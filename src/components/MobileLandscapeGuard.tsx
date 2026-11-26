import React, { useEffect, useState } from 'react';
import { Maximize2, RotateCw, Smartphone } from 'lucide-react';
import { detectTouchDevice, toggleFullscreenLandscape } from '../shared/controls';

/**
 * Enforces landscape-only orientation on mobile / touch devices across the entire game.
 * Whenever a mobile viewport is held in portrait (height > width), displays a full-screen
 * blocking prompt asking the user to rotate their phone horizontally, plus a one-tap
 * Fullscreen + Landscape Orientation Lock button.
 */
export const MobileLandscapeGuard: React.FC = () => {
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkOrientation = () => {
      const touchCapable = detectTouchDevice();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isMobileSized = Math.min(w, h) <= 900;
      const portrait = h > w * 1.02;
      setIsPortraitMobile(touchCapable && isMobileSized && portrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    screen.orientation?.addEventListener?.('change', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      screen.orientation?.removeEventListener?.('change', checkOrientation);
    };
  }, []);

  if (!isPortraitMobile) return null;

  const handleForceLandscape = async () => {
    setLockMessage(null);
    const ok = await toggleFullscreenLandscape(true);
    if (!ok) {
      setLockMessage('กรุณาปลดล็อกการหมุนหน้าจอของมือถือ แล้วตะแคงเครื่องเป็นแนวนอน');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-[#070B12] text-slate-100 flex flex-col items-center justify-center px-6 text-center select-none"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Animated Rotate-Phone Emblem */}
      <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
        <div className="absolute inset-0 rounded-2xl border-2 border-amber-500/35 bg-amber-500/10" />
        <div className="relative flex items-center justify-center animate-[spin_3.2s_ease-in-out_infinite]">
          <Smartphone className="w-12 h-12 text-amber-400" strokeWidth={1.75} />
        </div>
        <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg">
          <RotateCw className="w-5 h-5" />
        </div>
      </div>

      <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-amber-400 mb-2">
        STRIKE OPS · TACTICAL FPS
      </div>

      <h1 className="font-display text-2xl font-bold text-white leading-snug mb-2">
        กรุณาหมุนหน้าจอเป็นแนวนอน
      </h1>

      <p className="text-sm text-slate-300 max-w-xs leading-relaxed mb-6">
        เวอร์ชันมือถือรองรับการเล่นแบบ <span className="text-amber-300 font-semibold">แนวนอนเท่านั้น (Landscape Only)</span>{' '}
        เพื่อให้ปุ่มยิง เล็ง ควบคุม และมุมมอง 3D สมบูรณ์ที่สุด
      </p>

      <button
        type="button"
        onClick={handleForceLandscape}
        className="w-full max-w-xs py-3.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20"
      >
        <Maximize2 className="w-4 h-4" />
        เปิดเต็มจอ &amp; ล็อกแนวนอนอัตโนมัติ
      </button>

      {lockMessage && (
        <p className="mt-3 text-xs text-amber-300/90 max-w-xs leading-relaxed">
          {lockMessage}
        </p>
      )}

      <div className="mt-7 flex items-center gap-2 text-[11px] text-slate-500 font-mono">
        <span>PORTRAIT LOCKED</span>
        <span>•</span>
        <span>ROTATE 90° TO PLAY</span>
      </div>
    </div>
  );
};
