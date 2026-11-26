import type { MapBox, MapDefinition } from './maps';
import type { Vec3 } from './types';

export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT = 1.78;
export const PLAYER_EYE_HEIGHT = 1.56;
export const PLAYER_CROUCH_EYE_HEIGHT = 1.08;

/**
 * Resolve horizontal circle/box collision and vertical landing against map boxes.
 */
export function resolvePlayerMovement(
  pos: Vec3,
  velY: number,
  map: MapDefinition
): { x: number; y: number; z: number; velY: number; grounded: boolean } {
  let { x, y, z } = pos;
  let grounded = false;

  // Clamp to outer map bounds
  const margin = PLAYER_RADIUS + 0.2;
  if (x < map.bounds.minX + margin) x = map.bounds.minX + margin;
  if (x > map.bounds.maxX - margin) x = map.bounds.maxX - margin;
  if (z < map.bounds.minZ + margin) z = map.bounds.minZ + margin;
  if (z > map.bounds.maxZ - margin) z = map.bounds.maxZ - margin;

  if (y <= 0) {
    y = 0;
    if (velY < 0) velY = 0;
    grounded = true;
  }

  for (let i = 0; i < map.boxes.length; i++) {
    const b = map.boxes[i];
    if (b.decorOnly) continue;

    const minX = b.x - b.w * 0.5;
    const maxX = b.x + b.w * 0.5;
    const minY = b.y;
    const maxY = b.y + b.h;
    const minZ = b.z - b.d * 0.5;
    const maxZ = b.z + b.d * 0.5;

    // Check vertical overlap first
    const playerTop = y + PLAYER_HEIGHT;
    if (playerTop <= minY + 0.05 || y >= maxY - 0.05) {
      // Check standing on top of box
      if (
        x + PLAYER_RADIUS > minX &&
        x - PLAYER_RADIUS < maxX &&
        z + PLAYER_RADIUS > minZ &&
        z - PLAYER_RADIUS < maxZ
      ) {
        if (y >= maxY - 0.35 && y <= maxY + 0.12 && velY <= 0) {
          y = maxY;
          velY = 0;
          grounded = true;
        }
      }
      continue;
    }

    // Horizontal AABB overlap check
    const closestX = Math.max(minX, Math.min(x, maxX));
    const closestZ = Math.max(minZ, Math.min(z, maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
      // Allow smooth step-up onto low cover <= 0.55m if jumping
      if (maxY - y <= 0.55 && velY <= 0.5) {
        y = maxY;
        velY = 0;
        grounded = true;
        continue;
      }

      if (distSq > 0.000001) {
        const dist = Math.sqrt(distSq);
        const push = PLAYER_RADIUS - dist;
        x += (dx / dist) * push;
        z += (dz / dist) * push;
      } else {
        // Inside box center — push out along shallowest axis
        const penLeft = Math.abs(x - minX);
        const penRight = Math.abs(maxX - x);
        const penFront = Math.abs(z - minZ);
        const penBack = Math.abs(maxZ - z);
        const m = Math.min(penLeft, penRight, penFront, penBack);
        if (m === penLeft) x = minX - PLAYER_RADIUS;
        else if (m === penRight) x = maxX + PLAYER_RADIUS;
        else if (m === penFront) z = minZ - PLAYER_RADIUS;
        else z = maxZ + PLAYER_RADIUS;
      }
    }
  }

  return { x, y, z, velY, grounded };
}

/**
 * Ray-AABB intersection (slab method). Returns distance t >= 0 or null.
 */
export function rayIntersectsBox(
  origin: Vec3,
  dir: Vec3,
  box: MapBox,
  maxDist: number
): number | null {
  if (box.decorOnly) return null;
  const minX = box.x - box.w * 0.5;
  const maxX = box.x + box.w * 0.5;
  const minY = box.y;
  const maxY = box.y + box.h;
  const minZ = box.z - box.d * 0.5;
  const maxZ = box.z + box.d * 0.5;

  let tmin = 0;
  let tmax = maxDist;

  const axes: Array<[number, number, number, number]> = [
    [origin.x, dir.x, minX, maxX],
    [origin.y, dir.y, minY, maxY],
    [origin.z, dir.z, minZ, maxZ],
  ];

  for (let i = 0; i < 3; i++) {
    const [o, d, bMin, bMax] = axes[i];
    if (Math.abs(d) < 1e-8) {
      if (o < bMin || o > bMax) return null;
    } else {
      const invD = 1 / d;
      let t1 = (bMin - o) * invD;
      let t2 = (bMax - o) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }

  return tmin >= 0 && tmin <= maxDist ? tmin : null;
}

/**
 * Returns closest wall hit distance along a ray, or null if clear up to maxDist.
 */
export function raycastMap(
  origin: Vec3,
  dir: Vec3,
  map: MapDefinition,
  maxDist: number
): number | null {
  let closest: number | null = null;

  // Floor intersection
  if (dir.y < -1e-6 && origin.y > 0) {
    const tFloor = -origin.y / dir.y;
    if (tFloor >= 0 && tFloor <= maxDist) {
      closest = tFloor;
    }
  }

  for (let i = 0; i < map.boxes.length; i++) {
    const t = rayIntersectsBox(origin, dir, map.boxes[i], closest ?? maxDist);
    if (t !== null && (closest === null || t < closest)) {
      closest = t;
    }
  }

  return closest;
}

/**
 * Check clear line of sight between two 3D points.
 */
export function hasLineOfSight(a: Vec3, b: Vec3, map: MapDefinition): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 0.05) return true;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  const wallDist = raycastMap(a, dir, map, dist - 0.15);
  return wallDist === null;
}
