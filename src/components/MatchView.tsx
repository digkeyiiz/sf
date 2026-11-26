import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  Coins,
  LogOut,
  Maximize2,
  Minimize2,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  Shield,
  Skull,
  Smartphone,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { GameEngine, type HudSnapshot } from '../game/GameEngine';
import type { PerfMetricsSnapshot } from '../game/render/PerfMonitor';
import { soundEngine } from '../game/sound';
import { MAPS } from '../shared/maps';
import {
  PRIMARY_WEAPONS,
  WEAPON_RULES,
  WEAPONS,
  resolveWeaponForRule,
} from '../shared/weapons';
import { BOT_DIFFICULTIES, SF_RANKS, getRankForExp } from '../shared/progression';
import {
  RADIO_COMMANDS,
  formatKeyCode,
  toggleFullscreenLandscape,
  type ControlSettings,
} from '../shared/controls';
import type {
  CharacterLoadout,
  DamageTakenEvent,
  GrenadeExplodeEvent,
  HitConfirmEvent,
  KillFeedEvent,
  MatchRewardEvent,
  MatchSnapshot,
  PrimaryWeaponId,
  RoomState,
  ShotBroadcast,
  SupplyPickupEvent,
} from '../shared/types';
import { getSocket } from '../lib/socket';
import { RankBadge } from './RankBadge';
import { ControlsSettingsPanel } from './ControlsSettingsPanel';
import { TouchControlsOverlay } from './TouchControlsOverlay';

interface MatchViewProps {
  room: RoomState;
  myId: string;
  myLoadout: CharacterLoadout;
  controlSettings: ControlSettings;
  onChangeControlSettings: (next: ControlSettings) => void;
  matchReward: MatchRewardEvent | null;
  onLeaveRoom: () => void;
  onSetWeapon: (w: PrimaryWeaponId) => void;
  onStartRematch: () => void;
  onReturnToLobby: () => void;
  onSendChat: (text: string) => void;
}

const COMPASS_POINTS = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

function getCardinalLabel(deg: number): string {
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return COMPASS_POINTS[idx]?.label ?? 'N';
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const MatchView: React.FC<MatchViewProps> = ({
  room,
  myId,
  myLoadout,
  controlSettings,
  onChangeControlSettings,
  matchReward,
  onLeaveRoom,
  onSetWeapon,
  onStartRematch,
  onReturnToLobby,
  onSendChat,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const settingsRef = useRef<ControlSettings>(controlSettings);
  settingsRef.current = controlSettings;

  const meInRoom = room.players.find((p) => p.id === myId);
  const isHost = Boolean(meInRoom?.isHost);
  const ruleSpec = WEAPON_RULES[room.settings.weaponRule] ?? WEAPON_RULES.all;
  const initialResolved = resolveWeaponForRule(
    room.settings.weaponRule,
    meInRoom?.primaryWeapon ?? 'm4a1'
  );

  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({
    hp: 100,
    armor: 50,
    alive: true,
    respawnTimer: 0,
    weaponId: initialResolved.activeWeapon,
    slot: initialResolved.defaultSlot,
    allowedSlots: ruleSpec.allowedSlots,
    ammo: WEAPONS[initialResolved.activeWeapon].magSize,
    reserve: WEAPONS[initialResolved.activeWeapon].reserveAmmo,
    reloading: false,
    reloadProgress: 0,
    isScoped: false,
    isAds: false,
    crouch: false,
    sprinting: false,
    sliding: false,
    lean: 0,
    hasGrenade: ruleSpec.allowedSlots.includes(4),
    crosshairSpread: 0.15,
    pointerLocked: false,
    yawDeg: 0,
    radioOpen: false,
    enemyInCrosshair: false,
    sprintLocked: false,
  });

  const [killFeed, setKillFeed] = useState<KillFeedEvent[]>([]);
  const [hitmarker, setHitmarker] = useState<{ headshot: boolean; killed: boolean; ts: number } | null>(null);
  const [damageIndicator, setDamageIndicator] = useState<{ angleDeg: number; ts: number } | null>(
    null
  );
  const [screenFlash, setScreenFlash] = useState<{ color: 'gold' | 'heal'; ts: number } | null>(null);
  const [callout, setCallout] = useState<{ title: string; sub?: string; ts: number } | null>(null);
  const [deployStep, setDeployStep] = useState<number | null>(3);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [perf, setPerf] = useState<PerfMetricsSnapshot | null>(null);

  const isMatchEnded = room.status === 'ended';

  useEffect(() => {
    const checkViewport = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    document.addEventListener('fullscreenchange', checkViewport);
    return () => {
      window.removeEventListener('resize', checkViewport);
      document.removeEventListener('fullscreenchange', checkViewport);
    };
  }, []);

  const toggleFullscreen = () => {
    void toggleFullscreenLandscape(!document.fullscreenElement);
  };

  // Kinetic 3-2-1-GO tactical deploy banner on match entry
  useEffect(() => {
    setDeployStep(3);
    soundEngine.playCountdownBeep(false);
    const t1 = window.setTimeout(() => {
      setDeployStep(2);
      soundEngine.playCountdownBeep(false);
    }, 650);
    const t2 = window.setTimeout(() => {
      setDeployStep(1);
      soundEngine.playCountdownBeep(false);
    }, 1300);
    const t3 = window.setTimeout(() => {
      setDeployStep(0);
      soundEngine.playCountdownBeep(true);
    }, 1950);
    const t4 = window.setTimeout(() => {
      setDeployStep(null);
    }, 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [room.code, room.settings.mapId, room.settings.weaponRule]);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;
    const socket = getSocket();
    const mapDef = MAPS[room.settings.mapId] ?? MAPS.desert_camp;

    const engine = new GameEngine({
      container: mount,
      minimapCanvas: minimapRef.current,
      map: mapDef,
      mode: room.settings.mode,
      weaponRule: room.settings.weaponRule,
      myId,
      myTeam: meInRoom?.team ?? 'blue',
      myLoadout,
      primaryWeapon: meInRoom?.primaryWeapon ?? 'm4a1',
      callbacks: {
        onHudUpdate: (nextHud) => setHud(nextHud),
        onPointerLockChange: (locked) => {
          if (locked) setPauseMenuOpen(false);
        },
        onSendState: (st) => socket.emit('player:state', st),
        onShoot: (payload) => socket.emit('player:shoot', payload),
        onThrowGrenade: (payload) => socket.emit('player:throwGrenade', payload),
        onToggleScoreboard: (show) => setShowScoreboard(show),
        onOpenChat: () => setChatOpen(true),
        onRadioChat: (text) => onSendChat(text),
        onToggleHudHints: () => {
          onChangeControlSettings({
            ...settingsRef.current,
            showKeyHints: !settingsRef.current.showKeyHints,
          });
        },
        onPerfUpdate: (nextPerf) => setPerf(nextPerf),
        onTogglePerfHud: () => {
          onChangeControlSettings({
            ...settingsRef.current,
            showPerfHud: !settingsRef.current.showPerfHud,
          });
        },
      },
    });
    engine.applyControlSettings(settingsRef.current);
    engineRef.current = engine;

    const onSnapshot = (snap: MatchSnapshot) => {
      setSnapshot(snap);
      engine.applyServerSnapshot(snap);
    };

    const onShot = (shot: ShotBroadcast) => {
      engine.handleRemoteShot(shot);
    };

    const onHitConfirm = (ev: HitConfirmEvent) => {
      const hs = ev.hitZone === 'head';
      soundEngine.playHitmarker(hs);
      setHitmarker({ headshot: hs, killed: ev.killed, ts: Date.now() });
      if (ev.killed) {
        soundEngine.playKillChime();
        setScreenFlash({ color: 'gold', ts: Date.now() });
      }
    };

    const onDamageTaken = (ev: DamageTakenEvent) => {
      soundEngine.playDamageTaken(ev.hitZone === 'head');
      const angleDeg = engine.computeDamageAngleDeg(ev.attackerPos);
      setDamageIndicator({ angleDeg, ts: Date.now() });
      if (ev.remainingHp <= 0) {
        setCallout({
          title: 'ถูกสังหาร',
          sub: `โดย ${ev.attackerName}`,
          ts: Date.now(),
        });
      }
    };

    const onSupplyPickup = (ev: SupplyPickupEvent) => {
      soundEngine.playSupplyPickup();
      setScreenFlash({ color: 'heal', ts: Date.now() });
      if (ev.kind === 'ammo') {
        engine.refillAmmoFromSupply();
        setCallout({
          title: 'เติมกระสุนเต็มพิกัด',
          sub: 'พร้อมระเบิดมือ M67',
          ts: Date.now(),
        });
      } else {
        setCallout({
          title: 'ฟื้นฟูพลังชีวิต',
          sub: `+${ev.hpGained} HP · +${ev.armorGained} เกราะ`,
          ts: Date.now(),
        });
      }
    };

    const onKill = (ev: KillFeedEvent) => {
      setKillFeed((prev) => [ev, ...prev].slice(0, 6));
      if (ev.killerId === myId) {
        if (ev.headshot) {
          setCallout({
            title: 'HEADSHOT!',
            sub: `${ev.victimName} (+150)`,
            ts: Date.now(),
          });
        } else if ((ev.streak ?? 0) >= 3) {
          setCallout({
            title: `${ev.streak} KILL STREAK!`,
            sub: ev.victimName,
            ts: Date.now(),
          });
        } else if (ev.streak === 2) {
          setCallout({
            title: 'DOUBLE KILL!',
            sub: ev.victimName,
            ts: Date.now(),
          });
        }
      }
    };

    const onGrenadeExplode = (ev: GrenadeExplodeEvent) => {
      engine.handleGrenadeExplosion(ev);
    };

    const onReconcile = (pos: { x: number; y: number; z: number }) => {
      engine.applyServerReconciliation(pos);
    };

    // 2s RTT & packet-loss probe
    let pingSent = 0;
    let pingAcked = 0;
    let lastRttMs = 0;
    const pingTimer = window.setInterval(() => {
      const sentAt = performance.now();
      pingSent++;
      let replied = false;
      socket.emit('net:ping', Date.now(), () => {
        replied = true;
        pingAcked++;
        lastRttMs = Math.max(1, Math.round(performance.now() - sentAt));
        const lossPct = pingSent > 0 ? Math.max(0, Math.round(((pingSent - pingAcked) / pingSent) * 100)) : 0;
        engine.setNetworkStats(lastRttMs, lossPct);
        socket.emit('net:rtt', lastRttMs);
      });
      window.setTimeout(() => {
        if (!replied) {
          const lossPct = pingSent > 0 ? Math.max(0, Math.round(((pingSent - pingAcked) / pingSent) * 100)) : 0;
          engine.setNetworkStats(lastRttMs, lossPct);
        }
      }, 1500);
    }, 2000);

    socket.on('match:snapshot', onSnapshot);
    socket.on('combat:shot', onShot);
    socket.on('combat:hitConfirm', onHitConfirm);
    socket.on('combat:damageTaken', onDamageTaken);
    socket.on('combat:supplyPickup', onSupplyPickup);
    socket.on('combat:kill', onKill);
    socket.on('combat:grenadeExplode', onGrenadeExplode);
    socket.on('player:reconcile', onReconcile);

    return () => {
      clearInterval(pingTimer);
      socket.off('match:snapshot', onSnapshot);
      socket.off('combat:shot', onShot);
      socket.off('combat:hitConfirm', onHitConfirm);
      socket.off('combat:damageTaken', onDamageTaken);
      socket.off('combat:supplyPickup', onSupplyPickup);
      socket.off('combat:kill', onKill);
      socket.off('combat:grenadeExplode', onGrenadeExplode);
      socket.off('player:reconcile', onReconcile);
      engine.dispose();
      engineRef.current = null;
    };
  }, [room.code, room.settings.mapId, room.settings.mode, room.settings.weaponRule, myId]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMinimapCanvas(minimapRef.current);
    }
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.applyControlSettings(controlSettings);
    } else {
      soundEngine.volume = controlSettings.volume / 100;
      if (controlSettings.audioMix) {
        soundEngine.applyAudioMix(controlSettings.audioMix);
      }
    }
  }, [controlSettings]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.chatOpen = chatOpen;
    }
  }, [chatOpen]);

  useEffect(() => {
    if (isMatchEnded) {
      engineRef.current?.exitPointerLock();
    }
  }, [isMatchEnded]);

  useEffect(() => {
    if (!hitmarker) return;
    const t = setTimeout(() => setHitmarker(null), 175);
    return () => clearTimeout(t);
  }, [hitmarker]);

  useEffect(() => {
    if (!damageIndicator) return;
    const t = setTimeout(() => setDamageIndicator(null), 650);
    return () => clearTimeout(t);
  }, [damageIndicator]);

  useEffect(() => {
    if (!screenFlash) return;
    const t = setTimeout(() => setScreenFlash(null), 320);
    return () => clearTimeout(t);
  }, [screenFlash]);

  useEffect(() => {
    if (!callout) return;
    const t = setTimeout(() => setCallout(null), 1900);
    return () => clearTimeout(t);
  }, [callout]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendChat(chatInput.trim());
    }
    setChatInput('');
    setChatOpen(false);
    engineRef.current?.requestPointerLock();
  };

  const handleChangeNextWeapon = (w: PrimaryWeaponId) => {
    onSetWeapon(w);
    engineRef.current?.setPrimaryWeapon(w);
  };

  const livePlayers = snapshot?.players ?? [];
  const myLive = livePlayers.find((p) => p.id === myId);
  const scores = snapshot?.scores ?? room.scores;
  const timeLeft = snapshot?.timeRemainingSec ?? room.timeRemainingSec;
  const redBoard = [...livePlayers]
    .filter((p) => p.team === 'red')
    .sort((a, b) => b.score - a.score || b.kills - a.kills);
  const blueBoard = [...livePlayers]
    .filter((p) => p.team === 'blue')
    .sort((a, b) => b.score - a.score || b.kills - a.kills);
  const allBoard = [...livePlayers].sort((a, b) => b.score - a.score || b.kills - a.kills);

  const cScale = controlSettings.crosshairSize;
  const crosshairColor = hud.enemyInCrosshair ? '#ef4444' : controlSettings.crosshairColor;
  const spreadPx = Math.round((6 + hud.crosshairSpread * 18) * cScale);
  const tickLenPx = Math.round(10 * cScale);
  const activeWeaponSpec = WEAPONS[hud.weaponId];
  const isPlayingActive = hud.pointerLocked || (controlSettings.touchControls && !pauseMenuOpen);
  const showPauseOverlay = !isMatchEnded && !chatOpen && (!isPlayingActive || pauseMenuOpen);

  const stanceLabel = hud.sliding
    ? 'สไลด์!'
    : hud.lean < 0
      ? 'เอียงซ้าย'
      : hud.lean > 0
        ? 'เอียงขวา'
        : hud.crouch
          ? 'ย่อหลบ'
          : hud.sprinting
            ? 'วิ่งเร็ว'
            : 'ยืน';

  const redProgressPct = Math.min(100, Math.round((scores.red / Math.max(1, room.settings.targetKills)) * 100));
  const blueProgressPct = Math.min(100, Math.round((scores.blue / Math.max(1, room.settings.targetKills)) * 100));

  return (
    <div className="fixed inset-0 bg-[#0B0E14] overflow-hidden select-none touch-none">
      {/* Isolated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {/* Sniper Full-Screen Scope Reticle (PSG-1 & AWM) */}
      {hud.isScoped && hud.alive && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
          <div
            className="w-full h-full"
            style={{
              background:
                'radial-gradient(circle at center, transparent 0%, transparent 32%, rgba(5,7,11,0.98) 33.5%)',
            }}
          />
          <div className="absolute inset-x-0 top-1/2 h-[1px] bg-black/90" />
          <div className="absolute inset-y-0 left-1/2 w-[1px] bg-black/90" />
          <div className="absolute w-16 h-[1px] bg-black/80 top-[53%]" />
          <div className="absolute w-10 h-[1px] bg-black/80 top-[56%]" />
          <div className="absolute w-2.5 h-2.5 rounded-full bg-red-500/90" />
        </div>
      )}

      {/* Low-HP Adrenaline Edge Vignette */}
      {hud.alive && hud.hp <= 30 && (
        <div
          className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-200"
          style={{
            boxShadow: `inset 0 0 ${hud.hp <= 15 ? 140 : 95}px rgba(220, 38, 38, ${hud.hp <= 15 ? 0.45 : 0.28})`,
          }}
        />
      )}

      {/* Subtle Kill Confirm / Supply Pickup Screen Edge Flash */}
      {screenFlash && (
        <div
          key={screenFlash.ts}
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            boxShadow:
              screenFlash.color === 'gold'
                ? 'inset 0 0 85px rgba(245, 158, 11, 0.36)'
                : 'inset 0 0 85px rgba(34, 197, 94, 0.32)',
          }}
        />
      )}

      {/* Directional Damage Vignette + Tactical Hit Direction Arc */}
      {damageIndicator && (
        <>
          <div
            className="pointer-events-none fixed inset-0 z-10"
            style={{
              boxShadow: 'inset 0 0 110px rgba(239, 68, 68, 0.58)',
            }}
          />
          <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
            <div
              className="w-44 h-44 relative"
              style={{ transform: `rotate(${damageIndicator.angleDeg}deg)` }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-2 bg-red-500 rounded-full opacity-90" />
            </div>
          </div>
        </>
      )}

      {/* Dynamic Customizable Crosshair + Hitmarker */}
      {isPlayingActive && hud.alive && !hud.isScoped && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {hud.weaponId === 'm870' ? (
              <>
                <div
                  className="rounded-full border-2 transition-all duration-75"
                  style={{
                    borderColor: crosshairColor,
                    width: `${Math.round((44 + hud.crosshairSpread * 28) * cScale)}px`,
                    height: `${Math.round((44 + hud.crosshairSpread * 28) * cScale)}px`,
                    opacity: 0.85,
                  }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full absolute"
                  style={{ backgroundColor: crosshairColor }}
                />
              </>
            ) : controlSettings.crosshairStyle === 'circle' ? (
              <>
                <div
                  className="rounded-full border-2 transition-all duration-75"
                  style={{
                    borderColor: crosshairColor,
                    width: `${Math.round((24 + hud.crosshairSpread * 16) * cScale)}px`,
                    height: `${Math.round((24 + hud.crosshairSpread * 16) * cScale)}px`,
                    opacity: 0.88,
                  }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full absolute"
                  style={{ backgroundColor: crosshairColor }}
                />
              </>
            ) : controlSettings.crosshairStyle === 'dot' ? (
              <div
                className="rounded-full"
                style={{
                  backgroundColor: crosshairColor,
                  width: `${Math.round(5 * cScale)}px`,
                  height: `${Math.round(5 * cScale)}px`,
                }}
              />
            ) : (
              <>
                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: crosshairColor }} />
                {controlSettings.crosshairStyle !== 'tshape' && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-[2px]"
                    style={{
                      backgroundColor: crosshairColor,
                      height: `${tickLenPx}px`,
                      bottom: `${spreadPx}px`,
                    }}
                  />
                )}
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-[2px]"
                  style={{
                    backgroundColor: crosshairColor,
                    height: `${tickLenPx}px`,
                    top: `${spreadPx}px`,
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-[2px]"
                  style={{
                    backgroundColor: crosshairColor,
                    width: `${tickLenPx}px`,
                    right: `${spreadPx}px`,
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-[2px]"
                  style={{
                    backgroundColor: crosshairColor,
                    width: `${tickLenPx}px`,
                    left: `${spreadPx}px`,
                  }}
                />
              </>
            )}

            {hitmarker && (
              <motion.div
                key={hitmarker.ts}
                initial={{ scale: hitmarker.killed ? 1.7 : 1.45, opacity: 1 }}
                animate={{ scale: 0.9, opacity: 0.2 }}
                transition={{ duration: 0.17 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div
                  className="w-7 h-[2px] rotate-45 absolute"
                  style={{
                    backgroundColor: hitmarker.headshot
                      ? '#ef4444'
                      : hitmarker.killed
                        ? '#f59e0b'
                        : '#ffffff',
                  }}
                />
                <div
                  className="w-7 h-[2px] -rotate-45 absolute"
                  style={{
                    backgroundColor: hitmarker.headshot
                      ? '#ef4444'
                      : hitmarker.killed
                        ? '#f59e0b'
                        : '#ffffff',
                  }}
                />
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Reload Bar */}
      {hud.reloading && hud.alive && (
        <div className="pointer-events-none fixed left-1/2 top-[58%] -translate-x-1/2 z-20 w-44 space-y-1">
          <div className="text-[11px] font-display text-center text-amber-400 tracking-wide">
            กำลังรีโหลดกระสุน...
          </div>
          <div className="h-1.5 bg-black/75 border border-white/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* 3-2-1-GO Kinetic Match Deploy Countdown */}
      <AnimatePresence>
        {deployStep !== null && !isMatchEnded && (
          <motion.div
            key={`deploy-${deployStep}`}
            initial={{ opacity: 0, scale: 1.55 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.78 }}
            transition={{ duration: 0.24 }}
            className="pointer-events-none fixed inset-x-0 top-24 z-30 flex flex-col items-center justify-center text-center"
          >
            <div className="font-display text-4xl sm:text-5xl font-bold tracking-wider text-amber-400 drop-shadow-[0_4px_14px_rgba(0,0,0,0.95)]">
              {deployStep === 0 ? 'เปิดฉากยิง! (GO!)' : deployStep}
            </div>
            <div className="text-xs font-semibold text-white/90 mt-1 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              {room.settings.teamSize}v{room.settings.teamSize} · {ruleSpec.label}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kinetic Kill Streak / Headshot / Supply Callout */}
      <AnimatePresence>
        {callout && (
          <motion.div
            key={callout.ts}
            initial={{ opacity: 0, y: -12, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="pointer-events-none fixed left-1/2 top-28 -translate-x-1/2 z-20 text-center"
          >
            <div className="font-display text-2xl font-bold tracking-wider text-amber-400 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
              {callout.title}
            </div>
            {callout.sub && (
              <div className="text-xs font-medium text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                {callout.sub}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOP-CENTER: Pro Military Scoreboard + Live Tactical Compass Bearing */}
      <div className="pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-3 bg-[#090D16]/92 border border-white/14 rounded-md px-4 py-1.5">
          {room.settings.mode === 'tdm' ? (
            <>
              <div className="flex items-center gap-2.5 min-w-[82px] justify-end">
                <div className="text-right">
                  <div className="font-display text-[11px] font-bold text-[#FFB020] leading-none">
                    VIPER UNIT
                  </div>
                  <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden mt-1 ml-auto">
                    <div className="h-full bg-[#FFB020]" style={{ width: `${redProgressPct}%` }} />
                  </div>
                </div>
                <span className="font-mono-num text-2xl font-bold text-white leading-none">
                  {scores.red}
                </span>
              </div>

              <div className="px-3.5 border-x border-white/12 text-center">
                <div className="font-mono-num text-sm font-bold text-amber-400 leading-tight">
                  {formatClock(timeLeft)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono-num">
                  {room.settings.teamSize}v{room.settings.teamSize} · เป้า {room.settings.targetKills}
                </div>
              </div>

              <div className="flex items-center gap-2.5 min-w-[82px]">
                <span className="font-mono-num text-2xl font-bold text-white leading-none">
                  {scores.blue}
                </span>
                <div>
                  <div className="font-display text-[11px] font-bold text-[#4FD1FF] leading-none">
                    TASK FORCE
                  </div>
                  <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-[#4FD1FF]" style={{ width: `${blueProgressPct}%` }} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-4 px-2">
              <span className="font-display text-xs font-bold text-amber-400">FREE-FOR-ALL</span>
              <span className="font-mono-num text-base font-bold text-white">
                {formatClock(timeLeft)}
              </span>
              <span className="text-xs text-slate-400 font-mono-num">
                เป้า {room.settings.targetKills} Kills
              </span>
            </div>
          )}
        </div>

        {/* Live Rotating Tactical Compass Ribbon (Hide on tiny touch viewports to keep sightline open) */}
        <div
          className={`${
            controlSettings.touchControls ? 'hidden sm:flex' : 'flex'
          } items-center gap-3 bg-[#090D16]/82 border border-white/10 rounded px-3.5 py-0.5 text-[10px] font-mono-num text-slate-300`}
        >
          <span className="text-amber-400 font-bold">
            {getCardinalLabel(hud.yawDeg)} {String(hud.yawDeg).padStart(3, '0')}°
          </span>
          <span className="text-slate-600">|</span>
          <span>{ruleSpec.shortLabel}</span>
          {myLive && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400">K {myLive.kills}</span>
              <span className="text-slate-400">D {myLive.deaths}</span>
            </>
          )}
        </div>
      </div>

      {/* TOP-LEFT: 2D Tactical Minimap (Compact 84px on Touch Mobile so Left Fire never overlaps) */}
      <div
        className={`pointer-events-none fixed top-2 left-2 z-20 bg-[#090D16]/88 border border-white/14 rounded-md p-1 ${
          controlSettings.touchControls ? 'w-[84px] sm:w-[116px]' : ''
        }`}
      >
        <canvas
          ref={minimapRef}
          width={154}
          height={128}
          className={`block rounded-sm ${
            controlSettings.touchControls ? 'w-full h-auto' : ''
          }`}
        />
        <div
          className={`mt-0.5 px-1 items-center justify-between text-[9px] sm:text-[10px] text-slate-400 ${
            controlSettings.touchControls ? 'hidden sm:flex' : 'flex'
          }`}
        >
          <span className="font-medium text-slate-300 truncate">{MAPS[room.settings.mapId].name}</span>
          <span className="font-mono-num text-amber-400 ml-1">{room.code}</span>
        </div>
      </div>

      {/* OPTIONAL COMPACT PERF & NET TELEMETRY STRIP (Toggle via F3 or Settings) */}
      {controlSettings.showPerfHud && perf && (
        <div
          className={`pointer-events-none fixed left-2 z-20 bg-[#090D16]/90 border border-white/14 rounded px-2 py-1 font-mono-num text-[10px] text-slate-200 flex items-center gap-2 ${
            controlSettings.touchControls ? 'top-[74px]' : 'top-[162px]'
          }`}
        >
          <span className={perf.fps >= 55 ? 'text-emerald-400 font-bold' : perf.fps >= 35 ? 'text-amber-400 font-bold' : 'text-red-400 font-bold'}>
            {perf.fps} FPS
          </span>
          <span className="text-slate-500">|</span>
          <span>1%: {perf.onePercentLowFps}</span>
          <span className="text-slate-500">|</span>
          <span>DC: {perf.drawCalls}</span>
          <span className="text-slate-500">|</span>
          <span>{(perf.triangles / 1000).toFixed(1)}k tris</span>
          <span className="text-slate-500">|</span>
          <span>DPR {perf.pixelRatio.toFixed(2)} ({perf.qualityTier.toUpperCase()})</span>
          <span className="text-slate-500">|</span>
          <span className={perf.pingMs <= 60 ? 'text-emerald-400' : perf.pingMs <= 120 ? 'text-amber-400' : 'text-red-400'}>
            {perf.pingMs}ms
          </span>
          {perf.packetLossPct > 0 && (
            <span className="text-red-400">Loss {perf.packetLossPct}%</span>
          )}
        </div>
      )}

      {/* TOP-RIGHT: Icon-Only Quick Fullscreen / Scoreboard / Settings Bar for Touch Mode */}
      {controlSettings.touchControls && !isMatchEnded && (
        <div className="fixed top-2 right-2 z-30 flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-8 h-8 bg-[#090D16]/90 border border-white/18 rounded-md text-slate-200 hover:border-amber-400 flex items-center justify-center cursor-pointer"
            aria-label="เต็มหน้าจอ"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setShowScoreboard((s) => !s)}
            className="w-8 h-8 bg-[#090D16]/90 border border-white/18 rounded-md text-slate-200 hover:border-amber-400 flex items-center justify-center cursor-pointer"
            aria-label="ตารางคะแนน"
          >
            <Trophy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setPauseMenuOpen(true)}
            className="w-8 h-8 bg-[#090D16]/90 border border-amber-400/55 rounded-md text-amber-400 flex items-center justify-center cursor-pointer"
            aria-label="ตั้งค่า"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP-RIGHT: Live Animated Kill Feed (Max 2 compact lines on Touch Mode) */}
      <div
        className={`pointer-events-none fixed right-2 z-20 space-y-1 ${
          controlSettings.touchControls ? 'top-11 w-48 sm:w-64' : 'top-4 right-3 w-76'
        }`}
      >
        <AnimatePresence initial={false}>
          {(controlSettings.touchControls ? killFeed.slice(0, 2) : killFeed).map((k) => (
            <motion.div
              key={k.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.18 }}
              className={`bg-[#0B0E14]/88 border border-white/10 rounded flex items-center justify-end gap-1 ${
                controlSettings.touchControls ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
              }`}
            >
              <span
                className={`font-semibold truncate max-w-[74px] sm:max-w-[92px] ${
                  k.killerTeam === 'red' ? 'text-[#FFB020]' : 'text-[#4FD1FF]'
                }`}
              >
                {k.killerName}
              </span>
              <span className="text-[9px] text-slate-400 font-mono-num">
                [{WEAPONS[k.weaponId]?.name.split(' ')[0] ?? k.weaponId}]
              </span>
              {k.headshot && <Skull className="w-3 h-3 text-red-400 shrink-0" />}
              <span
                className={`font-semibold truncate max-w-[74px] sm:max-w-[92px] ${
                  k.victimTeam === 'red' ? 'text-amber-200' : 'text-sky-200'
                }`}
              >
                {k.victimName}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* BOTTOM-LEFT: Pro Vitality Module (Ultra-Slim 36px on Touch Mode — Zero Overlap!) */}
      <div
        className={`pointer-events-none fixed z-20 space-y-1.5 ${
          controlSettings.touchControls ? 'left-2 bottom-2 w-[124px] sm:w-[156px]' : 'bottom-3 left-3 w-72'
        }`}
      >
        {/* Tactical Radio Quick-Command Panel (Toggle via Z key or Radio button) */}
        <AnimatePresence>
          {hud.radioOpen && !isMatchEnded && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="pointer-events-auto bg-[#090D16]/94 border border-sky-400/40 rounded-md p-2.5 space-y-1 w-60"
            >
              <div className="flex items-center justify-between text-[11px] font-display font-bold text-sky-400 pb-1 border-b border-white/10">
                <span className="inline-flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5" /> วิทยุทีม
                </span>
                <button
                  type="button"
                  onClick={() => engineRef.current?.toggleRadioMenu()}
                  className="text-slate-400 hover:text-white text-[10px] cursor-pointer"
                >
                  ปิด
                </button>
              </div>
              {RADIO_COMMANDS.map((cmd, idx) => (
                <button
                  key={cmd.key}
                  type="button"
                  onClick={() => engineRef.current?.triggerRadioCommand(idx)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-white/10 text-xs text-slate-200 flex items-center gap-2 cursor-pointer"
                >
                  <span className="font-mono-num text-[10px] font-bold text-amber-400 bg-white/10 px-1.5 py-0.5 rounded">
                    {cmd.key}
                  </span>
                  <span>{cmd.label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {!controlSettings.touchControls && (
          <div className="space-y-1">
            {room.chat.slice(-4).map((m) => (
              <div key={m.id} className="bg-[#090D16]/78 rounded px-2.5 py-1 text-xs leading-snug">
                {m.system ? (
                  <span className="text-amber-400">{m.text}</span>
                ) : (
                  <>
                    <span
                      className={`font-semibold mr-1 ${
                        m.team === 'red' ? 'text-[#FFB020]' : 'text-[#4FD1FF]'
                      }`}
                    >
                      {m.senderName}:
                    </span>
                    <span className="text-slate-100">{m.text}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div
          className={`bg-[#090D16]/86 border border-white/14 rounded-md ${
            controlSettings.touchControls ? 'px-2 py-1.5 space-y-1' : 'p-3.5 space-y-2'
          }`}
        >
          <div className="flex items-end justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-[9px] font-display text-slate-400">HP</span>
              <span
                className={`font-mono-num font-bold leading-none ${
                  controlSettings.touchControls ? 'text-sm' : 'text-2xl'
                } ${hud.hp <= 30 ? 'text-red-400' : 'text-white'}`}
              >
                {hud.hp}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-300">
              <Shield className="w-3 h-3 text-sky-400" />
              <span className="font-mono-num font-semibold text-sky-300">{hud.armor}</span>
              {!controlSettings.touchControls && (
                <>
                  <span className="text-slate-600">·</span>
                  <span
                    className={`font-display font-bold text-[11px] ${
                      hud.sliding ? 'text-amber-400' : 'text-slate-200'
                    }`}
                  >
                    {stanceLabel}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  hud.hp <= 30 ? 'bg-red-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, hud.hp))}%` }}
              />
            </div>
            <div className="h-0.5 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-100"
                style={{ width: `${Math.max(0, Math.min(100, hud.armor))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM-CENTER: Collapsible Slim Tactical Keybind Action Bar (Desktop Only) */}
      {controlSettings.showKeyHints && !controlSettings.touchControls && !isMatchEnded && (
        <div className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 z-20 hidden xl:flex items-center gap-2 bg-[#090D16]/86 border border-white/12 rounded-md px-3.5 py-1.5 text-[10px] text-slate-300">
          {[
            [
              `${formatKeyCode(controlSettings.keybinds.leanLeft)}/${formatKeyCode(controlSettings.keybinds.leanRight)}`,
              'เอียงหลบ',
            ],
            [
              `${formatKeyCode(controlSettings.keybinds.sprint)}+${formatKeyCode(controlSettings.keybinds.crouch)}`,
              'สไลด์',
            ],
            [formatKeyCode(controlSettings.keybinds.quickMelee), 'มีดด่วน'],
            [formatKeyCode(controlSettings.keybinds.reload), 'รีโหลด'],
            [formatKeyCode(controlSettings.keybinds.grenade), 'ระเบิด'],
            [formatKeyCode(controlSettings.keybinds.radio), 'วิทยุ'],
            [formatKeyCode(controlSettings.keybinds.inspect), 'ชมปืน'],
            [formatKeyCode(controlSettings.keybinds.toggleHud), 'ซ่อนแถบ'],
          ].map(([keyCap, label]) => (
            <span key={label} className="inline-flex items-center gap-1 whitespace-nowrap">
              <kbd className="font-mono-num font-bold text-amber-400 bg-white/8 border border-white/15 rounded px-1.5 py-0.5 text-[9px]">
                {keyCap}
              </kbd>
              <span className="text-slate-400">{label}</span>
            </span>
          ))}
        </div>
      )}

      {/* BOTTOM-RIGHT: Pro Weapon Telemetry (Ultra-Slim Tap-to-Reload Badge on Touch Mode) */}
      <div
        onClick={() => {
          if (controlSettings.touchControls) {
            engineRef.current?.triggerVirtualReload();
          }
        }}
        className={`pointer-events-auto fixed z-20 bg-[#090D16]/86 border border-white/14 rounded-md ${
          controlSettings.touchControls
            ? 'bottom-2 right-2 px-2 py-1.5 w-[108px] sm:w-[138px] space-y-1 cursor-pointer active:border-amber-400'
            : 'bottom-3 right-3 p-3.5 w-66 space-y-2'
        }`}
      >
        <div className="flex items-end justify-between gap-1">
          <div className="min-w-0">
            {!controlSettings.touchControls && (
              <div className="text-[10px] text-slate-400">{activeWeaponSpec.thaiCategory}</div>
            )}
            <div
              className={`font-display font-bold text-white leading-tight truncate ${
                controlSettings.touchControls ? 'text-[10px]' : 'text-sm'
              }`}
            >
              {controlSettings.touchControls
                ? activeWeaponSpec.name.split(' ')[0]
                : activeWeaponSpec.name}
            </div>
          </div>
          <div className="font-mono-num text-right shrink-0">
            {hud.weaponId === 'knife' ? (
              <span className="text-xs sm:text-sm font-bold text-amber-400">MELEE</span>
            ) : (
              <>
                <span
                  className={`font-bold leading-none ${
                    controlSettings.touchControls ? 'text-sm sm:text-base' : 'text-2xl'
                  } ${
                    hud.ammo === 0
                      ? 'text-red-400'
                      : hud.ammo <= Math.ceil(activeWeaponSpec.magSize * 0.25)
                        ? 'text-amber-300'
                        : 'text-amber-400'
                  }`}
                >
                  {hud.ammo}
                </span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 ml-0.5">/{hud.reserve}</span>
              </>
            )}
          </div>
        </div>

        {/* Visual Magazine Bullet Pips */}
        {hud.weaponId !== 'knife' && activeWeaponSpec.magSize > 0 && (
          <div className="flex items-center gap-[2px] h-1">
            {Array.from({ length: Math.min(24, activeWeaponSpec.magSize) }, (_, i) => {
              const totalPips = Math.min(24, activeWeaponSpec.magSize);
              const filled =
                activeWeaponSpec.magSize <= totalPips
                  ? i < hud.ammo
                  : i < Math.round((hud.ammo / activeWeaponSpec.magSize) * totalPips);
              return (
                <div
                  key={i}
                  className={`flex-1 h-full rounded-[1px] ${
                    filled ? 'bg-amber-400' : 'bg-white/12'
                  }`}
                />
              );
            })}
          </div>
        )}

        {!controlSettings.touchControls && (
          <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-white/10 text-[10px] font-mono-num">
            {(
              [
                [1, 'หลัก'],
                [2, 'พก'],
                [3, 'มีด'],
                [4, hud.hasGrenade ? 'ระเบิด' : 'หมด'],
              ] as const
            ).map(([slot, label]) => {
              const allowed = hud.allowedSlots.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={!allowed}
                  onClick={() => engineRef.current?.equipSlot(slot)}
                  className={`py-1 px-1 rounded text-center border transition-colors cursor-pointer ${
                    !allowed
                      ? 'bg-black/40 text-slate-600 border-white/5 line-through opacity-45 cursor-not-allowed'
                      : hud.slot === slot
                        ? 'bg-amber-500 text-[#090D16] border-amber-500 font-bold'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:border-amber-400/50'
                  }`}
                >
                  {slot} {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Zero-Overlap Icon-First Mobile Touch Controls Overlay */}
      <TouchControlsOverlay
        visible={controlSettings.touchControls && !showPauseOverlay && !isMatchEnded && !chatOpen}
        isAds={hud.isAds}
        crouch={hud.crouch}
        sliding={hud.sliding}
        sprintLocked={hud.sprintLocked}
        lean={hud.lean}
        hasGrenade={hud.hasGrenade}
        activeSlot={hud.slot}
        allowedSlots={hud.allowedSlots}
        primaryWeaponShort={
          WEAPONS[ruleSpec.forcedPrimary ?? meInRoom?.primaryWeapon ?? 'm4a1']?.name.split(' ')[0] ??
          'M4A1'
        }
        buttonScale={controlSettings.touchButtonScale}
        adsOnFire={controlSettings.adsOnFire}
        autoFire={controlSettings.autoFire}
        enemyInCrosshair={hud.enemyInCrosshair}
        onMove={(x, y) => engineRef.current?.setVirtualMove(x, y)}
        onSprintLockChange={(locked) => engineRef.current?.setVirtualSprintLock(locked)}
        onLook={(dx, dy) => engineRef.current?.applyVirtualLook(dx, dy)}
        onFireChange={(f) => engineRef.current?.setVirtualFire(f)}
        onFireWithAdsChange={(f) => engineRef.current?.setVirtualFireWithAds(f)}
        onToggleAds={() => engineRef.current?.toggleVirtualAds()}
        onToggleAutoFire={() => {
          soundEngine.playUiClick();
          onChangeControlSettings({
            ...controlSettings,
            autoFire: !controlSettings.autoFire,
          });
        }}
        onReload={() => engineRef.current?.triggerVirtualReload()}
        onJump={() => engineRef.current?.triggerVirtualJump()}
        onCrouchOrSlide={() => engineRef.current?.triggerVirtualCrouchOrSlide()}
        onLean={(dir) => engineRef.current?.setVirtualLean(dir)}
        onGrenade={() => engineRef.current?.triggerVirtualGrenade()}
        onQuickMelee={() => engineRef.current?.triggerVirtualQuickMelee()}
        onToggleRadio={() => engineRef.current?.toggleRadioMenu()}
        onEquipSlot={(slot) => engineRef.current?.equipSlot(slot)}
      />

      {/* Respawn Overlay */}
      {!hud.alive && !isMatchEnded && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-red-950/25">
          <div className="bg-[#0B0E14]/92 border border-red-500/35 rounded-lg px-8 py-5 text-center space-y-1.5">
            <div className="font-display text-xl font-bold text-red-400">คุณถูกสังหาร</div>
            <div className="text-sm text-slate-300">
              เกิดใหม่ในอีก{' '}
              <span className="font-mono-num font-bold text-white">
                {Math.max(0.1, hud.respawnTimer).toFixed(1)}
              </span>{' '}
              วินาที
            </div>
          </div>
        </div>
      )}

      {/* In-Game Chat Input Box */}
      {chatOpen && !isMatchEnded && (
        <div className="fixed bottom-36 left-4 z-40 w-80 bg-[#0B0E14]/95 border border-amber-500/50 rounded-md p-2">
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input
              type="text"
              autoFocus
              maxLength={140}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setChatOpen(false);
                }
              }}
              placeholder="พิมพ์แชทแล้วกด Enter..."
              className="flex-1 bg-transparent text-xs text-white outline-none px-1.5"
            />
            <button
              type="submit"
              className="px-2.5 py-1 text-xs font-semibold bg-amber-500 text-[#0B0E14] rounded cursor-pointer"
            >
              ส่ง
            </button>
          </form>
        </div>
      )}

      {/* TAB Live Scoreboard Overlay */}
      {showScoreboard && !isMatchEnded && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center p-6">
          <div className="bg-[#0B0E14]/94 border border-white/15 rounded-lg max-w-3xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="font-display text-lg font-bold text-white">
                {room.settings.name} · {MAPS[room.settings.mapId].name}
              </div>
              <div className="font-mono-num text-xs text-amber-400">รหัสห้อง {room.code}</div>
            </div>

            {room.settings.mode === 'tdm' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: 'VIPER UNIT', score: scores.red, list: redBoard, color: 'text-[#FFB020]' },
                  { title: 'TASK FORCE', score: scores.blue, list: blueBoard, color: 'text-[#4FD1FF]' },
                ].map((side) => (
                  <div
                    key={side.title}
                    className="bg-[#121723] border border-white/10 rounded-md overflow-hidden"
                  >
                    <div className="px-3.5 py-2 border-b border-white/10 flex justify-between items-center text-xs font-display font-bold">
                      <span className={side.color}>{side.title}</span>
                      <span className="font-mono-num text-white">{side.score}</span>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="text-slate-500 border-b border-white/6">
                        <tr>
                          <th className="py-1.5 px-3 text-left font-medium">ชื่อ</th>
                          <th className="py-1.5 px-2 text-right font-medium">K</th>
                          <th className="py-1.5 px-2 text-right font-medium">D</th>
                          <th className="py-1.5 px-2 text-right font-medium">HS</th>
                          <th className="py-1.5 px-3 text-right font-medium">แต้ม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {side.list.map((p) => (
                          <tr key={p.id} className={p.id === myId ? 'bg-amber-500/12' : ''}>
                            <td className="py-1.5 px-3 text-white">
                              <span className="inline-flex items-center gap-1.5 truncate max-w-[140px]">
                                <RankBadge exp={p.exp} size="sm" />
                                <span className="truncate">{p.name}</span>
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono-num text-emerald-400">
                              {p.kills}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono-num text-slate-400">
                              {p.deaths}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono-num text-amber-400">
                              {p.headshots}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono-num text-white">
                              {p.score}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#121723] border border-white/10 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="text-slate-500 border-b border-white/10">
                    <tr>
                      <th className="py-2 px-4 text-left font-medium">อันดับ / ชื่อ</th>
                      <th className="py-2 px-3 text-right font-medium">Kills</th>
                      <th className="py-2 px-3 text-right font-medium">Deaths</th>
                      <th className="py-2 px-3 text-right font-medium">Headshots</th>
                      <th className="py-2 px-4 text-right font-medium">คะแนน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {allBoard.map((p, idx) => (
                      <tr key={p.id} className={p.id === myId ? 'bg-amber-500/12' : ''}>
                        <td className="py-2 px-4 text-white">
                          <span className="font-mono-num text-slate-400 mr-2">#{idx + 1}</span>
                          {p.name}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num text-emerald-400">
                          {p.kills}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num text-slate-400">
                          {p.deaths}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num text-amber-400">
                          {p.headshots}
                        </td>
                        <td className="py-2 px-4 text-right font-mono-num text-white">
                          {p.score}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pause / Tactical Settings & Controls Overlay */}
      {showPauseOverlay && (
        <div className="fixed inset-0 z-30 bg-[#090C12]/80 flex items-center justify-center p-4">
          <div className="bg-[#121725] border border-white/15 rounded-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs text-amber-400 font-mono-num">
                  รหัสห้อง {room.code} · {MAPS[room.settings.mapId].name} · {ruleSpec.shortLabel}
                </div>
                <h2 className="font-display text-2xl font-bold text-white mt-0.5">
                  เมนูสนามรบ & ตั้งค่าการควบคุม
                </h2>
              </div>

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
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold cursor-pointer ${
                  controlSettings.touchControls
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-sky-500/15 border-sky-400/50 text-sky-300 hover:border-sky-300'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                {controlSettings.touchControls ? 'โหมดมือถือ (ปุ่มสัมผัส)' : 'โหมด Desktop (เมาส์+คีย์บอร์ด)'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPauseMenuOpen(false);
                  if (!controlSettings.touchControls) {
                    engineRef.current?.requestPointerLock();
                  }
                }}
                className="w-full py-3.5 px-5 bg-amber-500 hover:bg-amber-400 text-[#090C12] font-display font-bold text-base rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                {controlSettings.touchControls ? 'เล่นต่อด้วยปุ่มบนหน้าจอ' : 'คลิกเพื่อเล็งยิง (Resume)'}
              </button>

              {!controlSettings.touchControls ? (
                <button
                  type="button"
                  onClick={() => {
                    onChangeControlSettings({
                      ...controlSettings,
                      inputMode: 'mobile',
                      touchControls: true,
                    });
                    setPauseMenuOpen(false);
                  }}
                  className="w-full py-3.5 px-4 bg-white/10 hover:bg-white/15 text-white border border-white/15 font-display font-bold text-sm rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  สลับเป็นโหมดมือถือ (ปุ่มสัมผัส)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onChangeControlSettings({
                      ...controlSettings,
                      inputMode: 'desktop',
                      touchControls: false,
                    });
                    setPauseMenuOpen(false);
                    engineRef.current?.requestPointerLock();
                  }}
                  className="w-full py-3.5 px-4 bg-white/10 hover:bg-white/15 text-white border border-white/15 font-display font-bold text-sm rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  สลับเป็นโหมด Desktop (เมาส์+คีย์บอร์ด)
                </button>
              )}
            </div>

            {/* Weapon Switcher */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>เปลี่ยนอาวุธหลัก ({ruleSpec.shortLabel})</span>
                <span className="font-mono-num text-[11px] text-amber-400">
                  {room.settings.teamSize}v{room.settings.teamSize}
                </span>
              </div>
              {ruleSpec.forcedPrimary ||
              room.settings.weaponRule === 'pistol' ||
              room.settings.weaponRule === 'knife' ? (
                <div className="bg-[#090C12] border border-amber-500/30 rounded px-3 py-2 text-xs text-slate-300">
                  กติกาห้องนี้ล็อกอาวุธเป็น{' '}
                  <strong className="text-amber-400">{ruleSpec.label}</strong>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(ruleSpec.allowedPrimaries ?? PRIMARY_WEAPONS).map((wId) => (
                    <button
                      key={wId}
                      type="button"
                      onClick={() => handleChangeNextWeapon(wId)}
                      className={`py-2 px-2.5 text-xs font-semibold rounded border text-left transition-colors cursor-pointer truncate ${
                        meInRoom?.primaryWeapon === wId
                          ? 'bg-amber-500/18 border-amber-500 text-amber-300'
                          : 'bg-[#090C12] border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {WEAPONS[wId].name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Full Tabbed Controls, Keybinds, Crosshair Studio & 3D Graphics Settings */}
            <div className="border-t border-white/10 pt-4">
              <ControlsSettingsPanel
                settings={controlSettings}
                onChange={onChangeControlSettings}
                compact
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              {isHost ? (
                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-amber-400 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  กลับห้องรอเปลี่ยนแผนที่
                </button>
              ) : (
                <span className="text-xs text-slate-500">กด ESC เพื่อเปิดเมนูนี้ได้ตลอดเวลา</span>
              )}
              <button
                type="button"
                onClick={onLeaveRoom}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                ออกจากห้องรบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Match End Summary Screen */}
      {isMatchEnded && (
        <div className="fixed inset-0 z-40 bg-[#0B0E14]/90 flex items-center justify-center p-4">
          <div className="bg-[#131823] border border-white/15 rounded-lg max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="text-center space-y-1.5">
              <Trophy className="w-9 h-9 text-amber-400 mx-auto" />
              <h2 className="font-display text-3xl font-bold text-white">
                {room.winner?.type === 'team'
                  ? room.winner.team === 'red'
                    ? 'VIPER UNIT ชนะการรบ!'
                    : 'TASK FORCE ชนะการรบ!'
                  : room.winner?.type === 'player'
                    ? `${room.winner.playerName} คว้าแชมป์!`
                    : 'จบเกมเสมอกัน!'}
              </h2>
              <div className="text-xs text-slate-300">
                {room.settings.mode === 'tdm' && (
                  <span className="font-mono-num mr-2">
                    VIPER {room.scores.red} — {room.scores.blue} TASK FORCE ·
                  </span>
                )}
                MVP ประจำแมตช์:{' '}
                <span className="text-amber-400 font-semibold">
                  {room.winner?.mvpName ?? '-'} ({room.winner?.mvpKills ?? 0} Kills)
                </span>
              </div>
            </div>

            {/* Match EXP / SP Reward & Special Force Rank-Up Panel */}
            {matchReward && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#0B0F18] border border-amber-500/40 rounded-lg p-4 space-y-3"
              >
                {matchReward.rankedUp && (
                  <div className="bg-amber-500/15 border border-amber-400/50 rounded-md px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                      <div>
                        <div className="font-display font-bold text-amber-300 text-sm">
                          เลื่อนยศใหม่! (RANK UP!)
                        </div>
                        <div className="text-xs text-slate-200">
                          {SF_RANKS[matchReward.oldRankIndex]?.thaiName} →{' '}
                          <strong className="text-amber-400">
                            {SF_RANKS[matchReward.newRankIndex]?.thaiName}
                          </strong>
                        </div>
                      </div>
                    </div>
                    <RankBadge exp={matchReward.profile.exp} size="lg" />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <RankBadge exp={matchReward.profile.exp} size="md" />
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {getRankForExp(matchReward.profile.exp).rank.thaiName}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono-num">
                        ระดับบอท {BOT_DIFFICULTIES[room.settings.botDifficulty || 'easy'].label} (x
                        {matchReward.difficultyMult})
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 font-mono-num">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">ได้รับ EXP</div>
                      <div className="text-lg font-bold text-emerald-400 flex items-center gap-1">
                        <Award className="w-4 h-4" />+{matchReward.expGained}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">ได้รับแต้มซื้อชุด</div>
                      <div className="text-lg font-bold text-amber-400 flex items-center gap-1">
                        <Coins className="w-4 h-4" />+{matchReward.spGained} SP
                      </div>
                    </div>
                  </div>
                </div>

                {matchReward.stageBonusSp > 0 && (
                  <div className="text-xs text-emerald-300 font-medium pt-1 border-t border-white/8">
                    ผ่านด่านสำเร็จ! รับโบนัสพิเศษ +{matchReward.stageBonusExp} EXP และ +{matchReward.stageBonusSp} SP
                  </div>
                )}

                {(() => {
                  const prog = getRankForExp(matchReward.profile.exp);
                  return (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono-num">
                        <span>EXP รวม {matchReward.profile.exp.toLocaleString()}</span>
                        <span>
                          {prog.nextRank
                            ? `อีก ${(prog.expNeeded - prog.expIntoLevel).toLocaleString()} EXP ขึ้นยศ ${prog.nextRank.thaiName}`
                            : 'ยศสูงสุดแล้ว'}
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${prog.progressPct}%` }}
                          transition={{ duration: 0.6 }}
                          className="h-full bg-amber-500"
                        />
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            <div className="bg-[#0B0E14] border border-white/10 rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-medium">ผู้เล่น</th>
                    <th className="py-2.5 px-2 text-center font-medium">ทีม</th>
                    <th className="py-2.5 px-3 text-right font-medium">K</th>
                    <th className="py-2.5 px-3 text-right font-medium">D</th>
                    <th className="py-2.5 px-3 text-right font-medium">HS</th>
                    <th className="py-2.5 px-4 text-right font-medium">คะแนน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {[...room.players]
                    .sort((a, b) => b.score - a.score || b.kills - a.kills)
                    .map((p) => (
                      <tr key={p.id} className={p.id === myId ? 'bg-amber-500/12' : ''}>
                        <td className="py-2 px-4 text-white font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <RankBadge exp={p.exp} size="sm" />
                            <span>{p.name}</span>
                          </span>
                        </td>
                        <td
                          className={`py-2 px-2 text-center font-display font-bold ${
                            p.team === 'red' ? 'text-[#FFB020]' : 'text-[#4FD1FF]'
                          }`}
                        >
                          {p.team === 'red' ? 'VIPER' : 'TASK'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num text-emerald-400">
                          {p.kills}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num text-slate-400">
                          {p.deaths}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num text-amber-400">
                          {p.headshots}
                        </td>
                        <td className="py-2 px-4 text-right font-mono-num text-white">
                          {p.score}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                กลับหน้าหลัก
              </button>
              {isHost && (
                <>
                  <button
                    type="button"
                    onClick={onReturnToLobby}
                    className="px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 text-white rounded-md transition-colors cursor-pointer"
                  >
                    กลับห้องรอเปลี่ยนแผนที่
                  </button>
                  <button
                    type="button"
                    onClick={onStartRematch}
                    className="px-5 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-[#0B0E14] rounded-md transition-colors cursor-pointer"
                  >
                    เล่นใหม่อีกตา (Rematch)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
