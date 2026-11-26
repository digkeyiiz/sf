import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Crosshair, Shield, UserCheck } from 'lucide-react';
import { LOBBY_BACKDROP_IMAGE } from '../lib/mapImages';
import { soundEngine } from '../game/sound';

interface GuestLoginScreenProps {
  loading: boolean;
  error: string | null;
  onLoginGuest: (opts: { name: string; starterUniformId: string; existingAccountId?: string }) => Promise<void>;
}

export const GuestLoginScreen: React.FC<GuestLoginScreenProps> = ({
  loading,
  error,
  onLoginGuest,
}) => {
  const [mode, setMode] = useState<'new' | 'restore'>('new');
  const [callsign, setCallsign] = useState('');
  const [starterUniform, setStarterUniform] = useState<'swat_navy' | 'police_patrol'>('swat_navy');
  const [accountIdInput, setAccountIdInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.playUiClick();
    if (mode === 'restore') {
      await onLoginGuest({
        name: '',
        starterUniformId: starterUniform,
        existingAccountId: accountIdInput.trim().toUpperCase(),
      });
      return;
    }
    await onLoginGuest({
      name: callsign.trim() || `Officer-${Math.floor(100 + Math.random() * 900)}`,
      starterUniformId: starterUniform,
    });
  };

  return (
    <div className="min-h-screen bg-[#090C12] text-[#F3F4F6] relative flex items-center justify-center p-4 overflow-hidden">
      <img
        src={LOBBY_BACKDROP_IMAGE}
        alt="STRIKE OPS Tactical HQ"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#090C12]/95 via-[#090C12]/82 to-[#0E1627]/85" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 max-w-lg w-full bg-[#101522]/96 border border-white/12 rounded-xl p-7 shadow-2xl space-y-6"
      >
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center justify-center gap-2 text-amber-400 font-display text-sm font-bold tracking-[0.18em]">
            <Crosshair className="w-5 h-5" />
            <span>STRIKE OPS · TACTICAL FPS</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            เข้าสู่ระบบผู้เยี่ยมชม (Guest Session)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            ตั้งชื่อตัวละครของคุณเพื่อรับรหัสประจำตัว ระบบจะจำชื่อ ยศทหาร แต้ม SP และชุดยุทธวิธีให้อัตโนมัติ
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#090C12] border border-white/10 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`py-2 rounded-md transition-colors cursor-pointer ${
              mode === 'new' ? 'bg-amber-500 text-[#090C12]' : 'text-slate-400 hover:text-white'
            }`}
          >
            สร้างตัวละครผู้เยี่ยมชมใหม่
          </button>
          <button
            type="button"
            onClick={() => setMode('restore')}
            className={`py-2 rounded-md transition-colors cursor-pointer ${
              mode === 'restore' ? 'bg-amber-500 text-[#090C12]' : 'text-slate-400 hover:text-white'
            }`}
          >
            เข้าด้วยรหัส ID เดิม
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'new' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="guest-callsign" className="block text-xs font-medium text-slate-300">
                  ตั้งชื่อตัวละคร / นามเรียกขาน (Callsign)
                </label>
                <input
                  id="guest-callsign"
                  type="text"
                  maxLength={18}
                  autoFocus
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  placeholder="เช่น CaptainTop, SWAT191, หมวดต้น..."
                  className="w-full bg-[#090C12] border border-white/15 focus:border-amber-500 rounded-md px-4 py-3 text-sm text-white outline-none transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  เลือกเครื่องแบบตำรวจเริ่มต้น (ปรับแต่งผสมผสานเพิ่มได้ในคลัง)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStarterUniform('swat_navy')}
                    className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      starterUniform === 'swat_navy'
                        ? 'bg-sky-500/15 border-sky-400 text-white'
                        : 'bg-[#090C12] border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-display font-bold text-sm">
                      <Shield className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>หน่วยสวาท SWAT</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      ชุดตำรวจสวาทกรมท่า + เสื้อเกราะ POLICE + หมวกแก๊ป
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStarterUniform('police_patrol')}
                    className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      starterUniform === 'police_patrol'
                        ? 'bg-amber-500/15 border-amber-400 text-white'
                        : 'bg-[#090C12] border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-display font-bold text-sm">
                      <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>ตำรวจสายตรวจ</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      ชุดตำรวจกากี-กรมท่า ตราโล่ทอง + อินทรธนู + เกราะ POLICE
                    </p>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="guest-id-restore" className="block text-xs font-medium text-slate-300">
                กรอกรหัสประจำตัวผู้เยี่ยมชมเดิม (Guest ID)
              </label>
              <input
                id="guest-id-restore"
                type="text"
                maxLength={14}
                autoFocus
                value={accountIdInput}
                onChange={(e) => setAccountIdInput(e.target.value.toUpperCase())}
                placeholder="เช่น SF-A9K4M2"
                className="w-full bg-[#090C12] border border-white/15 focus:border-amber-500 rounded-md px-4 py-3 text-sm font-mono-num uppercase tracking-widest text-white outline-none transition-colors"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#090C12] font-display font-bold text-base rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <UserCheck className="w-5 h-5" />
            {loading ? 'กำลังโหลดข้อมูลทหาร...' : 'เข้าสู่สนามรบ STRIKE OPS'}
          </button>

          <div className="text-[11px] text-slate-400 text-center flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span>รับฟรี 500 SP เริ่มต้น</span>
            <span>·</span>
            <span>เริ่มยศพลทหารฝึกหัด</span>
            <span>·</span>
            <span>เล่นด่านบอท Easy/Normal/Hard เก็บ EXP ได้ทันที</span>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
