import type {
  BotDifficulty,
  CharacterLoadout,
  MapId,
  TeamId,
  TeamSize,
  WeaponRule,
} from './types.ts';

export type CosmeticCategory = 'uniform' | 'headgear' | 'facegear' | 'vest' | 'weaponSkin';

export interface SfRankDefinition {
  id: string;
  thaiName: string;
  enName: string;
  shortCode: string;
  minExp: number;
  tier: 'enlisted' | 'nco' | 'officer' | 'field' | 'general';
  insigniaType: 'chevron' | 'bar' | 'diamond' | 'pip' | 'laurel' | 'star';
  insigniaCount: number;
  color: string;
}

/**
 * Authentic Special Force Military Rank Progression (16 Ranks)
 * Tuned with brisk early progression so new soldiers rank up noticeably
 * within their first 1–2 matches and stay rewarded across long play sessions.
 */
export const SF_RANKS: SfRankDefinition[] = [
  { id: 'trainee', thaiName: 'พลทหารฝึกหัด', enName: 'Trainee', shortCode: 'TRN', minExp: 0, tier: 'enlisted', insigniaType: 'chevron', insigniaCount: 1, color: '#94a3b8' },
  { id: 'private', thaiName: 'พลทหาร', enName: 'Private', shortCode: 'PVT', minExp: 220, tier: 'enlisted', insigniaType: 'chevron', insigniaCount: 2, color: '#cbd5e1' },
  { id: 'pfc', thaiName: 'พลทหารชั้นเอก', enName: 'Private 1st Class', shortCode: 'PFC', minExp: 520, tier: 'enlisted', insigniaType: 'chevron', insigniaCount: 3, color: '#cbd5e1' },
  { id: 'corporal', thaiName: 'สิบตรี', enName: 'Corporal', shortCode: 'CPL', minExp: 920, tier: 'nco', insigniaType: 'bar', insigniaCount: 1, color: '#38bdf8' },
  { id: 'sergeant', thaiName: 'สิบโท', enName: 'Sergeant', shortCode: 'SGT', minExp: 1450, tier: 'nco', insigniaType: 'bar', insigniaCount: 2, color: '#38bdf8' },
  { id: 'staff_sgt', thaiName: 'สิบเอก', enName: 'Staff Sergeant', shortCode: 'SSG', minExp: 2150, tier: 'nco', insigniaType: 'bar', insigniaCount: 3, color: '#60a5fa' },
  { id: 'sfc', thaiName: 'จ่าสิบตรี', enName: 'Sergeant 1st Class', shortCode: 'SFC', minExp: 3100, tier: 'nco', insigniaType: 'diamond', insigniaCount: 1, color: '#818cf8' },
  { id: 'master_sgt', thaiName: 'จ่าสิบเอก', enName: 'Master Sergeant', shortCode: 'MSG', minExp: 4300, tier: 'nco', insigniaType: 'diamond', insigniaCount: 2, color: '#a78bfa' },
  { id: 'second_lt', thaiName: 'ร้อยตรี', enName: '2nd Lieutenant', shortCode: '2LT', minExp: 5800, tier: 'officer', insigniaType: 'pip', insigniaCount: 1, color: '#fbbf24' },
  { id: 'first_lt', thaiName: 'ร้อยโท', enName: '1st Lieutenant', shortCode: '1LT', minExp: 7600, tier: 'officer', insigniaType: 'pip', insigniaCount: 2, color: '#fbbf24' },
  { id: 'captain', thaiName: 'ร้อยเอก', enName: 'Captain', shortCode: 'CPT', minExp: 9800, tier: 'officer', insigniaType: 'pip', insigniaCount: 3, color: '#f59e0b' },
  { id: 'major', thaiName: 'พันตรี', enName: 'Major', shortCode: 'MAJ', minExp: 12600, tier: 'field', insigniaType: 'laurel', insigniaCount: 1, color: '#fb923c' },
  { id: 'lt_col', thaiName: 'พันโท', enName: 'Lt. Colonel', shortCode: 'LTC', minExp: 16200, tier: 'field', insigniaType: 'laurel', insigniaCount: 2, color: '#f97316' },
  { id: 'colonel', thaiName: 'พันเอก', enName: 'Colonel', shortCode: 'COL', minExp: 20800, tier: 'field', insigniaType: 'laurel', insigniaCount: 3, color: '#ef4444' },
  { id: 'brigadier', thaiName: 'พลจัตวา', enName: 'Brigadier General', shortCode: 'BG', minExp: 27000, tier: 'general', insigniaType: 'star', insigniaCount: 1, color: '#fde047' },
  { id: 'general', thaiName: 'พลเอกพิเศษ', enName: 'General', shortCode: 'GEN', minExp: 35000, tier: 'general', insigniaType: 'star', insigniaCount: 3, color: '#facc15' },
];

export interface RankProgressInfo {
  index: number;
  rank: SfRankDefinition;
  nextRank: SfRankDefinition | null;
  expIntoLevel: number;
  expNeeded: number;
  progressPct: number;
}

export function getRankForExp(exp: number): RankProgressInfo {
  const safeExp = Math.max(0, Math.floor(exp || 0));
  let index = 0;
  for (let i = SF_RANKS.length - 1; i >= 0; i--) {
    if (safeExp >= SF_RANKS[i].minExp) {
      index = i;
      break;
    }
  }
  const rank = SF_RANKS[index];
  const nextRank = index < SF_RANKS.length - 1 ? SF_RANKS[index + 1] : null;
  if (!nextRank) {
    return {
      index,
      rank,
      nextRank: null,
      expIntoLevel: safeExp - rank.minExp,
      expNeeded: 1,
      progressPct: 100,
    };
  }
  const span = Math.max(1, nextRank.minExp - rank.minExp);
  const expIntoLevel = Math.max(0, safeExp - rank.minExp);
  const progressPct = Math.min(100, Math.round((expIntoLevel / span) * 100));
  return {
    index,
    rank,
    nextRank,
    expIntoLevel,
    expNeeded: span,
    progressPct,
  };
}

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  thaiName: string;
  description: string;
  priceSp: number;
  swatch: string;
  accent?: string;
}

export const COSMETIC_ITEMS: CosmeticItem[] = [
  // Uniforms
  {
    id: 'swat_navy',
    category: 'uniform',
    name: 'SWAT Tactical Navy',
    thaiName: 'ชุดหน่วยสวาท (SWAT กรมท่า)',
    description: 'เครื่องแบบปฏิบัติการพิเศษตำรวจสีกรมท่าเข้ม แขนพับพร้อมอาร์มหน่วย',
    priceSp: 0,
    swatch: '#1c2b44',
    accent: '#38bdf8',
  },
  {
    id: 'police_patrol',
    category: 'uniform',
    name: 'Metro Police Patrol',
    thaiName: 'ชุดตำรวจสายตรวจ (สีกากี-กรม)',
    description: 'เครื่องแบบตำรวจสายตรวจพร้อมตราโล่ทองอกซ้ายและอินทรธนูบ่า',
    priceSp: 0,
    swatch: '#6b5e4c',
    accent: '#f59e0b',
  },
  {
    id: 'commando_black',
    category: 'uniform',
    name: 'Arintharaj 26 Black',
    thaiName: 'ชุดอรินทราช / คอมมานโดดำ',
    description: 'ชุดจู่โจมสีดำด้านสำหรับปฏิบัติการชิงตัวประกันและต่อต้านการก่อการร้าย',
    priceSp: 300,
    swatch: '#17191f',
    accent: '#94a3b8',
  },
  {
    id: 'tactical_olive',
    category: 'uniform',
    name: 'Ranger Tactical Olive',
    thaiName: 'ชุดรบพิเศษเขียวโอลีฟ',
    description: 'เครื่องแบบหน่วยลาดตระเวนป่าสีเขียวโอลีฟเข้ม เนื้อผ้าริปสต็อป',
    priceSp: 450,
    swatch: '#384632',
    accent: '#84cc16',
  },
  {
    id: 'desert_ops',
    category: 'uniform',
    name: 'Desert Multicam Ops',
    thaiName: 'ชุดรบทะเลทรายมัลติแคม',
    description: 'ชุดลายพรางทะเลทรายสีกากี-ทราย สำหรับสมรภูมิกลางแจ้ง',
    priceSp: 650,
    swatch: '#a68c64',
    accent: '#fbbf24',
  },
  {
    id: 'urban_ghost',
    category: 'uniform',
    name: 'Urban Ghost Camo',
    thaiName: 'ชุดพรางเมือง Ghost Special',
    description: 'ชุดปฏิบัติการพิเศษลายพรางดิจิทัลเทา-ดำ รุ่นลิมิเต็ด',
    priceSp: 950,
    swatch: '#3f4854',
    accent: '#e2e8f0',
  },
  {
    id: 'thai_narai',
    category: 'uniform',
    name: 'Naresuan 261 CTU',
    thaiName: 'ชุดหน่วยนเรศวร 261 (CTU)',
    description: 'ชุดตำรวจพลร่มนเรศวร 261 สีกราไฟต์-กรมท่าเข้ม พร้อมอาร์มหน่วยสีแดงทอง',
    priceSp: 580,
    swatch: '#1b2638',
    accent: '#dc2626',
  },
  {
    id: 'arctic_ops',
    category: 'uniform',
    name: 'Arctic Winter Splinter',
    thaiName: 'ชุดรบหิมะอาร์กติก',
    description: 'ชุดพรางหิมะลายเรขาคณิตสีขาว-เทาหม่น หน่วยลาดตระเวนขั้วโลก',
    priceSp: 640,
    swatch: '#d6dde6',
    accent: '#475569',
  },
  {
    id: 'jungle_tiger',
    category: 'uniform',
    name: 'Jungle Tigerstripe',
    thaiName: 'ชุดพรางเสือซ่อนเล็บ',
    description: 'ลายพรางเสือโคร่งป่าระดับตำนาน ผ้าริปสตอปกันน้ำหน่วยรบพิเศษ',
    priceSp: 720,
    swatch: '#273a2b',
    accent: '#84cc16',
  },
  {
    id: 'vip_commander',
    category: 'uniform',
    name: 'Tactical Gold Commander',
    thaiName: 'ชุดผู้บัญชาการรบพิเศษ',
    description: 'เครื่องแบบยุทธวิธีสีชาร์โคลดำขลิบดิ้นทอง ระดับนายพลผู้บัญชาการ',
    priceSp: 1250,
    swatch: '#181b22',
    accent: '#f59e0b',
  },

  // Headgear
  {
    id: 'police_cap',
    category: 'headgear',
    name: 'Police Tactical Cap',
    thaiName: 'หมวกแก๊ปตำรวจ (ตราโล่ทอง)',
    description: 'หมวกแก๊ปตำรวจหน่วยปฏิบัติการพิเศษ ประดับตราโล่สีทองด้านหน้า',
    priceSp: 0,
    swatch: '#18253a',
    accent: '#f59e0b',
  },
  {
    id: 'beret_navy',
    category: 'headgear',
    name: 'Commando Navy Beret',
    thaiName: 'หมวกเบเร่ต์คอมมานโดกรมท่า',
    description: 'หมวกเบเร่ต์ตำรวจคอมมานโดทรงเอียงเท่พร้อมเข็มหน้าหมวกสีเงิน',
    priceSp: 280,
    swatch: '#1c2b48',
    accent: '#e2e8f0',
  },
  {
    id: 'riot_helmet',
    category: 'headgear',
    name: 'SWAT Riot Helmet',
    thaiName: 'หมวกปราบจลาจล (กระบังหน้าใส)',
    description: 'หมวกนิรภัยตำรวจปราบจลาจลพร้อมกระบังกันกระสุนโปร่งใส',
    priceSp: 400,
    swatch: '#141a24',
    accent: '#38bdf8',
  },
  {
    id: 'fast_nvg',
    category: 'headgear',
    name: 'FAST Ballistic + 4-Eye NVG',
    thaiName: 'หมวก FAST พร้อมกล้อง NVG 4 ตา',
    description: 'หมวกกันกระสุน Ops-Core ติดกล้องมองกลางคืน GPNVG-18 เต็มระบบ',
    priceSp: 550,
    swatch: '#2a3038',
    accent: '#22c55e',
  },
  {
    id: 'beret_red',
    category: 'headgear',
    name: 'Tactical Red Beret',
    thaiName: 'หมวกเบเร่ต์รบพิเศษแดง',
    description: 'สัญลักษณ์แห่งหน่วยรบพิเศษระดับหัวกะทิ ประดับตราปีกทอง',
    priceSp: 600,
    swatch: '#991b1b',
    accent: '#fbbf24',
  },
  {
    id: 'boonie_hat',
    category: 'headgear',
    name: 'Recon Sniper Boonie',
    thaiName: 'หมวกปีกกว้างพลซุ่มยิง',
    description: 'หมวกปีกพรางสำหรับพลสไนเปอร์และหน่วยลาดตระเวนระยะไกล',
    priceSp: 480,
    swatch: '#57503a',
    accent: '#a3a380',
  },
  {
    id: 'altyn_visor',
    category: 'headgear',
    name: 'Altyn K6-3 Ballistic Visor',
    thaiName: 'หมวกเหล็ก Altyn เกราะหนัก',
    description: 'หมวกเกราะไทเทเนียมระดับตำนาน พร้อมแผ่นเหล็กกันกระสุนพับปิดเต็มใบหน้า',
    priceSp: 780,
    swatch: '#3a463c',
    accent: '#94a3b8',
  },
  {
    id: 'ghillie_hood',
    category: 'headgear',
    name: 'Sniper Recon Ghillie Hood',
    thaiName: 'ฮู้ดพรางสไนเปอร์ (Recon Hood)',
    description: 'ผ้าคลุมฮู้ดพรางศีรษะและไหล่พร้อมชุดหูฟังสื่อสารสำหรับพลแม่นปืน',
    priceSp: 540,
    swatch: '#364935',
    accent: '#a3e635',
  },
  {
    id: 'commander_cap',
    category: 'headgear',
    name: 'Police Commander Peak Cap',
    thaiName: 'หมวกหม้อตาลผู้บัญชาการ',
    description: 'หมวกทรงหม้อตาลผู้บังคับบัญชา ประดับช่อชัยพฤกษ์สีทองและตราโล่เต็มยศ',
    priceSp: 680,
    swatch: '#13223b',
    accent: '#fbbf24',
  },

  // Facegear
  {
    id: 'none',
    category: 'facegear',
    name: 'Open Face',
    thaiName: 'เปิดหน้า (เห็นใบหน้าจริง)',
    description: 'ไม่สวมหน้ากาก เห็นรายละเอียดใบหน้าและสายตาคมชัด',
    priceSp: 0,
    swatch: '#c89b7b',
  },
  {
    id: 'aviator',
    category: 'facegear',
    name: 'Police Aviator Shades',
    thaiName: 'แว่นกันแดดตำรวจ Aviator',
    description: 'แว่นกันแดดกรอบทองเลนส์ดำเงา สไตล์เจ้าหน้าที่ตำรวจสายสืบ',
    priceSp: 200,
    swatch: '#111827',
    accent: '#f59e0b',
  },
  {
    id: 'tactical_goggles',
    category: 'facegear',
    name: 'Ballistic Goggles',
    thaiName: 'แว่นกันสะเก็ดยุทธวิธี',
    description: 'แว่นตากันฝุ่นและสะเก็ดระเบิดเลนส์ปรอทน้ำเงินเข้ม',
    priceSp: 280,
    swatch: '#0f2847',
    accent: '#38bdf8',
  },
  {
    id: 'balaclava',
    category: 'facegear',
    name: 'SWAT Balaclava',
    thaiName: 'หมวกไอ้โม่งหน่วยสวาท',
    description: 'ผ้าคลุมหน้าปกปิดตัวตนสีดำด้านสำหรับหน่วยปฏิบัติการพิเศษ',
    priceSp: 320,
    swatch: '#181a20',
  },
  {
    id: 'gas_mask',
    category: 'facegear',
    name: 'S10 SWAT Gas Mask',
    thaiName: 'หน้ากากกันแก๊ส S10 ตำรวจสวาท',
    description: 'หน้ากากป้องกันสารเคมีและแก๊สน้ำตาแบบสองไส้กรอง พร้อมเลนส์กลมดำ',
    priceSp: 680,
    swatch: '#1b2028',
    accent: '#64748b',
  },
  {
    id: 'skull_mask',
    category: 'facegear',
    name: 'Ghost Skull Balaclava',
    thaiName: 'ผ้าคลุมลายหัวกะโหลก Ghost',
    description: 'ผ้าคลุมหน้าสกรีนลายหัวกะโหลกสีขาว ระดับตำนาน STRIKE OPS',
    priceSp: 850,
    swatch: '#121418',
    accent: '#f8fafc',
  },
  {
    id: 'shemagh_wrap',
    category: 'facegear',
    name: 'Desert Tactical Shemagh',
    thaiName: 'ผ้าพันคอชีมัคทะเลทราย',
    description: 'ผ้าพันคอและปิดครึ่งหน้าลายตารางทะเลทรายสไตล์หน่วยรบพิเศษ',
    priceSp: 320,
    swatch: '#b89f74',
    accent: '#3f3424',
  },
  {
    id: 'ballistic_mandible',
    category: 'facegear',
    name: 'Carbon Ballistic Mandible',
    thaiName: 'หน้ากากเกราะคางคาร์บอน',
    description: 'หน้ากากกันกระสุนช่วงล่างผลิตจากคาร์บอนไฟเบอร์ พร้อมเลนส์ตาเรดาร์ฟ้า',
    priceSp: 680,
    swatch: '#181e27',
    accent: '#38bdf8',
  },
  {
    id: 'cyber_visor',
    category: 'facegear',
    name: 'Holo Tactical HUD Visor',
    thaiName: 'แว่นจอเรดาร์หน่วยพิเศษ',
    description: 'แว่นโฮโลแกรมคลุมตาแบบโอบโค้งเรืองแสงไซยาน-อำพัน ล้ำสมัยระดับ AAA',
    priceSp: 820,
    swatch: '#0ea5e9',
    accent: '#f59e0b',
  },
  {
    id: 'tactical_warpaint',
    category: 'facegear',
    name: 'Spec-Ops Tactical Warpaint',
    thaiName: 'สีพรางหน้าหน่วยรบพิเศษ',
    description: 'ทาสีพรางหน้าดำ-เขียวด้านสไตล์คอมมานโด พร้อมหูฟังไมค์ยุทธวิธีในตัว',
    priceSp: 260,
    swatch: '#2d3b29',
    accent: '#84cc16',
  },
  {
    id: 'comms_headset',
    category: 'facegear',
    name: 'Peltor ComTac + Amber Lens',
    thaiName: 'ชุดหูฟัง Peltor + แว่นยิงปืน',
    description: 'หูฟังตัดเสียงปืน Peltor ComTac พร้อมไมค์ก้านและแว่นกันสะเก็ดเลนส์อำพัน',
    priceSp: 420,
    swatch: '#3a3f32',
    accent: '#f59e0b',
  },

  // Vests
  {
    id: 'police_kevlar',
    category: 'vest',
    name: 'POLICE Kevlar Vest',
    thaiName: 'เสื้อเกราะตำรวจ (POLICE)',
    description: 'เสื้อเกราะกันกระสุนสีกรมท่าเข้ม สกรีนคำว่า POLICE ชัดเจนหน้า-หลัง',
    priceSp: 0,
    swatch: '#16243a',
    accent: '#f8fafc',
  },
  {
    id: 'swat_heavy',
    category: 'vest',
    name: 'SWAT Heavy Armor',
    thaiName: 'เกราะหนักหน่วยสวาท (SWAT)',
    description: 'เกราะหนักเต็มพิกัดพร้อมแผ่นกันไหล่ ซองแม็กกาซีน 3 ช่อง และวิทยุสื่อสาร',
    priceSp: 480,
    swatch: '#181e29',
    accent: '#38bdf8',
  },
  {
    id: 'plate_tan',
    category: 'vest',
    name: 'Coyote Tan Plate Carrier',
    thaiName: 'เกราะเพลทรบพิเศษสีทราย',
    description: 'เสื้อเกราะ MOLLE สีโคโยตี้แทน เบาคล่องตัวสไตล์หน่วยซีล',
    priceSp: 600,
    swatch: '#8f7958',
    accent: '#d6c3a5',
  },
  {
    id: 'stealth_rig',
    category: 'vest',
    name: 'Commando Chest Rig',
    thaiName: 'สายโยงยุทธวิธีคอมมานโด',
    description: 'ชุดสายโยงซองกระสุนน้ำหนักเบาพร้อมมีดพกอกซ้าย',
    priceSp: 720,
    swatch: '#262b33',
    accent: '#f59e0b',
  },
  {
    id: 'naresuan_jpc',
    category: 'vest',
    name: 'Naresuan CTU-261 JPC',
    thaiName: 'เกราะหน่วยนเรศวร (CTU-261)',
    description: 'เกราะเพลทแคร์ริเออร์ดำขลิบทอง พร้อมแท่งไฟเคมีเรืองแสงและสายรัดห้ามเลือด',
    priceSp: 740,
    swatch: '#141c29',
    accent: '#f59e0b',
  },
  {
    id: 'ghillie_cape',
    category: 'vest',
    name: 'Recon Sniper Cloak Rig',
    thaiName: 'ผ้าคลุมพรางไหล่สไนเปอร์',
    description: 'เกราะอกน้ำหนักเบาคู่ผ้าคลุมไหล่พรางป่าและใบไม้สังเคราะห์',
    priceSp: 680,
    swatch: '#334832',
    accent: '#84cc16',
  },
  {
    id: 'juggernaut_exo',
    category: 'vest',
    name: 'Heavy EOD Juggernaut Armor',
    thaiName: 'เกราะจั๊กเกอร์นอต EOD เต็มยศ',
    description: 'ชุดเกราะเก็บกู้ระเบิดเต็มพิกัด เกราะไหล่คู่ เกราะคอ เกราะเป้า และถังหลังคู่',
    priceSp: 1180,
    swatch: '#27303a',
    accent: '#ef4444',
  },

  // Weapon Skins
  {
    id: 'standard',
    category: 'weaponSkin',
    name: 'Factory Gunmetal',
    thaiName: 'เหล็กดำด้านมาตรฐาน',
    description: 'ผิวโลหะรมดำจากโรงงาน แข็งแกร่งสมจริง',
    priceSp: 0,
    swatch: '#2b303a',
    accent: '#94a3b8',
  },
  {
    id: 'police_blue',
    category: 'weaponSkin',
    name: 'SWAT Cobalt Steel',
    thaiName: 'ลายตำรวจ SWAT น้ำเงิน-เหล็ก',
    description: 'เคลือบผิวสีน้ำเงินโคบอลต์ตัดแถบโครเมียมประจำหน่วยสวาท',
    priceSp: 300,
    swatch: '#1d4ed8',
    accent: '#93c5fd',
  },
  {
    id: 'desert_tan',
    category: 'weaponSkin',
    name: 'Tactical FDE Tan',
    thaiName: 'สีทรายยุทธวิธี (FDE)',
    description: 'พ่นเคลือบ Cerakote สีทรายทะเลทรายแบบหน่วยรบพิเศษอเมริกัน',
    priceSp: 420,
    swatch: '#a68b61',
    accent: '#e5d5b7',
  },
  {
    id: 'tiger_camo',
    category: 'weaponSkin',
    name: 'Viper Tiger Camo',
    thaiName: 'ลายเสือโคร่งยุทธวิธี',
    description: 'ลายพรางเสือโคร่งสีทอง-ดำ เอกลักษณ์ระดับตำนานแห่งสมรภูมิ STRIKE OPS',
    priceSp: 680,
    swatch: '#d97706',
    accent: '#18181b',
  },
  {
    id: 'crimson_carbon',
    category: 'weaponSkin',
    name: 'Crimson Carbon',
    thaiName: 'คาร์บอนไฟเบอร์แดงเพลิง',
    description: 'ลวดลายคาร์บอนไฟเบอร์ดำด้านตัดขอบแดงเมทัลลิกเงางาม',
    priceSp: 920,
    swatch: '#991b1b',
    accent: '#f87171',
  },
  {
    id: 'arctic_wolf',
    category: 'weaponSkin',
    name: 'Arctic White Cerakote',
    thaiName: 'หิมะอาร์กติก (Arctic Wolf)',
    description: 'เคลือบเซราโค้ทสีขาวหิมะด้านตัดโครงไทเทเนียมเทาเข้ม สวยเฉียบทุกมุมมอง',
    priceSp: 760,
    swatch: '#e2e8f0',
    accent: '#334155',
  },
  {
    id: 'emerald_cyber',
    category: 'weaponSkin',
    name: 'Spec-Ops Emerald Titanium',
    thaiName: 'มรกตไทเทเนียม',
    description: 'ผิวโลหะไทเทเนียมชุบอะโนไดซ์เขียวมรกตประกายเงาคู่ลายคาร์บอน',
    priceSp: 980,
    swatch: '#059669',
    accent: '#6ee7b7',
  },
  {
    id: 'gold_engraved',
    category: 'weaponSkin',
    name: 'Royal Gold Edition',
    thaiName: 'ทองคำลิมิเต็ด (Royal Gold)',
    description: 'ปืนเคลือบทองคำแท้ 24K เงาวาวสะท้อนแสง ระดับยศนายพล',
    priceSp: 1400,
    swatch: '#eab308',
    accent: '#fef08a',
  },
  {
    id: 'dragon_obsidian',
    category: 'weaponSkin',
    name: 'Black Dragon Obsidian',
    thaiName: 'มังกรดำออบซิเดียน (Black Dragon)',
    description: 'เหล็กดามัสกัสสีดำออบซิเดียนสลักเกล็ดมังกรและเส้นทองคำหลอมละลายระดับตำนาน',
    priceSp: 1650,
    swatch: '#18121e',
    accent: '#f59e0b',
  },
];

export const COSMETIC_BY_ID: Record<string, CosmeticItem> = Object.fromEntries(
  COSMETIC_ITEMS.map((item) => [item.id, item])
);

export const DEFAULT_LOADOUT: CharacterLoadout = {
  uniformId: 'swat_navy',
  headgearId: 'police_cap',
  facegearId: 'none',
  vestId: 'police_kevlar',
  weaponSkinId: 'standard',
};

export const DEFAULT_OWNED_ITEMS: string[] = COSMETIC_ITEMS.filter((i) => i.priceSp === 0).map(
  (i) => i.id
);

export const STARTER_SP = 500;

export function sanitizeLoadout(
  raw: Partial<CharacterLoadout> | undefined,
  ownedSet?: Set<string>
): CharacterLoadout {
  const pick = (cat: CosmeticCategory, val: string | undefined, fallback: string) => {
    if (!val) return fallback;
    const item = COSMETIC_BY_ID[val];
    if (!item || item.category !== cat) return fallback;
    if (ownedSet && item.priceSp > 0 && !ownedSet.has(val)) return fallback;
    return val;
  };
  return {
    uniformId: pick('uniform', raw?.uniformId, DEFAULT_LOADOUT.uniformId),
    headgearId: pick('headgear', raw?.headgearId, DEFAULT_LOADOUT.headgearId),
    facegearId: pick('facegear', raw?.facegearId, DEFAULT_LOADOUT.facegearId),
    vestId: pick('vest', raw?.vestId, DEFAULT_LOADOUT.vestId),
    weaponSkinId: pick('weaponSkin', raw?.weaponSkinId, DEFAULT_LOADOUT.weaponSkinId),
  };
}

/**
 * Generates varied authentic Police / SWAT / Special Ops outfits for AI Bots
 * so teammates & enemies look like realistic tactical units on the battlefield.
 */
export function getBotLoadout(team: TeamId, botIndex: number, difficulty: BotDifficulty): CharacterLoadout {
  if (team === 'blue') {
    const policePresets: CharacterLoadout[] = [
      { uniformId: 'thai_narai', headgearId: 'riot_helmet', facegearId: 'balaclava', vestId: 'naresuan_jpc', weaponSkinId: 'police_blue' },
      { uniformId: 'police_patrol', headgearId: 'police_cap', facegearId: 'aviator', vestId: 'police_kevlar', weaponSkinId: 'standard' },
      { uniformId: 'arctic_ops', headgearId: 'fast_nvg', facegearId: 'cyber_visor', vestId: 'swat_heavy', weaponSkinId: 'arctic_wolf' },
      { uniformId: 'vip_commander', headgearId: 'commander_cap', facegearId: 'ballistic_mandible', vestId: 'juggernaut_exo', weaponSkinId: 'emerald_cyber' },
    ];
    return policePresets[(botIndex + (difficulty === 'hard' ? 2 : 0)) % policePresets.length];
  }
  const redPresets: CharacterLoadout[] = [
    { uniformId: 'desert_ops', headgearId: 'beret_red', facegearId: 'shemagh_wrap', vestId: 'plate_tan', weaponSkinId: 'desert_tan' },
    { uniformId: 'commando_black', headgearId: 'altyn_visor', facegearId: 'skull_mask', vestId: 'juggernaut_exo', weaponSkinId: 'dragon_obsidian' },
    { uniformId: 'jungle_tiger', headgearId: 'ghillie_hood', facegearId: 'tactical_goggles', vestId: 'ghillie_cape', weaponSkinId: 'tiger_camo' },
    { uniformId: 'urban_ghost', headgearId: 'fast_nvg', facegearId: 'ballistic_mandible', vestId: 'naresuan_jpc', weaponSkinId: 'crimson_carbon' },
  ];
  return redPresets[(botIndex + (difficulty === 'hard' ? 1 : 0)) % redPresets.length];
}

export interface BotDifficultySpec {
  id: BotDifficulty;
  label: string;
  thaiLabel: string;
  description: string;
  expMult: number;
  spMult: number;
  botMaxHp: number;
  botArmor: number;
  fireDelayMin: number;
  fireDelayMax: number;
  accuracyMin: number;
  accuracyMax: number;
  headshotChance: number;
  damageMult: number;
  moveSpeed: number;
}

/**
 * Tuned so Easy is genuinely fun & forgiving for relaxed EXP/SP farming,
 * Normal gives an enjoyable Special Force pace, and Hard tests sharp aim.
 */
export const BOT_DIFFICULTIES: Record<BotDifficulty, BotDifficultySpec> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    thaiLabel: 'ง่าย (ฟาร์ม EXP สบาย)',
    description: 'บอทยิงช้าและแม่นน้อย เล่นง่ายเพลินๆ เหมาะเก็บยศและสะสม SP',
    expMult: 1.0,
    spMult: 1.0,
    botMaxHp: 75,
    botArmor: 15,
    fireDelayMin: 1.15,
    fireDelayMax: 1.85,
    accuracyMin: 0.1,
    accuracyMax: 0.24,
    headshotChance: 0.04,
    damageMult: 0.52,
    moveSpeed: 3.6,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    thaiLabel: 'ปานกลาง (สมดุลสนุก)',
    description: 'บอทเคลื่อนที่และยิงโต้ตอบสมดุล ลุ้นมันส์แต่ไม่ตึงเครียดเกินไป',
    expMult: 1.35,
    spMult: 1.35,
    botMaxHp: 95,
    botArmor: 35,
    fireDelayMin: 0.65,
    fireDelayMax: 1.15,
    accuracyMin: 0.2,
    accuracyMax: 0.38,
    headshotChance: 0.1,
    damageMult: 0.78,
    moveSpeed: 4.5,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    thaiLabel: 'ยาก (หน่วยรบพิเศษ)',
    description: 'บอทตอบสนองไว ยิงคม พร้อมโบนัส EXP และ SP สูงสุด x1.8',
    expMult: 1.8,
    spMult: 1.8,
    botMaxHp: 110,
    botArmor: 50,
    fireDelayMin: 0.36,
    fireDelayMax: 0.68,
    accuracyMin: 0.36,
    accuracyMax: 0.54,
    headshotChance: 0.18,
    damageMult: 1.0,
    moveSpeed: 5.2,
  },
};

export const BOT_DIFFICULTY_LIST: BotDifficultySpec[] = [
  BOT_DIFFICULTIES.easy,
  BOT_DIFFICULTIES.normal,
  BOT_DIFFICULTIES.hard,
];

export interface BotStageDefinition {
  id: string;
  stageNumber: number;
  title: string;
  subtitle: string;
  mapId: MapId;
  difficulty: BotDifficulty;
  teamSize: TeamSize;
  botCount: number;
  weaponRule: WeaponRule;
  targetKills: number;
  clearBonusExp: number;
  clearBonusSp: number;
}

export const BOT_STAGES: BotStageDefinition[] = [
  {
    id: 'stage_1_desert_easy',
    stageNumber: 1,
    title: 'ด่าน 1 · ค่ายทะเลทราย (ฝึกซ้อม)',
    subtitle: 'กวาดล้างแนวหน้ากลางค่ายทะเลทราย 3v3 เล่นง่ายเก็บ EXP & SP ไว',
    mapId: 'desert_camp',
    difficulty: 'easy',
    teamSize: 3,
    botCount: 5,
    weaponRule: 'all',
    targetKills: 15,
    clearBonusExp: 180,
    clearBonusSp: 220,
  },
  {
    id: 'stage_2_warehouse_easy',
    stageNumber: 2,
    title: 'ด่าน 2 · บุกโกดังลูกซอง M870',
    subtitle: 'ปฏิบัติการจู่โจมโกดังตู้คอนเทนเนอร์ระยะประชิด บอทระดับง่าย',
    mapId: 'warehouse',
    difficulty: 'easy',
    teamSize: 2,
    botCount: 3,
    weaponRule: 'shotgun',
    targetKills: 12,
    clearBonusExp: 200,
    clearBonusSp: 250,
  },
  {
    id: 'stage_3_crossroad_normal',
    stageNumber: 3,
    title: 'ด่าน 3 · แยกยุทธการ SWAT ยามค่ำ',
    subtitle: 'นำทีมตำรวจ SWAT คุมสี่แยกและรถหุ้มเกราะ 3v3 ระดับปานกลาง',
    mapId: 'crossroad',
    difficulty: 'normal',
    teamSize: 3,
    botCount: 5,
    weaponRule: 'all',
    targetKills: 20,
    clearBonusExp: 320,
    clearBonusSp: 350,
  },
  {
    id: 'stage_4_desert_sniper_normal',
    stageNumber: 4,
    title: 'ด่าน 4 · ดวลสไนเปอร์ทะเลทราย',
    subtitle: 'วัดความคม PSG-1 2v2 จากหอคอยและหลังกระสอบทราย ระดับปานกลาง',
    mapId: 'desert_camp',
    difficulty: 'normal',
    teamSize: 2,
    botCount: 3,
    weaponRule: 'sniper',
    targetKills: 15,
    clearBonusExp: 350,
    clearBonusSp: 380,
  },
  {
    id: 'stage_5_warehouse_hard',
    stageNumber: 5,
    title: 'ด่าน 5 · กวาดล้างโกดังหน่วยพิเศษ',
    subtitle: 'ปะทะบอทหน่วยรบพิเศษ 4v4 เต็มรูปแบบ โบนัส EXP และ SP มหาศาล',
    mapId: 'warehouse',
    difficulty: 'hard',
    teamSize: 4,
    botCount: 7,
    weaponRule: 'all',
    targetKills: 25,
    clearBonusExp: 520,
    clearBonusSp: 550,
  },
  {
    id: 'stage_6_crossroad_hard',
    stageNumber: 6,
    title: 'ด่าน 6 · ปฏิบัติการชี้ชะตากลางเมือง',
    subtitle: 'ศึกตัดสินระดับ Hard ดวลไรเฟิลล้วนกลางแยกยุทธการ',
    mapId: 'crossroad',
    difficulty: 'hard',
    teamSize: 3,
    botCount: 5,
    weaponRule: 'rifle',
    targetKills: 25,
    clearBonusExp: 600,
    clearBonusSp: 650,
  },
];

export const BOT_STAGE_BY_ID: Record<string, BotStageDefinition> = Object.fromEntries(
  BOT_STAGES.map((s) => [s.id, s])
);
