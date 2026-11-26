export type TeamId = 'red' | 'blue';
export type GameMode = 'tdm' | 'ffa';
export type MapId = 'desert_camp' | 'warehouse' | 'crossroad';
export type PrimaryWeaponId = 'm4a1' | 'ak74' | 'scar' | 'psg1' | 'awp' | 'mp5' | 'p90' | 'm870';
export type WeaponId = PrimaryWeaponId | 'deagle' | 'knife' | 'frag';
export type WeaponSlot = 1 | 2 | 3 | 4;
export type WeaponRule = 'all' | 'sniper' | 'shotgun' | 'pistol' | 'rifle' | 'knife';
export type TeamSize = 1 | 2 | 3 | 4 | 6;
export type HitZone = 'head' | 'body' | 'limb';
export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CharacterLoadout {
  uniformId: string;
  headgearId: string;
  facegearId: string;
  vestId: string;
  weaponSkinId: string;
}

export interface PlayerProfile {
  accountId: string;
  name: string;
  exp: number;
  sp: number;
  totalKills: number;
  totalHeadshots: number;
  totalDeaths: number;
  matchesPlayed: number;
  wins: number;
  clearedStages: string[];
  ownedItems: string[];
  loadout: CharacterLoadout;
  createdAt: number;
}

export interface MatchRewardEvent {
  expGained: number;
  spGained: number;
  baseExp: number;
  killExp: number;
  headshotExp: number;
  winBonusExp: number;
  stageBonusExp: number;
  stageBonusSp: number;
  difficultyMult: number;
  rankedUp: boolean;
  oldRankIndex: number;
  newRankIndex: number;
  stageClearedId?: string;
  profile: PlayerProfile;
}

export interface RoomSettings {
  name: string;
  mapId: MapId;
  mode: GameMode;
  teamSize: TeamSize;
  weaponRule: WeaponRule;
  botDifficulty: BotDifficulty;
  stageId?: string;
  maxPlayers: number;
  targetKills: number;
  timeLimitSec: number;
  botCount: number;
  hasPassword: boolean;
}

export interface RoomSummary {
  code: string;
  name: string;
  mapId: MapId;
  mode: GameMode;
  teamSize: TeamSize;
  weaponRule: WeaponRule;
  botDifficulty: BotDifficulty;
  stageId?: string;
  playerCount: number;
  botCount: number;
  maxPlayers: number;
  status: 'waiting' | 'playing';
  hasPassword: boolean;
  hostName: string;
}

export interface RoomPlayer {
  id: string;
  accountId?: string;
  name: string;
  exp: number;
  loadout: CharacterLoadout;
  team: TeamId;
  slotIndex: number; // 0 .. teamSize - 1
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
  primaryWeapon: PrimaryWeaponId;
  kills: number;
  deaths: number;
  headshots: number;
  score: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  team?: TeamId;
  text: string;
  system?: boolean;
  timestamp: number;
}

export interface RoomState {
  code: string;
  settings: RoomSettings;
  status: 'waiting' | 'playing' | 'ended';
  players: RoomPlayer[];
  chat: ChatMessage[];
  scores: {
    red: number;
    blue: number;
  };
  timeRemainingSec: number;
  winner?: {
    type: 'team' | 'player' | 'draw';
    team?: TeamId;
    playerId?: string;
    playerName?: string;
    mvpName?: string;
    mvpKills?: number;
  };
}

export interface LivePlayerSnapshot {
  id: string;
  accountId?: string;
  name: string;
  exp: number;
  loadout: CharacterLoadout;
  team: TeamId;
  slotIndex: number;
  isBot: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  lean: number;
  sprinting: boolean;
  hp: number;
  maxHp: number;
  armor: number;
  alive: boolean;
  respawnTimer: number;
  weaponId: WeaponId;
  primaryWeapon: PrimaryWeaponId;
  kills: number;
  deaths: number;
  headshots: number;
  score: number;
}

export interface LiveGrenadeSnapshot {
  id: string;
  ownerId: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
}

export interface SupplyCrateSnapshot {
  id: string;
  kind: 'medkit' | 'ammo';
  x: number;
  y: number;
  z: number;
  available: boolean;
}

export interface MatchSnapshot {
  tick: number;
  timeRemainingSec: number;
  scores: {
    red: number;
    blue: number;
  };
  players: LivePlayerSnapshot[];
  grenades: LiveGrenadeSnapshot[];
  supplies: SupplyCrateSnapshot[];
}

export interface ShotHitItem {
  playerId: string;
  hitZone: HitZone;
}

export interface ShotBroadcast {
  shooterId: string;
  weaponId: WeaponId;
  origin: Vec3;
  endPoint: Vec3;
  endPoints?: Vec3[];
  hitPlayerId?: string;
  hitZone?: HitZone;
}

export interface HitConfirmEvent {
  targetId: string;
  hitZone: HitZone;
  damage: number;
  killed: boolean;
  remainingHp: number;
}

export interface DamageTakenEvent {
  attackerId: string;
  attackerName: string;
  attackerPos: Vec3;
  damage: number;
  hitZone: HitZone;
  remainingHp: number;
  remainingArmor: number;
}

export interface KillFeedEvent {
  id: string;
  killerId: string;
  killerName: string;
  killerTeam: TeamId;
  victimId: string;
  victimName: string;
  victimTeam: TeamId;
  weaponId: WeaponId;
  headshot: boolean;
  streak?: number;
  timestamp: number;
}

export interface GrenadeExplodeEvent {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface SupplyPickupEvent {
  kind: 'medkit' | 'ammo';
  hpGained: number;
  armorGained: number;
}
