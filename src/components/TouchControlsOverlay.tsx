import React, { useRef, useState } from 'react';
import {
  ArrowUp,
  Bomb,
  ChevronDown,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Lock,
  Radio,
  RotateCw,
  Swords,
  X,
  Zap,
} from 'lucide-react';
import type { WeaponSlot } from '../shared/types';

interface TouchControlsOverlayProps {
  visible: boolean;
  isAds: boolean;
  crouch: boolean;
  sliding: boolean;
  sprintLocked: boolean;
  lean: number;
  hasGrenade: boolean;
  activeSlot: WeaponSlot;
  allowedSlots: WeaponSlot[];
  primaryWeaponShort?: string;
  buttonScale: number;
  adsOnFire: boolean;
  autoFire: boolean;
  enemyInCrosshair: boolean;
  onMove: (x: number, y: number) => void;
  onSprintLockChange: (locked: boolean) => void;
  onLook: (dx: number, dy: number) => void;
  onFireChange: (firing: boolean) => void;
  onFireWithAdsChange: (firing: boolean) => void;
  onToggleAds: () => void;
  onToggleAutoFire: () => void;
  onReload: () => void;
  onJump: () => void;
  onCrouchOrSlide: () => void;
  onLean: (dir: number) => void;
  onGrenade: () => void;
  onQuickMelee: () => void;
  onToggleRadio: () => void;
  onEquipSlot: (slot: WeaponSlot) => void;
}

function triggerHaptic(ms = 12) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore on unsupported browsers (iOS Safari)
  }
}

/** Crisp tactical bullet glyph for primary fire buttons (unmistakable PUBG/CoD Mobile style) */
const BulletFireIcon: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
    <path
      d="M14 2.5C15.9 4.8 17 7.8 17 11V21.5H11V11C11 7.8 12.1 4.8 14 2.5Z"
      fill="currentColor"
    />
    <rect x="10.2" y="23" width="7.6" height="2.4" rx="0.8" fill="currentColor" />
    <path
      d="M5.5 11.5L8.2 13M22.5 11.5L19.8 13M4.5 16H7.8M23.5 16H20.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

/** Crisp tactical rifle silhouette icon */
const RifleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-3.5' }) => (
  <svg viewBox="0 0 32 14" fill="none" className={className} aria-hidden="true">
    <path
      d="M2 5.2H6.5L8.2 3.8H19.5V5H29.5V6.6H21.2L20 7.6H16.5L17.4 11.6H14.8L13.8 7.8H10.8L9.6 10.6H7.4L8.2 7.8H5.4L2 9.4V5.2Z"
      fill="currentColor"
    />
    <rect x="12" y="2.2" width="5" height="1.4" rx="0.4" fill="currentColor" />
  </svg>
);

/** Crisp tactical pistol silhouette icon */
const PistolIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-3.5' }) => (
  <svg viewBox="0 0 22 16" fill="none" className={className} aria-hidden="true">
    <path
      d="M3 3.5H19V6.8H11.5L10.4 8.2H8.4L7.1 13.5H4.2L5.5 7.4H3V3.5Z"
      fill="currentColor"
    />
  </svg>
);

export const TouchControlsOverlay: React.FC<TouchControlsOverlayProps> = ({
  visible,
  isAds,
  crouch,
  sliding,
  sprintLocked,
  lean,
  hasGrenade,
  activeSlot,
  allowedSlots,
  primaryWeaponShort = 'RIFLE',
  buttonScale,
  adsOnFire,
  autoFire,
  enemyInCrosshair,
  onMove,
  onSprintLockChange,
  onLook,
  onFireChange,
  onFireWithAdsChange,
  onToggleAds,
  onToggleAutoFire,
  onReload,
  onJump,
  onCrouchOrSlide,
  onLean,
  onGrenade,
  onQuickMelee,
  onToggleRadio,
  onEquipSlot,
}) => {
  // Floating Left Joystick State
  const joyPointerId = useRef<number | null>(null);
  const joyOrigin = useRef<{ x: number; y: number } | null>(null);
  const [joyActive, setJoyActive] = useState(false);
  const [joyCenter, setJoyCenter] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [sprintZoneHot, setSprintZoneHot] = useState(false);

  // Right-Half Drag-to-Look State
  const lookPointerId = useRef<number | null>(null);
  const lastLookPos = useRef<{ x: number; y: number } | null>(null);

  // Right Fire + Drag-to-Aim State (2-thumb ergonomic shooting + tracking)
  const rightFirePointerId = useRef<number | null>(null);
  const rightFireLastPos = useRef<{ x: number; y: number } | null>(null);
  const [rightFiring, setRightFiring] = useState(false);
  const [leftFiring, setLeftFiring] = useState(false);

  if (!visible) return null;

  // Clamp scale so buttons never collide on 375px-high landscape phones
  const scale = Math.max(0.85, Math.min(1.18, buttonScale || 1));
  const joyRadius = 46;

  const updateFloatingJoystick = (clientX: number, clientY: number) => {
    const origin = joyOrigin.current;
    if (!origin) return;
    let dx = clientX - origin.x;
    let dy = clientY - origin.y;
    const rawDist = Math.hypot(dx, dy);

    const inSprintLockZone = dy < -(joyRadius * 1.18) && Math.abs(dx) < joyRadius * 0.65;
    setSprintZoneHot(inSprintLockZone);

    if (rawDist > joyRadius) {
      dx = (dx / rawDist) * joyRadius;
      dy = (dy / rawDist) * joyRadius;
    }
    setKnob({ x: dx, y: dy });
    onMove(dx / joyRadius, -dy / joyRadius);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-25 select-none touch-none overflow-hidden">
      {/* =====================================================================
          ZONE 1: FLOATING LEFT VIRTUAL JOYSTICK (Below Left Fire, Above HP Bar)
         ===================================================================== */}
      <div
        className="pointer-events-auto fixed left-0 bottom-12 top-[38%] w-[40%] touch-none"
        onPointerDown={(e) => {
          if (joyPointerId.current !== null) return;
          joyPointerId.current = e.pointerId;
          joyOrigin.current = { x: e.clientX, y: e.clientY };
          setJoyCenter({ x: e.clientX, y: e.clientY });
          setJoyActive(true);
          setKnob({ x: 0, y: 0 });
          setSprintZoneHot(false);
          if (sprintLocked) onSprintLockChange(false);
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (joyPointerId.current !== e.pointerId) return;
          updateFloatingJoystick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (joyPointerId.current !== e.pointerId) return;
          joyPointerId.current = null;
          const origin = joyOrigin.current;
          const lockedSprint =
            origin !== null &&
            e.clientY - origin.y < -(joyRadius * 1.18) &&
            Math.abs(e.clientX - origin.x) < joyRadius * 0.68;
          joyOrigin.current = null;
          setJoyActive(false);
          setJoyCenter(null);
          setKnob({ x: 0, y: 0 });
          setSprintZoneHot(false);
          if (lockedSprint) {
            triggerHaptic(18);
            onMove(0, 0);
            onSprintLockChange(true);
          } else {
            onMove(0, 0);
          }
        }}
        onPointerCancel={() => {
          joyPointerId.current = null;
          joyOrigin.current = null;
          setJoyActive(false);
          setJoyCenter(null);
          setKnob({ x: 0, y: 0 });
          setSprintZoneHot(false);
          onMove(0, 0);
        }}
      >
        {/* Clean Rest-State Joystick Ring (Zero Clutter) */}
        {!joyActive && (
          <div
            className="pointer-events-none absolute left-5 bottom-3 sm:left-8 sm:bottom-6 w-24 h-24 rounded-full bg-[#090C12]/42 border border-white/22 flex items-center justify-center"
            style={{ transform: `scale(${scale})`, transformOrigin: 'bottom left' }}
          >
            <div className="absolute inset-2.5 rounded-full border border-dashed border-amber-400/25" />
            <div className="w-9 h-9 rounded-full bg-amber-400/75 border-2 border-amber-100/80 shadow" />
          </div>
        )}
      </div>

      {/* Active Floating Joystick Ring + Auto-Sprint Lock Halo */}
      {joyActive && joyCenter && (
        <div
          className="pointer-events-none fixed z-30"
          style={{
            left: `${joyCenter.x}px`,
            top: `${joyCenter.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className={`absolute left-1/2 -translate-x-1/2 -top-14 w-9 h-9 rounded-full border-2 flex items-center justify-center transition-colors ${
              sprintZoneHot
                ? 'bg-amber-400 border-amber-100 text-[#090C12] scale-110'
                : 'bg-[#090C12]/72 border-white/30 text-amber-300'
            }`}
          >
            <Lock className="w-4 h-4" />
          </div>

          <div className="relative w-24 h-24 rounded-full bg-[#090C12]/58 border-2 border-amber-400/50 flex items-center justify-center">
            <div className="absolute inset-2.5 rounded-full border border-dashed border-amber-300/30" />
            <div
              className="w-10 h-10 rounded-full bg-amber-400/92 border-2 border-amber-100 shadow-lg"
              style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          ZONE 2: RIGHT-HALF DRAG-TO-LOOK CAMERA PAD
         ===================================================================== */}
      <div
        className="pointer-events-auto fixed inset-y-12 right-0 left-[40%] touch-none"
        onPointerDown={(e) => {
          if (lookPointerId.current !== null) return;
          lookPointerId.current = e.pointerId;
          lastLookPos.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (lookPointerId.current !== e.pointerId || !lastLookPos.current) return;
          const dx = e.clientX - lastLookPos.current.x;
          const dy = e.clientY - lastLookPos.current.y;
          lastLookPos.current = { x: e.clientX, y: e.clientY };
          onLook(dx, dy);
        }}
        onPointerUp={(e) => {
          if (lookPointerId.current === e.pointerId) {
            lookPointerId.current = null;
            lastLookPos.current = null;
          }
        }}
        onPointerCancel={() => {
          lookPointerId.current = null;
          lastLookPos.current = null;
        }}
      />

      {/* =====================================================================
          ZONE 3: LEFT-MID SECONDARY FIRE + ICON-ONLY LEAN (Cleanly below Minimap)
         ===================================================================== */}
      <div
        className="pointer-events-auto fixed left-2.5 top-[88px] sm:left-4 sm:top-[116px] flex items-center gap-1.5 touch-none"
        style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        {/* Icon-Only Left Fire Button (Claw / Steady Hipfire) */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
            triggerHaptic(14);
            setLeftFiring(true);
            onFireChange(true);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            setLeftFiring(false);
            onFireChange(false);
          }}
          onPointerCancel={() => {
            setLeftFiring(false);
            onFireChange(false);
          }}
          className={`w-11 h-11 rounded-full border-2 flex items-center justify-center transition-transform cursor-pointer shadow-lg ${
            leftFiring
              ? 'bg-red-500 border-amber-200 text-white scale-92'
              : 'bg-red-600/72 border-red-300/70 text-white'
          }`}
          aria-label="ยิงซ้าย"
        >
          <BulletFireIcon className="w-5 h-5" />
        </button>

        {/* Compact Icon-Only Lean Left / Right */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHaptic(10);
                onLean(-1);
              }}
              className={`w-8 h-8 rounded-md border flex items-center justify-center cursor-pointer active:scale-95 ${
                lean < 0
                  ? 'bg-amber-400 text-[#090C12] border-amber-200'
                  : 'bg-[#090C12]/72 text-slate-200 border-white/22'
              }`}
              aria-label="เอียงซ้าย"
            >
              <CornerUpLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHaptic(10);
                onLean(1);
              }}
              className={`w-8 h-8 rounded-md border flex items-center justify-center cursor-pointer active:scale-95 ${
                lean > 0
                  ? 'bg-amber-400 text-[#090C12] border-amber-200'
                  : 'bg-[#090C12]/72 text-slate-200 border-white/22'
              }`}
              aria-label="เอียงขวา"
            >
              <CornerUpRight className="w-4 h-4" />
            </button>
          </div>

          {sprintLocked && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHaptic(10);
                onSprintLockChange(false);
              }}
              className="h-6 px-2 rounded bg-amber-400 text-[#090C12] text-[10px] font-display font-bold border border-amber-100 inline-flex items-center justify-center gap-1 cursor-pointer"
              aria-label="หยุดวิ่งอัตโนมัติ"
            >
              <Lock className="w-3 h-3" />
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* =====================================================================
          ZONE 4: BOTTOM-CENTER ICON-FIRST WEAPON SWITCHER (Zero Overlap!)
         ===================================================================== */}
      <div
        className="pointer-events-auto fixed bottom-2 left-1/2 z-30 flex items-center gap-1 bg-[#090D16]/92 border border-white/14 rounded-lg p-1 touch-none"
        style={{
          transform: `translateX(-50%) scale(${Math.min(1.08, scale)})`,
          transformOrigin: 'bottom center',
        }}
      >
        {(
          [
            { slot: 1 as WeaponSlot, label: primaryWeaponShort, kind: 'rifle' as const },
            { slot: 2 as WeaponSlot, label: 'DE', kind: 'pistol' as const },
            { slot: 3 as WeaponSlot, label: '', kind: 'knife' as const },
            { slot: 4 as WeaponSlot, label: '', kind: 'grenade' as const },
          ]
        ).map(({ slot, label, kind }) => {
          if (!allowedSlots.includes(slot)) return null;
          const disabled = slot === 4 && !hasGrenade;
          const active = activeSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (disabled) return;
                triggerHaptic(10);
                onEquipSlot(slot);
              }}
              className={`h-8 px-2 sm:px-2.5 rounded-md border flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                disabled
                  ? 'bg-black/35 text-slate-600 border-white/8 opacity-45'
                  : active
                    ? 'bg-amber-400 text-[#090C12] border-amber-200 font-bold'
                    : 'bg-white/6 text-slate-200 border-white/12 active:bg-white/14'
              }`}
              aria-label={`อาวุธช่อง ${slot}`}
            >
              {kind === 'rifle' && <RifleIcon className="w-5 h-3.5 shrink-0" />}
              {kind === 'pistol' && <PistolIcon className="w-4 h-3.5 shrink-0" />}
              {kind === 'knife' && <Swords className="w-4 h-4 shrink-0" />}
              {kind === 'grenade' && <Bomb className="w-4 h-4 shrink-0" />}
              {label && (
                <span className="font-mono-num text-[10px] font-bold leading-none whitespace-nowrap">
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          ZONE 5: RIGHT ERGONOMIC ICON-FIRST COMBAT ARC (Above Bottom Ammo Bar)
         ===================================================================== */}
      <div
        className="pointer-events-auto fixed bottom-13 right-2.5 sm:bottom-15 sm:right-5 flex flex-col items-end gap-1.5 touch-none"
        style={{ transform: `scale(${scale})`, transformOrigin: 'bottom right' }}
      >
        {/* Row 1: Compact Icon Utility Strip (Auto-Fire, Radio, Quick Melee, Grenade) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              triggerHaptic(12);
              onToggleAutoFire();
            }}
            className={`h-8 px-2 rounded-lg border text-[10px] font-display font-bold inline-flex items-center gap-1 cursor-pointer active:scale-95 ${
              autoFire
                ? 'bg-amber-400 text-[#090C12] border-amber-100'
                : 'bg-[#090C12]/76 text-slate-300 border-white/18'
            }`}
            aria-label="ยิงอัตโนมัติ"
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>AUTO</span>
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              triggerHaptic(10);
              onToggleRadio();
            }}
            className="w-8 h-8 rounded-lg bg-[#090C12]/76 border border-white/18 text-sky-300 flex items-center justify-center cursor-pointer active:scale-95"
            aria-label="วิทยุ"
          >
            <Radio className="w-4 h-4" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              triggerHaptic(14);
              onQuickMelee();
            }}
            className="w-8 h-8 rounded-lg bg-[#090C12]/76 border border-white/18 text-slate-200 flex items-center justify-center cursor-pointer active:scale-95"
            aria-label="มีดด่วน"
          >
            <Swords className="w-4 h-4" />
          </button>

          {hasGrenade && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHaptic(16);
                onGrenade();
              }}
              className="w-8 h-8 rounded-lg bg-[#090C12]/76 border border-amber-400/50 text-amber-400 flex items-center justify-center cursor-pointer active:scale-95"
              aria-label="ปาระเบิด"
            >
              <Bomb className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Row 2: Crisp Icon Movement & Reload Strip (Crouch/Slide, Jump, Reload) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              triggerHaptic(12);
              onCrouchOrSlide();
            }}
            className={`w-10 h-10 rounded-full border flex items-center justify-center cursor-pointer active:scale-95 ${
              crouch || sliding
                ? 'bg-amber-400 text-[#090C12] border-amber-100'
                : 'bg-[#090C12]/78 text-slate-100 border-white/22'
            }`}
            aria-label="ย่อหรือสไลด์"
          >
            <ChevronDown className="w-5 h-5" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              triggerHaptic(12);
              onJump();
            }}
            className="w-10 h-10 rounded-full bg-[#090C12]/78 border border-white/22 text-slate-100 flex items-center justify-center cursor-pointer active:scale-95"
            aria-label="กระโดด"
          >
            <ArrowUp className="w-5 h-5" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              triggerHaptic(12);
              onReload();
            }}
            className="w-10 h-10 rounded-full bg-[#090C12]/78 border border-white/22 text-amber-300 flex items-center justify-center cursor-pointer active:scale-95"
            aria-label="รีโหลด"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Row 3: Primary Thumb Arc — Large ADS Scope + HERO FIRE & DRAG-TO-AIM */}
        <div className="flex items-end gap-2.5">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              triggerHaptic(12);
              onToggleAds();
            }}
            className={`w-13 h-13 rounded-full border-2 flex items-center justify-center cursor-pointer active:scale-95 shadow-lg ${
              isAds
                ? 'bg-sky-400 text-[#090C12] border-sky-100'
                : 'bg-[#090C12]/80 text-sky-300 border-sky-400/60'
            }`}
            aria-label="เล็งศูนย์"
          >
            <Crosshair className="w-6 h-6" />
          </button>

          {/* HERO RIGHT FIRE BUTTON — Simultaneous Fire + Drag-to-Aim Tracking */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              rightFirePointerId.current = e.pointerId;
              rightFireLastPos.current = { x: e.clientX, y: e.clientY };
              (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              triggerHaptic(16);
              setRightFiring(true);
              if (adsOnFire) {
                onFireWithAdsChange(true);
              } else {
                onFireChange(true);
              }
            }}
            onPointerMove={(e) => {
              if (rightFirePointerId.current !== e.pointerId || !rightFireLastPos.current) return;
              e.stopPropagation();
              const dx = e.clientX - rightFireLastPos.current.x;
              const dy = e.clientY - rightFireLastPos.current.y;
              rightFireLastPos.current = { x: e.clientX, y: e.clientY };
              onLook(dx, dy);
            }}
            onPointerUp={(e) => {
              if (rightFirePointerId.current !== e.pointerId) return;
              e.stopPropagation();
              rightFirePointerId.current = null;
              rightFireLastPos.current = null;
              setRightFiring(false);
              if (adsOnFire) {
                onFireWithAdsChange(false);
              } else {
                onFireChange(false);
              }
            }}
            onPointerCancel={() => {
              rightFirePointerId.current = null;
              rightFireLastPos.current = null;
              setRightFiring(false);
              onFireWithAdsChange(false);
              onFireChange(false);
            }}
            className={`w-[74px] h-[74px] rounded-full border-2 flex items-center justify-center transition-transform cursor-pointer shadow-[0_0_24px_rgba(239,68,68,0.45)] ${
              rightFiring
                ? 'bg-red-500 border-amber-100 text-white scale-92'
                : enemyInCrosshair
                  ? 'bg-amber-500 border-amber-100 text-[#090C12]'
                  : 'bg-red-600/86 border-red-200/80 text-white'
            }`}
            aria-label="ปุ่มยิง"
          >
            <BulletFireIcon className="w-9 h-9" />
          </button>
        </div>
      </div>
    </div>
  );
};
