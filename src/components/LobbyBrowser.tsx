import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeftRight,
  Bot,
  Check,
  CheckCircle2,
  Coins,
  Crosshair,
  Flame,
  Globe,
  Lock,
  LogOut,
  Maximize2,
  Minimize2,
  Monitor,
  Pencil,
  Play,
  Plus,
  PlusSquare,
  RefreshCw,
  Search,
  Settings2,
  Shirt,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Swords,
  Target,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { MAPS, MAP_LIST } from '../shared/maps';
import {
  PRIMARY_WEAPONS,
  TEAM_SIZES,
  WEAPON_RULES,
  WEAPON_RULE_LIST,
  WEAPONS,
} from '../shared/weapons';
import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_LIST,
  BOT_STAGES,
  getRankForExp,
  type BotStageDefinition,
} from '../shared/progression';
import type {
  BotDifficulty,
  CharacterLoadout,
  GameMode,
  MapId,
  PlayerProfile,
  PrimaryWeaponId,
  RoomSummary,
  TeamSize,
  WeaponRule,
} from '../shared/types';
import { MAP_IMAGES } from '../lib/mapImages';
import { soundEngine } from '../game/sound';
import { RankBadge } from './RankBadge';
import { CharacterCustomizer } from './CharacterCustomizer';
import { ControlsSettingsPanel } from './ControlsSettingsPanel';
import {
  CharacterPreview3D,
  SHOWCASE_POSES,
  type ShowcasePoseId,
} from './CharacterPreview3D';
import {
  toggleFullscreenLandscape,
  type ControlSettings,
} from '../shared/controls';

interface LobbyBrowserProps {
  connected: boolean;
  profile: PlayerProfile;
  controlSettings: ControlSettings;
  onChangeControlSettings: (next: ControlSettings) => void;
  onRenameProfile: (name: string) => Promise<void>;
  onEquipLoadout: (loadout: CharacterLoadout) => Promise<void>;
  onPurchaseItem: (itemId: string) => Promise<string | null>;
  onSwitchAccount: () => void;
  primaryWeapon: PrimaryWeaponId;
  onChangePrimaryWeapon: (w: PrimaryWeaponId) => void;
  rooms: RoomSummary[];
  onRefreshRooms: () => void;
  onCreateRoom: (opts: {
    roomName: string;
    mapId: MapId;
    mode: GameMode;
    teamSize: TeamSize;
    weaponRule: WeaponRule;
    botDifficulty: BotDifficulty;
    stageId?: string;
    targetKills: number;
    botCount: number;
    password: string;
    autoStart?: boolean;
  }) => Promise<string | null>;
  onJoinRoom: (code: string, password?: string) => Promise<string | null>;
  onQuickPlay: (mapId?: MapId) => Promise<string | null>;
  initialJoinCode?: string;
}

type LobbyModal =
  | null
  | 'rooms'
  | 'modes'
  | 'customize'
  | 'arsenal'
  | 'controls'
  | 'create';

interface DuelPreset {
  id: string;
  formatLabel: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  roomName: string;
  mapId: MapId;
  teamSize: TeamSize;
  weaponRule: WeaponRule;
  targetKills: number;
  botCount: number;
  icon: 'sniper' | 'shotgun' | 'pistol' | 'team';
}

type LaunchSelection =
  | { kind: 'stage'; stage: BotStageDefinition }
  | { kind: 'duel'; preset: DuelPreset };

const DUEL_PRESETS: DuelPreset[] = [
  {
    id: '1v1_sniper',
    formatLabel: '1v1 · สไนล้วน',
    title: 'ดวลสไนเปอร์ PSG-1',
    shortTitle: '1v1 สไนล้วน',
    subtitle: 'วัดความคม 1 ต่อ 1 ระยะไกล',
    roomName: '1v1 ดวลสไนเปอร์ PSG-1',
    mapId: 'desert_camp',
    teamSize: 1,
    weaponRule: 'sniper',
    targetKills: 15,
    botCount: 1,
    icon: 'sniper',
  },
  {
    id: '2v2_shotgun',
    formatLabel: '2v2 · ลูกซองล้วน',
    title: 'ดวลลูกซอง M870',
    shortTitle: '2v2 ลูกซอง',
    subtitle: 'บุกประชิดโกดังตู้คอนเทนเนอร์',
    roomName: '2v2 ดวลลูกซอง M870',
    mapId: 'warehouse',
    teamSize: 2,
    weaponRule: 'shotgun',
    targetKills: 20,
    botCount: 2,
    icon: 'shotgun',
  },
  {
    id: '3v3_pistol',
    formatLabel: '3v3 · ปืนพกล้วน',
    title: 'ดวลปืนพก Deagle',
    shortTitle: '3v3 ปืนพก',
    subtitle: 'ยิงหัวสุดเดือดด้วย Desert Eagle',
    roomName: '3v3 ดวลปืนพก Deagle',
    mapId: 'crossroad',
    teamSize: 3,
    weaponRule: 'pistol',
    targetKills: 25,
    botCount: 4,
    icon: 'pistol',
  },
  {
    id: '4v4_all',
    formatLabel: '4v4 · อาวุธครบ',
    title: 'ศึกทีม 4v4 เต็มรูปแบบ',
    shortTitle: '4v4 อาวุธครบ',
    subtitle: 'TASK FORCE vs VIPER ครบทุกอาวุธ',
    roomName: '4v4 STRIKE OPS Team',
    mapId: 'desert_camp',
    teamSize: 4,
    weaponRule: 'all',
    targetKills: 30,
    botCount: 6,
    icon: 'team',
  },
];

export const LobbyBrowser: React.FC<LobbyBrowserProps> = ({
  connected,
  profile,
  controlSettings,
  onChangeControlSettings,
  onRenameProfile,
  onEquipLoadout,
  onPurchaseItem,
  onSwitchAccount,
  primaryWeapon,
  onChangePrimaryWeapon,
  rooms,
  onRefreshRooms,
  onCreateRoom,
  onJoinRoom,
  onQuickPlay,
  initialJoinCode = '',
}) => {
  const [activeModal, setActiveModal] = useState<LobbyModal>(
    initialJoinCode ? 'rooms' : null
  );
  const [modesTab, setModesTab] = useState<'bot' | 'duel'>('bot');
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'playing'>('all');
  const [stageDiffFilter, setStageDiffFilter] = useState<'all' | BotDifficulty>('all');
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Selected Mode for Giant Bottom-Left START Button
  const [selectedLaunch, setSelectedLaunch] = useState<LaunchSelection>({
    kind: 'stage',
    stage: BOT_STAGES[0],
  });

  // 3D Character Lobby Pose Cycle
  const [lobbyPose, setLobbyPose] = useState<ShowcasePoseId>('combat');

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );

  // Inline Callsign edit state
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);

  // Create room state
  const [roomName, setRoomName] = useState('');
  const [mapId, setMapId] = useState<MapId>('desert_camp');
  const [mode, setMode] = useState<GameMode>('tdm');
  const [teamSize, setTeamSize] = useState<TeamSize>(3);
  const [weaponRule, setWeaponRule] = useState<WeaponRule>('all');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('easy');
  const [targetKills, setTargetKills] = useState(20);
  const [botCount, setBotCount] = useState(5);
  const [password, setPassword] = useState('');

  // Password prompt for locked public rooms
  const [lockedRoomTarget, setLockedRoomTarget] = useState<RoomSummary | null>(null);
  const [lockedPassword, setLockedPassword] = useState('');

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const playerName = profile.name;
  const rankInfo = getRankForExp(profile.exp);
  const clearedSet = new Set(profile.clearedStages);
  const activeWeaponSpec = WEAPONS[primaryWeapon];
  const activeWeaponShort = activeWeaponSpec.name.split(' ')[0];

  const filteredStages = BOT_STAGES.filter((s) =>
    stageDiffFilter === 'all' ? true : s.difficulty === stageDiffFilter
  );

  const filteredRooms = rooms.filter((r) => {
    if (statusFilter === 'waiting') return r.status === 'waiting';
    if (statusFilter === 'playing') return r.status === 'playing';
    return true;
  });

  const maxAllowedBots = Math.max(0, teamSize * 2 - 1);

  const handleToggleFullscreen = async () => {
    soundEngine.playUiClick();
    await toggleFullscreenLandscape(!isFullscreen);
  };

  const handleCyclePose = () => {
    soundEngine.playUiClick();
    const ids = Object.keys(SHOWCASE_POSES) as ShowcasePoseId[];
    const nextIdx = (ids.indexOf(lobbyPose) + 1) % ids.length;
    setLobbyPose(ids[nextIdx]);
  };

  const handleSelectTeamSize = (ts: TeamSize) => {
    soundEngine.playUiClick();
    setTeamSize(ts);
    const maxB = Math.max(0, ts * 2 - 1);
    if (botCount > maxB) setBotCount(maxB);
  };

  const handleQuickJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) {
      setJoinError('กรอกรหัสห้อง 6 หลัก');
      return;
    }
    setBusy(true);
    setJoinError(null);
    const err = await onJoinRoom(cleaned);
    setBusy(false);
    if (err) setJoinError(err);
  };

  const handleJoinPublicRoom = async (room: RoomSummary) => {
    soundEngine.playUiClick();
    if (room.hasPassword) {
      setLockedRoomTarget(room);
      setLockedPassword('');
      setJoinError(null);
      return;
    }
    setBusy(true);
    setJoinError(null);
    const err = await onJoinRoom(room.code);
    setBusy(false);
    if (err) setJoinError(err);
  };

  const handleConfirmLockedJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockedRoomTarget) return;
    setBusy(true);
    const err = await onJoinRoom(lockedRoomTarget.code, lockedPassword);
    setBusy(false);
    if (err) {
      setJoinError(err);
    } else {
      setLockedRoomTarget(null);
    }
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setJoinError(null);
    const ruleShort = WEAPON_RULES[weaponRule].shortLabel;
    const err = await onCreateRoom({
      roomName:
        roomName.trim() ||
        `${teamSize}v${teamSize} ${ruleShort} · ${playerName || 'Officer'}`,
      mapId,
      mode,
      teamSize,
      weaponRule,
      botDifficulty,
      targetKills,
      botCount: Math.min(botCount, maxAllowedBots),
      password: password.trim(),
    });
    setBusy(false);
    if (err) {
      setJoinError(err);
    } else {
      setActiveModal(null);
    }
  };

  const handleLaunchPreset = async (preset: DuelPreset) => {
    soundEngine.playUiClick();
    setBusy(true);
    setJoinError(null);
    const err = await onCreateRoom({
      roomName: preset.roomName,
      mapId: preset.mapId,
      mode: 'tdm',
      teamSize: preset.teamSize,
      weaponRule: preset.weaponRule,
      botDifficulty: 'easy',
      targetKills: preset.targetKills,
      botCount: preset.botCount,
      password: '',
    });
    setBusy(false);
    if (err) setJoinError(err);
  };

  const handleLaunchBotStage = async (stage: BotStageDefinition) => {
    soundEngine.playUiClick();
    setBusy(true);
    setJoinError(null);
    const err = await onCreateRoom({
      roomName: stage.title,
      mapId: stage.mapId,
      mode: 'tdm',
      teamSize: stage.teamSize,
      weaponRule: stage.weaponRule,
      botDifficulty: stage.difficulty,
      stageId: stage.id,
      targetKills: stage.targetKills,
      botCount: stage.botCount,
      password: '',
      autoStart: true,
    });
    setBusy(false);
    if (err) setJoinError(err);
  };

  const handleQuickPlayClick = async () => {
    if (!connected || busy) return;
    soundEngine.playUiClick();
    setBusy(true);
    setJoinError(null);
    const err = await onQuickPlay();
    setBusy(false);
    if (err) setJoinError(err);
  };

  const handleHeroStart = () => {
    if (!connected || busy) return;
    if (selectedLaunch.kind === 'stage') {
      handleLaunchBotStage(selectedLaunch.stage);
    } else {
      handleLaunchPreset(selectedLaunch.preset);
    }
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameDraft.trim();
    if (cleaned && cleaned !== profile.name) {
      await onRenameProfile(cleaned);
    }
    setEditingName(false);
  };

  const renderPresetIcon = (kind: DuelPreset['icon']) => {
    if (kind === 'sniper') return <Target className="w-4 h-4 text-amber-400 shrink-0" />;
    if (kind === 'shotgun') return <Flame className="w-4 h-4 text-red-400 shrink-0" />;
    if (kind === 'pistol') return <Crosshair className="w-4 h-4 text-sky-400 shrink-0" />;
    return <Swords className="w-4 h-4 text-emerald-400 shrink-0" />;
  };

  const selectedMapInfo =
    selectedLaunch.kind === 'stage'
      ? MAPS[selectedLaunch.stage.mapId]
      : MAPS[selectedLaunch.preset.mapId];

  const selectedModeTitle =
    selectedLaunch.kind === 'stage'
      ? `บอท ${BOT_DIFFICULTIES[selectedLaunch.stage.difficulty].label}`
      : selectedLaunch.preset.shortTitle;

  const selectedModeMeta =
    selectedLaunch.kind === 'stage'
      ? `${selectedMapInfo.name} · ${selectedLaunch.stage.teamSize}v${selectedLaunch.stage.teamSize}`
      : `${selectedMapInfo.name} · ${WEAPON_RULES[selectedLaunch.preset.weaponRule].shortLabel}`;

  const currentPoseLabel = SHOWCASE_POSES[lobbyPose]?.label ?? 'พร้อมรบ';

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-[#090C12] text-[#F3F4F6] select-none">
      {/* FULL-VIEWPORT LIVE 3D OPERATOR COMMAND STAGE (PUBG Mobile / AAA Style) */}
      <div className="absolute inset-0 z-0">
        <CharacterPreview3D
          variant="lobby"
          loadout={profile.loadout}
          weaponId={primaryWeapon}
          team="blue"
          name={profile.name}
          rankShort={rankInfo.rank.shortCode}
          externalPose={lobbyPose}
          hideOverlayControls
        />
      </div>

      {/* Subtle Top & Bottom Atmospheric Scrims for Crisp HUD Readability */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#070B14]/75 via-[#070B14]/30 to-transparent z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#070B14]/82 via-[#070B14]/35 to-transparent z-10" />

      {/* =====================================================================
          TOP COMMAND BAR (Profile Left · Brand Center · Currency & Icons Right)
         ===================================================================== */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 px-2.5 sm:px-5 pt-2 sm:pt-3 flex items-start justify-between gap-2">
        {/* TOP-LEFT: Officer Profile Strip */}
        <div className="pointer-events-auto flex items-center gap-2 bg-[#0B111E]/92 border border-white/15 rounded-md px-2 sm:px-3 py-1.5 shadow-lg max-w-[240px] sm:max-w-[310px]">
          <RankBadge exp={profile.exp} size="sm" />

          <div className="min-w-0 flex-1">
            {editingName ? (
              <form onSubmit={handleSaveRename} className="flex items-center gap-1">
                <input
                  type="text"
                  maxLength={18}
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="w-24 sm:w-32 bg-[#070B12] border border-amber-400 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                />
                <button
                  type="submit"
                  className="p-1 rounded bg-amber-400 text-[#090C12] cursor-pointer"
                  aria-label="บันทึกชื่อ"
                >
                  <Check className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
                  {profile.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setNameDraft(profile.name);
                    setEditingName(true);
                  }}
                  className="text-slate-400 hover:text-amber-400 shrink-0 cursor-pointer"
                  title="เปลี่ยนชื่อ"
                  aria-label="เปลี่ยนชื่อ"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-amber-300 font-medium truncate">
                {rankInfo.rank.thaiName}
              </span>
              <div className="w-12 sm:w-20 h-1 bg-white/15 rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${rankInfo.progressPct}%` }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onSwitchAccount();
            }}
            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-white/8 transition-colors shrink-0 cursor-pointer"
            title="สลับบัญชี"
            aria-label="สลับบัญชี"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* TOP-CENTER: Clean Tactical Brand Emblem */}
        <div className="hidden md:flex items-center gap-2 pt-1.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
          <Crosshair className="w-5 h-5 text-amber-400" />
          <span className="font-display font-black tracking-[0.2em] text-base text-white uppercase">
            STRIKE OPS
          </span>
        </div>

        {/* TOP-RIGHT: SP Balance + Compact Icon Action Bar */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          {/* SP Currency Counter */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              setActiveModal('customize');
            }}
            className="h-9 sm:h-10 px-2.5 sm:px-3 bg-[#0B111E]/92 border border-white/15 hover:border-amber-400/60 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
            title="แต้ม SP ซื้อชุดและลายปืน"
          >
            <Coins className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-mono-num font-bold text-xs sm:text-sm text-amber-300">
              {profile.sp.toLocaleString()}
            </span>
          </button>

          {/* Compact Tactical Icon Cluster */}
          <div className="flex items-center bg-[#0B111E]/92 border border-white/15 rounded-md p-0.5 sm:p-1 gap-0.5 sm:gap-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                setActiveModal('customize');
              }}
              className="h-8 sm:h-8 px-2 sm:px-2.5 rounded hover:bg-white/12 text-white flex items-center gap-1.5 text-xs font-display font-bold transition-colors cursor-pointer whitespace-nowrap"
              title="ร้านค้า & แต่งตัว"
            >
              <ShoppingBag className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="hidden lg:inline">ร้านค้า</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                setActiveModal('arsenal');
              }}
              className="h-8 sm:h-8 px-2 sm:px-2.5 rounded hover:bg-white/12 text-white flex items-center gap-1.5 text-xs font-display font-bold transition-colors cursor-pointer whitespace-nowrap"
              title="คลังอาวุธ"
            >
              <Crosshair className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="hidden lg:inline">คลังปืน</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                const nextTouch = !controlSettings.touchControls;
                onChangeControlSettings({
                  ...controlSettings,
                  inputMode: nextTouch ? 'mobile' : 'desktop',
                  touchControls: nextTouch,
                });
              }}
              className={`h-8 px-2 sm:px-2.5 rounded flex items-center gap-1.5 text-xs font-display font-bold transition-colors cursor-pointer whitespace-nowrap border ${
                controlSettings.touchControls
                  ? 'bg-emerald-500/18 border-emerald-400/50 text-emerald-300'
                  : 'bg-sky-500/15 border-sky-400/45 text-sky-300'
              }`}
              title={
                controlSettings.touchControls
                  ? 'กำลังใช้โหมดมือถือ (คลิกสลับเป็น Desktop PC)'
                  : 'กำลังใช้โหมด Desktop PC (คลิกสลับเป็นโหมดมือถือ)'
              }
            >
              {controlSettings.touchControls ? (
                <>
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">มือถือ</span>
                </>
              ) : (
                <>
                  <Monitor className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">PC</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                setActiveModal('controls');
              }}
              className="h-8 sm:h-8 px-2 sm:px-2.5 rounded hover:bg-white/12 text-white flex items-center gap-1.5 text-xs font-display font-bold transition-colors cursor-pointer whitespace-nowrap"
              title="ตั้งค่า"
            >
              <Settings2 className="w-4 h-4 text-slate-200 shrink-0" />
              <span className="hidden lg:inline">ตั้งค่า</span>
            </button>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="h-8 w-8 rounded hover:bg-white/12 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              title={isFullscreen ? 'ออกจากเต็มจอ' : 'เต็มหน้าจอ'}
              aria-label="เต็มหน้าจอ"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* =====================================================================
          LEFT TACTICAL QUICK MENU (Matte Command Center Side Tiles)
         ===================================================================== */}
      <aside className="fixed left-2.5 sm:left-5 top-[58px] sm:top-[74px] z-20 flex flex-col gap-1.5 sm:gap-2">
        <button
          type="button"
          disabled={!connected || busy}
          onClick={handleQuickPlayClick}
          className="w-[144px] sm:w-[196px] px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-[#0F1E30]/94 hover:bg-[#152942] disabled:opacity-50 border border-[#4FD1FF]/55 hover:border-[#4FD1FF] rounded-md flex items-center justify-between gap-2 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-[#4FD1FF] shrink-0" />
            <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
              เล่นด่วน
            </span>
          </div>
          <span className="font-mono-num text-[10px] font-bold text-[#4FD1FF] shrink-0">
            QUICK
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            onRefreshRooms();
            setActiveModal('rooms');
          }}
          className="w-[144px] sm:w-[196px] px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-[#0B111E]/90 hover:bg-[#121C30] border border-white/15 hover:border-amber-400/70 rounded-md flex items-center justify-between gap-2 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
            <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
              หาห้อง
            </span>
          </div>
          <span className="font-mono-num text-[11px] sm:text-xs font-bold text-amber-400 shrink-0">
            {rooms.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            setModesTab('bot');
            setActiveModal('modes');
          }}
          className="w-[144px] sm:w-[196px] px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-[#0B111E]/90 hover:bg-[#121C30] border border-white/15 hover:border-amber-400/70 rounded-md flex items-center justify-between gap-2 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
            <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
              ด่านบอท
            </span>
          </div>
          <span className="font-mono-num text-[11px] sm:text-xs font-semibold text-slate-300 shrink-0">
            {profile.clearedStages.length}/{BOT_STAGES.length}
          </span>
        </button>

        <button
          type="button"
          disabled={!connected || busy}
          onClick={() => {
            soundEngine.playUiClick();
            setActiveModal('create');
          }}
          className="w-[144px] sm:w-[196px] px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-[#0B111E]/90 hover:bg-[#121C30] disabled:opacity-50 border border-white/15 hover:border-amber-400/70 rounded-md flex items-center justify-between gap-2 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <PlusSquare className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
            <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
              สร้างห้อง
            </span>
          </div>
          <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-300 shrink-0" />
        </button>
      </aside>

      {/* =====================================================================
          BOTTOM-LEFT HERO LAUNCH ZONE (Mode Card + Giant Golden START Button)
         ===================================================================== */}
      <div className="fixed left-2.5 sm:left-5 bottom-2.5 sm:bottom-5 z-20 flex flex-col gap-1.5 sm:gap-2">
        {/* Mode Selector Box (Directly above START) */}
        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            setModesTab(selectedLaunch.kind === 'stage' ? 'bot' : 'duel');
            setActiveModal('modes');
          }}
          className="w-[178px] sm:w-[238px] bg-[#0B111E]/92 hover:bg-[#0F1728] border border-amber-400/55 rounded-md px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer shadow-lg"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
              {selectedLaunch.kind === 'stage' ? (
                <Bot className="w-4 h-4 text-amber-400" />
              ) : (
                <Swords className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-xs sm:text-sm text-white leading-tight truncate">
                {selectedModeTitle}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-300 truncate leading-tight mt-0.5">
                {selectedModeMeta}
              </div>
            </div>
          </div>
          <ArrowLeftRight className="w-4 h-4 text-amber-400 shrink-0" />
        </button>

        {/* GIANT GOLDEN-AMBER START BUTTON */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          disabled={!connected || busy}
          onClick={handleHeroStart}
          className="w-[178px] sm:w-[238px] h-12 sm:h-14 bg-gradient-to-b from-[#FDE047] via-[#F59E0B] to-[#D97706] hover:brightness-105 disabled:opacity-50 text-[#090C12] rounded-md font-display font-black tracking-wider text-xl sm:text-2xl shadow-[0_8px_28px_rgba(245,158,11,0.45)] border border-amber-100/70 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
          <span>{busy ? 'กำลังเข้า...' : 'START'}</span>
        </motion.button>

        {!connected && (
          <div className="text-[11px] font-medium text-amber-300 drop-shadow">
            กำลังเชื่อมต่อเซิร์ฟเวอร์...
          </div>
        )}
        {joinError && activeModal === null && (
          <div className="text-[11px] font-medium text-red-300 bg-[#0B111E]/90 px-2.5 py-1 rounded border border-red-500/40 max-w-[238px]">
            {joinError}
          </div>
        )}
      </div>

      {/* =====================================================================
          BOTTOM-RIGHT TACTICAL DOCK
         ===================================================================== */}
      <nav className="fixed right-2.5 sm:right-5 bottom-2.5 sm:bottom-5 z-20 flex items-center gap-1 sm:gap-1.5 bg-[#0B111E]/92 border border-white/15 rounded-md p-1 sm:p-1.5 shadow-xl">
        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            setActiveModal('customize');
          }}
          className="px-2.5 sm:px-3.5 py-2 rounded hover:bg-white/12 text-white flex flex-col sm:flex-row items-center gap-1 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Shirt className="w-4 h-4 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
          <span className="font-display font-bold text-[10px] sm:text-xs">แต่งตัว</span>
        </button>

        <div className="w-px h-6 bg-white/12" />

        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            setActiveModal('arsenal');
          }}
          className="px-2.5 sm:px-3.5 py-2 rounded hover:bg-white/12 text-white flex flex-col sm:flex-row items-center gap-1 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Crosshair className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="font-display font-bold text-[10px] sm:text-xs">
            {activeWeaponShort}
          </span>
        </button>

        <div className="w-px h-6 bg-white/12" />

        <button
          type="button"
          onClick={handleCyclePose}
          className="px-2.5 sm:px-3.5 py-2 rounded hover:bg-white/12 text-white flex flex-col sm:flex-row items-center gap-1 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap"
          title="เปลี่ยนท่าทางตัวละคร"
        >
          <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-display font-bold text-[10px] sm:text-xs">
            {currentPoseLabel}
          </span>
        </button>

        <div className="w-px h-6 bg-white/12" />

        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            setActiveModal('controls');
          }}
          className="px-2.5 sm:px-3.5 py-2 rounded hover:bg-white/12 text-white flex flex-col sm:flex-row items-center gap-1 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap"
        >
          <SlidersHorizontal className="w-4 h-4 text-slate-300 shrink-0" />
          <span className="font-display font-bold text-[10px] sm:text-xs">ปุ่มเล่น</span>
        </button>
      </nav>

      {/* =====================================================================
          OVERLAY MODALS (Mobile Landscape & Desktop Zero-Overlap Drawers)
         ===================================================================== */}
      <AnimatePresence>
        {/* 1. ONLINE ROOM BROWSER + 6-DIGIT QUICK JOIN MODAL */}
        {activeModal === 'rooms' && (
          <motion.div
            key="modal-rooms"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#060910]/90 flex items-center justify-center p-2 sm:p-5"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-4xl max-h-[94dvh] bg-[#0F1522] border border-white/15 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-3.5 sm:px-5 py-2.5 sm:py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 bg-[#131B2C]">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-sky-400" />
                  <h2 className="font-display font-bold text-sm sm:text-lg text-white">
                    หาห้องออนไลน์
                  </h2>
                  <span className="font-mono-num text-xs text-amber-400">
                    ({rooms.length})
                  </span>
                </div>

                {/* 6-Digit Room Code Quick Join */}
                <form onSubmit={handleQuickJoin} className="flex items-center gap-1.5 flex-1 sm:flex-initial max-w-xs">
                  <input
                    type="text"
                    maxLength={8}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="รหัสห้อง 6 หลัก"
                    className="w-full sm:w-36 bg-[#090C12] border border-white/18 focus:border-amber-400 rounded px-2.5 py-1.5 text-xs font-mono-num uppercase tracking-wider text-white outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!connected || busy}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#090C12] font-display font-bold text-xs rounded whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    เข้าห้อง
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="ปิด"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filter Toolbar */}
              <div className="px-3.5 sm:px-5 py-2 border-b border-white/8 flex items-center justify-between gap-2 bg-[#0C111C]">
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['all', 'ทั้งหมด'],
                      ['waiting', 'รอเริ่ม'],
                      ['playing', 'กำลังรบ'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStatusFilter(id)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                        statusFilter === id
                          ? 'bg-amber-400 text-[#090C12]'
                          : 'text-slate-300 hover:bg-white/8'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      onRefreshRooms();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/8 hover:bg-white/14 text-xs text-slate-200 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">รีเฟรช</span>
                  </button>
                  <button
                    type="button"
                    disabled={!connected || busy}
                    onClick={handleQuickPlayClick}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#4FD1FF]/18 border border-[#4FD1FF]/55 hover:bg-[#4FD1FF] hover:text-[#090C12] text-xs font-bold text-[#4FD1FF] transition-colors cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>เล่นด่วน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setActiveModal('create');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-500/20 border border-amber-400/50 hover:bg-amber-400 hover:text-[#090C12] text-xs font-bold text-amber-300 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>สร้างห้อง</span>
                  </button>
                </div>
              </div>

              {joinError && (
                <div className="px-4 py-2 bg-red-500/15 border-b border-red-500/30 text-xs text-red-300">
                  {joinError}
                </div>
              )}

              {/* Mobile-Friendly Card Grid of Online Rooms */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                {filteredRooms.length === 0 ? (
                  <div className="py-10 text-center space-y-3">
                    <Search className="w-8 h-8 text-slate-500 mx-auto" />
                    <div className="font-display font-bold text-base text-white">
                      ยังไม่มีห้องออนไลน์
                    </div>
                    <button
                      type="button"
                      disabled={!connected || busy}
                      onClick={() => setActiveModal('create')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-[#090C12] font-display font-bold text-xs rounded-md cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      สร้างห้องแรกเลย
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {filteredRooms.map((room) => {
                      const mapInfo = MAPS[room.mapId];
                      const ruleSpec = WEAPON_RULES[room.weaponRule] ?? WEAPON_RULES.all;
                      const full = room.playerCount >= room.maxPlayers;
                      return (
                        <div
                          key={room.code}
                          className="bg-[#141C2E] border border-white/10 hover:border-amber-400/55 rounded-lg p-3 flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono-num text-xs font-bold text-amber-400 tracking-wider">
                                {room.code}
                              </span>
                              {room.hasPassword && (
                                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <span
                                className={`text-[11px] font-semibold ${
                                  room.status === 'playing'
                                    ? 'text-amber-300'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {room.status === 'playing' ? 'กำลังรบ' : 'รอเริ่ม'}
                              </span>
                            </div>

                            <div className="font-display font-bold text-sm text-white truncate">
                              {room.name}
                            </div>

                            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
                              <span>{mapInfo?.name}</span>
                              <span>·</span>
                              <span className="text-slate-200 font-mono-num">
                                {room.mode === 'tdm'
                                  ? `${room.teamSize}v${room.teamSize}`
                                  : 'FFA'}
                              </span>
                              <span>·</span>
                              <span className="text-amber-300">{ruleSpec.shortLabel}</span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5 font-mono-num text-slate-200">
                                <Users className="w-3 h-3 text-slate-400" />
                                {room.playerCount}/{room.maxPlayers}
                                {room.botCount > 0 && ` (+${room.botCount})`}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={busy || full}
                            onClick={() => handleJoinPublicRoom(room)}
                            className="px-3.5 py-2 rounded-md bg-amber-400 hover:bg-amber-300 disabled:bg-white/10 disabled:text-slate-500 text-[#090C12] font-display font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {full ? 'เต็ม' : 'เข้าเล่น'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 2. MODE & BOT STAGE PICKER MODAL */}
        {activeModal === 'modes' && (
          <motion.div
            key="modal-modes"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#060910]/90 flex items-center justify-center p-2 sm:p-5"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-4xl max-h-[94dvh] bg-[#0F1522] border border-white/15 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 border-b border-white/10 flex items-center justify-between gap-3 bg-[#131B2C]">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setModesTab('bot');
                    }}
                    className={`px-3 py-1.5 rounded-md font-display font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      modesTab === 'bot'
                        ? 'bg-amber-400 text-[#090C12]'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Bot className="w-4 h-4" />
                    ด่านบอท EXP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      setModesTab('duel');
                    }}
                    className={`px-3 py-1.5 rounded-md font-display font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      modesTab === 'duel'
                        ? 'bg-amber-400 text-[#090C12]'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Swords className="w-4 h-4" />
                    ดวลอาวุธด่วน
                  </button>
                </div>

                {modesTab === 'bot' && (
                  <div className="hidden sm:flex items-center gap-1">
                    {(
                      [
                        ['all', 'ทั้งหมด'],
                        ['easy', 'Easy'],
                        ['normal', 'Normal'],
                        ['hard', 'Hard'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setStageDiffFilter(id)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                          stageDiffFilter === id
                            ? 'bg-white/18 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="ปิด"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                {modesTab === 'bot' ? (
                  <div className="space-y-3">
                    {/* Mobile Difficulty Filter */}
                    <div className="flex sm:hidden items-center gap-1">
                      {(
                        [
                          ['all', 'ทั้งหมด'],
                          ['easy', 'Easy'],
                          ['normal', 'Normal'],
                          ['hard', 'Hard'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setStageDiffFilter(id)}
                          className={`flex-1 py-1 rounded text-xs font-semibold cursor-pointer ${
                            stageDiffFilter === id
                              ? 'bg-amber-400 text-[#090C12]'
                              : 'bg-white/8 text-slate-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                      {filteredStages.map((stage) => {
                        const cleared = clearedSet.has(stage.id);
                        const isSelected =
                          selectedLaunch.kind === 'stage' &&
                          selectedLaunch.stage.id === stage.id;
                        const diffColor =
                          stage.difficulty === 'easy'
                            ? 'text-emerald-400'
                            : stage.difficulty === 'normal'
                              ? 'text-amber-400'
                              : 'text-red-400';

                        return (
                          <div
                            key={stage.id}
                            onClick={() => {
                              soundEngine.playUiClick();
                              setSelectedLaunch({ kind: 'stage', stage });
                            }}
                            className={`rounded-lg overflow-hidden border transition-colors cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'bg-[#172238] border-amber-400'
                                : 'bg-[#12192A] border-white/10 hover:border-white/25'
                            }`}
                          >
                            <div className="relative h-20 sm:h-24 bg-[#182030]">
                              <img
                                src={MAP_IMAGES[stage.mapId]}
                                alt={stage.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover opacity-75"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-[#12192A] via-[#12192A]/35 to-transparent" />
                              <div className="absolute top-2 left-2.5 right-2.5 flex items-center justify-between text-[11px] font-mono-num">
                                <span className={`font-bold ${diffColor}`}>
                                  {BOT_DIFFICULTIES[stage.difficulty].label.toUpperCase()}
                                </span>
                                {cleared && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                )}
                              </div>
                              <div className="absolute bottom-1.5 left-2.5 right-2.5 font-display font-bold text-xs sm:text-sm text-white truncate">
                                {stage.title}
                              </div>
                            </div>

                            <div className="p-2.5 flex items-center justify-between gap-2">
                              <div className="text-[11px] font-mono-num text-slate-300 truncate">
                                {stage.teamSize}v{stage.teamSize} ·{' '}
                                <span className="text-amber-400">
                                  +{stage.clearBonusExp} EXP / +{stage.clearBonusSp} SP
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={!connected || busy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLaunch({ kind: 'stage', stage });
                                  handleLaunchBotStage(stage);
                                }}
                                className="px-2.5 py-1.5 rounded bg-amber-400 hover:bg-amber-300 text-[#090C12] font-display font-bold text-xs inline-flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                เล่น
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {DUEL_PRESETS.map((preset) => {
                      const isSelected =
                        selectedLaunch.kind === 'duel' &&
                        selectedLaunch.preset.id === preset.id;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => {
                            soundEngine.playUiClick();
                            setSelectedLaunch({ kind: 'duel', preset });
                          }}
                          className={`rounded-lg border p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#172238] border-amber-400'
                              : 'bg-[#12192A] border-white/10 hover:border-white/25'
                          }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 text-xs font-mono-num text-amber-400 font-semibold">
                              {renderPresetIcon(preset.icon)}
                              <span>{preset.formatLabel}</span>
                            </div>
                            <div className="font-display font-bold text-sm sm:text-base text-white truncate">
                              {preset.title}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {MAPS[preset.mapId].name} · {preset.subtitle}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={!connected || busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLaunch({ kind: 'duel', preset });
                              handleLaunchPreset(preset);
                            }}
                            className="px-3.5 py-2 rounded-md bg-amber-400 hover:bg-amber-300 text-[#090C12] font-display font-bold text-xs inline-flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            เริ่ม
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 3. WARDROBE & 3D CHARACTER CUSTOMIZER MODAL */}
        {activeModal === 'customize' && (
          <motion.div
            key="modal-customize"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#060910]/94 flex items-center justify-center p-2 sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="w-full max-w-6xl h-[94dvh] bg-[#0D1320] border border-white/15 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-3.5 sm:px-5 py-2 sm:py-3 border-b border-white/10 flex items-center justify-between gap-3 bg-[#121A2B] shrink-0">
                <div className="flex items-center gap-2">
                  <Shirt className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                  <h2 className="font-display font-bold text-sm sm:text-base text-white">
                    แต่งตัวละคร & ร้านค้า
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-1.5 font-mono-num text-xs sm:text-sm font-bold text-amber-400">
                    <Coins className="w-4 h-4" />
                    {profile.sp.toLocaleString()} SP
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/18 text-xs font-display font-bold text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>ปิด</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 sm:p-4">
                <CharacterCustomizer
                  profile={profile}
                  primaryWeapon={primaryWeapon}
                  onChangePrimaryWeapon={onChangePrimaryWeapon}
                  onEquipLoadout={onEquipLoadout}
                  onPurchaseItem={onPurchaseItem}
                />
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 4. ARSENAL (PRIMARY WEAPONS) MODAL */}
        {activeModal === 'arsenal' && (
          <motion.div
            key="modal-arsenal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#060910]/92 flex items-center justify-center p-2 sm:p-5"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-4xl max-h-[94dvh] bg-[#0F1522] border border-white/15 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-4 py-2.5 sm:py-3 border-b border-white/10 flex items-center justify-between bg-[#131B2C]">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-5 h-5 text-sky-400" />
                  <h2 className="font-display font-bold text-sm sm:text-base text-white">
                    คลังอาวุธหลัก
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="ปิด"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {PRIMARY_WEAPONS.map((wId) => {
                  const w = WEAPONS[wId];
                  const selected = primaryWeapon === wId;
                  const rpm = Math.round(60000 / Math.max(50, w.fireRateMs));
                  return (
                    <button
                      key={wId}
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        onChangePrimaryWeapon(wId);
                      }}
                      className={`text-left p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                        selected
                          ? 'bg-amber-500/14 border-amber-400'
                          : 'bg-[#141C2E] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
                            {w.name}
                          </span>
                          {selected && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {w.thaiCategory}
                        </div>
                      </div>

                      <div className="space-y-1.5 text-[10px] font-mono-num">
                        <div>
                          <div className="flex justify-between text-slate-300">
                            <span>DMG</span>
                            <span>{w.pellets > 1 ? `${w.damage}x${w.pellets}` : w.damage}</span>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-amber-400"
                              style={{ width: `${w.stats.damage}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-slate-300">
                            <span>RPM</span>
                            <span>{rpm}</span>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-sky-400"
                              style={{ width: `${w.stats.fireRate}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex justify-between text-slate-400 pt-0.5 border-t border-white/8">
                          <span>MAG</span>
                          <span className="text-slate-200">{w.magSize}/{w.reserveAmmo}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 5. CONTROLS & GRAPHICS SETTINGS MODAL */}
        {activeModal === 'controls' && (
          <motion.div
            key="modal-controls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#060910]/92 flex items-center justify-center p-2 sm:p-5"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-4xl max-h-[94dvh] bg-[#0F1522] border border-white/15 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-4 py-2.5 sm:py-3 border-b border-white/10 flex items-center justify-between bg-[#131B2C]">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-amber-400" />
                  <h2 className="font-display font-bold text-sm sm:text-base text-white">
                    ตั้งค่าปุ่ม & กราฟิก
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="ปิด"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 sm:p-5">
                <ControlsSettingsPanel
                  settings={controlSettings}
                  onChange={onChangeControlSettings}
                />
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 6. CREATE ROOM MODAL (Compact Mobile Landscape Friendly) */}
        {activeModal === 'create' && (
          <motion.div
            key="modal-create"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#060910]/92 flex items-center justify-center p-2 sm:p-5"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-2xl max-h-[94dvh] bg-[#0F1522] border border-white/15 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-4 py-2.5 sm:py-3 border-b border-white/10 flex items-center justify-between bg-[#131B2C]">
                <div className="flex items-center gap-2">
                  <PlusSquare className="w-5 h-5 text-amber-400" />
                  <h2 className="font-display font-bold text-sm sm:text-base text-white">
                    สร้างห้องรบ
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="ปิด"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitCreate} className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">ชื่อห้อง</label>
                    <input
                      type="text"
                      maxLength={32}
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder={`${teamSize}v${teamSize} · ${playerName}`}
                      className="w-full bg-[#090C12] border border-white/15 focus:border-amber-400 rounded px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">รหัสผ่าน (ไม่ใส่ก็ได้)</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="เว้นว่าง = เปิดสาธารณะ"
                      className="w-full bg-[#090C12] border border-white/15 focus:border-amber-400 rounded px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                </div>

                {/* Team Size */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">ขนาดทีม</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {TEAM_SIZES.map((ts) => (
                      <button
                        key={ts}
                        type="button"
                        onClick={() => handleSelectTeamSize(ts as TeamSize)}
                        className={`py-2 rounded border font-mono-num text-xs font-bold transition-colors cursor-pointer ${
                          teamSize === ts
                            ? 'bg-amber-400 text-[#090C12] border-amber-400'
                            : 'bg-[#090C12] text-slate-300 border-white/12 hover:border-white/30'
                        }`}
                      >
                        {ts}v{ts}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">แผนที่</label>
                    <select
                      value={mapId}
                      onChange={(e) => setMapId(e.target.value as MapId)}
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-xs text-white outline-none"
                    >
                      {MAP_LIST.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">อาวุธ</label>
                    <select
                      value={weaponRule}
                      onChange={(e) => setWeaponRule(e.target.value as WeaponRule)}
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-xs text-white outline-none"
                    >
                      {WEAPON_RULE_LIST.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.shortLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">บอท</label>
                    <select
                      value={Math.min(botCount, maxAllowedBots)}
                      onChange={(e) => setBotCount(Number(e.target.value))}
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-xs text-white outline-none"
                    >
                      <option value={0}>0 (PvP)</option>
                      {Array.from({ length: maxAllowedBots }, (_, i) => i + 1)
                        .filter((n) => n <= 10)
                        .map((n) => (
                          <option key={n} value={n}>
                            {n} ตัว
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">ระดับบอท</label>
                    <select
                      value={botDifficulty}
                      onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-xs text-white outline-none"
                    >
                      {BOT_DIFFICULTY_LIST.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">โหมด</label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as GameMode)}
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-xs text-white outline-none"
                    >
                      <option value="tdm">Team (TDM)</option>
                      <option value="ffa">เดี่ยว (FFA)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">เป้าหมาย</label>
                    <select
                      value={targetKills}
                      onChange={(e) => setTargetKills(Number(e.target.value))}
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-xs text-white outline-none"
                    >
                      <option value={10}>10 Kills</option>
                      <option value={15}>15 Kills</option>
                      <option value={20}>20 Kills</option>
                      <option value={30}>30 Kills</option>
                      <option value={50}>50 Kills</option>
                    </select>
                  </div>
                </div>

                {joinError && <div className="text-xs text-red-400">{joinError}</div>}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={!connected || busy}
                    className="px-5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#090C12] font-display font-bold text-xs sm:text-sm rounded-md cursor-pointer"
                  >
                    {busy ? 'กำลังสร้าง...' : 'สร้างห้องเลย'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* LOCKED ROOM PASSWORD PROMPT */}
        {lockedRoomTarget && (
          <motion.div
            key="modal-password"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/82 flex items-center justify-center p-4"
          >
            <form
              onSubmit={handleConfirmLockedJoin}
              className="w-full max-w-sm bg-[#111726] border border-white/15 rounded-xl p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-display font-bold text-white">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>ห้องล็อกรหัสผ่าน</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLockedRoomTarget(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-slate-400 truncate">{lockedRoomTarget.name}</div>
              <input
                type="password"
                autoFocus
                value={lockedPassword}
                onChange={(e) => setLockedPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านห้อง..."
                className="w-full bg-[#090C12] border border-white/15 focus:border-amber-400 rounded px-3 py-2 text-sm text-white outline-none"
              />
              {joinError && <div className="text-xs text-red-400">{joinError}</div>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLockedRoomTarget(null)}
                  className="px-3 py-1.5 text-xs text-slate-300 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-[#090C12] font-display font-bold text-xs rounded cursor-pointer"
                >
                  เข้าห้อง
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
