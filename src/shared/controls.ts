export type KeyAction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'leanLeft'
  | 'leanRight'
  | 'reload'
  | 'grenade'
  | 'quickSwitch'
  | 'quickMelee'
  | 'inspect'
  | 'radio'
  | 'toggleHud';

export type KeyBindings = Record<KeyAction, string>;

export type CrosshairStyle = 'classic' | 'tshape' | 'dot' | 'circle';
export type GraphicsQuality = 'auto' | 'ultra' | 'high' | 'medium' | 'low';
export type InputMode = 'auto' | 'desktop' | 'mobile';

export interface AudioMixSettings {
  master: number; // 0 - 100
  sfx: number; // 0 - 100
  ambience: number; // 0 - 100
  ui: number; // 0 - 100
  voice: number; // 0 - 100
}

export interface ControlSettings {
  inputMode: InputMode; // 'auto' follows device, or explicit 'desktop' / 'mobile'
  sensitivity: number; // 0.6 - 6.0 (Mouse)
  touchSensitivity: number; // 0.8 - 6.0 (Touch drag look)
  fov: number; // 68 - 105
  volume: number; // 0 - 100 (legacy master mirror)
  audioMix: AudioMixSettings;
  crosshairColor: string;
  crosshairStyle: CrosshairStyle;
  crosshairSize: number; // 0.7 - 1.8 (scale)
  toggleAds: boolean;
  toggleCrouch: boolean;
  showKeyHints: boolean;
  showPerfHud: boolean;
  touchControls: boolean;
  aimAssist: boolean; // Soft magnetic aim assist on touch mode
  autoFire: boolean; // Auto-fire when enemy is in crosshair (mobile)
  adsOnFire: boolean; // 1-tap ADS + Fire button behavior on mobile
  touchButtonScale: number; // 0.85 - 1.35 scale multiplier for mobile buttons
  graphicsQuality: GraphicsQuality;
  keybinds: KeyBindings;
}

export const DEFAULT_KEYBINDS: KeyBindings = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  leanLeft: 'KeyQ',
  leanRight: 'KeyE',
  reload: 'KeyR',
  grenade: 'KeyG',
  quickSwitch: 'KeyF',
  quickMelee: 'KeyX',
  inspect: 'KeyV',
  radio: 'KeyZ',
  toggleHud: 'KeyH',
};

export const KEY_ACTION_LABELS: Array<{
  action: KeyAction;
  label: string;
  group: 'move' | 'combat' | 'utility';
}> = [
  { action: 'forward', label: 'เดินหน้า', group: 'move' },
  { action: 'backward', label: 'ถอยหลัง', group: 'move' },
  { action: 'left', label: 'เดินซ้าย', group: 'move' },
  { action: 'right', label: 'เดินขวา', group: 'move' },
  { action: 'jump', label: 'กระโดด', group: 'move' },
  { action: 'sprint', label: 'วิ่งเร็ว (Sprint)', group: 'move' },
  { action: 'crouch', label: 'ย่อ / สไลด์ (เมื่อวิ่ง)', group: 'move' },
  { action: 'leanLeft', label: 'เอียงตัวหลบซ้าย', group: 'move' },
  { action: 'leanRight', label: 'เอียงตัวหลบขวา', group: 'move' },
  { action: 'reload', label: 'รีโหลดกระสุน', group: 'combat' },
  { action: 'grenade', label: 'ปาระเบิด M67 ทันที', group: 'combat' },
  { action: 'quickSwitch', label: 'สลับอาวุธด่วน', group: 'combat' },
  { action: 'quickMelee', label: 'ฟันมีดฉับพลัน', group: 'combat' },
  { action: 'inspect', label: 'หมุนชมอาวุธ', group: 'utility' },
  { action: 'radio', label: 'เมนูวิทยุสื่อสารทีม', group: 'utility' },
  { action: 'toggleHud', label: 'ซ่อน/แสดงแถบปุ่มลัด', group: 'utility' },
];

export const CROSSHAIR_COLORS = [
  { id: 'green', label: 'เขียว', value: '#22c55e' },
  { id: 'amber', label: 'อำพัน', value: '#ffb020' },
  { id: 'cyan', label: 'ฟ้า', value: '#4fd1ff' },
  { id: 'white', label: 'ขาว', value: '#ffffff' },
  { id: 'red', label: 'แดง', value: '#ef4444' },
];

export const CROSSHAIR_STYLES: Array<{ id: CrosshairStyle; label: string }> = [
  { id: 'classic', label: 'กากบาท Tactical' },
  { id: 'tshape', label: 'T-Shape โปร' },
  { id: 'circle', label: 'วงกลมจุดกลาง' },
  { id: 'dot', label: 'จุด Dot คม' },
];

export const RADIO_COMMANDS: Array<{ key: string; code: string; label: string; chatText: string }> = [
  { key: '1', code: 'Digit1', label: 'บุกโจมตี!', chatText: '[วิทยุ] บุกโจมตีเลย! Go Go Go!' },
  { key: '2', code: 'Digit2', label: 'คุ้มกันฉันด้วย!', chatText: '[วิทยุ] คุ้มกันฉันด้วย! Cover Me!' },
  { key: '3', code: 'Digit3', label: 'พบข้าศึก!', chatText: '[วิทยุ] พบข้าศึกอยู่ข้างหน้า! Enemy Spotted!' },
  { key: '4', code: 'Digit4', label: 'ถอยตั้งหลัก!', chatText: '[วิทยุ] ถอยกลับมาตั้งหลัก! Fall Back!' },
  { key: '5', code: 'Digit5', label: 'ยอดเยี่ยม!', chatText: '[วิทยุ] ยอดเยี่ยมมาก! Nice Shot!' },
];

/**
 * Accurately distinguishes true Mobile/Tablet touch devices from Desktop/Laptop PCs
 * (even Windows touchscreen laptops or Desktop browsers inside compact iframes).
 */
export function detectTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const uaMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  // iPadOS 13+ reports Macintosh UA with multi-touch and no fine mouse hover
  const isIPadOs =
    /Macintosh/i.test(ua) &&
    navigator.maxTouchPoints > 1 &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (uaMobile || isIPadOs) return true;

  // Desktop OS with a fine pointer / mouse hover is NEVER auto-treated as mobile
  const hasDesktopMouse =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(pointer: fine)').matches ||
      window.matchMedia('(hover: hover)').matches);
  if (hasDesktopMouse) return false;

  // Fallback for unknown mobile browsers whose primary pointer is coarse with no hover
  const primaryCoarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return primaryCoarse;
}

export function resolveTouchControls(inputMode: InputMode): boolean {
  if (inputMode === 'mobile') return true;
  if (inputMode === 'desktop') return false;
  return detectTouchDevice();
}

export const DEFAULT_AUDIO_MIX: AudioMixSettings = {
  master: 75,
  sfx: 100,
  ambience: 65,
  ui: 80,
  voice: 90,
};

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  inputMode: 'auto',
  sensitivity: 2.2,
  touchSensitivity: 2.6,
  fov: 76,
  volume: 75,
  audioMix: { ...DEFAULT_AUDIO_MIX },
  crosshairColor: '#22c55e',
  crosshairStyle: 'classic',
  crosshairSize: 1.0,
  toggleAds: false,
  toggleCrouch: false,
  showKeyHints: true,
  showPerfHud: false,
  touchControls: false,
  aimAssist: true,
  autoFire: false,
  adsOnFire: false,
  touchButtonScale: 1.0,
  graphicsQuality: 'auto',
  keybinds: { ...DEFAULT_KEYBINDS },
};

const STORAGE_KEY = 'sf_control_settings_v1';
const VALID_QUALITIES: GraphicsQuality[] = ['auto', 'ultra', 'high', 'medium', 'low'];
const VALID_INPUT_MODES: InputMode[] = ['auto', 'desktop', 'mobile'];

export function loadControlSettings(): ControlSettings {
  const isTouch = detectTouchDevice();
  const base: ControlSettings = {
    ...DEFAULT_CONTROL_SETTINGS,
    inputMode: 'auto',
    touchControls: isTouch,
    graphicsQuality: 'auto',
    audioMix: { ...DEFAULT_AUDIO_MIX },
    keybinds: { ...DEFAULT_KEYBINDS },
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<ControlSettings>;
    const vol = Math.max(0, Math.min(100, Math.round(Number(parsed.volume ?? base.volume))));
    const rawMix = parsed.audioMix;
    const audioMix: AudioMixSettings = {
      master: Math.max(0, Math.min(100, Math.round(Number(rawMix?.master ?? vol)))),
      sfx: Math.max(0, Math.min(100, Math.round(Number(rawMix?.sfx ?? DEFAULT_AUDIO_MIX.sfx)))),
      ambience: Math.max(
        0,
        Math.min(100, Math.round(Number(rawMix?.ambience ?? DEFAULT_AUDIO_MIX.ambience)))
      ),
      ui: Math.max(0, Math.min(100, Math.round(Number(rawMix?.ui ?? DEFAULT_AUDIO_MIX.ui)))),
      voice: Math.max(
        0,
        Math.min(100, Math.round(Number(rawMix?.voice ?? DEFAULT_AUDIO_MIX.voice)))
      ),
    };
    const quality =
      parsed.graphicsQuality && VALID_QUALITIES.includes(parsed.graphicsQuality)
        ? parsed.graphicsQuality
        : base.graphicsQuality;

    // Migrate legacy saves (which lacked inputMode) to 'auto' so Desktop PCs are cleanly separated from Mobile
    const inputMode: InputMode =
      parsed.inputMode && VALID_INPUT_MODES.includes(parsed.inputMode)
        ? parsed.inputMode
        : 'auto';
    const touchControls = resolveTouchControls(inputMode);

    return {
      ...base,
      ...parsed,
      inputMode,
      touchControls,
      sensitivity: Math.max(0.6, Math.min(6, Number(parsed.sensitivity ?? base.sensitivity))),
      touchSensitivity: Math.max(
        0.8,
        Math.min(6, Number(parsed.touchSensitivity ?? base.touchSensitivity))
      ),
      fov: Math.max(68, Math.min(105, Math.round(Number(parsed.fov ?? base.fov)))),
      volume: audioMix.master,
      audioMix,
      graphicsQuality: quality,
      crosshairSize: Math.max(0.7, Math.min(1.8, Number(parsed.crosshairSize ?? base.crosshairSize))),
      touchButtonScale: Math.max(
        0.85,
        Math.min(1.35, Number(parsed.touchButtonScale ?? base.touchButtonScale))
      ),
      showPerfHud: parsed.showPerfHud !== undefined ? Boolean(parsed.showPerfHud) : base.showPerfHud,
      aimAssist: parsed.aimAssist !== undefined ? Boolean(parsed.aimAssist) : base.aimAssist,
      autoFire: parsed.autoFire !== undefined ? Boolean(parsed.autoFire) : base.autoFire,
      adsOnFire: parsed.adsOnFire !== undefined ? Boolean(parsed.adsOnFire) : base.adsOnFire,
      keybinds: {
        ...DEFAULT_KEYBINDS,
        ...(parsed.keybinds && typeof parsed.keybinds === 'object' ? parsed.keybinds : {}),
      },
    };
  } catch {
    return base;
  }
}

export function saveControlSettings(settings: ControlSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage failures
  }
}

export function formatKeyCode(code: string): string {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'SPACE';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
  if (code === 'Tab') return 'TAB';
  return code.toUpperCase().slice(0, 6);
}

/**
 * Enters or exits fullscreen and attempts to lock mobile screen orientation to landscape.
 */
export async function toggleFullscreenLandscape(enter: boolean): Promise<boolean> {
  try {
    const orientationApi = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
      unlock?: () => void;
    };

    if (enter) {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
      if (orientationApi && typeof orientationApi.lock === 'function') {
        await orientationApi.lock('landscape');
        return true;
      }
      return window.innerWidth > window.innerHeight;
    }

    if (orientationApi && typeof orientationApi.unlock === 'function') {
      try {
        orientationApi.unlock();
      } catch {
        // ignore unlock failure
      }
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen().catch(() => {});
    }
    return true;
  } catch {
    return window.innerWidth > window.innerHeight;
  }
}
