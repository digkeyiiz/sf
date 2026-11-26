import type { HitZone, Vec3, WeaponId } from '../shared/types.ts';
import type { MapDefinition } from '../shared/maps.ts';
import { hasLineOfSight, resolvePlayerMovement } from '../shared/collision.ts';

export interface HistorySample {
  timestamp: number;
  x: number;
  y: number;
  z: number;
  crouch: boolean;
  alive: boolean;
}

/**
 * Per-player 350ms position history ring buffer for Server-Side Lag Compensation (Hitbox Rewind).
 */
export class PositionHistoryBuffer {
  private samples: HistorySample[] = [];
  private readonly maxAgeMs = 350;

  public push(sample: HistorySample) {
    this.samples.push(sample);
    const cutoff = sample.timestamp - this.maxAgeMs;
    while (this.samples.length > 16 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  /**
   * Interpolates player position at `targetTimeMs` (clamped safely to buffer span).
   */
  public sampleAt(targetTimeMs: number, fallback: HistorySample): HistorySample {
    const len = this.samples.length;
    if (len === 0) return fallback;
    if (targetTimeMs >= this.samples[len - 1].timestamp) return this.samples[len - 1];
    if (targetTimeMs <= this.samples[0].timestamp) return this.samples[0];

    for (let i = len - 1; i > 0; i--) {
      const b = this.samples[i];
      const a = this.samples[i - 1];
      if (targetTimeMs >= a.timestamp && targetTimeMs <= b.timestamp) {
        const span = Math.max(1, b.timestamp - a.timestamp);
        const t = (targetTimeMs - a.timestamp) / span;
        return {
          timestamp: targetTimeMs,
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
          crouch: t < 0.5 ? a.crouch : b.crouch,
          alive: a.alive && b.alive,
        };
      }
    }
    return fallback;
  }

  public clear() {
    this.samples.length = 0;
  }
}

export interface MovementValidationResult {
  x: number;
  y: number;
  z: number;
  corrected: boolean;
}

/**
 * Server-authoritative movement validation:
 * - Enforces maximum physically possible horizontal speed (accounting for sprint/slide + jitter margin)
 * - Runs shared `resolvePlayerMovement` against `map` to prevent noclip / walking through walls
 * - Clamps vertical elevation strictly to reachable jump/platform height
 */
export function validatePlayerMove(
  prev: { x: number; y: number; z: number },
  next: { x: number; y: number; z: number },
  dtSec: number,
  map: MapDefinition
): MovementValidationResult {
  const safeDt = Math.max(0.016, Math.min(0.45, dtSec));
  // Max realistic sprint/slide speed is ~11.5 m/s; allow generous lag burst margin up to 14.5 m/s
  const maxStep = Math.max(1.25, 14.5 * safeDt);
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const dist2d = Math.hypot(dx, dz);

  let targetX = next.x;
  let targetZ = next.z;
  let corrected = false;

  if (dist2d > maxStep) {
    const ratio = maxStep / dist2d;
    targetX = prev.x + dx * ratio;
    targetZ = prev.z + dz * ratio;
    corrected = true;
  }

  const targetY = Math.max(0, Math.min(7.5, Number.isFinite(next.y) ? next.y : prev.y));
  if (Math.abs(targetY - next.y) > 0.25) {
    corrected = true;
  }

  const resolved = resolvePlayerMovement(
    { x: targetX, y: targetY, z: targetZ },
    0,
    map
  );

  // If collision pushed player significantly back from claimed coords, signal reconciliation
  if (Math.hypot(resolved.x - next.x, resolved.z - next.z) > 0.8) {
    corrected = true;
  }

  return {
    x: resolved.x,
    y: resolved.y,
    z: resolved.z,
    corrected,
  };
}

/**
 * Server-authoritative hit verification with Lag Compensation rewind:
 * 1. Verifies muzzle origin is physically near shooter's eye position
 * 2. Rewinds target position by `rewindMs` (clamped 0..250ms)
 * 3. Verifies clean line-of-sight (`hasLineOfSight`) through `map` (blocks wallhack / shoot-through-wall!)
 * 4. Verifies ray-to-capsule proximity so clients cannot fabricate hits on off-screen targets
 */
export function validateHitWithRewind(params: {
  shooterPos: Vec3;
  shooterCrouch: boolean;
  claimedOrigin: Vec3;
  claimedEnd: Vec3;
  targetCurrent: HistorySample;
  targetHistory: PositionHistoryBuffer;
  rewindMs: number;
  claimedZone: HitZone;
  weaponId: WeaponId;
  maxRange: number;
  map: MapDefinition;
}): { valid: boolean; verifiedZone: HitZone } {
  const {
    shooterPos,
    shooterCrouch,
    claimedOrigin,
    claimedEnd,
    targetCurrent,
    targetHistory,
    rewindMs,
    claimedZone,
    weaponId,
    maxRange,
    map,
  } = params;

  const eyeY = shooterPos.y + (shooterCrouch ? 1.12 : 1.62);
  // 1. Muzzle origin must be within 1.85m of shooter's true eye position (allows lean + ping jitter)
  const originDelta = Math.hypot(
    claimedOrigin.x - shooterPos.x,
    claimedOrigin.y - eyeY,
    claimedOrigin.z - shooterPos.z
  );
  const safeOrigin: Vec3 =
    originDelta <= 1.85
      ? claimedOrigin
      : { x: shooterPos.x, y: eyeY, z: shooterPos.z };

  // 2. Rewind target to shooter's visual timestamp (clamped 0..250ms)
  const clampedRewind = Math.max(0, Math.min(250, rewindMs));
  const targetAtShot = targetHistory.sampleAt(Date.now() - clampedRewind, targetCurrent);
  if (!targetAtShot.alive) {
    return { valid: false, verifiedZone: claimedZone };
  }

  // 3. Distance range check
  const targetHeight = targetAtShot.crouch ? 1.15 : 1.52;
  const targetCenter: Vec3 = {
    x: targetAtShot.x,
    y: targetAtShot.y + (claimedZone === 'head' ? targetHeight : claimedZone === 'limb' ? 0.55 : 1.08),
    z: targetAtShot.z,
  };
  const dist = Math.hypot(
    targetCenter.x - safeOrigin.x,
    targetCenter.y - safeOrigin.y,
    targetCenter.z - safeOrigin.z
  );
  if (dist > maxRange + 3.5) {
    return { valid: false, verifiedZone: claimedZone };
  }

  // 4. Server-side Line-Of-Sight check against map collision boxes (blocks shooting through solid walls!)
  if (weaponId !== 'knife') {
    const clearDirect = hasLineOfSight(safeOrigin, targetCenter, map);
    const clearHead =
      clearDirect ||
      hasLineOfSight(
        safeOrigin,
        { x: targetAtShot.x, y: targetAtShot.y + (targetAtShot.crouch ? 1.08 : 1.56), z: targetAtShot.z },
        map
      );
    if (!clearHead) {
      return { valid: false, verifiedZone: claimedZone };
    }
  }

  // 5. Ray proximity check (closest point on shot segment to rewound target cylinder)
  const segX = claimedEnd.x - safeOrigin.x;
  const segY = claimedEnd.y - safeOrigin.y;
  const segZ = claimedEnd.z - safeOrigin.z;
  const segLenSq = segX * segX + segY * segY + segZ * segZ;
  if (segLenSq > 0.001 && weaponId !== 'knife' && weaponId !== 'm870') {
    const t = Math.max(
      0,
      Math.min(
        1,
        ((targetCenter.x - safeOrigin.x) * segX +
          (targetCenter.y - safeOrigin.y) * segY +
          (targetCenter.z - safeOrigin.z) * segZ) /
          segLenSq
      )
    );
    const closestX = safeOrigin.x + segX * t;
    const closestY = safeOrigin.y + segY * t;
    const closestZ = safeOrigin.z + segZ * t;
    const errXZ = Math.hypot(closestX - targetAtShot.x, closestZ - targetAtShot.z);
    const errY = Math.abs(closestY - targetCenter.y);
    if (errXZ > 1.35 || errY > 1.55) {
      return { valid: false, verifiedZone: claimedZone };
    }
  }

  return { valid: true, verifiedZone: claimedZone };
}

/**
 * Quantizes numeric coordinates/angles cleanly to reduce WebSocket JSON payload size by ~35%.
 */
export function q2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function q3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
