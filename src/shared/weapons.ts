import type { PrimaryWeaponId, TeamSize, WeaponId, WeaponRule, WeaponSlot } from './types';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  thaiCategory: string;
  slot: WeaponSlot;
  damage: number;
  pellets: number; // 1 for standard guns, 8 for M870 shotgun
  headshotMult: number;
  fireRateMs: number;
  automatic: boolean;
  magSize: number;
  reserveAmmo: number;
  reloadTimeMs: number;
  spread: number;
  adsSpread: number;
  recoilKick: number;
  moveSpeedMult: number;
  range: number;
  adsFov: number;
  hasScope: boolean;
  description: string;
  stats: {
    damage: number;
    fireRate: number;
    accuracy: number;
    mobility: number;
  };
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  m4a1: {
    id: 'm4a1',
    name: 'M4A1 Tactical',
    thaiCategory: 'ปืนไรเฟิลจู่โจม',
    slot: 1,
    damage: 30,
    pellets: 1,
    headshotMult: 2.5,
    fireRateMs: 95,
    automatic: true,
    magSize: 30,
    reserveAmmo: 120,
    reloadTimeMs: 1850,
    spread: 0.014,
    adsSpread: 0.004,
    recoilKick: 0.016,
    moveSpeedMult: 1.0,
    range: 120,
    adsFov: 52,
    hasScope: false,
    description: 'สมดุลยอดเยี่ยม ยิงนิ่ง ควบคุมง่าย เหมาะกับทุกระยะการรบ',
    stats: { damage: 72, fireRate: 82, accuracy: 86, mobility: 78 },
  },
  ak74: {
    id: 'ak74',
    name: 'AK-74 Classic',
    thaiCategory: 'ปืนไรเฟิลจู่โจม',
    slot: 1,
    damage: 38,
    pellets: 1,
    headshotMult: 2.7,
    fireRateMs: 110,
    automatic: true,
    magSize: 30,
    reserveAmmo: 120,
    reloadTimeMs: 2050,
    spread: 0.02,
    adsSpread: 0.007,
    recoilKick: 0.024,
    moveSpeedMult: 0.96,
    range: 120,
    adsFov: 54,
    hasScope: false,
    description: 'พลังทำลายล้างสูง ยิงหัวทีเดียวร่วง แรงดีดสูงกว่าแต่เด็ดขาด',
    stats: { damage: 90, fireRate: 74, accuracy: 72, mobility: 74 },
  },
  scar: {
    id: 'scar',
    name: 'SCAR-H Tactical',
    thaiCategory: 'ปืนไรเฟิลรบหนัก',
    slot: 1,
    damage: 36,
    pellets: 1,
    headshotMult: 2.6,
    fireRateMs: 112,
    automatic: true,
    magSize: 20,
    reserveAmmo: 100,
    reloadTimeMs: 2000,
    spread: 0.013,
    adsSpread: 0.0028,
    recoilKick: 0.021,
    moveSpeedMult: 0.96,
    range: 145,
    adsFov: 50,
    hasScope: false,
    description: 'ไรเฟิล 7.62 มม. หน่วยรบพิเศษ ยิงแรงและแม่นยำสูง พร้อมกล้อง Holo ยุทธวิธี',
    stats: { damage: 88, fireRate: 75, accuracy: 91, mobility: 76 },
  },
  psg1: {
    id: 'psg1',
    name: 'PSG-1 Sniper',
    thaiCategory: 'ปืนสไนเปอร์ไรเฟิล',
    slot: 1,
    damage: 88,
    pellets: 1,
    headshotMult: 2.4,
    fireRateMs: 760,
    automatic: false,
    magSize: 5,
    reserveAmmo: 25,
    reloadTimeMs: 2350,
    spread: 0.045,
    adsSpread: 0.0005,
    recoilKick: 0.052,
    moveSpeedMult: 0.88,
    range: 180,
    adsFov: 20,
    hasScope: true,
    description: 'สไนเปอร์กึ่งอัตโนมัติในตำนาน คลิกขวาซูมกล้องเล็ง แม่นยำสูงสุด',
    stats: { damage: 95, fireRate: 34, accuracy: 98, mobility: 64 },
  },
  awp: {
    id: 'awp',
    name: 'AWM .338 Magnum',
    thaiCategory: 'สไนเปอร์ลูกเลื่อนหนัก',
    slot: 1,
    damage: 112,
    pellets: 1,
    headshotMult: 2.5,
    fireRateMs: 1220,
    automatic: false,
    magSize: 5,
    reserveAmmo: 25,
    reloadTimeMs: 2650,
    spread: 0.052,
    adsSpread: 0.0003,
    recoilKick: 0.072,
    moveSpeedMult: 0.85,
    range: 220,
    adsFov: 17,
    hasScope: true,
    description: 'สไนเปอร์ลูกเลื่อน .338 แม็กนั่ม นัดเดียวปลิดชีพกลางลำตัว พลังทำลายสูงสุด',
    stats: { damage: 100, fireRate: 22, accuracy: 100, mobility: 58 },
  },
  m870: {
    id: 'm870',
    name: 'M870 Tactical',
    thaiCategory: 'ปืนลูกซองปั๊มแอ็กชัน',
    slot: 1,
    damage: 22, // x 8 pellets = up to 176 close range!
    pellets: 8,
    headshotMult: 1.75,
    fireRateMs: 820,
    automatic: false,
    magSize: 6,
    reserveAmmo: 30,
    reloadTimeMs: 2200,
    spread: 0.062,
    adsSpread: 0.042,
    recoilKick: 0.068,
    moveSpeedMult: 0.98,
    range: 36,
    adsFov: 60,
    hasScope: false,
    description: 'ลูกซอง 12 เกจ ยิงกระจาย 8 เม็ดต่อนัด สังหารระยะประชิดในนัดเดียว พร้อมแอนิเมชันปั๊มลูก',
    stats: { damage: 100, fireRate: 34, accuracy: 56, mobility: 84 },
  },
  mp5: {
    id: 'mp5',
    name: 'MP5-N Tactical',
    thaiCategory: 'ปืนกลมือเก็บเสียง (SMG)',
    slot: 1,
    damage: 24,
    pellets: 1,
    headshotMult: 2.4,
    fireRateMs: 74,
    automatic: true,
    magSize: 35,
    reserveAmmo: 140,
    reloadTimeMs: 1550,
    spread: 0.017,
    adsSpread: 0.007,
    recoilKick: 0.011,
    moveSpeedMult: 1.09,
    range: 85,
    adsFov: 56,
    hasScope: false,
    description: 'อัตราการยิงเร็วมาก เก็บเสียง คล่องตัวสูง เหมาะสำหรับสายบุกประชิด',
    stats: { damage: 58, fireRate: 92, accuracy: 80, mobility: 92 },
  },
  p90: {
    id: 'p90',
    name: 'P90 Tactical PDW',
    thaiCategory: 'ปืนกลมือแม็กใส 50 นัด',
    slot: 1,
    damage: 21,
    pellets: 1,
    headshotMult: 2.3,
    fireRateMs: 62,
    automatic: true,
    magSize: 50,
    reserveAmmo: 150,
    reloadTimeMs: 1950,
    spread: 0.016,
    adsSpread: 0.006,
    recoilKick: 0.0095,
    moveSpeedMult: 1.11,
    range: 92,
    adsFov: 55,
    hasScope: false,
    description: 'ปืนกลมือหน่วยรบพิเศษแม็กใส 50 นัด ยิงรัวสุดขีด วิ่งไวทะลวงแนวหน้า',
    stats: { damage: 54, fireRate: 100, accuracy: 83, mobility: 96 },
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    thaiCategory: 'ปืนพกสั้น',
    slot: 2,
    damage: 48,
    pellets: 1,
    headshotMult: 2.5,
    fireRateMs: 270,
    automatic: false,
    magSize: 7,
    reserveAmmo: 35,
    reloadTimeMs: 1500,
    spread: 0.015,
    adsSpread: 0.005,
    recoilKick: 0.036,
    moveSpeedMult: 1.07,
    range: 80,
    adsFov: 58,
    hasScope: false,
    description: 'ปืนพกแรงสูง พกติดตัวเป็นอาวุธรองคู่ใจสไนเปอร์ หรือใช้ดวลปืนพกล้วน',
    stats: { damage: 84, fireRate: 48, accuracy: 82, mobility: 90 },
  },
  knife: {
    id: 'knife',
    name: 'Combat Knife',
    thaiCategory: 'มีดต่อสู้ประชิด',
    slot: 3,
    damage: 65,
    pellets: 1,
    headshotMult: 1.8,
    fireRateMs: 420,
    automatic: false,
    magSize: 1,
    reserveAmmo: 0,
    reloadTimeMs: 0,
    spread: 0,
    adsSpread: 0,
    recoilKick: 0.01,
    moveSpeedMult: 1.2,
    range: 3.1,
    adsFov: 74,
    hasScope: false,
    description: 'วิ่งเร็วที่สุดเมื่อถือมีด ฟันระยะประชิดแรงมาก',
    stats: { damage: 80, fireRate: 62, accuracy: 100, mobility: 100 },
  },
  frag: {
    id: 'frag',
    name: 'M67 Frag',
    thaiCategory: 'ระเบิดมือสังหาร',
    slot: 4,
    damage: 130,
    pellets: 1,
    headshotMult: 1.0,
    fireRateMs: 900,
    automatic: false,
    magSize: 1,
    reserveAmmo: 0,
    reloadTimeMs: 0,
    spread: 0,
    adsSpread: 0,
    recoilKick: 0.02,
    moveSpeedMult: 1.12,
    range: 30,
    adsFov: 74,
    hasScope: false,
    description: 'ระเบิดมือทำลายพื้นที่ กด G หรือเลข 4 เพื่อขว้างใส่ศัตรู',
    stats: { damage: 100, fireRate: 25, accuracy: 70, mobility: 94 },
  },
};

export const PRIMARY_WEAPONS: PrimaryWeaponId[] = [
  'm4a1',
  'ak74',
  'scar',
  'psg1',
  'awp',
  'm870',
  'mp5',
  'p90',
];

export interface WeaponRuleSpec {
  id: WeaponRule;
  label: string;
  shortLabel: string;
  description: string;
  allowedSlots: WeaponSlot[];
  defaultSlot: WeaponSlot;
  forcedPrimary?: PrimaryWeaponId;
  allowedPrimaries?: PrimaryWeaponId[];
}

export const WEAPON_RULES: Record<WeaponRule, WeaponRuleSpec> = {
  all: {
    id: 'all',
    label: 'อาวุธอิสระ (All Weapons)',
    shortLabel: 'อาวุธครบ',
    description: 'เลือกใช้ปืนหลักได้ครบทั้ง 8 กระบอก พร้อมปืนพก มีด และระเบิดมือ',
    allowedSlots: [1, 2, 3, 4],
    defaultSlot: 1,
    allowedPrimaries: ['m4a1', 'ak74', 'scar', 'psg1', 'awp', 'm870', 'mp5', 'p90'],
  },
  sniper: {
    id: 'sniper',
    label: 'ดวลสไนเปอร์ (Sniper Only)',
    shortLabel: 'สไนล้วน',
    description: 'ดวลความคมด้วย PSG-1 หรือ AWM .338 Magnum พร้อมมีดสำหรับวิ่งสลับ',
    allowedSlots: [1, 3],
    defaultSlot: 1,
    allowedPrimaries: ['psg1', 'awp'],
  },
  shotgun: {
    id: 'shotgun',
    label: 'ดวลลูกซอง (Shotgun Only)',
    shortLabel: 'ลูกซองล้วน',
    description: 'ทุกคนดวลด้วยปืนลูกซอง M870 Tactical ระยะประชิดสุดเดือด',
    allowedSlots: [1, 3],
    defaultSlot: 1,
    forcedPrimary: 'm870',
    allowedPrimaries: ['m870'],
  },
  pistol: {
    id: 'pistol',
    label: 'ดวลปืนพก (Pistol Only)',
    shortLabel: 'ปืนพกล้วน',
    description: 'วัดความคมด้วย Desert Eagle เท่านั้น พร้อมมีดประชิด',
    allowedSlots: [2, 3],
    defaultSlot: 2,
  },
  rifle: {
    id: 'rifle',
    label: 'ดวลไรเฟิล (Rifle Duel)',
    shortLabel: 'ไรเฟิลล้วน',
    description: 'ดวลปืนกลจู่โจม M4A1 / AK-74 / SCAR-H เท่านั้น ไร้สไนเปอร์และระเบิด',
    allowedSlots: [1, 3],
    defaultSlot: 1,
    allowedPrimaries: ['m4a1', 'ak74', 'scar'],
  },
  knife: {
    id: 'knife',
    label: 'ดวลมีด (Knife Only)',
    shortLabel: 'มีดล้วน',
    description: 'ประลองความไวระยะประชิดด้วย Combat Knife ล้วนๆ',
    allowedSlots: [3],
    defaultSlot: 3,
  },
};

export const WEAPON_RULE_LIST: WeaponRuleSpec[] = [
  WEAPON_RULES.all,
  WEAPON_RULES.sniper,
  WEAPON_RULES.shotgun,
  WEAPON_RULES.pistol,
  WEAPON_RULES.rifle,
  WEAPON_RULES.knife,
];

export const TEAM_SIZES: TeamSize[] = [1, 2, 3, 4, 6];

export function getSlotPositionLabel(slotIndex: number): string {
  const labels = [
    'แนวหน้าซ้าย (Left Flank)',
    'แนวกลาง (Mid Push)',
    'แนวหน้าขวา (Right Flank)',
    'แนวหลังซ้าย (Back Left)',
    'ซุ่มยิงกลาง (Overwatch)',
    'แนวหลังขวา (Back Right)',
  ];
  return labels[slotIndex % labels.length];
}

export function resolveWeaponForRule(
  rule: WeaponRule,
  preferredPrimary: PrimaryWeaponId
): { primaryWeapon: PrimaryWeaponId; activeWeapon: WeaponId; defaultSlot: WeaponSlot } {
  const spec = WEAPON_RULES[rule] ?? WEAPON_RULES.all;
  if (spec.forcedPrimary) {
    return {
      primaryWeapon: spec.forcedPrimary,
      activeWeapon: spec.forcedPrimary,
      defaultSlot: 1,
    };
  }
  if (rule === 'pistol') {
    return { primaryWeapon: preferredPrimary, activeWeapon: 'deagle', defaultSlot: 2 };
  }
  if (rule === 'knife') {
    return { primaryWeapon: preferredPrimary, activeWeapon: 'knife', defaultSlot: 3 };
  }
  if (spec.allowedPrimaries && !spec.allowedPrimaries.includes(preferredPrimary)) {
    const fallback = spec.allowedPrimaries[0];
    return { primaryWeapon: fallback, activeWeapon: fallback, defaultSlot: 1 };
  }
  return { primaryWeapon: preferredPrimary, activeWeapon: preferredPrimary, defaultSlot: 1 };
}

export function isWeaponAllowedByRule(rule: WeaponRule, weaponId: WeaponId): boolean {
  const spec = WEAPON_RULES[rule] ?? WEAPON_RULES.all;
  const wSpec = WEAPONS[weaponId];
  if (!wSpec) return false;
  if (!spec.allowedSlots.includes(wSpec.slot)) return false;
  if (wSpec.slot === 1 && spec.allowedPrimaries) {
    return spec.allowedPrimaries.includes(weaponId as PrimaryWeaponId);
  }
  return true;
}
