import React, { useEffect, useState } from 'react';
import {
  Crosshair,
  Eye,
  Gamepad2,
  Keyboard,
  Monitor,
  RotateCcw,
  Sliders,
  Smartphone,
  Volume2,
} from 'lucide-react';
import {
  CROSSHAIR_COLORS,
  CROSSHAIR_STYLES,
  DEFAULT_AUDIO_MIX,
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_KEYBINDS,
  KEY_ACTION_LABELS,
  formatKeyCode,
  resolveTouchControls,
  type AudioMixSettings,
  type ControlSettings,
  type GraphicsQuality,
  type InputMode,
  type KeyAction,
} from '../shared/controls';
import { soundEngine } from '../game/sound';

interface ControlsSettingsPanelProps {
  settings: ControlSettings;
  onChange: (next: ControlSettings) => void;
  compact?: boolean;
}

export const ControlsSettingsPanel: React.FC<ControlsSettingsPanelProps> = ({
  settings,
  onChange,
  compact = false,
}) => {
  const [subTab, setSubTab] = useState<'gameplay' | 'mobile' | 'keybinds' | 'visuals'>(
    settings.touchControls ? 'mobile' : 'gameplay'
  );
  const [listeningAction, setListeningAction] = useState<KeyAction | null>(null);

  useEffect(() => {
    if (!listeningAction) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListeningAction(null);
        return;
      }
      soundEngine.playUiClick();
      onChange({
        ...settings,
        keybinds: {
          ...settings.keybinds,
          [listeningAction]: e.code,
        },
      });
      setListeningAction(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listeningAction, settings, onChange]);

  const patch = (partial: Partial<ControlSettings>) => {
    onChange({ ...settings, ...partial });
  };

  const patchAudioMix = (channel: keyof AudioMixSettings, value: number) => {
    const nextMix: AudioMixSettings = {
      ...DEFAULT_AUDIO_MIX,
      ...settings.audioMix,
      [channel]: value,
    };
    soundEngine.applyAudioMix(nextMix);
    patch({
      audioMix: nextMix,
      volume: nextMix.master,
    });
  };

  const setPlatformMode = (mode: InputMode) => {
    soundEngine.playUiClick();
    patch({
      inputMode: mode,
      touchControls: resolveTouchControls(mode),
    });
  };

  const resetAll = () => {
    soundEngine.playUiClick();
    soundEngine.applyAudioMix(DEFAULT_AUDIO_MIX);
    onChange({
      ...DEFAULT_CONTROL_SETTINGS,
      inputMode: 'auto',
      touchControls: resolveTouchControls('auto'),
      audioMix: { ...DEFAULT_AUDIO_MIX },
      keybinds: { ...DEFAULT_KEYBINDS },
    });
  };

  const previewGap = Math.round(7 * settings.crosshairSize);
  const previewLen = Math.round(10 * settings.crosshairSize);

  return (
    <div className="space-y-4">
      {/* Sub-tab Segmented Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 bg-[#090C12] border border-white/10 rounded-md text-xs">
          {(
            [
              ['gameplay', 'เมาส์ & เสียง', Sliders],
              ['mobile', 'มือถือ & ช่วยเล็ง', Smartphone],
              ['keybinds', 'ปุ่มคีย์บอร์ด', Keyboard],
              ['visuals', 'เป้าเล็ง & ภาพ 3D', Monitor],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                setSubTab(id);
                setListeningAction(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === id
                  ? 'bg-amber-500 text-[#090C12] font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={resetAll}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          คืนค่าเริ่มต้น
        </button>
      </div>

      {/* TAB 1: Gameplay, Mouse Sensitivity, FOV, Audio & Touch Mode */}
      {subTab === 'gameplay' && (
        <div className={`grid grid-cols-1 ${compact ? '' : 'lg:grid-cols-2'} gap-4 text-xs`}>
          <div className="bg-[#0B0F18] border border-white/10 rounded-lg p-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                  ความไวเมาส์ (Sensitivity)
                </span>
                <span className="font-mono-num text-amber-400 font-bold">
                  {settings.sensitivity.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0.6}
                max={6.0}
                step={0.1}
                value={settings.sensitivity}
                onChange={(e) => patch({ sensitivity: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Eye className="w-3.5 h-3.5 text-sky-400" />
                  มุมมองภาพ (Field of View)
                </span>
                <span className="font-mono-num text-sky-400 font-bold">{settings.fov}°</span>
              </div>
              <input
                type="range"
                min={68}
                max={105}
                step={1}
                value={settings.fov}
                onChange={(e) => patch({ fov: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="space-y-2.5 pt-2 border-t border-white/8">
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                มิกเซอร์เสียง 5 แชนแนล (3D Tactical Audio)
              </div>
              {(
                [
                  ['master', 'เสียงรวม (Master)', 'text-emerald-400'],
                  ['sfx', 'เสียงปืน & ระเบิด (SFX)', 'text-amber-400'],
                  ['ambience', 'เสียงบรรยากาศ & ฝีเท้า', 'text-sky-400'],
                  ['ui', 'เสียงเมนู & Hitmarker', 'text-slate-300'],
                  ['voice', 'เสียงวิทยุสื่อสาร (Voice)', 'text-indigo-300'],
                ] as const
              ).map(([ch, label, colorCls]) => {
                const val = settings.audioMix?.[ch] ?? DEFAULT_AUDIO_MIX[ch];
                return (
                  <div key={ch} className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-300">
                      <span>{label}</span>
                      <span className={`font-mono-num font-bold ${colorCls}`}>{val}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={val}
                      onChange={(e) => patchAudioMix(ch, Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-[#0B0F18] border border-white/10 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 py-1 border-b border-white/8">
              <div>
                <div className="font-medium text-white">โหมดเล็งศูนย์ปืน (ADS)</div>
                <div className="text-[11px] text-slate-400">
                  เลือกคลิกขวาค้าง หรือคลิกขวาครั้งเดียวเพื่อเปิด/ปิด
                </div>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-[#090C12] border border-white/10 rounded">
                <button
                  type="button"
                  onClick={() => patch({ toggleAds: false })}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                    !settings.toggleAds ? 'bg-amber-500 text-[#090C12]' : 'text-slate-400'
                  }`}
                >
                  กดค้าง
                </button>
                <button
                  type="button"
                  onClick={() => patch({ toggleAds: true })}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                    settings.toggleAds ? 'bg-amber-500 text-[#090C12]' : 'text-slate-400'
                  }`}
                >
                  กดสลับ
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 py-1 border-b border-white/8">
              <div>
                <div className="font-medium text-white">โหมดย่อตัวหลบ (Crouch)</div>
                <div className="text-[11px] text-slate-400">
                  กดค้าง หรือกดสลับ (กดขณะวิ่งจะเป็นการสไลด์พุ่งหลบ)
                </div>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-[#090C12] border border-white/10 rounded">
                <button
                  type="button"
                  onClick={() => patch({ toggleCrouch: false })}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                    !settings.toggleCrouch ? 'bg-amber-500 text-[#090C12]' : 'text-slate-400'
                  }`}
                >
                  กดค้าง
                </button>
                <button
                  type="button"
                  onClick={() => patch({ toggleCrouch: true })}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                    settings.toggleCrouch ? 'bg-amber-500 text-[#090C12]' : 'text-slate-400'
                  }`}
                >
                  กดสลับ
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-white/8">
              <div>
                <div className="font-medium text-white inline-flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-sky-400" />
                  โหมดอุปกรณ์ (Desktop / Mobile)
                </div>
                <div className="text-[11px] text-slate-400">
                  แยกชุดควบคุมอัตโนมัติ: Desktop ใช้เมาส์+คีย์บอร์ด · มือถือใช้จอยสัมผัส
                </div>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-[#090C12] border border-white/10 rounded shrink-0">
                {(
                  [
                    ['auto', 'อัตโนมัติ'],
                    ['desktop', 'PC'],
                    ['mobile', 'มือถือ'],
                  ] as const
                ).map(([mId, mLabel]) => (
                  <button
                    key={mId}
                    type="button"
                    onClick={() => setPlatformMode(mId)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      (settings.inputMode ?? 'auto') === mId
                        ? 'bg-amber-500 text-[#090C12]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 py-1 border-b border-white/8">
              <div>
                <div className="font-medium text-white inline-flex items-center gap-1.5">
                  <Gamepad2 className="w-3.5 h-3.5 text-sky-400" />
                  แถบปุ่มลัดด้านล่างหน้าจอ (HUD Hints)
                </div>
                <div className="text-[11px] text-slate-400">
                  แสดงคีย์ลัดระหว่างเล่น (กดปุ่ม {formatKeyCode(settings.keybinds.toggleHud)} ซ่อน/แสดงได้ตลอด)
                </div>
              </div>
              <button
                type="button"
                onClick={() => patch({ showKeyHints: !settings.showKeyHints })}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.showKeyHints
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-[#090C12] border-white/15 text-slate-400 hover:text-white'
                }`}
              >
                {settings.showKeyHints ? 'แสดง' : 'ซ่อน'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <div className="font-medium text-white inline-flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                  แสดงข้อมูล FPS / Ping / Draw Calls (กด F3)
                </div>
                <div className="text-[11px] text-slate-400">
                  แถบวัดเฟรมเรต 1% Low และความหน่วงเครือข่ายแบบเรียลไทม์มุมบน
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  patch({ showPerfHud: !settings.showPerfHud });
                }}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.showPerfHud
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-[#090C12] border-white/15 text-slate-400 hover:text-white'
                }`}
              >
                {settings.showPerfHud ? 'แสดงอยู่' : 'ปิดอยู่'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1.5: Dedicated Mobile Ergonomics & Aim Assist Studio */}
      {subTab === 'mobile' && (
        <div className={`grid grid-cols-1 ${compact ? '' : 'lg:grid-cols-2'} gap-4 text-xs`}>
          <div className="bg-[#0B0F18] border border-white/10 rounded-lg p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div>
                <div className="font-semibold text-white inline-flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  โหมดควบคุมบนมือถือ (Touch Controls)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  เลือกแยก Desktop (เมาส์+คีย์บอร์ด) กับ Mobile (จอยสัมผัส) ได้ทันที
                </div>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-[#090C12] border border-white/10 rounded shrink-0">
                {(
                  [
                    ['auto', 'อัตโนมัติ'],
                    ['desktop', 'Desktop PC'],
                    ['mobile', 'มือถือ'],
                  ] as const
                ).map(([mId, mLabel]) => (
                  <button
                    key={mId}
                    type="button"
                    onClick={() => setPlatformMode(mId)}
                    className={`px-2.5 py-1.5 rounded text-[11px] font-semibold cursor-pointer ${
                      (settings.inputMode ?? 'auto') === mId
                        ? 'bg-emerald-500 text-[#090C12]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {mLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="font-medium">ความไวลากหันจอมือถือ (Touch Sensitivity)</span>
                <span className="font-mono-num text-amber-400 font-bold">
                  {settings.touchSensitivity.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0.8}
                max={6.0}
                step={0.1}
                value={settings.touchSensitivity}
                onChange={(e) => patch({ touchSensitivity: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="font-medium">ขนาดปุ่มกดบนมือถือ (Button Scale)</span>
                <span className="font-mono-num text-sky-400 font-bold">
                  {Math.round(settings.touchButtonScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.85}
                max={1.35}
                step={0.05}
                value={settings.touchButtonScale}
                onChange={(e) => patch({ touchButtonScale: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="bg-[#0B0F18] border border-white/10 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/8">
              <div>
                <div className="font-semibold text-white">ช่วยเล็งอัตโนมัติ (Mobile Aim Assist)</div>
                <div className="text-[11px] text-slate-400">
                  หน่วงเป้าและช่วยดึงศูนย์เข้าหาศัตรูอย่างนุ่มนวลเมื่อลากนิ้วผ่านเป้าหมาย
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  patch({ aimAssist: !settings.aimAssist });
                }}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.aimAssist
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-[#090C12] border-white/15 text-slate-400'
                }`}
              >
                {settings.aimAssist ? 'เปิด (แนะนำ)' : 'ปิด'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/8">
              <div>
                <div className="font-semibold text-white">ยิงอัตโนมัติเมื่อเป้าตรงศัตรู (Auto-Fire)</div>
                <div className="text-[11px] text-slate-400">
                  สไตล์ CoD Mobile — แค่หันเป้าให้ตรงศัตรูปืนจะยิงให้อัตโนมัติ เล่นมือเดียวก็ยังง่าย!
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  patch({ autoFire: !settings.autoFire });
                }}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.autoFire
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-[#090C12] border-white/15 text-slate-400'
                }`}
              >
                {settings.autoFire ? 'เปิดใช้งาน' : 'ปิดอยู่'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 py-1.5">
              <div>
                <div className="font-semibold text-white">กดปุ่มยิงขวาแล้วเล็งศูนย์ทันที (1-Tap ADS+Fire)</div>
                <div className="text-[11px] text-slate-400">
                  กดปุ่มยิงขวาจะยกศูนย์เล็ง+ยิงพร้อมกันทันที ปล่อยนิ้วจะออกจากศูนย์อัตโนมัติ
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  patch({ adsOnFire: !settings.adsOnFire });
                }}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.adsOnFire
                    ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                    : 'bg-[#090C12] border-white/15 text-slate-400'
                }`}
              >
                {settings.adsOnFire ? 'เปิดใช้งาน' : 'ปิดอยู่'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Interactive Keybind Remapper */}
      {subTab === 'keybinds' && (
        <div className="bg-[#0B0F18] border border-white/10 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>คลิกที่ปุ่มใดก็ได้แล้วกดคีย์บอร์ดปุ่มใหม่เพื่อตั้งค่า (กด ESC เพื่อยกเลิก)</span>
            <span className="font-mono-num text-amber-400">ยิง: คลิกซ้าย · เล็ง: คลิกขวา</span>
          </div>

          <div
            className={`grid grid-cols-1 ${compact ? 'sm:grid-cols-2 max-h-60 overflow-y-auto pr-1' : 'sm:grid-cols-2 lg:grid-cols-3'} gap-2`}
          >
            {KEY_ACTION_LABELS.map((item) => {
              const isListening = listeningAction === item.action;
              return (
                <div
                  key={item.action}
                  className="flex items-center justify-between gap-2 bg-[#111623] border border-white/8 rounded px-3 py-2 text-xs"
                >
                  <span className="text-slate-200 truncate">{item.label}</span>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setListeningAction(isListening ? null : item.action);
                    }}
                    className={`min-w-[64px] px-2.5 py-1 rounded font-mono-num text-[11px] font-bold border transition-colors cursor-pointer ${
                      isListening
                        ? 'bg-amber-500 text-[#090C12] border-amber-400'
                        : 'bg-[#090C12] text-amber-300 border-white/15 hover:border-amber-500/60'
                    }`}
                  >
                    {isListening ? 'กดปุ่ม...' : formatKeyCode(settings.keybinds[item.action])}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Live Crosshair Designer & 3D Graphics Quality */}
      {subTab === 'visuals' && (
        <div className={`grid grid-cols-1 ${compact ? '' : 'lg:grid-cols-2'} gap-4 text-xs`}>
          {/* Live Crosshair Preview + Customization */}
          <div className="bg-[#0B0F18] border border-white/10 rounded-lg p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">ออกแบบเป้าเล็ง (Crosshair Studio)</span>
              <span className="font-mono-num text-[11px] text-slate-400">
                ขนาด {Math.round(settings.crosshairSize * 100)}%
              </span>
            </div>

            {/* Live Target Preview Viewport */}
            <div className="relative h-28 rounded-md bg-gradient-to-b from-[#172133] via-[#1d2738] to-[#121824] border border-white/10 flex items-center justify-center overflow-hidden">
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at center, rgba(255,255,255,0.22) 1px, transparent 1px)',
                  backgroundSize: '18px 18px',
                }}
              />
              <div className="relative flex items-center justify-center">
                {settings.crosshairStyle === 'circle' ? (
                  <>
                    <div
                      className="rounded-full border-2"
                      style={{
                        borderColor: settings.crosshairColor,
                        width: `${Math.round(30 * settings.crosshairSize)}px`,
                        height: `${Math.round(30 * settings.crosshairSize)}px`,
                      }}
                    />
                    <div
                      className="w-1.5 h-1.5 rounded-full absolute"
                      style={{ backgroundColor: settings.crosshairColor }}
                    />
                  </>
                ) : settings.crosshairStyle === 'dot' ? (
                  <div
                    className="rounded-full"
                    style={{
                      backgroundColor: settings.crosshairColor,
                      width: `${Math.round(5 * settings.crosshairSize)}px`,
                      height: `${Math.round(5 * settings.crosshairSize)}px`,
                    }}
                  />
                ) : (
                  <>
                    <div
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: settings.crosshairColor }}
                    />
                    {settings.crosshairStyle !== 'tshape' && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2 w-[2px]"
                        style={{
                          backgroundColor: settings.crosshairColor,
                          height: `${previewLen}px`,
                          bottom: `${previewGap}px`,
                        }}
                      />
                    )}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-[2px]"
                      style={{
                        backgroundColor: settings.crosshairColor,
                        height: `${previewLen}px`,
                        top: `${previewGap}px`,
                      }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-[2px]"
                      style={{
                        backgroundColor: settings.crosshairColor,
                        width: `${previewLen}px`,
                        right: `${previewGap}px`,
                      }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-[2px]"
                      style={{
                        backgroundColor: settings.crosshairColor,
                        width: `${previewLen}px`,
                        left: `${previewGap}px`,
                      }}
                    />
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {CROSSHAIR_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => patch({ crosshairStyle: st.id })}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border cursor-pointer ${
                    settings.crosshairStyle === st.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-[#090C12] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {CROSSHAIR_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => patch({ crosshairColor: c.value })}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] border cursor-pointer ${
                      settings.crosshairColor === c.value
                        ? 'border-amber-400 text-white bg-white/10'
                        : 'border-white/10 text-slate-400 bg-[#090C12]'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: c.value }}
                    />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>ขนาดเป้าเล็ง</span>
                <span className="font-mono-num text-amber-400">
                  {settings.crosshairSize.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.8}
                step={0.1}
                value={settings.crosshairSize}
                onChange={(e) => patch({ crosshairSize: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* 3D Graphics Quality Presets (5 Tiers + Auto Dynamic Resolution) */}
          <div className="bg-[#0B0F18] border border-white/10 rounded-lg p-4 space-y-2.5">
            <div className="font-semibold text-white">คุณภาพภาพ 3D และแสงเงา (Graphics Quality)</div>
            <div className="space-y-1.5">
              {(
                [
                  {
                    id: 'auto' as GraphicsQuality,
                    title: 'อัตโนมัติ (Auto DRS · แนะนำ)',
                    desc: 'ปรับความละเอียดอัตโนมัติตามเฟรมเรตจริง (Desktop ล็อก 60 FPS / มือถือลื่นเสถียร)',
                  },
                  {
                    id: 'ultra' as GraphicsQuality,
                    title: 'สูงสุด (Ultra · Desktop AAA)',
                    desc: 'เงา Soft Shadow 2048px + Selective Bloom แสงไฟ & ประกายปากกระบอก + IBL เต็มรูปแบบ',
                  },
                  {
                    id: 'high' as GraphicsQuality,
                    title: 'สูง (High)',
                    desc: 'เงา Soft Shadow 1024px + Selective Bloom อ่อนๆ + ฝุ่นบรรยากาศครบถ้วน',
                  },
                  {
                    id: 'medium' as GraphicsQuality,
                    title: 'กลาง (Medium · สมดุล)',
                    desc: 'เงาและแสงครบถ้วน ปิด Post-FX เพื่อให้เฟรมเรตนิ่งบนโน้ตบุ๊กและมือถือ',
                  },
                  {
                    id: 'low' as GraphicsQuality,
                    title: 'ประหยัด (Low · FPS สูงสุด)',
                    desc: 'ปิดเงาเรียลไทม์และเอฟเฟกต์เสริม เหมาะสำหรับอุปกรณ์สเปกประหยัด',
                  },
                ] as const
              ).map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    patch({ graphicsQuality: q.id });
                  }}
                  className={`w-full text-left p-2.5 rounded-md border transition-colors cursor-pointer ${
                    settings.graphicsQuality === q.id
                      ? 'bg-amber-500/15 border-amber-400 text-white'
                      : 'bg-[#111623] border-white/10 text-slate-300 hover:border-white/25'
                  }`}
                >
                  <div className="font-semibold text-xs">{q.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{q.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
