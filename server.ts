import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import type { Socket } from 'socket.io';
import { MAPS } from './src/shared/maps.ts';
import {
  PRIMARY_WEAPONS,
  TEAM_SIZES,
  WEAPONS,
  WEAPON_RULES,
  isWeaponAllowedByRule,
  resolveWeaponForRule,
} from './src/shared/weapons.ts';
import {
  BOT_DIFFICULTIES,
  BOT_STAGE_BY_ID,
  COSMETIC_BY_ID,
  DEFAULT_LOADOUT,
  DEFAULT_OWNED_ITEMS,
  STARTER_SP,
  getBotLoadout,
  getRankForExp,
  sanitizeLoadout,
} from './src/shared/progression.ts';
import {
  PLAYER_EYE_HEIGHT,
  hasLineOfSight,
  raycastMap,
  resolvePlayerMovement,
} from './src/shared/collision.ts';
import type {
  BotDifficulty,
  CharacterLoadout,
  ChatMessage,
  GameMode,
  HitZone,
  LiveGrenadeSnapshot,
  LivePlayerSnapshot,
  MapId,
  MatchRewardEvent,
  MatchSnapshot,
  PlayerProfile,
  PrimaryWeaponId,
  RoomPlayer,
  RoomSettings,
  RoomState,
  RoomSummary,
  ShotHitItem,
  SupplyCrateSnapshot,
  TeamId,
  TeamSize,
  Vec3,
  WeaponId,
  WeaponRule,
} from './src/shared/types.ts';

import {
  SlidingWindowRateLimiter,
  generateSecureAccountId,
  generateSecureRoomCode,
  generateSessionToken,
  isAllowedOrigin,
  verifyTokenMatch,
} from './src/server/security.ts';
import {
  PositionHistoryBuffer,
  q2,
  q3,
  validateHitWithRewind,
  validatePlayerMove,
} from './src/server/netcode.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const TICK_RATE = Number(process.env.TICK_RATE) || 30;
const TICK_DT = 1 / TICK_RATE;

// Persistent JSON profile store + per-account session tokens & sliding-window rate limiter
const DATA_DIR = path.resolve(__dirname, 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const profiles = new Map<string, PlayerProfile>();
const sessionTokens = new Map<string, string>();
const rateLimiter = new SlidingWindowRateLimiter();
let saveProfilesTimer: ReturnType<typeof setTimeout> | null = null;

function ensureSessionToken(accountId: string): string {
  let tok = sessionTokens.get(accountId);
  if (!tok) {
    tok = generateSessionToken();
    sessionTokens.set(accountId, tok);
  }
  return tok;
}

function loadProfilesFromDisk() {
  try {
    if (!fs.existsSync(PROFILES_FILE)) return;
    const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, PlayerProfile>;
    if (parsed && typeof parsed === 'object') {
      for (const [id, prof] of Object.entries(parsed)) {
        if (prof && typeof prof.accountId === 'string') {
          const owned = Array.from(new Set([...DEFAULT_OWNED_ITEMS, ...(prof.ownedItems || [])]));
          const ownedSet = new Set(owned);
          profiles.set(id, {
            accountId: prof.accountId,
            name: sanitizeText(prof.name, 18) || prof.accountId,
            exp: Math.max(0, Number(prof.exp) || 0),
            sp: Math.max(0, Number(prof.sp) || 0),
            totalKills: Math.max(0, Number(prof.totalKills) || 0),
            totalHeadshots: Math.max(0, Number(prof.totalHeadshots) || 0),
            totalDeaths: Math.max(0, Number(prof.totalDeaths) || 0),
            matchesPlayed: Math.max(0, Number(prof.matchesPlayed) || 0),
            wins: Math.max(0, Number(prof.wins) || 0),
            clearedStages: Array.isArray(prof.clearedStages) ? prof.clearedStages : [],
            ownedItems: owned,
            loadout: sanitizeLoadout(prof.loadout, ownedSet),
            createdAt: Number(prof.createdAt) || Date.now(),
          });
        }
      }
    }
  } catch {
    // Start fresh if file is missing or malformed
  }
}

function scheduleSaveProfiles() {
  if (saveProfilesTimer) return;
  saveProfilesTimer = setTimeout(() => {
    saveProfilesTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const obj: Record<string, PlayerProfile> = {};
      for (const [id, prof] of profiles.entries()) {
        obj[id] = prof;
      }
      fs.writeFileSync(PROFILES_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch {
      // Ignore write failures in read-only sandboxes
    }
  }, 200);
}

function generateAccountId(): string {
  return generateSecureAccountId((id) => profiles.has(id));
}

function createGuestProfile(requestedName?: string, starterUniformId?: string): PlayerProfile {
  const accountId = generateAccountId();
  const cleanName = sanitizeText(requestedName, 18) || `Officer-${accountId.slice(-4)}`;
  const owned = [...DEFAULT_OWNED_ITEMS];
  const ownedSet = new Set(owned);
  const loadout = sanitizeLoadout(
    {
      ...DEFAULT_LOADOUT,
      uniformId: starterUniformId === 'police_patrol' ? 'police_patrol' : 'swat_navy',
    },
    ownedSet
  );
  const profile: PlayerProfile = {
    accountId,
    name: cleanName,
    exp: 0,
    sp: STARTER_SP,
    totalKills: 0,
    totalHeadshots: 0,
    totalDeaths: 0,
    matchesPlayed: 0,
    wins: 0,
    clearedStages: [],
    ownedItems: owned,
    loadout,
    createdAt: Date.now(),
  };
  profiles.set(accountId, profile);
  scheduleSaveProfiles();
  return profile;
}

loadProfilesFromDisk();

const BOT_NAMES = [
  'Viper',
  'Ghost',
  'Reaper',
  'Hawk',
  'Cobra',
  'Titan',
  'Shadow',
  'Wolf',
  'Raptor',
  'Nomad',
  'Frost',
  'Blaze',
];

interface ServerPlayer extends LivePlayerSnapshot {
  isHost: boolean;
  isReady: boolean;
  lastShotAt: number;
  lastMoveAt: number;
  grenadesLeft: number;
  rttMs: number;
  history: PositionHistoryBuffer;
  streak: number;
  waypointIndex: number;
  strafeDir: number;
  strafeTimer: number;
  botFireCooldown: number;
  velY: number;
}

interface DisconnectedSlot {
  roomCode: string;
  accountId: string;
  player: ServerPlayer;
  timer: ReturnType<typeof setTimeout>;
}

interface ServerGrenade {
  id: string;
  ownerId: string;
  ownerName: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuseSec: number;
}

interface ServerSupplyCrate extends SupplyCrateSnapshot {
  respawnSec: number;
}

interface ServerRoom {
  code: string;
  password: string;
  settings: RoomSettings;
  status: 'waiting' | 'playing' | 'ended';
  players: Map<string, ServerPlayer>;
  grenades: ServerGrenade[];
  supplies: ServerSupplyCrate[];
  chat: ChatMessage[];
  scores: { red: number; blue: number };
  timeRemainingSec: number;
  tick: number;
  winner?: RoomState['winner'];
  intervalId: ReturnType<typeof setInterval> | null;
}

const rooms = new Map<string, ServerRoom>();
const socketToRoom = new Map<string, string>();
const disconnectedSlots = new Map<string, DisconnectedSlot>();
const QUICK_PLAY_MAPS: MapId[] = ['desert_camp', 'warehouse', 'crossroad'];
let quickPlayMapCursor = 0;

function generateRoomCode(): string {
  return generateSecureRoomCode((code) => rooms.has(code));
}

function sanitizeText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

function normalizeTeamSize(raw: unknown): TeamSize {
  const n = Number(raw);
  if (TEAM_SIZES.includes(n as TeamSize)) return n as TeamSize;
  return 3;
}

function normalizeWeaponRule(raw: unknown): WeaponRule {
  if (typeof raw === 'string' && raw in WEAPON_RULES) return raw as WeaponRule;
  return 'all';
}

function normalizeBotDifficulty(raw: unknown): BotDifficulty {
  if (raw === 'easy' || raw === 'normal' || raw === 'hard') return raw;
  return 'easy';
}

function makeRoomSummary(room: ServerRoom): RoomSummary {
  let humans = 0;
  let bots = 0;
  let hostName = 'Unknown';
  for (const p of room.players.values()) {
    if (p.isBot) bots++;
    else humans++;
    if (p.isHost) hostName = p.name;
  }
  return {
    code: room.code,
    name: room.settings.name,
    mapId: room.settings.mapId,
    mode: room.settings.mode,
    teamSize: room.settings.teamSize,
    weaponRule: room.settings.weaponRule,
    botDifficulty: room.settings.botDifficulty,
    stageId: room.settings.stageId,
    playerCount: humans,
    botCount: room.status === 'waiting' ? room.settings.botCount : bots,
    maxPlayers: room.settings.maxPlayers,
    status: room.status === 'playing' ? 'playing' : 'waiting',
    hasPassword: room.settings.hasPassword,
    hostName,
  };
}

function makeRoomState(room: ServerRoom): RoomState {
  const players: RoomPlayer[] = Array.from(room.players.values()).map((p) => ({
    id: p.id,
    accountId: p.accountId,
    name: p.name,
    exp: p.exp,
    loadout: p.loadout,
    team: p.team,
    slotIndex: p.slotIndex,
    isHost: p.isHost,
    isReady: p.isReady,
    isBot: p.isBot,
    primaryWeapon: p.primaryWeapon,
    kills: p.kills,
    deaths: p.deaths,
    headshots: p.headshots,
    score: p.score,
  }));

  return {
    code: room.code,
    settings: room.settings,
    status: room.status,
    players,
    chat: room.chat.slice(-40),
    scores: { ...room.scores },
    timeRemainingSec: Math.ceil(room.timeRemainingSec),
    winner: room.winner,
  };
}

function isSlotTaken(
  room: ServerRoom,
  team: TeamId,
  slotIndex: number,
  excludePlayerId?: string,
  ignoreBots = true
): boolean {
  for (const p of room.players.values()) {
    if (excludePlayerId && p.id === excludePlayerId) continue;
    if (ignoreBots && p.isBot) continue;
    if (p.team === team && p.slotIndex === slotIndex) return true;
  }
  return false;
}

function findFirstFreeSlot(
  room: ServerRoom,
  team: TeamId,
  excludePlayerId?: string,
  ignoreBots = true
): number | null {
  for (let i = 0; i < room.settings.teamSize; i++) {
    if (!isSlotTaken(room, team, i, excludePlayerId, ignoreBots)) return i;
  }
  return null;
}

function assignTeamAndSlotForNewPlayer(room: ServerRoom): { team: TeamId; slotIndex: number } | null {
  let redCount = 0;
  let blueCount = 0;
  for (const p of room.players.values()) {
    if (p.isBot) continue;
    if (p.team === 'red') redCount++;
    else blueCount++;
  }
  const primaryTeam: TeamId = redCount <= blueCount ? 'red' : 'blue';
  const secondaryTeam: TeamId = primaryTeam === 'red' ? 'blue' : 'red';

  const slot1 = findFirstFreeSlot(room, primaryTeam);
  if (slot1 !== null) return { team: primaryTeam, slotIndex: slot1 };

  const slot2 = findFirstFreeSlot(room, secondaryTeam);
  if (slot2 !== null) return { team: secondaryTeam, slotIndex: slot2 };

  return null;
}

function rebalanceSlotsAfterResize(room: ServerRoom) {
  const humans = Array.from(room.players.values()).filter((p) => !p.isBot);
  const usedRed = new Set<number>();
  const usedBlue = new Set<number>();

  // Keep valid slots first
  const needAssign: ServerPlayer[] = [];
  for (const p of humans) {
    const used = p.team === 'red' ? usedRed : usedBlue;
    if (p.slotIndex >= 0 && p.slotIndex < room.settings.teamSize && !used.has(p.slotIndex)) {
      used.add(p.slotIndex);
    } else {
      needAssign.push(p);
    }
  }

  // Assign remaining players into any open slots
  for (const p of needAssign) {
    let placed = false;
    for (const tryTeam of [p.team, p.team === 'red' ? 'blue' : 'red'] as TeamId[]) {
      const used = tryTeam === 'red' ? usedRed : usedBlue;
      for (let i = 0; i < room.settings.teamSize; i++) {
        if (!used.has(i)) {
          p.team = tryTeam;
          p.slotIndex = i;
          used.add(i);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }
}

function getSpawnPoint(room: ServerRoom, team: TeamId, slotIndex: number, useExactSlot: boolean) {
  const map = MAPS[room.settings.mapId] ?? MAPS.desert_camp;
  const teamPool = team === 'red' ? map.redSpawns : map.blueSpawns;

  // On initial round deploy in TDM, honor the exact tactical deployment slot chosen by the player!
  if (useExactSlot && room.settings.mode === 'tdm' && teamPool.length > 0) {
    return teamPool[slotIndex % teamPool.length];
  }

  const pool = room.settings.mode === 'ffa' ? [...map.redSpawns, ...map.blueSpawns] : teamPool;
  let best = pool[Math.floor(Math.random() * pool.length)];
  let bestScore = -1;
  for (const sp of pool) {
    let minEnemyDist = 999;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      if (room.settings.mode === 'tdm' && p.team === team) continue;
      const d = Math.hypot(p.x - sp.x, p.z - sp.z);
      if (d < minEnemyDist) minEnemyDist = d;
    }
    const jitter = Math.random() * 4;
    if (minEnemyDist + jitter > bestScore) {
      bestScore = minEnemyDist + jitter;
      best = sp;
    }
  }
  return best;
}

function spawnPlayerEntity(room: ServerRoom, p: ServerPlayer, useExactSlot = false) {
  const sp = getSpawnPoint(room, p.team, p.slotIndex, useExactSlot);
  const resolvedWep = resolveWeaponForRule(room.settings.weaponRule, p.primaryWeapon);
  const diffSpec = BOT_DIFFICULTIES[room.settings.botDifficulty] ?? BOT_DIFFICULTIES.easy;
  p.x = sp.x + (useExactSlot ? 0 : (Math.random() - 0.5) * 1.2);
  p.y = sp.y;
  p.z = sp.z + (useExactSlot ? 0 : (Math.random() - 0.5) * 1.2);
  p.yaw = sp.yaw;
  p.pitch = 0;
  p.crouch = false;
  p.lean = 0;
  p.sprinting = false;
  p.maxHp = p.isBot ? diffSpec.botMaxHp : 100;
  p.hp = p.maxHp;
  p.armor = p.isBot ? diffSpec.botArmor : 50;
  p.alive = true;
  p.respawnTimer = 0;
  p.primaryWeapon = resolvedWep.primaryWeapon;
  p.weaponId = resolvedWep.activeWeapon;
  p.streak = 0;
  p.velY = 0;
  p.grenadesLeft = WEAPONS.frag.magSize;
  p.lastMoveAt = Date.now();
  p.history.clear();
  p.history.push({
    timestamp: Date.now(),
    x: p.x,
    y: p.y,
    z: p.z,
    crouch: false,
    alive: true,
  });
  if (p.isBot) {
    p.botFireCooldown = diffSpec.fireDelayMin * 0.75 + Math.random() * 0.5;
  }
  const map = MAPS[room.settings.mapId] ?? MAPS.desert_camp;
  p.waypointIndex = Math.floor(Math.random() * map.waypoints.length);
}

function pushSystemChat(room: ServerRoom, text: string) {
  const msg: ChatMessage = {
    id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    senderId: 'system',
    senderName: 'ระบบ',
    text,
    system: true,
    timestamp: Date.now(),
  };
  room.chat.push(msg);
  if (room.chat.length > 50) room.chat.shift();
  return msg;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      const forwardedHost = Array.isArray(req.headers['x-forwarded-host'])
        ? req.headers['x-forwarded-host'][0]
        : req.headers['x-forwarded-host'];
      const reqHost = forwardedHost || req.headers.host;
      if (isAllowedOrigin(origin, reqHost)) {
        callback(null, true);
      } else {
        callback('Origin not allowed', false);
      }
    },
    pingInterval: 10000,
    pingTimeout: 20000,
  });

  app.use(express.json({ limit: '32kb' }));

  // Periodic cleanup of expired sliding-window rate-limit buckets
  setInterval(() => rateLimiter.prune(), 60_000);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, tickRate: TICK_RATE });
  });

  app.get('/api/rooms', (_req, res) => {
    const list = Array.from(rooms.values()).map(makeRoomSummary);
    res.json(list);
  });

  // Guest Session Login / Restore (issues cryptographic sessionToken for subsequent mutations)
  app.post('/api/profile/login', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!rateLimiter.allow(`http:login:${ip}`, 24, 60_000)) {
      res.status(429).json({ ok: false, error: 'มีการร้องขอถี่เกินไป กรุณารอสักครู่' });
      return;
    }
    const reqAccountId = sanitizeText(req.body?.accountId, 24).toUpperCase();
    const reqName = sanitizeText(req.body?.name, 18);
    const starterUniformId = sanitizeText(req.body?.starterUniformId, 32);

    let profile = reqAccountId ? profiles.get(reqAccountId) : undefined;
    if (!profile) {
      profile = createGuestProfile(reqName || undefined, starterUniformId || undefined);
    } else if (reqName && reqName !== profile.name) {
      profile.name = reqName;
      scheduleSaveProfiles();
    }
    const sessionToken = ensureSessionToken(profile.accountId);
    res.json({ ok: true, profile, sessionToken });
  });

  app.get('/api/profile/:accountId', (req, res) => {
    const id = sanitizeText(req.params.accountId, 24).toUpperCase();
    const profile = profiles.get(id);
    if (!profile) {
      res.status(404).json({ ok: false, error: 'Profile not found' });
      return;
    }
    // Issue token seamlessly for returning legacy guest sessions
    const sessionToken = ensureSessionToken(profile.accountId);
    res.json({ ok: true, profile, sessionToken });
  });

  // Update Callsign & Equipped Tactical Loadout (protected by session token + rate limit)
  app.post('/api/profile/update', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!rateLimiter.allow(`http:update:${ip}`, 40, 60_000)) {
      res.status(429).json({ ok: false, error: 'มีการบันทึกข้อมูลถี่เกินไป กรุณารอสักครู่' });
      return;
    }
    const accountId = sanitizeText(req.body?.accountId, 24).toUpperCase();
    const profile = profiles.get(accountId);
    if (!profile) {
      res.status(404).json({ ok: false, error: 'ไม่พบบัญชีผู้เยี่ยมชม' });
      return;
    }
    const providedToken = String(req.headers['x-session-token'] || req.body?.sessionToken || '');
    const expectedToken = sessionTokens.get(accountId);
    if (expectedToken && !verifyTokenMatch(providedToken, expectedToken)) {
      res.status(401).json({ ok: false, error: 'เซสชันหมดอายุ กรุณารีเฟรชหน้าเพื่อยืนยันตัวตนใหม่' });
      return;
    }
    if (typeof req.body?.name === 'string') {
      const cleanName = sanitizeText(req.body.name, 18);
      if (cleanName) profile.name = cleanName;
    }
    if (req.body?.loadout && typeof req.body.loadout === 'object') {
      const ownedSet = new Set(profile.ownedItems);
      profile.loadout = sanitizeLoadout(req.body.loadout as Partial<CharacterLoadout>, ownedSet);
    }
    scheduleSaveProfiles();
    res.json({ ok: true, profile });
  });

  // Purchase Cosmetic Gear with Earned SP (protected by session token + rate limit)
  app.post('/api/profile/purchase', (req, res) => {
    const ip = req.ip || 'unknown';
    if (!rateLimiter.allow(`http:purchase:${ip}`, 25, 60_000)) {
      res.status(429).json({ ok: false, error: 'มีการทำรายการถี่เกินไป กรุณารอสักครู่' });
      return;
    }
    const accountId = sanitizeText(req.body?.accountId, 24).toUpperCase();
    const itemId = sanitizeText(req.body?.itemId, 40);
    const autoEquip = req.body?.autoEquip !== false;

    const profile = profiles.get(accountId);
    if (!profile) {
      res.status(404).json({ ok: false, error: 'ไม่พบบัญชีผู้เยี่ยมชม' });
      return;
    }
    const providedToken = String(req.headers['x-session-token'] || req.body?.sessionToken || '');
    const expectedToken = sessionTokens.get(accountId);
    if (expectedToken && !verifyTokenMatch(providedToken, expectedToken)) {
      res.status(401).json({ ok: false, error: 'เซสชันหมดอายุ กรุณารีเฟรชหน้าเพื่อยืนยันตัวตนใหม่' });
      return;
    }
    const item = COSMETIC_BY_ID[itemId];
    if (!item) {
      res.status(400).json({ ok: false, error: 'ไม่พบไอเทมนี้ในร้านค้า' });
      return;
    }
    if (!profile.ownedItems.includes(item.id)) {
      if (profile.sp < item.priceSp) {
        res.status(400).json({ ok: false, error: 'แต้ม SP ไม่เพียงพอ กรุณาลงเล่นเพื่อสะสม SP เพิ่ม' });
        return;
      }
      profile.sp -= item.priceSp;
      profile.ownedItems.push(item.id);
    }
    if (autoEquip) {
      const ownedSet = new Set(profile.ownedItems);
      const patch: Partial<CharacterLoadout> = { ...profile.loadout };
      if (item.category === 'uniform') patch.uniformId = item.id;
      else if (item.category === 'headgear') patch.headgearId = item.id;
      else if (item.category === 'facegear') patch.facegearId = item.id;
      else if (item.category === 'vest') patch.vestId = item.id;
      else if (item.category === 'weaponSkin') patch.weaponSkinId = item.id;
      profile.loadout = sanitizeLoadout(patch, ownedSet);
    }
    scheduleSaveProfiles();
    res.json({ ok: true, profile });
  });

  function broadcastRoomList() {
    const list = Array.from(rooms.values()).map(makeRoomSummary);
    io.emit('rooms:list', list);
  }

  function broadcastRoomState(room: ServerRoom) {
    io.to(room.code).emit('room:state', makeRoomState(room));
  }

  function endMatch(room: ServerRoom) {
    if (room.status !== 'playing') return;
    room.status = 'ended';
    if (room.intervalId) {
      clearInterval(room.intervalId);
      room.intervalId = null;
    }

    const allPlayers = Array.from(room.players.values());
    const sorted = [...allPlayers].sort((a, b) => b.score - a.score || b.kills - a.kills);
    const mvp = sorted[0];

    if (room.settings.mode === 'tdm') {
      if (room.scores.red > room.scores.blue) {
        room.winner = {
          type: 'team',
          team: 'red',
          mvpName: mvp?.name,
          mvpKills: mvp?.kills,
        };
      } else if (room.scores.blue > room.scores.red) {
        room.winner = {
          type: 'team',
          team: 'blue',
          mvpName: mvp?.name,
          mvpKills: mvp?.kills,
        };
      } else {
        room.winner = {
          type: 'draw',
          mvpName: mvp?.name,
          mvpKills: mvp?.kills,
        };
      }
    } else {
      room.winner = {
        type: 'player',
        playerId: mvp?.id,
        playerName: mvp?.name,
        mvpName: mvp?.name,
        mvpKills: mvp?.kills,
      };
    }

    // Award authoritative EXP, SP, and Stage Clear progression to every human player!
    const diffSpec = BOT_DIFFICULTIES[room.settings.botDifficulty] ?? BOT_DIFFICULTIES.easy;
    const stageDef = room.settings.stageId ? BOT_STAGE_BY_ID[room.settings.stageId] : undefined;

    for (const p of allPlayers) {
      if (p.isBot || !p.accountId) continue;
      const profile = profiles.get(p.accountId);
      if (!profile) continue;

      const didWin =
        (room.winner?.type === 'team' && room.winner.team === p.team) ||
        (room.winner?.type === 'player' && room.winner.playerId === p.id);

      const oldRankIndex = getRankForExp(profile.exp).index;

      // Generous, enjoyable EXP & SP calculation so players progress smoothly
      const baseExp = 80;
      const killExp = p.kills * 24;
      const headshotExp = p.headshots * 14;
      const winBonusExp = didWin ? 110 : 35;
      const stageBonusExp = stageDef && didWin ? stageDef.clearBonusExp : 0;
      const stageBonusSp = stageDef && didWin ? stageDef.clearBonusSp : 0;

      const expGained = Math.round(
        (baseExp + killExp + headshotExp + winBonusExp) * diffSpec.expMult + stageBonusExp
      );
      const spGained = Math.round(
        (75 + p.kills * 20 + p.headshots * 12 + (didWin ? 95 : 40)) * diffSpec.spMult + stageBonusSp
      );

      profile.exp += expGained;
      profile.sp += spGained;
      profile.totalKills += p.kills;
      profile.totalHeadshots += p.headshots;
      profile.totalDeaths += p.deaths;
      profile.matchesPlayed += 1;
      if (didWin) profile.wins += 1;

      let stageClearedId: string | undefined;
      if (stageDef && didWin) {
        stageClearedId = stageDef.id;
        if (!profile.clearedStages.includes(stageDef.id)) {
          profile.clearedStages.push(stageDef.id);
        }
      }

      p.exp = profile.exp;
      const newRankIndex = getRankForExp(profile.exp).index;

      const rewardPayload: MatchRewardEvent = {
        expGained,
        spGained,
        baseExp,
        killExp,
        headshotExp,
        winBonusExp,
        stageBonusExp,
        stageBonusSp,
        difficultyMult: diffSpec.expMult,
        rankedUp: newRankIndex > oldRankIndex,
        oldRankIndex,
        newRankIndex,
        stageClearedId,
        profile,
      };
      io.to(p.id).emit('profile:matchReward', rewardPayload);
    }

    scheduleSaveProfiles();
    broadcastRoomState(room);
    broadcastRoomList();
  }

  function applyDamage(
    room: ServerRoom,
    attacker: ServerPlayer,
    victim: ServerPlayer,
    rawDamage: number,
    weaponId: WeaponId,
    hitZone: HitZone
  ) {
    if (!victim.alive || room.status !== 'playing') return;
    if (attacker.id === victim.id) return;
    if (room.settings.mode === 'tdm' && attacker.team === victim.team) return;

    let dmg = Math.round(rawDamage);
    if (hitZone !== 'head' && victim.armor > 0) {
      const absorbed = Math.min(victim.armor, Math.round(dmg * 0.25));
      victim.armor = Math.max(0, victim.armor - absorbed);
      dmg = Math.max(1, dmg - absorbed);
    }

    victim.hp = Math.max(0, victim.hp - dmg);
    const killed = victim.hp <= 0;

    if (!attacker.isBot) {
      io.to(attacker.id).emit('combat:hitConfirm', {
        targetId: victim.id,
        hitZone,
        damage: dmg,
        killed,
        remainingHp: victim.hp,
      });
    }

    if (!victim.isBot) {
      io.to(victim.id).emit('combat:damageTaken', {
        attackerId: attacker.id,
        attackerName: attacker.name,
        attackerPos: { x: attacker.x, y: attacker.y, z: attacker.z },
        damage: dmg,
        hitZone,
        remainingHp: victim.hp,
        remainingArmor: victim.armor,
      });
    }

    if (killed) {
      victim.alive = false;
      victim.respawnTimer = 3.0;
      victim.deaths += 1;
      victim.streak = 0;

      attacker.kills += 1;
      attacker.streak += 1;
      if (hitZone === 'head') attacker.headshots += 1;
      attacker.score += hitZone === 'head' ? 150 : 100;

      if (room.settings.mode === 'tdm') {
        room.scores[attacker.team] += 1;
      }

      io.to(room.code).emit('combat:kill', {
        id: `kill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        killerId: attacker.id,
        killerName: attacker.name,
        killerTeam: attacker.team,
        victimId: victim.id,
        victimName: victim.name,
        victimTeam: victim.team,
        weaponId,
        headshot: hitZone === 'head',
        streak: attacker.streak,
        timestamp: Date.now(),
      });

      if (room.settings.mode === 'tdm') {
        if (
          room.scores.red >= room.settings.targetKills ||
          room.scores.blue >= room.settings.targetKills
        ) {
          endMatch(room);
        }
      } else if (attacker.kills >= room.settings.targetKills) {
        endMatch(room);
      }
    }
  }

  function updateBotAI(room: ServerRoom, bot: ServerPlayer) {
    const map = MAPS[room.settings.mapId] ?? MAPS.desert_camp;
    const diffSpec = BOT_DIFFICULTIES[room.settings.botDifficulty] ?? BOT_DIFFICULTIES.easy;
    const botEye: Vec3 = { x: bot.x, y: bot.y + PLAYER_EYE_HEIGHT, z: bot.z };
    const botWeapon = bot.weaponId;
    const spec = WEAPONS[botWeapon] ?? WEAPONS.m4a1;

    let target: ServerPlayer | null = null;
    const detectRange =
      room.settings.botDifficulty === 'easy'
        ? 34
        : room.settings.botDifficulty === 'normal'
          ? 44
          : 54;
    let bestDist = botWeapon === 'knife' ? 24 : botWeapon === 'm870' ? 28 : detectRange;

    for (const other of room.players.values()) {
      if (!other.alive || other.id === bot.id) continue;
      if (room.settings.mode === 'tdm' && other.team === bot.team) continue;
      const dist = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (dist < bestDist) {
        const otherEye: Vec3 = {
          x: other.x,
          y: other.y + PLAYER_EYE_HEIGHT * 0.85,
          z: other.z,
        };
        if (hasLineOfSight(botEye, otherEye, map)) {
          bestDist = dist;
          target = other;
        }
      }
    }

    bot.botFireCooldown = Math.max(0, bot.botFireCooldown - TICK_DT);

    if (target) {
      const dx = target.x - bot.x;
      const dy = target.y + 1.35 - (bot.y + PLAYER_EYE_HEIGHT);
      const dz = target.z - bot.z;
      const horiz = Math.sqrt(dx * dx + dz * dz) || 0.001;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.pitch = Math.atan2(dy, horiz);

      bot.strafeTimer -= TICK_DT;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 0.85 + Math.random() * 1.25;
      }

      const strafeSpeed = diffSpec.moveSpeed * 0.62 * TICK_DT;
      const rightX = Math.cos(bot.yaw);
      const rightZ = -Math.sin(bot.yaw);
      let nextX = bot.x + rightX * bot.strafeDir * strafeSpeed;
      let nextZ = bot.z + rightZ * bot.strafeDir * strafeSpeed;

      const idealMin = botWeapon === 'knife' ? 1.5 : botWeapon === 'm870' ? 5.5 : 8;
      const idealMax = botWeapon === 'knife' ? 2.2 : botWeapon === 'm870' ? 10 : 20;

      if (horiz > idealMax) {
        const chaseSpeed = botWeapon === 'knife' ? diffSpec.moveSpeed * 1.05 : diffSpec.moveSpeed * 0.62;
        nextX += (dx / horiz) * chaseSpeed * TICK_DT;
        nextZ += (dz / horiz) * chaseSpeed * TICK_DT;
      } else if (horiz < idealMin) {
        nextX -= (dx / horiz) * 1.8 * TICK_DT;
        nextZ -= (dz / horiz) * 1.8 * TICK_DT;
      }

      const resolved = resolvePlayerMovement({ x: nextX, y: bot.y, z: nextZ }, bot.velY, map);
      bot.x = resolved.x;
      bot.y = resolved.y;
      bot.z = resolved.z;
      bot.velY = resolved.velY;

      if (bot.botFireCooldown <= 0 && horiz <= spec.range + 1) {
        const delaySpan = Math.max(0.1, diffSpec.fireDelayMax - diffSpec.fireDelayMin);
        bot.botFireCooldown = Math.max(
          spec.fireRateMs / 1000,
          diffSpec.fireDelayMin + Math.random() * delaySpan
        );

        const dirLen = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const spread = room.settings.botDifficulty === 'easy' ? 0.14 : room.settings.botDifficulty === 'normal' ? 0.08 : 0.045;
        const dir: Vec3 = {
          x: dx / dirLen + (Math.random() - 0.5) * spread,
          y: dy / dirLen + (Math.random() - 0.5) * spread,
          z: dz / dirLen + (Math.random() - 0.5) * spread,
        };
        const dNorm = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
        dir.x /= dNorm;
        dir.y /= dNorm;
        dir.z /= dNorm;

        const distFactor = Math.max(0, Math.min(1, 1 - horiz / 42));
        const hitChance =
          botWeapon === 'knife'
            ? Math.min(0.68, diffSpec.accuracyMax + 0.18)
            : diffSpec.accuracyMin + (diffSpec.accuracyMax - diffSpec.accuracyMin) * distFactor;
        const didHit = Math.random() < hitChance;
        const isHeadshot = didHit && botWeapon !== 'knife' && Math.random() < diffSpec.headshotChance;

        const wallDist = raycastMap(botEye, dir, map, spec.range) ?? spec.range;
        const travel = didHit ? Math.min(horiz, wallDist) : wallDist;
        const endPoint: Vec3 = {
          x: botEye.x + dir.x * travel,
          y: botEye.y + dir.y * travel,
          z: botEye.z + dir.z * travel,
        };

        io.to(room.code).emit('combat:shot', {
          shooterId: bot.id,
          weaponId: botWeapon,
          origin: botEye,
          endPoint,
          hitPlayerId: didHit ? target.id : undefined,
          hitZone: isHeadshot ? 'head' : 'body',
        });

        if (didHit) {
          const hitZone: HitZone = isHeadshot ? 'head' : 'body';
          const rawBase =
            botWeapon === 'm870'
              ? Math.max(20, 84 - horiz * 2.4)
              : spec.damage * (isHeadshot ? 1.45 : 0.72);
          applyDamage(room, bot, target, rawBase * diffSpec.damageMult, botWeapon, hitZone);
        }
      }
      return;
    }

    const wp = map.waypoints[bot.waypointIndex % map.waypoints.length];
    const dx = wp.x - bot.x;
    const dz = wp.z - bot.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 2.2) {
      bot.waypointIndex = Math.floor(Math.random() * map.waypoints.length);
    } else {
      const moveSpeed = diffSpec.moveSpeed * TICK_DT;
      const nx = dx / dist;
      const nz = dz / dist;
      bot.yaw = Math.atan2(-nx, -nz);
      bot.pitch = 0;

      const prevX = bot.x;
      const prevZ = bot.z;
      const resolved = resolvePlayerMovement(
        { x: bot.x + nx * moveSpeed, y: bot.y, z: bot.z + nz * moveSpeed },
        bot.velY,
        map
      );
      bot.x = resolved.x;
      bot.y = resolved.y;
      bot.z = resolved.z;
      bot.velY = resolved.velY;

      if (Math.hypot(bot.x - prevX, bot.z - prevZ) < moveSpeed * 0.25) {
        bot.waypointIndex = Math.floor(Math.random() * map.waypoints.length);
      }
    }
  }

  function updateGrenades(room: ServerRoom) {
    const map = MAPS[room.settings.mapId] ?? MAPS.desert_camp;
    const remaining: ServerGrenade[] = [];

    for (const g of room.grenades) {
      g.fuseSec -= TICK_DT;
      g.vy -= 18 * TICK_DT;

      const nextX = g.x + g.vx * TICK_DT;
      const nextY = g.y + g.vy * TICK_DT;
      const nextZ = g.z + g.vz * TICK_DT;

      if (nextY <= 0.18) {
        g.y = 0.18;
        g.vy = Math.abs(g.vy) * 0.35;
        g.vx *= 0.72;
        g.vz *= 0.72;
      } else {
        g.y = nextY;
      }

      const wallRay = raycastMap(
        { x: g.x, y: g.y, z: g.z },
        { x: nextX - g.x, y: 0, z: nextZ - g.z },
        map,
        1
      );
      if (wallRay !== null && wallRay < 1) {
        g.vx *= -0.45;
        g.vz *= -0.45;
      } else {
        g.x = Math.max(map.bounds.minX + 0.5, Math.min(map.bounds.maxX - 0.5, nextX));
        g.z = Math.max(map.bounds.minZ + 0.5, Math.min(map.bounds.maxZ - 0.5, nextZ));
      }

      if (g.fuseSec <= 0) {
        io.to(room.code).emit('combat:grenadeExplode', {
          id: g.id,
          x: g.x,
          y: g.y,
          z: g.z,
        });

        const owner = room.players.get(g.ownerId);
        const blastOrigin: Vec3 = { x: g.x, y: g.y + 0.35, z: g.z };
        const radius = 8.0;

        for (const victim of room.players.values()) {
          if (!victim.alive) continue;
          const victimCenter: Vec3 = { x: victim.x, y: victim.y + 1.0, z: victim.z };
          const dist = Math.hypot(
            victimCenter.x - blastOrigin.x,
            victimCenter.y - blastOrigin.y,
            victimCenter.z - blastOrigin.z
          );
          if (dist <= radius && hasLineOfSight(blastOrigin, victimCenter, map)) {
            const falloff = 1 - dist / radius;
            const dmg = Math.max(15, WEAPONS.frag.damage * falloff);
            if (owner) {
              applyDamage(room, owner, victim, dmg, 'frag', 'body');
            }
          }
        }
      } else {
        remaining.push(g);
      }
    }

    room.grenades = remaining;
  }

  function startMatchLoop(room: ServerRoom) {
    if (room.intervalId) clearInterval(room.intervalId);
    room.status = 'playing';
    room.scores = { red: 0, blue: 0 };
    room.timeRemainingSec = room.settings.timeLimitSec;
    room.tick = 0;
    room.winner = undefined;
    room.grenades = [];
    const mapDef = MAPS[room.settings.mapId] ?? MAPS.desert_camp;
    room.supplies = mapDef.supplySpawns.map((s) => ({
      id: s.id,
      kind: s.kind,
      x: s.x,
      y: s.y,
      z: s.z,
      available: true,
      respawnSec: 0,
    }));

    // Remove previous bots
    for (const [id, p] of room.players.entries()) {
      if (p.isBot) room.players.delete(id);
    }

    // Reset & deploy human players at their exact chosen tactical slots
    for (const p of room.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.headshots = 0;
      p.score = 0;
      spawnPlayerEntity(room, p, true);
    }

    // Fill bots up to configured botCount while respecting teamSize slots!
    const maxTotalSlots = room.settings.teamSize * 2;
    const currentHumans = room.players.size;
    const desiredBots = Math.max(
      0,
      Math.min(room.settings.botCount, maxTotalSlots - currentHumans)
    );

    const ruleSpec = WEAPON_RULES[room.settings.weaponRule];
    const botPrimaryPool = ruleSpec.allowedPrimaries ?? PRIMARY_WEAPONS;

    for (let i = 0; i < desiredBots; i++) {
      let redCount = 0;
      let blueCount = 0;
      for (const p of room.players.values()) {
        if (p.team === 'red') redCount++;
        else blueCount++;
      }
      const prefTeam: TeamId = redCount <= blueCount ? 'red' : 'blue';
      const altTeam: TeamId = prefTeam === 'red' ? 'blue' : 'red';
      let team: TeamId = prefTeam;
      let slot = findFirstFreeSlot(room, prefTeam, undefined, false);
      if (slot === null) {
        team = altTeam;
        slot = findFirstFreeSlot(room, altTeam, undefined, false);
      }
      if (slot === null) break;

      const botId = `bot_${room.code}_${i}`;
      const chosenPrimary = botPrimaryPool[i % botPrimaryPool.length];
      const resolvedWep = resolveWeaponForRule(room.settings.weaponRule, chosenPrimary);
      const botDiff = room.settings.botDifficulty;
      const botExp =
        botDiff === 'hard'
          ? 9800 + i * 1800
          : botDiff === 'normal'
            ? 2200 + i * 550
            : 250 + i * 180;

      const bot: ServerPlayer = {
        id: botId,
        name: `[BOT] ${BOT_NAMES[i % BOT_NAMES.length]}`,
        exp: botExp,
        loadout: getBotLoadout(team, i, botDiff),
        team,
        slotIndex: slot,
        isHost: false,
        isReady: true,
        isBot: true,
        primaryWeapon: resolvedWep.primaryWeapon,
        weaponId: resolvedWep.activeWeapon,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        crouch: false,
        lean: 0,
        sprinting: false,
        hp: 100,
        maxHp: 100,
        armor: 50,
        alive: true,
        respawnTimer: 0,
        kills: 0,
        deaths: 0,
        headshots: 0,
        score: 0,
        lastShotAt: 0,
        lastMoveAt: Date.now(),
        grenadesLeft: WEAPONS.frag.magSize,
        rttMs: 0,
        history: new PositionHistoryBuffer(),
        streak: 0,
        waypointIndex: 0,
        strafeDir: 1,
        strafeTimer: 1,
        botFireCooldown: 1.0,
        velY: 0,
      };
      spawnPlayerEntity(room, bot, true);
      room.players.set(botId, bot);
    }

    broadcastRoomState(room);
    broadcastRoomList();

    room.intervalId = setInterval(() => {
      if (room.status !== 'playing') return;
      room.tick += 1;
      room.timeRemainingSec = Math.max(0, room.timeRemainingSec - TICK_DT);
      const nowMs = Date.now();

      if (room.timeRemainingSec <= 0) {
        endMatch(room);
        return;
      }

      for (const p of room.players.values()) {
        if (!p.alive) {
          p.respawnTimer = Math.max(0, p.respawnTimer - TICK_DT);
          if (p.respawnTimer <= 0) {
            spawnPlayerEntity(room, p, false);
          }
        } else if (p.isBot) {
          updateBotAI(room, p);
        }
        // Record 30Hz authoritative position sample for Lag Compensation Hitbox Rewind
        p.history.push({
          timestamp: nowMs,
          x: p.x,
          y: p.y,
          z: p.z,
          crouch: p.crouch,
          alive: p.alive,
        });
      }

      updateGrenades(room);

      // Supply Crates (refills server-side grenades too on ammo pickup!)
      for (const sup of room.supplies) {
        if (!sup.available) {
          sup.respawnSec -= TICK_DT;
          if (sup.respawnSec <= 0) {
            sup.available = true;
            sup.respawnSec = 0;
          }
          continue;
        }
        for (const p of room.players.values()) {
          if (!p.alive) continue;
          const dist = Math.hypot(p.x - sup.x, p.z - sup.z);
          if (dist > 1.55) continue;
          if (sup.kind === 'medkit' && p.hp >= p.maxHp && p.armor >= 50) continue;

          sup.available = false;
          sup.respawnSec = 24;
          let hpGained = 0;
          let armorGained = 0;
          if (sup.kind === 'medkit') {
            const nextHp = Math.min(p.maxHp, p.hp + 40);
            const nextArmor = Math.min(50, p.armor + 25);
            hpGained = nextHp - p.hp;
            armorGained = nextArmor - p.armor;
            p.hp = nextHp;
            p.armor = nextArmor;
          } else if (sup.kind === 'ammo') {
            p.grenadesLeft = WEAPONS.frag.magSize;
          }
          if (!p.isBot) {
            io.to(p.id).emit('combat:supplyPickup', {
              kind: sup.kind,
              hpGained,
              armorGained,
            });
          }
          break;
        }
      }

      // Quantized MatchSnapshot reduces WebSocket JSON bandwidth ~35% at 30Hz!
      const snapshot: MatchSnapshot = {
        tick: room.tick,
        timeRemainingSec: Math.ceil(room.timeRemainingSec),
        scores: { ...room.scores },
        players: Array.from(room.players.values()).map((p) => ({
          id: p.id,
          accountId: p.accountId,
          name: p.name,
          exp: p.exp,
          loadout: p.loadout,
          team: p.team,
          slotIndex: p.slotIndex,
          isBot: p.isBot,
          x: q2(p.x),
          y: q2(p.y),
          z: q2(p.z),
          yaw: q3(p.yaw),
          pitch: q3(p.pitch),
          crouch: p.crouch,
          lean: q2(p.lean),
          sprinting: p.sprinting,
          hp: p.hp,
          maxHp: p.maxHp,
          armor: p.armor,
          alive: p.alive,
          respawnTimer: Number(p.respawnTimer.toFixed(1)),
          weaponId: p.weaponId,
          primaryWeapon: p.primaryWeapon,
          kills: p.kills,
          deaths: p.deaths,
          headshots: p.headshots,
          score: p.score,
        })),
        grenades: room.grenades.map(
          (g): LiveGrenadeSnapshot => ({
            id: g.id,
            ownerId: g.ownerId,
            team: g.team,
            x: q2(g.x),
            y: q2(g.y),
            z: q2(g.z),
          })
        ),
        supplies: room.supplies.map((s) => ({
          id: s.id,
          kind: s.kind,
          x: s.x,
          y: s.y,
          z: s.z,
          available: s.available,
        })),
      };

      io.to(room.code).emit('match:snapshot', snapshot);
    }, 1000 / TICK_RATE);
  }

  function leaveCurrentRoom(socket: Socket, allowReconnectGrace = false) {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    socketToRoom.delete(socket.id);
    socket.leave(code);

    const room = rooms.get(code);
    if (!room) return;

    const departing = room.players.get(socket.id);
    room.players.delete(socket.id);

    // 60s Reconnect Grace Window when a player drops mid-match unexpectedly
    if (allowReconnectGrace && departing && !departing.isBot && departing.accountId && room.status === 'playing') {
      const prevGrace = disconnectedSlots.get(departing.accountId);
      if (prevGrace) clearTimeout(prevGrace.timer);

      const remainingNow = Array.from(room.players.values()).filter((p) => !p.isBot);
      const graceMs = remainingNow.length > 0 ? 60_000 : 15_000;
      const timer = setTimeout(() => {
        const entry = disconnectedSlots.get(departing.accountId!);
        if (!entry) return;
        disconnectedSlots.delete(departing.accountId!);
        const r = rooms.get(entry.roomCode);
        if (!r) return;
        const stillHumans = Array.from(r.players.values()).filter((p) => !p.isBot);
        if (stillHumans.length === 0) {
          if (r.intervalId) clearInterval(r.intervalId);
          rooms.delete(entry.roomCode);
          broadcastRoomList();
        }
      }, graceMs);

      disconnectedSlots.set(departing.accountId, {
        roomCode: code,
        accountId: departing.accountId,
        player: departing,
        timer,
      });

      if (remainingNow.length > 0) {
        pushSystemChat(room, `${departing.name} สัญญาณขาดชั่วคราว (สงวนสิทธิ์กลับเข้าห้อง 60 วิ)`);
        if (departing.isHost) {
          remainingNow[0].isHost = true;
          remainingNow[0].isReady = true;
        }
        broadcastRoomState(room);
        broadcastRoomList();
      }
      return;
    }

    const remainingHumans = Array.from(room.players.values()).filter((p) => !p.isBot);
    if (remainingHumans.length === 0) {
      if (room.intervalId) clearInterval(room.intervalId);
      rooms.delete(code);
      broadcastRoomList();
      return;
    }

    if (departing) {
      pushSystemChat(room, `${departing.name} ออกจากห้องแล้ว`);
      if (departing.isHost) {
        remainingHumans[0].isHost = true;
        remainingHumans[0].isReady = true;
        pushSystemChat(room, `${remainingHumans[0].name} เป็นหัวหน้าห้องคนใหม่`);
      }
    }

    broadcastRoomState(room);
    broadcastRoomList();
  }

  io.on('connection', (socket) => {
    socket.emit('rooms:list', Array.from(rooms.values()).map(makeRoomSummary));

    // Low-overhead Ping/Pong RTT measurement for Telemetry HUD & Lag Compensation
    socket.on('net:ping', (clientTs: number, ack?: (serverTs: number) => void) => {
      const code = socketToRoom.get(socket.id);
      if (code) {
        const room = rooms.get(code);
        const p = room?.players.get(socket.id);
        if (p && typeof clientTs === 'number' && Number.isFinite(clientTs)) {
          // Client sends last measured RTT or timestamp; client will also report rtt via net:rtt
        }
      }
      if (typeof ack === 'function') {
        ack(Date.now());
      } else {
        socket.emit('net:pong', { clientTs, serverTs: Date.now() });
      }
    });

    socket.on('net:rtt', (rttMs: number) => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const p = rooms.get(code)?.players.get(socket.id);
      if (p && typeof rttMs === 'number' && Number.isFinite(rttMs)) {
        p.rttMs = Math.max(0, Math.min(500, rttMs));
      }
    });

    // Reconnect into reserved live match slot within 60s grace window
    socket.on(
      'room:reconnect',
      (
        payload: { accountId?: string },
        cb?: (res: { ok: boolean; room?: RoomState }) => void
      ) => {
        const accountId = sanitizeText(payload?.accountId, 24).toUpperCase();
        if (!accountId) {
          cb?.({ ok: false });
          return;
        }
        const reserved = disconnectedSlots.get(accountId);
        if (!reserved) {
          cb?.({ ok: false });
          return;
        }
        const room = rooms.get(reserved.roomCode);
        if (!room || room.status !== 'playing') {
          clearTimeout(reserved.timer);
          disconnectedSlots.delete(accountId);
          cb?.({ ok: false });
          return;
        }
        clearTimeout(reserved.timer);
        disconnectedSlots.delete(accountId);

        const restored = reserved.player;
        restored.id = socket.id;
        restored.lastMoveAt = Date.now();
        room.players.set(socket.id, restored);
        socketToRoom.set(socket.id, room.code);
        socket.join(room.code);
        pushSystemChat(room, `${restored.name} กลับเข้าสู่สมรภูมิแล้ว`);
        const state = makeRoomState(room);
        broadcastRoomState(room);
        broadcastRoomList();
        cb?.({ ok: true, room: state });
      }
    );

    socket.on('rooms:refresh', () => {
      socket.emit('rooms:list', Array.from(rooms.values()).map(makeRoomSummary));
    });

    socket.on(
      'room:create',
      (
        payload: {
          accountId?: string;
          playerName: string;
          loadout?: CharacterLoadout;
          primaryWeapon?: PrimaryWeaponId;
          roomName?: string;
          mapId?: MapId;
          mode?: GameMode;
          teamSize?: TeamSize;
          weaponRule?: WeaponRule;
          botDifficulty?: BotDifficulty;
          stageId?: string;
          targetKills?: number;
          botCount?: number;
          password?: string;
          autoStart?: boolean;
        },
        cb?: (res: { ok: boolean; error?: string; room?: RoomState }) => void
      ) => {
        if (!rateLimiter.allow(`sock:create:${socket.id}`, 6, 30_000)) {
          cb?.({ ok: false, error: 'สร้างห้องถี่เกินไป กรุณารอสักครู่' });
          return;
        }
        leaveCurrentRoom(socket);

        const accountId = sanitizeText(payload?.accountId, 24).toUpperCase() || undefined;
        const prof = accountId ? profiles.get(accountId) : undefined;
        const playerName =
          sanitizeText(payload?.playerName, 18) ||
          prof?.name ||
          `Officer-${socket.id.slice(0, 4)}`;
        const playerExp = prof?.exp ?? 0;
        const playerLoadout = prof
          ? prof.loadout
          : sanitizeLoadout(payload?.loadout, new Set(DEFAULT_OWNED_ITEMS));

        const stageDef = payload?.stageId ? BOT_STAGE_BY_ID[payload.stageId] : undefined;
        const roomName =
          sanitizeText(payload?.roomName, 32) ||
          stageDef?.title ||
          `ห้องของ ${playerName}`;
        const mapId: MapId =
          stageDef?.mapId ??
          (payload?.mapId && MAPS[payload.mapId] ? payload.mapId : 'desert_camp');
        const mode: GameMode = stageDef ? 'tdm' : payload?.mode === 'ffa' ? 'ffa' : 'tdm';
        const teamSize = stageDef
          ? stageDef.teamSize
          : normalizeTeamSize(payload?.teamSize ?? 3);
        const maxPlayers = teamSize * 2;
        const weaponRule = stageDef
          ? stageDef.weaponRule
          : normalizeWeaponRule(payload?.weaponRule ?? 'all');
        const botDifficulty = stageDef
          ? stageDef.difficulty
          : normalizeBotDifficulty(payload?.botDifficulty ?? 'easy');
        const targetKills = stageDef
          ? stageDef.targetKills
          : Math.max(5, Math.min(100, Number(payload?.targetKills) || 20));
        const botCount = stageDef
          ? Math.min(maxPlayers - 1, stageDef.botCount)
          : Math.max(
              0,
              Math.min(maxPlayers - 1, Number(payload?.botCount ?? Math.min(3, maxPlayers - 1)))
            );
        const password = sanitizeText(payload?.password, 16);
        const preferredPrimary: PrimaryWeaponId =
          payload?.primaryWeapon && PRIMARY_WEAPONS.includes(payload.primaryWeapon)
            ? payload.primaryWeapon
            : 'm4a1';
        const resolvedWep = resolveWeaponForRule(weaponRule, preferredPrimary);

        const code = generateRoomCode();
        const hostPlayer: ServerPlayer = {
          id: socket.id,
          accountId: prof?.accountId,
          name: playerName,
          exp: playerExp,
          loadout: playerLoadout,
          team: 'blue',
          slotIndex: 0,
          isHost: true,
          isReady: true,
          isBot: false,
          primaryWeapon: resolvedWep.primaryWeapon,
          weaponId: resolvedWep.activeWeapon,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
          crouch: false,
          lean: 0,
          sprinting: false,
          hp: 100,
          maxHp: 100,
          armor: 50,
          alive: true,
          respawnTimer: 0,
          kills: 0,
          deaths: 0,
          headshots: 0,
          score: 0,
          lastShotAt: 0,
          lastMoveAt: Date.now(),
          grenadesLeft: WEAPONS.frag.magSize,
          rttMs: 0,
          history: new PositionHistoryBuffer(),
          streak: 0,
          waypointIndex: 0,
          strafeDir: 1,
          strafeTimer: 1,
          botFireCooldown: 0,
          velY: 0,
        };

        const room: ServerRoom = {
          code,
          password,
          settings: {
            name: roomName,
            mapId,
            mode,
            teamSize,
            weaponRule,
            botDifficulty,
            stageId: stageDef?.id,
            maxPlayers,
            targetKills,
            timeLimitSec: 360,
            botCount,
            hasPassword: password.length > 0,
          },
          status: 'waiting',
          players: new Map([[socket.id, hostPlayer]]),
          grenades: [],
          supplies: [],
          chat: [],
          scores: { red: 0, blue: 0 },
          timeRemainingSec: 360,
          tick: 0,
          intervalId: null,
        };

        pushSystemChat(
          room,
          `สร้างห้อง ${code} (${teamSize}v${teamSize} · ${WEAPON_RULES[weaponRule].shortLabel} · บอท ${BOT_DIFFICULTIES[botDifficulty].label})`
        );

        rooms.set(code, room);
        socketToRoom.set(socket.id, code);
        socket.join(code);

        if (payload?.autoStart) {
          startMatchLoop(room);
          cb?.({ ok: true, room: makeRoomState(room) });
          return;
        }

        broadcastRoomList();
        const state = makeRoomState(room);
        socket.emit('room:state', state);
        cb?.({ ok: true, room: state });
      }
    );

    socket.on(
      'room:join',
      (
        payload: {
          code: string;
          accountId?: string;
          playerName: string;
          loadout?: CharacterLoadout;
          primaryWeapon?: PrimaryWeaponId;
          password?: string;
        },
        cb?: (res: { ok: boolean; error?: string; room?: RoomState }) => void
      ) => {
        if (!rateLimiter.allow(`sock:join:${socket.id}`, 10, 30_000)) {
          cb?.({ ok: false, error: 'ลองเข้าห้องถี่เกินไป กรุณารอสักครู่' });
          return;
        }
        const code = sanitizeText(payload?.code, 10).toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          cb?.({ ok: false, error: 'ไม่พบห้องรบตามรหัสที่ระบุ กรุณาตรวจสอบรหัสห้องอีกครั้ง' });
          return;
        }
        if (room.password && room.password !== sanitizeText(payload?.password, 16)) {
          cb?.({ ok: false, error: 'รหัสผ่านห้องไม่ถูกต้อง' });
          return;
        }

        const assignment = assignTeamAndSlotForNewPlayer(room);
        if (!assignment) {
          cb?.({ ok: false, error: 'ห้องเต็มแล้ว ไม่สามารถเข้าร่วมได้' });
          return;
        }

        leaveCurrentRoom(socket);

        // If joining mid-match and a bot occupies that slot, seamlessly swap the bot out!
        if (room.status === 'playing') {
          for (const [pid, existing] of room.players.entries()) {
            if (existing.isBot && existing.team === assignment.team && existing.slotIndex === assignment.slotIndex) {
              room.players.delete(pid);
              break;
            }
          }
        }

        const accountId = sanitizeText(payload?.accountId, 24).toUpperCase() || undefined;
        const prof = accountId ? profiles.get(accountId) : undefined;
        const playerName =
          sanitizeText(payload?.playerName, 18) ||
          prof?.name ||
          `Officer-${socket.id.slice(0, 4)}`;
        const playerExp = prof?.exp ?? 0;
        const playerLoadout = prof
          ? prof.loadout
          : sanitizeLoadout(payload?.loadout, new Set(DEFAULT_OWNED_ITEMS));

        const preferredPrimary: PrimaryWeaponId =
          payload?.primaryWeapon && PRIMARY_WEAPONS.includes(payload.primaryWeapon)
            ? payload.primaryWeapon
            : 'm4a1';
        const resolvedWep = resolveWeaponForRule(room.settings.weaponRule, preferredPrimary);

        const newPlayer: ServerPlayer = {
          id: socket.id,
          accountId: prof?.accountId,
          name: playerName,
          exp: playerExp,
          loadout: playerLoadout,
          team: assignment.team,
          slotIndex: assignment.slotIndex,
          isHost: false,
          isReady: false,
          isBot: false,
          primaryWeapon: resolvedWep.primaryWeapon,
          weaponId: resolvedWep.activeWeapon,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
          crouch: false,
          lean: 0,
          sprinting: false,
          hp: 100,
          maxHp: 100,
          armor: 50,
          alive: true,
          respawnTimer: 0,
          kills: 0,
          deaths: 0,
          headshots: 0,
          score: 0,
          lastShotAt: 0,
          lastMoveAt: Date.now(),
          grenadesLeft: WEAPONS.frag.magSize,
          rttMs: 0,
          history: new PositionHistoryBuffer(),
          streak: 0,
          waypointIndex: 0,
          strafeDir: 1,
          strafeTimer: 1,
          botFireCooldown: 0,
          velY: 0,
        };

        if (room.status === 'playing') {
          spawnPlayerEntity(room, newPlayer, true);
        }

        room.players.set(socket.id, newPlayer);
        socketToRoom.set(socket.id, code);
        socket.join(code);

        pushSystemChat(
          room,
          `${playerName} เข้าร่วมหน่วย ${assignment.team === 'red' ? 'VIPER UNIT' : 'TASK FORCE'} ตำแหน่งที่ ${assignment.slotIndex + 1}`
        );
        broadcastRoomState(room);
        broadcastRoomList();
        cb?.({ ok: true, room: makeRoomState(room) });
      }
    );

    // Quick Play Matchmaker: joins an open public room (swapping out a bot if live) or creates a balanced 3v3 match
    socket.on(
      'room:quickPlay',
      (
        payload: {
          accountId?: string;
          playerName: string;
          loadout?: CharacterLoadout;
          primaryWeapon?: PrimaryWeaponId;
          mapId?: MapId;
        },
        cb?: (res: { ok: boolean; error?: string; room?: RoomState }) => void
      ) => {
        if (!rateLimiter.allow(`sock:qp:${socket.id}`, 8, 30_000)) {
          cb?.({ ok: false, error: 'กดจับคู่ถี่เกินไป กรุณารอสักครู่' });
          return;
        }
        leaveCurrentRoom(socket);

        const accountId = sanitizeText(payload?.accountId, 24).toUpperCase() || undefined;
        const prof = accountId ? profiles.get(accountId) : undefined;
        const playerName =
          sanitizeText(payload?.playerName, 18) ||
          prof?.name ||
          `Officer-${socket.id.slice(0, 4)}`;
        const playerExp = prof?.exp ?? 0;
        const playerLoadout = prof
          ? prof.loadout
          : sanitizeLoadout(payload?.loadout, new Set(DEFAULT_OWNED_ITEMS));
        const preferredPrimary: PrimaryWeaponId =
          payload?.primaryWeapon && PRIMARY_WEAPONS.includes(payload.primaryWeapon)
            ? payload.primaryWeapon
            : 'm4a1';

        // Prefer open public rooms (no password) that still have human slot capacity
        let bestRoom: ServerRoom | null = null;
        for (const r of rooms.values()) {
          if (r.password || r.status === 'ended') continue;
          const humanSlot = assignTeamAndSlotForNewPlayer(r);
          if (!humanSlot) continue;
          if (!bestRoom || r.status === 'playing') {
            bestRoom = r;
            if (r.status === 'playing') break;
          }
        }

        if (bestRoom) {
          const assignment = assignTeamAndSlotForNewPlayer(bestRoom)!;
          if (bestRoom.status === 'playing') {
            for (const [pid, existing] of bestRoom.players.entries()) {
              if (existing.isBot && existing.team === assignment.team && existing.slotIndex === assignment.slotIndex) {
                bestRoom.players.delete(pid);
                break;
              }
            }
          }
          const resolvedWep = resolveWeaponForRule(bestRoom.settings.weaponRule, preferredPrimary);
          const qpPlayer: ServerPlayer = {
            id: socket.id,
            accountId: prof?.accountId,
            name: playerName,
            exp: playerExp,
            loadout: playerLoadout,
            team: assignment.team,
            slotIndex: assignment.slotIndex,
            isHost: false,
            isReady: true,
            isBot: false,
            primaryWeapon: resolvedWep.primaryWeapon,
            weaponId: resolvedWep.activeWeapon,
            x: 0,
            y: 0,
            z: 0,
            yaw: 0,
            pitch: 0,
            crouch: false,
            lean: 0,
            sprinting: false,
            hp: 100,
            maxHp: 100,
            armor: 50,
            alive: true,
            respawnTimer: 0,
            kills: 0,
            deaths: 0,
            headshots: 0,
            score: 0,
            lastShotAt: 0,
            lastMoveAt: Date.now(),
            grenadesLeft: WEAPONS.frag.magSize,
            rttMs: 0,
            history: new PositionHistoryBuffer(),
            streak: 0,
            waypointIndex: 0,
            strafeDir: 1,
            strafeTimer: 1,
            botFireCooldown: 0,
            velY: 0,
          };
          if (bestRoom.status === 'playing') {
            spawnPlayerEntity(bestRoom, qpPlayer, true);
          }
          bestRoom.players.set(socket.id, qpPlayer);
          socketToRoom.set(socket.id, bestRoom.code);
          socket.join(bestRoom.code);
          pushSystemChat(bestRoom, `${playerName} เข้าร่วมผ่าน Quick Play`);
          broadcastRoomState(bestRoom);
          broadcastRoomList();
          cb?.({ ok: true, room: makeRoomState(bestRoom) });
          return;
        }

        // No open public room found -> launch a fresh 3v3 Quick Match with bots (humans can join live!)
        const chosenMap: MapId =
          payload?.mapId && MAPS[payload.mapId]
            ? payload.mapId
            : QUICK_PLAY_MAPS[quickPlayMapCursor++ % QUICK_PLAY_MAPS.length];
        const code = generateRoomCode();
        const resolvedWep = resolveWeaponForRule('all', preferredPrimary);
        const hostPlayer: ServerPlayer = {
          id: socket.id,
          accountId: prof?.accountId,
          name: playerName,
          exp: playerExp,
          loadout: playerLoadout,
          team: 'blue',
          slotIndex: 0,
          isHost: true,
          isReady: true,
          isBot: false,
          primaryWeapon: resolvedWep.primaryWeapon,
          weaponId: resolvedWep.activeWeapon,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
          crouch: false,
          lean: 0,
          sprinting: false,
          hp: 100,
          maxHp: 100,
          armor: 50,
          alive: true,
          respawnTimer: 0,
          kills: 0,
          deaths: 0,
          headshots: 0,
          score: 0,
          lastShotAt: 0,
          lastMoveAt: Date.now(),
          grenadesLeft: WEAPONS.frag.magSize,
          rttMs: 0,
          history: new PositionHistoryBuffer(),
          streak: 0,
          waypointIndex: 0,
          strafeDir: 1,
          strafeTimer: 1,
          botFireCooldown: 0,
          velY: 0,
        };
        const newRoom: ServerRoom = {
          code,
          password: '',
          settings: {
            name: `Quick Match · ${MAPS[chosenMap].name}`,
            mapId: chosenMap,
            mode: 'tdm',
            teamSize: 3,
            weaponRule: 'all',
            botDifficulty: 'normal',
            maxPlayers: 6,
            targetKills: 25,
            timeLimitSec: 360,
            botCount: 5,
            hasPassword: false,
          },
          status: 'waiting',
          players: new Map([[socket.id, hostPlayer]]),
          grenades: [],
          supplies: [],
          chat: [],
          scores: { red: 0, blue: 0 },
          timeRemainingSec: 360,
          tick: 0,
          intervalId: null,
        };
        pushSystemChat(newRoom, `เริ่มสมรภูมิ Quick Play (${MAPS[chosenMap].name} · 3v3 TDM)`);
        rooms.set(code, newRoom);
        socketToRoom.set(socket.id, code);
        socket.join(code);
        startMatchLoop(newRoom);
        cb?.({ ok: true, room: makeRoomState(newRoom) });
      }
    );

    socket.on('room:leave', () => {
      leaveCurrentRoom(socket);
    });

    socket.on(
      'room:moveSlot',
      (payload: { team: TeamId; slotIndex: number }) => {
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.status === 'playing') return;
        const p = room.players.get(socket.id);
        if (!p) return;

        const targetTeam: TeamId = payload?.team === 'blue' ? 'blue' : 'red';
        const targetSlot = Math.floor(Number(payload?.slotIndex));
        if (
          !Number.isFinite(targetSlot) ||
          targetSlot < 0 ||
          targetSlot >= room.settings.teamSize
        ) {
          return;
        }
        if (isSlotTaken(room, targetTeam, targetSlot, p.id, true)) return;

        p.team = targetTeam;
        p.slotIndex = targetSlot;
        broadcastRoomState(room);
      }
    );

    socket.on('room:switchTeam', () => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.status === 'playing') return;
      const p = room.players.get(socket.id);
      if (!p) return;

      const nextTeam: TeamId = p.team === 'red' ? 'blue' : 'red';
      const openSlot = findFirstFreeSlot(room, nextTeam, p.id, true);
      if (openSlot === null) return;
      p.team = nextTeam;
      p.slotIndex = openSlot;
      broadcastRoomState(room);
    });

    socket.on('room:toggleReady', () => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.status !== 'waiting') return;
      const p = room.players.get(socket.id);
      if (!p || p.isHost) return;
      p.isReady = !p.isReady;
      broadcastRoomState(room);
    });

    socket.on('room:setWeapon', (weaponId: PrimaryWeaponId) => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const p = room.players.get(socket.id);
      if (!p || !PRIMARY_WEAPONS.includes(weaponId)) return;
      const resolved = resolveWeaponForRule(room.settings.weaponRule, weaponId);
      p.primaryWeapon = resolved.primaryWeapon;
      if (room.status !== 'playing') {
        p.weaponId = resolved.activeWeapon;
      }
      broadcastRoomState(room);
    });

    socket.on(
      'room:updateSettings',
      (
        patch: Partial<
          Pick<
            RoomSettings,
            'mapId' | 'mode' | 'teamSize' | 'weaponRule' | 'botDifficulty' | 'targetKills' | 'botCount'
          >
        >
      ) => {
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.status === 'playing') return;
        const p = room.players.get(socket.id);
        if (!p?.isHost) return;

        if (patch.mapId && MAPS[patch.mapId]) room.settings.mapId = patch.mapId;
        if (patch.mode === 'tdm' || patch.mode === 'ffa') room.settings.mode = patch.mode;
        if (patch.botDifficulty !== undefined) {
          room.settings.botDifficulty = normalizeBotDifficulty(patch.botDifficulty);
        }
        if (patch.teamSize !== undefined) {
          const nextSize = normalizeTeamSize(patch.teamSize);
          const humanCount = Array.from(room.players.values()).filter((x) => !x.isBot).length;
          if (nextSize * 2 >= humanCount) {
            room.settings.teamSize = nextSize;
            room.settings.maxPlayers = nextSize * 2;
            room.settings.botCount = Math.min(room.settings.botCount, room.settings.maxPlayers - 1);
            rebalanceSlotsAfterResize(room);
          }
        }
        if (patch.weaponRule !== undefined) {
          room.settings.weaponRule = normalizeWeaponRule(patch.weaponRule);
          for (const pl of room.players.values()) {
            const resolved = resolveWeaponForRule(room.settings.weaponRule, pl.primaryWeapon);
            pl.primaryWeapon = resolved.primaryWeapon;
            pl.weaponId = resolved.activeWeapon;
          }
        }
        if (typeof patch.targetKills === 'number') {
          room.settings.targetKills = Math.max(5, Math.min(100, Math.round(patch.targetKills)));
        }
        if (typeof patch.botCount === 'number') {
          room.settings.botCount = Math.max(
            0,
            Math.min(room.settings.maxPlayers - 1, Math.round(patch.botCount))
          );
        }

        broadcastRoomState(room);
        broadcastRoomList();
      }
    );

    socket.on('room:chat', (rawText: string) => {
      if (!rateLimiter.allow(`sock:chat:${socket.id}`, 6, 10_000)) return;
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const p = room.players.get(socket.id);
      if (!p) return;
      const text = sanitizeText(rawText, 160);
      if (!text) return;

      const msg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        senderId: p.id,
        senderName: p.name,
        team: p.team,
        text,
        timestamp: Date.now(),
      };
      room.chat.push(msg);
      if (room.chat.length > 50) room.chat.shift();
      io.to(code).emit('room:chatMessage', msg);
    });

    socket.on('room:startMatch', () => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.status === 'playing') return;
      const p = room.players.get(socket.id);
      if (!p?.isHost) return;
      startMatchLoop(room);
    });

    socket.on('room:returnToLobby', () => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const p = room.players.get(socket.id);
      if (!p?.isHost) return;

      if (room.intervalId) {
        clearInterval(room.intervalId);
        room.intervalId = null;
      }
      room.status = 'waiting';
      room.winner = undefined;
      for (const [id, pl] of room.players.entries()) {
        if (pl.isBot) room.players.delete(id);
        else {
          pl.kills = 0;
          pl.deaths = 0;
          pl.headshots = 0;
          pl.score = 0;
          pl.isReady = pl.isHost;
        }
      }
      broadcastRoomState(room);
      broadcastRoomList();
    });

    socket.on(
      'player:state',
      (data: {
        x: number;
        y: number;
        z: number;
        yaw: number;
        pitch: number;
        crouch: boolean;
        lean?: number;
        sprinting?: boolean;
        weaponId: WeaponId;
        seq?: number;
      }) => {
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.status !== 'playing') return;
        const p = room.players.get(socket.id);
        if (!p || !p.alive) return;

        const map = MAPS[room.settings.mapId] ?? MAPS.desert_camp;
        const nowMs = Date.now();
        const dtSec = Math.max(0.016, Math.min(0.45, (nowMs - p.lastMoveAt) / 1000));
        p.lastMoveAt = nowMs;

        if (
          typeof data.x === 'number' &&
          typeof data.y === 'number' &&
          typeof data.z === 'number' &&
          Number.isFinite(data.x) &&
          Number.isFinite(data.y) &&
          Number.isFinite(data.z)
        ) {
          const check = validatePlayerMove(
            { x: p.x, y: p.y, z: p.z },
            { x: data.x, y: data.y, z: data.z },
            dtSec,
            map
          );
          p.x = check.x;
          p.y = check.y;
          p.z = check.z;
          if (check.corrected) {
            socket.emit('player:reconcile', {
              x: q2(p.x),
              y: q2(p.y),
              z: q2(p.z),
              seq: data.seq,
            });
          }
        }
        if (typeof data.yaw === 'number' && Number.isFinite(data.yaw)) p.yaw = data.yaw;
        if (typeof data.pitch === 'number' && Number.isFinite(data.pitch)) {
          p.pitch = Math.max(-1.55, Math.min(1.55, data.pitch));
        }
        p.crouch = Boolean(data.crouch);
        if (typeof data.lean === 'number' && Number.isFinite(data.lean)) {
          p.lean = Math.max(-1, Math.min(1, data.lean));
        }
        p.sprinting = Boolean(data.sprinting);
        if (data.weaponId && isWeaponAllowedByRule(room.settings.weaponRule, data.weaponId)) {
          p.weaponId = data.weaponId;
        }
      }
    );

    socket.on(
      'player:shoot',
      (data: {
        weaponId: WeaponId;
        origin: Vec3;
        endPoint: Vec3;
        endPoints?: Vec3[];
        hitPlayerId?: string;
        hitZone?: HitZone;
        hits?: ShotHitItem[];
      }) => {
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.status !== 'playing') return;
        const shooter = room.players.get(socket.id);
        if (!shooter || !shooter.alive) return;

        if (!isWeaponAllowedByRule(room.settings.weaponRule, data.weaponId)) return;
        const spec = WEAPONS[data.weaponId];
        if (!spec || data.weaponId === 'frag') return;

        const now = Date.now();
        if (now - shooter.lastShotAt < spec.fireRateMs * 0.72) return;
        shooter.lastShotAt = now;

        const map = MAPS[room.settings.mapId] ?? MAPS.desert_camp;
        const safeOrigin: Vec3 =
          data.origin &&
          Number.isFinite(data.origin.x) &&
          Number.isFinite(data.origin.y) &&
          Number.isFinite(data.origin.z)
            ? data.origin
            : { x: shooter.x, y: shooter.y + PLAYER_EYE_HEIGHT, z: shooter.z };
        const safeEnd: Vec3 =
          data.endPoint &&
          Number.isFinite(data.endPoint.x) &&
          Number.isFinite(data.endPoint.y) &&
          Number.isFinite(data.endPoint.z)
            ? data.endPoint
            : safeOrigin;

        socket.to(code).emit('combat:shot', {
          shooterId: shooter.id,
          weaponId: data.weaponId,
          origin: safeOrigin,
          endPoint: safeEnd,
          endPoints: data.endPoints?.slice(0, 10),
          hitPlayerId: data.hitPlayerId,
          hitZone: data.hitZone,
        });

        const hitList: ShotHitItem[] = Array.isArray(data.hits)
          ? data.hits.slice(0, spec.pellets)
          : data.hitPlayerId
            ? [{ playerId: data.hitPlayerId, hitZone: data.hitZone ?? 'body' }]
            : [];

        if (hitList.length === 0) return;

        // Server-Authoritative Lag-Compensated Hit Verification (Rewind + LOS + Ray Capsule)
        const rewindMs = Math.min(250, Math.max(0, shooter.rttMs * 0.55));
        const perVictim = new Map<string, { totalDmg: number; bestZone: HitZone }>();
        for (const h of hitList) {
          const victim = room.players.get(h.playerId);
          if (!victim || !victim.alive) continue;

          const hitZone: HitZone =
            h.hitZone === 'head' || h.hitZone === 'limb' ? h.hitZone : 'body';

          const verify = validateHitWithRewind({
            shooterPos: { x: shooter.x, y: shooter.y, z: shooter.z },
            shooterCrouch: shooter.crouch,
            claimedOrigin: safeOrigin,
            claimedEnd: safeEnd,
            targetCurrent: {
              timestamp: now,
              x: victim.x,
              y: victim.y,
              z: victim.z,
              crouch: victim.crouch,
              alive: victim.alive,
            },
            targetHistory: victim.history,
            rewindMs,
            claimedZone: hitZone,
            weaponId: data.weaponId,
            maxRange: spec.range,
            map,
          });
          if (!verify.valid) continue;

          const dist = Math.hypot(
            victim.x - shooter.x,
            victim.y - shooter.y,
            victim.z - shooter.z
          );
          const mult =
            verify.verifiedZone === 'head'
              ? spec.headshotMult
              : verify.verifiedZone === 'limb'
                ? 0.85
                : 1.0;

          let falloff = 1.0;
          if (data.weaponId === 'm870' && dist > 10) {
            falloff = Math.max(0.32, 1 - (dist - 10) / 28);
          }

          const dmg = spec.damage * mult * falloff;
          const cur = perVictim.get(h.playerId);
          if (!cur) {
            perVictim.set(h.playerId, { totalDmg: dmg, bestZone: verify.verifiedZone });
          } else {
            cur.totalDmg += dmg;
            if (verify.verifiedZone === 'head') cur.bestZone = 'head';
          }
        }

        for (const [victimId, info] of perVictim.entries()) {
          const victim = room.players.get(victimId);
          if (victim && victim.alive) {
            applyDamage(room, shooter, victim, info.totalDmg, data.weaponId, info.bestZone);
          }
        }
      }
    );

    socket.on('player:throwGrenade', (data: { origin: Vec3; dir: Vec3 }) => {
      if (!rateLimiter.allow(`sock:grenade:${socket.id}`, 4, 5_000)) return;
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.status !== 'playing') return;
      if (!isWeaponAllowedByRule(room.settings.weaponRule, 'frag')) return;
      const p = room.players.get(socket.id);
      if (!p || !p.alive || p.grenadesLeft <= 0) return;

      p.grenadesLeft -= 1;

      const eyeY = p.y + (p.crouch ? 1.12 : PLAYER_EYE_HEIGHT);
      const rawDirX = Number.isFinite(data?.dir?.x) ? data.dir.x : -Math.sin(p.yaw);
      const rawDirY = Number.isFinite(data?.dir?.y) ? data.dir.y : 0.2;
      const rawDirZ = Number.isFinite(data?.dir?.z) ? data.dir.z : -Math.cos(p.yaw);
      const dLen = Math.hypot(rawDirX, rawDirY, rawDirZ) || 1;
      const dirX = rawDirX / dLen;
      const dirY = rawDirY / dLen;
      const dirZ = rawDirZ / dLen;

      // Authoritative throw origin near player's true eye position (blocks remote teleport-bombing!)
      const originX = p.x + dirX * 0.55;
      const originY = eyeY - 0.1;
      const originZ = p.z + dirZ * 0.55;

      const speed = 17.5;
      const g: ServerGrenade = {
        id: `gren_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ownerId: p.id,
        ownerName: p.name,
        team: p.team,
        x: originX,
        y: originY,
        z: originZ,
        vx: dirX * speed,
        vy: dirY * speed + 4.2,
        vz: dirZ * speed,
        fuseSec: 2.1,
      };
      room.grenades.push(g);
    });

    socket.on('disconnect', () => {
      leaveCurrentRoom(socket, true);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`STRIKE OPS tactical server (${TICK_RATE}Hz) running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
