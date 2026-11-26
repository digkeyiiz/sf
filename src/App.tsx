import { useEffect, useState } from 'react';
import { getSocket } from './lib/socket';
import { GuestLoginScreen } from './components/GuestLoginScreen';
import { LobbyBrowser } from './components/LobbyBrowser';
import { RoomLobby } from './components/RoomLobby';
import { MatchView } from './components/MatchView';
import { MobileLandscapeGuard } from './components/MobileLandscapeGuard';
import { PRIMARY_WEAPONS } from './shared/weapons';
import {
  loadControlSettings,
  saveControlSettings,
  type ControlSettings,
} from './shared/controls';
import type {
  BotDifficulty,
  CharacterLoadout,
  ChatMessage,
  GameMode,
  MapId,
  MatchRewardEvent,
  PlayerProfile,
  PrimaryWeaponId,
  RoomSettings,
  RoomState,
  RoomSummary,
  TeamId,
  TeamSize,
  WeaponRule,
} from './shared/types';

function loadSavedAccountId(): string | null {
  try {
    return localStorage.getItem('sf_account_id');
  } catch {
    return null;
  }
}

function loadSessionToken(): string {
  try {
    return localStorage.getItem('sf_session_token') || '';
  } catch {
    return '';
  }
}

function saveSessionStorage(profile: PlayerProfile, sessionToken?: string) {
  try {
    localStorage.setItem('sf_account_id', profile.accountId);
    localStorage.setItem('sf_callsign', profile.name);
    if (sessionToken) {
      localStorage.setItem('sf_session_token', sessionToken);
    }
  } catch {
    // ignore storage errors
  }
}

function clearSessionStorage() {
  try {
    localStorage.removeItem('sf_account_id');
    localStorage.removeItem('sf_session_token');
  } catch {
    // ignore
  }
}

function loadSavedWeapon(): PrimaryWeaponId {
  try {
    const saved = localStorage.getItem('sf_weapon') as PrimaryWeaponId | null;
    if (saved && PRIMARY_WEAPONS.includes(saved)) return saved;
  } catch {
    // ignore
  }
  return 'm4a1';
}

function getInitialRoomCodeFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').toUpperCase().slice(0, 8);
  } catch {
    return '';
  }
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState('');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [primaryWeapon, setPrimaryWeapon] = useState<PrimaryWeaponId>(loadSavedWeapon);
  const [controlSettings, setControlSettings] = useState<ControlSettings>(loadControlSettings);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
  const [matchReward, setMatchReward] = useState<MatchRewardEvent | null>(null);
  const [initialJoinCode] = useState<string>(getInitialRoomCodeFromUrl);

  const handleUpdateControlSettings = (next: ControlSettings) => {
    setControlSettings(next);
    saveControlSettings(next);
  };

  // Auto-restore remembered Guest Session on load
  useEffect(() => {
    const savedId = loadSavedAccountId();
    if (!savedId) {
      setAuthChecking(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/profile/${encodeURIComponent(savedId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && data.profile) {
          setProfile(data.profile);
          saveSessionStorage(data.profile, data.sessionToken);
        } else {
          clearSessionStorage();
        }
      })
      .catch(() => {
        // fallback to login screen
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoginGuest = async (opts: {
    name: string;
    starterUniformId: string;
    existingAccountId?: string;
  }) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (opts.existingAccountId) {
        const res = await fetch(`/api/profile/${encodeURIComponent(opts.existingAccountId)}`);
        const data = await res.json();
        if (!res.ok || !data?.ok || !data.profile) {
          setAuthError('ไม่พบรหัสผู้เยี่ยมชมนี้ในระบบ กรุณาตรวจสอบรหัส ID หรือสร้างตัวละครใหม่');
          return;
        }
        setProfile(data.profile);
        saveSessionStorage(data.profile, data.sessionToken);
        return;
      }

      const res = await fetch('/api/profile/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: opts.name,
          starterUniformId: opts.starterUniformId,
        }),
      });
      const data = await res.json();
      if (data?.ok && data.profile) {
        setProfile(data.profile);
        saveSessionStorage(data.profile, data.sessionToken);
      } else {
        setAuthError(data?.error || 'ไม่สามารถเข้าสู่ระบบผู้เยี่ยมชมได้');
      }
    } catch {
      setAuthError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRenameProfile = async (name: string) => {
    if (!profile) return;
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': loadSessionToken(),
        },
        body: JSON.stringify({ accountId: profile.accountId, name }),
      });
      const data = await res.json();
      if (data?.ok && data.profile) {
        setProfile(data.profile);
        saveSessionStorage(data.profile);
      }
    } catch {
      // ignore network error
    }
  };

  const handleEquipLoadout = async (loadout: CharacterLoadout) => {
    if (!profile) return;
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': loadSessionToken(),
        },
        body: JSON.stringify({ accountId: profile.accountId, loadout }),
      });
      const data = await res.json();
      if (data?.ok && data.profile) {
        setProfile(data.profile);
      }
    } catch {
      // ignore
    }
  };

  const handlePurchaseItem = async (itemId: string): Promise<string | null> => {
    if (!profile) return 'กรุณาเข้าสู่ระบบก่อน';
    try {
      const res = await fetch('/api/profile/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': loadSessionToken(),
        },
        body: JSON.stringify({ accountId: profile.accountId, itemId, autoEquip: true }),
      });
      const data = await res.json();
      if (data?.ok && data.profile) {
        setProfile(data.profile);
        return null;
      }
      return data?.error || 'ไม่สามารถซื้อไอเทมได้';
    } catch {
      return 'การเชื่อมต่อขัดข้อง';
    }
  };

  const handleSwitchAccount = () => {
    if (currentRoom) {
      getSocket().emit('room:leave');
      setCurrentRoom(null);
    }
    clearSessionStorage();
    setProfile(null);
    setAuthError(null);
  };

  const handleChangePrimaryWeapon = (w: PrimaryWeaponId) => {
    setPrimaryWeapon(w);
    try {
      localStorage.setItem('sf_weapon', w);
    } catch {
      // ignore
    }
    if (currentRoom) {
      getSocket().emit('room:setWeapon', w);
    }
  };

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      setSocketId(socket.id || '');
      socket.emit('rooms:refresh');
      const savedId = loadSavedAccountId();
      if (savedId) {
        socket.emit(
          'room:reconnect',
          { accountId: savedId },
          (res: { ok: boolean; room?: RoomState }) => {
            if (res?.ok && res.room) {
              setCurrentRoom(res.room);
            }
          }
        );
      }
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onRoomsList = (list: RoomSummary[]) => {
      setRooms(list);
    };

    const onRoomState = (state: RoomState) => {
      setCurrentRoom(state);
      if (state.status === 'playing' || state.status === 'waiting') {
        setMatchReward(null);
      }
    };

    const onChatMessage = (msg: ChatMessage) => {
      setCurrentRoom((prev) => {
        if (!prev) return prev;
        if (prev.chat.some((c) => c.id === msg.id)) return prev;
        return { ...prev, chat: [...prev.chat, msg].slice(-45) };
      });
    };

    const onMatchReward = (reward: MatchRewardEvent) => {
      setMatchReward(reward);
      if (reward?.profile) {
        setProfile(reward.profile);
        saveSessionStorage(reward.profile);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('rooms:list', onRoomsList);
    socket.on('room:state', onRoomState);
    socket.on('room:chatMessage', onChatMessage);
    socket.on('profile:matchReward', onMatchReward);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('rooms:list', onRoomsList);
      socket.off('room:state', onRoomState);
      socket.off('room:chatMessage', onChatMessage);
      socket.off('profile:matchReward', onMatchReward);
    };
  }, []);

  const handleCreateRoom = (opts: {
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
  }): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!profile) {
        resolve('กรุณาเข้าสู่ระบบผู้เยี่ยมชมก่อน');
        return;
      }
      const socket = getSocket();
      socket.emit(
        'room:create',
        {
          accountId: profile.accountId,
          playerName: profile.name,
          loadout: profile.loadout,
          primaryWeapon,
          ...opts,
        },
        (res: { ok: boolean; error?: string; room?: RoomState }) => {
          if (res?.ok && res.room) {
            setMatchReward(null);
            setCurrentRoom(res.room);
            resolve(null);
          } else {
            resolve(res?.error || 'ไม่สามารถสร้างห้องได้');
          }
        }
      );
    });
  };

  const handleJoinRoom = (code: string, password?: string): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!profile) {
        resolve('กรุณาเข้าสู่ระบบผู้เยี่ยมชมก่อน');
        return;
      }
      const socket = getSocket();
      socket.emit(
        'room:join',
        {
          code,
          password,
          accountId: profile.accountId,
          playerName: profile.name,
          loadout: profile.loadout,
          primaryWeapon,
        },
        (res: { ok: boolean; error?: string; room?: RoomState }) => {
          if (res?.ok && res.room) {
            setMatchReward(null);
            setCurrentRoom(res.room);
            resolve(null);
          } else {
            resolve(res?.error || 'ไม่สามารถเข้าร่วมห้องได้');
          }
        }
      );
    });
  };

  const handleQuickPlay = (mapId?: MapId): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!profile) {
        resolve('กรุณาเข้าสู่ระบบผู้เยี่ยมชมก่อน');
        return;
      }
      const socket = getSocket();
      socket.emit(
        'room:quickPlay',
        {
          accountId: profile.accountId,
          playerName: profile.name,
          loadout: profile.loadout,
          primaryWeapon,
          mapId,
        },
        (res: { ok: boolean; error?: string; room?: RoomState }) => {
          if (res?.ok && res.room) {
            setMatchReward(null);
            setCurrentRoom(res.room);
            resolve(null);
          } else {
            resolve(res?.error || 'ไม่สามารถจับคู่เล่นด่วนได้');
          }
        }
      );
    });
  };

  const handleLeaveRoom = () => {
    getSocket().emit('room:leave');
    setCurrentRoom(null);
    setMatchReward(null);
  };

  const renderContent = () => {
    if (authChecking) {
      return (
        <div className="min-h-screen bg-[#090C12] text-slate-300 flex items-center justify-center text-sm font-display">
          กำลังโหลดข้อมูลหน่วยรบ STRIKE OPS...
        </div>
      );
    }

    if (!profile) {
      return (
        <GuestLoginScreen
          loading={authLoading}
          error={authError}
          onLoginGuest={handleLoginGuest}
        />
      );
    }

    if (currentRoom) {
      if (currentRoom.status === 'playing' || currentRoom.status === 'ended') {
        return (
          <MatchView
            room={currentRoom}
            myId={socketId}
            myLoadout={profile.loadout}
            controlSettings={controlSettings}
            onChangeControlSettings={handleUpdateControlSettings}
            matchReward={matchReward}
            onLeaveRoom={handleLeaveRoom}
            onSetWeapon={handleChangePrimaryWeapon}
            onStartRematch={() => {
              setMatchReward(null);
              getSocket().emit('room:startMatch');
            }}
            onReturnToLobby={() => {
              setMatchReward(null);
              getSocket().emit('room:returnToLobby');
            }}
            onSendChat={(text) => getSocket().emit('room:chat', text)}
          />
        );
      }

      return (
        <RoomLobby
          room={currentRoom}
          myId={socketId}
          onLeave={handleLeaveRoom}
          onSwitchTeam={() => getSocket().emit('room:switchTeam')}
          onMoveSlot={(team: TeamId, slotIndex: number) =>
            getSocket().emit('room:moveSlot', { team, slotIndex })
          }
          onToggleReady={() => getSocket().emit('room:toggleReady')}
          onSetWeapon={handleChangePrimaryWeapon}
          onUpdateSettings={(patch: Partial<RoomSettings>) =>
            getSocket().emit('room:updateSettings', patch)
          }
          onStartMatch={() => getSocket().emit('room:startMatch')}
          onSendChat={(text) => getSocket().emit('room:chat', text)}
        />
      );
    }

    return (
      <LobbyBrowser
        connected={connected}
        profile={profile}
        controlSettings={controlSettings}
        onChangeControlSettings={handleUpdateControlSettings}
        onRenameProfile={handleRenameProfile}
        onEquipLoadout={handleEquipLoadout}
        onPurchaseItem={handlePurchaseItem}
        onSwitchAccount={handleSwitchAccount}
        primaryWeapon={primaryWeapon}
        onChangePrimaryWeapon={handleChangePrimaryWeapon}
        rooms={rooms}
        onRefreshRooms={() => getSocket().emit('rooms:refresh')}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onQuickPlay={handleQuickPlay}
        initialJoinCode={initialJoinCode}
      />
    );
  };

  return (
    <>
      {renderContent()}
      <MobileLandscapeGuard />
    </>
  );
}
