import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  Crown,
  Link2,
  Lock,
  LogOut,
  MapPin,
  Play,
  Send,
  Shield,
  UserPlus,
} from 'lucide-react';
import { MAPS, MAP_LIST } from '../shared/maps';
import {
  PRIMARY_WEAPONS,
  TEAM_SIZES,
  WEAPON_RULES,
  WEAPON_RULE_LIST,
  WEAPONS,
  getSlotPositionLabel,
} from '../shared/weapons';
import { BOT_DIFFICULTIES, BOT_DIFFICULTY_LIST } from '../shared/progression';
import type {
  BotDifficulty,
  GameMode,
  MapId,
  PrimaryWeaponId,
  RoomPlayer,
  RoomSettings,
  RoomState,
  TeamId,
  TeamSize,
  WeaponRule,
} from '../shared/types';
import { MAP_IMAGES } from '../lib/mapImages';
import { soundEngine } from '../game/sound';
import { RankBadge } from './RankBadge';

interface RoomLobbyProps {
  room: RoomState;
  myId: string;
  onLeave: () => void;
  onSwitchTeam: () => void;
  onMoveSlot: (team: TeamId, slotIndex: number) => void;
  onToggleReady: () => void;
  onSetWeapon: (w: PrimaryWeaponId) => void;
  onUpdateSettings: (patch: Partial<RoomSettings>) => void;
  onStartMatch: () => void;
  onSendChat: (text: string) => void;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  room,
  myId,
  onLeave,
  onSwitchTeam,
  onMoveSlot,
  onToggleReady,
  onSetWeapon,
  onUpdateSettings,
  onStartMatch,
  onSendChat,
}) => {
  const [chatText, setChatText] = useState('');
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const me = room.players.find((p) => p.id === myId);
  const isHost = Boolean(me?.isHost);
  const humanPlayers = room.players.filter((p) => !p.isBot);
  const mapInfo = MAPS[room.settings.mapId];
  const ruleSpec = WEAPON_RULES[room.settings.weaponRule] ?? WEAPON_RULES.all;
  const teamSize = room.settings.teamSize || 4;
  const maxAllowedBots = Math.max(0, teamSize * 2 - 1);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.chat.length]);

  const copyCode = () => {
    navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopiedType('code');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const copyInviteLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.code);
    navigator.clipboard?.writeText(url.toString()).catch(() => {});
    setCopiedType('link');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendChat(chatText.trim());
    setChatText('');
  };

  const findPlayerAt = (team: TeamId, slotIndex: number): RoomPlayer | undefined =>
    humanPlayers.find((p) => p.team === team && p.slotIndex === slotIndex);

  const handleClickSlot = (team: TeamId, slotIndex: number, occupant?: RoomPlayer) => {
    if (occupant) return;
    soundEngine.playUiClick();
    onMoveSlot(team, slotIndex);
  };

  const getWeaponDisplayForPlayer = (p: RoomPlayer) => {
    if (ruleSpec.forcedPrimary) return WEAPONS[ruleSpec.forcedPrimary].name;
    if (room.settings.weaponRule === 'pistol') return WEAPONS.deagle.name;
    if (room.settings.weaponRule === 'knife') return WEAPONS.knife.name;
    return WEAPONS[p.primaryWeapon]?.name ?? p.primaryWeapon;
  };

  const renderTeamColumn = (team: TeamId) => {
    const isViper = team === 'red';
    const teamPlayers = humanPlayers.filter((p) => p.team === team);
    const borderClass = isViper ? 'border-[#FFB020]/35' : 'border-[#4FD1FF]/35';
    const headerBg = isViper
      ? 'bg-gradient-to-r from-[#FFB020]/20 via-[#FFB020]/8 to-transparent border-b border-[#FFB020]/25'
      : 'bg-gradient-to-r from-[#4FD1FF]/20 via-[#4FD1FF]/8 to-transparent border-b border-[#4FD1FF]/25';
    const titleColor = isViper ? 'text-[#FFB020]' : 'text-[#4FD1FF]';
    const slotNumClass = isViper
      ? 'bg-[#FFB020]/15 text-[#FFB020] border-[#FFB020]/35'
      : 'bg-[#4FD1FF]/15 text-[#4FD1FF] border-[#4FD1FF]/35';
    const hoverEmptyClass = isViper
      ? 'hover:bg-[#FFB020]/[0.08] hover:border-[#FFB020]/45'
      : 'hover:bg-[#4FD1FF]/[0.08] hover:border-[#4FD1FF]/45';

    return (
      <div className={`bg-[#101522] border ${borderClass} rounded-lg overflow-hidden flex flex-col`}>
        <div className={`px-4 py-3 ${headerBg} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Shield className={`w-4 h-4 ${titleColor}`} />
            <h2 className={`font-display font-bold text-sm tracking-wide ${titleColor}`}>
              {isViper ? 'VIPER UNIT (หน่วยไวเปอร์)' : 'TASK FORCE (หน่วยเฉพาะกิจ)'}
            </h2>
          </div>
          <span className="font-mono-num text-xs text-slate-300">
            {teamPlayers.length} / {teamSize} ตำแหน่ง
          </span>
        </div>

        <div className="p-2.5 space-y-2">
          {Array.from({ length: teamSize }, (_, slotIndex) => {
            const occupant = findPlayerAt(team, slotIndex);
            const isMe = occupant?.id === myId;
            const laneLabel = getSlotPositionLabel(slotIndex);

            if (!occupant) {
              return (
                <motion.button
                  key={`${team}-slot-${slotIndex}`}
                  type="button"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleClickSlot(team, slotIndex)}
                  className={`w-full text-left px-3 py-2.5 rounded-md border border-dashed border-white/12 bg-[#0B0F18]/75 ${hoverEmptyClass} transition-colors flex items-center justify-between gap-3 cursor-pointer group`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-7 h-7 rounded border flex items-center justify-center font-mono-num text-xs font-bold shrink-0 ${slotNumClass}`}
                    >
                      #{slotIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-400 group-hover:text-white transition-colors truncate">
                        ตำแหน่งว่าง — คลิกเพื่อย้ายมาลงจุดนี้
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{laneLabel}</div>
                    </div>
                  </div>
                  <UserPlus className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0 transition-colors" />
                </motion.button>
              );
            }

            return (
              <motion.div
                key={`${team}-slot-${slotIndex}`}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`px-3 py-2.5 rounded-md border flex items-center justify-between gap-2.5 ${
                  isMe
                    ? 'bg-amber-500/[0.11] border-amber-500/70'
                    : 'bg-[#141B2B] border-white/10'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-7 h-7 rounded border flex items-center justify-center font-mono-num text-xs font-bold shrink-0 ${
                      isMe ? 'bg-amber-500 text-[#090C12] border-amber-400' : slotNumClass
                    }`}
                  >
                    #{slotIndex + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5 truncate">
                      <RankBadge exp={occupant.exp} size="sm" />
                      {occupant.isHost && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      <span className="truncate">{occupant.name}</span>
                      {isMe && <span className="text-[11px] text-amber-400 shrink-0">(คุณ)</span>}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {laneLabel} · <span className="text-slate-300">{getWeaponDisplayForPlayer(occupant)}</span>
                    </div>
                  </div>
                </div>

                <span
                  className={`text-xs font-semibold shrink-0 ${
                    occupant.isHost
                      ? 'text-amber-400'
                      : occupant.isReady
                        ? 'text-emerald-400'
                        : 'text-slate-500'
                  }`}
                >
                  {occupant.isHost ? 'หัวหน้าห้อง' : occupant.isReady ? 'พร้อมรบ' : 'รอพร้อม'}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  // 2D Tactical Spawn Blueprint projection helper
  const mapBounds = mapInfo.bounds;
  const spanX = mapBounds.maxX - mapBounds.minX;
  const spanZ = mapBounds.maxZ - mapBounds.minZ;
  const toSvgX = (wx: number) => ((wx - mapBounds.minX) / spanX) * 260 + 10;
  const toSvgY = (wz: number) => ((wz - mapBounds.minZ) / spanZ) * 150 + 10;

  return (
    <div className="min-h-screen bg-[#090C12] text-[#F3F4F6] flex flex-col">
      {/* Top Room Header */}
      <header className="bg-[#0E131F] border-b border-white/10 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-13 sm:h-15 flex items-center justify-between gap-2 sm:gap-5">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <h1 className="font-display text-sm sm:text-lg font-bold text-white truncate">
              {room.settings.name}
            </h1>
            <span className="hidden md:inline text-xs text-slate-400 whitespace-nowrap shrink-0">
              <span className="font-mono-num text-white font-semibold">
                {room.settings.mode === 'tdm' ? `${teamSize}v${teamSize}` : 'FFA'}
              </span>
              {' · '}
              <span className="text-amber-400 font-semibold">{ruleSpec.shortLabel}</span>
              {' · '}
              <span className="font-mono-num text-slate-200">{room.settings.targetKills}</span> Kills
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={copyCode}
              title="คัดลอกรหัสห้อง"
              className="flex items-center gap-1.5 bg-[#090C12] border border-white/15 hover:border-amber-400 rounded-md px-2.5 py-1.5 transition-colors cursor-pointer"
            >
              <span className="font-mono-num text-xs sm:text-sm font-bold text-amber-400 tracking-wider">
                {room.code}
              </span>
              {copiedType === 'code' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            <button
              type="button"
              onClick={copyInviteLink}
              title="คัดลอกลิงก์ชวนเพื่อน"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/15 text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedType === 'link' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {copiedType === 'link' ? 'คัดลอกแล้ว' : 'ลิงก์ชวน'}
              </span>
            </button>

            <button
              type="button"
              onClick={onLeave}
              title="ออกจากห้อง"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-red-400 border border-white/12 hover:border-red-500/40 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Tactical Waiting Room Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-5 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Left 8 Columns: Interactive Red vs Blue Slot Positioning + Weapon Rule Loadout + Chat */}
        <div className="lg:col-span-8 flex flex-col gap-3.5 sm:gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-300 flex items-center gap-1.5">
              <span>แตะช่องว่างเพื่อย้ายฝั่ง</span>
              <span className="text-slate-500">·</span>
              <span className="font-mono-num text-white font-semibold">
                {humanPlayers.length}/{room.settings.maxPlayers}
              </span>
              {room.settings.botCount > 0 && (
                <span className="text-slate-400 font-mono-num">
                  +{room.settings.botCount} บอท
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onSwitchTeam();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#131928] hover:bg-[#1B2336] border border-white/12 text-white rounded-md transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              สลับฝั่ง
            </button>
          </div>

          {/* Interactive Red Force vs Blue Force Numbered Slot Boards (Side-by-side even on mobile landscape sm+) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {renderTeamColumn('red')}
            {renderTeamColumn('blue')}
          </div>

          {/* Loadout Picker — Adapts to Active Same-Weapon Duel Rule */}
          <div className="bg-[#101522] border border-white/10 rounded-lg p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-white">
                  อาวุธที่ใช้ในการดวล — {ruleSpec.label}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{ruleSpec.description}</p>
              </div>
              <span className="font-mono-num text-xs text-amber-400 font-semibold">
                {ruleSpec.shortLabel}
              </span>
            </div>

            {ruleSpec.forcedPrimary || room.settings.weaponRule === 'pistol' || room.settings.weaponRule === 'knife' ? (
              <div className="bg-[#0B0F18] border border-amber-500/35 rounded-md p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-display text-sm font-bold text-white">
                      ล็อกอาวุธเท่าเทียมทุกคน:{' '}
                      <span className="text-amber-400">
                        {ruleSpec.forcedPrimary
                          ? WEAPONS[ruleSpec.forcedPrimary].name
                          : room.settings.weaponRule === 'pistol'
                            ? WEAPONS.deagle.name
                            : WEAPONS.knife.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {room.settings.weaponRule === 'knife'
                        ? 'ใช้มีด Combat Knife ประชิดล้วน 100%'
                        : 'ทุกคนได้รับอาวุธเดียวกัน พร้อมมีด Combat Knife สำหรับวิ่งสลับ'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {PRIMARY_WEAPONS.map((wId) => {
                  const w = WEAPONS[wId];
                  const allowed = !ruleSpec.allowedPrimaries || ruleSpec.allowedPrimaries.includes(wId);
                  const active = me?.primaryWeapon === wId && allowed;
                  return (
                    <button
                      key={wId}
                      type="button"
                      disabled={!allowed}
                      onClick={() => {
                        soundEngine.playUiClick();
                        onSetWeapon(wId);
                      }}
                      className={`p-3 rounded-md border text-left transition-colors ${
                        !allowed
                          ? 'bg-[#0A0D14] border-white/6 text-slate-600 opacity-45 cursor-not-allowed'
                          : active
                            ? 'bg-amber-500/15 border-amber-500 text-white cursor-pointer'
                            : 'bg-[#0B0F18] border-white/10 text-slate-300 hover:border-white/25 cursor-pointer'
                      }`}
                    >
                      <div className="font-display font-bold text-xs truncate">{w.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {w.thaiCategory}
                      </div>
                      <div className="font-mono-num text-[10px] text-amber-400 mt-1.5">
                        {w.pellets > 1 ? `${w.damage}x${w.pellets}` : `DMG ${w.damage}`} · MAG {w.magSize}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Room Chat */}
          <div className="bg-[#101522] border border-white/10 rounded-lg flex flex-col h-44">
            <div className="px-4 py-2 border-b border-white/8 text-xs font-semibold text-slate-300">
              แชทห้องรบ
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2.5 space-y-1.5 text-xs">
              {room.chat.map((m) => (
                <div key={m.id} className="leading-relaxed">
                  {m.system ? (
                    <span className="text-amber-400/90">{m.text}</span>
                  ) : (
                    <>
                      <span
                        className={`font-semibold mr-1.5 ${
                          m.team === 'red' ? 'text-[#FFB020]' : 'text-[#4FD1FF]'
                        }`}
                      >
                        {m.senderName}:
                      </span>
                      <span className="text-slate-200">{m.text}</span>
                    </>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleChatSubmit} className="p-2 border-t border-white/8 flex gap-2">
              <input
                type="text"
                maxLength={160}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="พิมพ์วางแผนกับเพื่อนในห้อง..."
                className="flex-1 bg-[#090C12] border border-white/12 focus:border-amber-500 rounded px-3 py-1.5 text-xs text-white outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded transition-colors cursor-pointer"
                aria-label="ส่งข้อความ"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Right 4 Columns: Map Preview + Live 2D Tactical Spawn Blueprint + Host Match Settings */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="bg-[#101522] border border-white/10 rounded-lg overflow-hidden">
            <div className="relative aspect-video bg-[#1A2130]">
              <img
                src={MAP_IMAGES[room.settings.mapId]}
                alt={mapInfo.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#090C12]/92 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <div className="font-display font-bold text-white text-lg">
                  {mapInfo.name}
                </div>
                <div className="text-xs text-slate-300">{mapInfo.thaiName}</div>
              </div>
            </div>

            {/* Live 2D Tactical Spawn Blueprint showing exact Red & Blue numbered deployment positions */}
            <div className="p-4 border-b border-white/10 bg-[#0B0F18] space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  แผนผังจุดลงสนาม (Spawn Blueprint)
                </span>
                {me && (
                  <span className="font-mono-num text-amber-400">
                    จุดของคุณ: {me.team === 'red' ? 'VIPER' : 'TASK FORCE'} #{me.slotIndex + 1}
                  </span>
                )}
              </div>

              <svg
                viewBox="0 0 280 170"
                className="w-full h-36 bg-[#070A10] border border-white/10 rounded"
              >
                {/* Map Cover Geometry */}
                {mapInfo.boxes
                  .filter((b) => !b.decorOnly)
                  .map((b, idx) => {
                    const rx = toSvgX(b.x - b.w * 0.5);
                    const ry = toSvgY(b.z - b.d * 0.5);
                    const rw = Math.max(2, (b.w / spanX) * 260);
                    const rh = Math.max(2, (b.d / spanZ) * 150);
                    return (
                      <rect
                        key={idx}
                        x={rx}
                        y={ry}
                        width={rw}
                        height={rh}
                        fill="rgba(148, 163, 184, 0.24)"
                      />
                    );
                  })}

                {/* RED Spawn Positions #1..teamSize */}
                {mapInfo.redSpawns.slice(0, teamSize).map((sp, i) => {
                  const cx = toSvgX(sp.x);
                  const cy = toSvgY(sp.z);
                  const isMySpot = me?.team === 'red' && me?.slotIndex === i;
                  const occupied = Boolean(findPlayerAt('red', i));
                  return (
                    <g
                      key={`red-sp-${i}`}
                      onClick={() => handleClickSlot('red', i, findPlayerAt('red', i))}
                      className={occupied ? '' : 'cursor-pointer'}
                    >
                      {isMySpot && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={11}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="1.8"
                          strokeDasharray="3 2"
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={7.5}
                        fill={isMySpot ? '#ffffff' : occupied ? '#FFB020' : 'rgba(255,176,32,0.35)'}
                        stroke="#FDE68A"
                        strokeWidth={occupied || isMySpot ? 1.4 : 0.8}
                      />
                      <text
                        x={cx}
                        y={cy + 3}
                        textAnchor="middle"
                        fill={isMySpot || occupied ? '#090C12' : '#ffffff'}
                        fontSize="8.5"
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {i + 1}
                      </text>
                    </g>
                  );
                })}

                {/* TASK FORCE Spawn Positions #1..teamSize */}
                {mapInfo.blueSpawns.slice(0, teamSize).map((sp, i) => {
                  const cx = toSvgX(sp.x);
                  const cy = toSvgY(sp.z);
                  const isMySpot = me?.team === 'blue' && me?.slotIndex === i;
                  const occupied = Boolean(findPlayerAt('blue', i));
                  return (
                    <g
                      key={`blue-sp-${i}`}
                      onClick={() => handleClickSlot('blue', i, findPlayerAt('blue', i))}
                      className={occupied ? '' : 'cursor-pointer'}
                    >
                      {isMySpot && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={11}
                          fill="none"
                          stroke="#4FD1FF"
                          strokeWidth="1.8"
                          strokeDasharray="3 2"
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={7.5}
                        fill={isMySpot ? '#ffffff' : occupied ? '#4FD1FF' : 'rgba(79,209,255,0.32)'}
                        stroke="#BAE6FD"
                        strokeWidth={occupied || isMySpot ? 1.4 : 0.8}
                      />
                      <text
                        x={cx}
                        y={cy + 3}
                        textAnchor="middle"
                        fill={isMySpot || occupied ? '#090C12' : '#ffffff'}
                        fontSize="8.5"
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {i + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <p className="text-[10px] text-slate-500">
                คลิกที่จุดเลขสีทอง (VIPER) หรือฟ้า (TASK FORCE) บนแผนผังเพื่อย้ายตำแหน่งเกิดได้โดยตรง
              </p>
            </div>

            {/* Host Live Room Settings */}
            <div className="p-4 space-y-3 text-xs">
              {/* Team Size Format */}
              <div className="space-y-1.5">
                <label className="text-slate-400 block">ขนาดทีม (Format)</label>
                {isHost ? (
                  <div className="grid grid-cols-5 gap-1.5">
                    {TEAM_SIZES.map((ts) => (
                      <button
                        key={ts}
                        type="button"
                        onClick={() => {
                          soundEngine.playUiClick();
                          onUpdateSettings({ teamSize: ts as TeamSize });
                        }}
                        className={`py-1.5 rounded border font-mono-num font-bold transition-colors cursor-pointer ${
                          teamSize === ts
                            ? 'bg-amber-500 text-[#090C12] border-amber-500'
                            : 'bg-[#090C12] text-slate-300 border-white/12 hover:border-white/30'
                        }`}
                      >
                        {ts}v{ts}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="font-mono-num font-semibold text-white">
                    {teamSize}v{teamSize} (สูงสุด {room.settings.maxPlayers} คน)
                  </div>
                )}
              </div>

              {/* Weapon Rule */}
              <div className="space-y-1.5">
                <label className="text-slate-400 block">กติกาอาวุธดวล (Weapon Rule)</label>
                {isHost ? (
                  <select
                    value={room.settings.weaponRule}
                    onChange={(e) =>
                      onUpdateSettings({ weaponRule: e.target.value as WeaponRule })
                    }
                    className="w-full bg-[#090C12] border border-white/15 rounded px-3 py-2 text-white outline-none"
                  >
                    {WEAPON_RULE_LIST.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="font-semibold text-amber-400">{ruleSpec.label}</div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 block">แผนที่สนามรบ</label>
                {isHost ? (
                  <select
                    value={room.settings.mapId}
                    onChange={(e) => onUpdateSettings({ mapId: e.target.value as MapId })}
                    className="w-full bg-[#090C12] border border-white/15 rounded px-3 py-2 text-white outline-none"
                  >
                    {MAP_LIST.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.thaiName})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="font-semibold text-white">
                    {mapInfo.name} ({mapInfo.thaiName})
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-slate-400 block">โหมด</label>
                  {isHost ? (
                    <select
                      value={room.settings.mode}
                      onChange={(e) => onUpdateSettings({ mode: e.target.value as GameMode })}
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-white outline-none"
                    >
                      <option value="tdm">Team (TDM)</option>
                      <option value="ffa">เดี่ยว (FFA)</option>
                    </select>
                  ) : (
                    <div className="font-semibold text-white">
                      {room.settings.mode === 'tdm' ? 'Team (TDM)' : 'เดี่ยว (FFA)'}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 block">เป้าหมาย (Kills)</label>
                  {isHost ? (
                    <select
                      value={room.settings.targetKills}
                      onChange={(e) => onUpdateSettings({ targetKills: Number(e.target.value) })}
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-white outline-none"
                    >
                      <option value={10}>10 Kills</option>
                      <option value={15}>15 Kills</option>
                      <option value={25}>25 Kills</option>
                      <option value={40}>40 Kills</option>
                      <option value={60}>60 Kills</option>
                    </select>
                  ) : (
                    <div className="font-mono-num font-semibold text-white">
                      {room.settings.targetKills} Kills
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-slate-400 block">จำนวนบอท (AI Bots)</label>
                  {isHost ? (
                    <select
                      value={Math.min(room.settings.botCount, maxAllowedBots)}
                      onChange={(e) => onUpdateSettings({ botCount: Number(e.target.value) })}
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-white outline-none"
                    >
                      <option value={0}>0 ตัว (PvP ล้วน)</option>
                      {Array.from({ length: maxAllowedBots }, (_, i) => i + 1)
                        .filter((n) => n <= 10)
                        .map((n) => (
                          <option key={n} value={n}>
                            {n} ตัว
                          </option>
                        ))}
                    </select>
                  ) : (
                    <div className="font-mono-num font-semibold text-white">
                      {room.settings.botCount} ตัว
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 block">ระดับความยากบอท</label>
                  {isHost ? (
                    <select
                      value={room.settings.botDifficulty || 'easy'}
                      onChange={(e) =>
                        onUpdateSettings({ botDifficulty: e.target.value as BotDifficulty })
                      }
                      className="w-full bg-[#090C12] border border-white/15 rounded px-2.5 py-2 text-white outline-none"
                    >
                      {BOT_DIFFICULTY_LIST.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label} ({d.expMult}x EXP)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="font-semibold text-amber-400">
                      {BOT_DIFFICULTIES[room.settings.botDifficulty || 'easy'].label}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Primary Start / Ready Button */}
          <div className="bg-[#101522] border border-white/10 rounded-lg p-5 space-y-3">
            {isHost ? (
              <>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={onStartMatch}
                  className="w-full py-3.5 px-5 bg-amber-500 hover:bg-amber-400 text-[#090C12] font-display font-bold text-base rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  เริ่มการรบ ({teamSize}v{teamSize} · {ruleSpec.shortLabel})
                </motion.button>
                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  แชร์รหัส <span className="font-mono-num text-amber-400">{room.code}</span> ให้เพื่อนเข้าร่วมหน่วย VIPER หรือ TASK FORCE ได้ทันที
                </p>
              </>
            ) : (
              <>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={onToggleReady}
                  className={`w-full py-3.5 px-5 font-display font-bold text-base rounded-md transition-colors cursor-pointer ${
                    me?.isReady
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-[#090C12]'
                  }`}
                >
                  {me?.isReady ? 'พร้อมรบแล้ว (คลิกเพื่อยกเลิก)' : 'กดพร้อมรบ (Ready)'}
                </motion.button>
                <p className="text-xs text-slate-400 text-center">
                  รอหัวหน้าห้องกดเริ่มการรบ
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
