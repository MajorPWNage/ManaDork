import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMockRoom } from '../data/mockRoom';
import { newId } from '../lib/id';
import { applyIntentToRoom } from '../lib/roomMutations';
import { buildRoomSettings } from '../lib/roomSettings';
import { hasSupabase, supabase } from '../lib/supabase';
import {
  HEARTBEAT_MS,
  RESYNC_MS,
  bumpRoomRevision,
  electNextHost,
  isHostHeartbeatStale,
  refreshRoomChecksum
} from '../lib/sync';
import {
  clearActiveRoom,
  clearSeatAssignment,
  loadActiveRoom,
  loadOrCreateClientId,
  loadRecentRooms,
  loadSeatAssignment,
  saveActiveRoom,
  saveSeatAssignment
} from '../lib/roomStorage';
import type {
  ConnectedClient,
  RoomSettings,
  RoomSnapshot,
  SyncBroadcastPayload,
  SyncIntent,
  SyncIntentEnvelope,
  SyncMode
} from '../types';

const ROOM_TABLE = 'rooms';

function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toUpperCase();
}

function normalizeRoomSnapshot(snapshot: RoomSnapshot | null): RoomSnapshot | null {
  if (!snapshot) {
    return null;
  }

  const settings =
    snapshot.settings ??
    buildRoomSettings({
      format: snapshot.format ?? 'commander',
      playerCount: snapshot.players?.length ?? 4,
      startingLife: snapshot.startingLife ?? 40
    });

  const normalized: RoomSnapshot = {
    ...snapshot,
    format: snapshot.format ?? settings.format,
    startingLife: snapshot.startingLife ?? settings.startingLife,
    settings,
    hostClientId: snapshot.hostClientId,
    revision: snapshot.revision ?? 1,
    checksum: snapshot.checksum ?? '',
    lastHeartbeatAt:
      snapshot.lastHeartbeatAt ?? snapshot.updatedAt ?? snapshot.createdAt ?? new Date().toISOString()
  };

  return normalized.checksum ? normalized : refreshRoomChecksum(normalized);
}

async function persistRoom(room: RoomSnapshot) {
  saveActiveRoom(room);

  if (!supabase || room.syncMode !== 'online') {
    return;
  }

  const { error } = await supabase
    .from(ROOM_TABLE)
    .update({
      room_name: room.roomName,
      format: room.format,
      starting_life: room.startingLife,
      game_state: room,
      updated_at: new Date().toISOString()
    })
    .eq('room_code', room.roomCode);

  if (error) {
    console.error('Failed to persist room', error);
  }
}

export function useRoomState() {
  const [room, setRoom] = useState<RoomSnapshot | null>(() =>
    normalizeRoomSnapshot(loadActiveRoom())
  );
  const [joinCode, setJoinCode] = useState('');
  const [recentRooms, setRecentRooms] = useState<string[]>(() => loadRecentRooms());
  const [status, setStatus] = useState<string>('Ready');
  const [connectedClients, setConnectedClients] = useState<Record<string, ConnectedClient>>({});
  const [focusedSeatId, setFocusedSeatId] = useState<string | null>(() => {
    const active = normalizeRoomSnapshot(loadActiveRoom());
    if (!active || active.syncMode !== 'online') {
      return null;
    }

    const localClientId = loadOrCreateClientId();
    const controlledSeat = active.players.find(
      (player) => player.controllerClientId === localClientId
    );

    return controlledSeat?.id ?? loadSeatAssignment(active.roomCode);
  });

  const clientId = useRef(loadOrCreateClientId());
  const roomSubRef = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);
  const syncChannelRef = useRef<any>(null);
  const roomRef = useRef<RoomSnapshot | null>(room);
  const heartbeatTimerRef = useRef<number | null>(null);
  const resyncTimerRef = useRef<number | null>(null);
  const lastHostHeartbeatRef = useRef<string | null>(null);
  const processedIntentIdsRef = useRef<Set<string>>(new Set());

  const isOnline = room?.syncMode === 'online';

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const hydrateRoom = useCallback((nextRoomInput: RoomSnapshot) => {
    const nextRoom = normalizeRoomSnapshot(nextRoomInput);
    if (!nextRoom) {
      return;
    }

    roomRef.current = nextRoom;
    setRoom(nextRoom);
    saveActiveRoom(nextRoom);
    setRecentRooms(loadRecentRooms());

    if (nextRoom.syncMode === 'online') {
      const controlledSeat = nextRoom.players.find(
        (player) => player.controllerClientId === clientId.current
      );
      const nextSeatId = controlledSeat?.id ?? loadSeatAssignment(nextRoom.roomCode);
      setFocusedSeatId(nextSeatId ?? null);

      if (nextSeatId) {
        saveSeatAssignment(nextRoom.roomCode, nextSeatId);
      }
    } else {
      setFocusedSeatId(null);
    }
  }, []);

  const updateRoom = useCallback(async (updater: (current: RoomSnapshot) => RoomSnapshot) => {
    setRoom((current) => {
      if (!current) {
        return current;
      }

      const next = normalizeRoomSnapshot(updater(current));
      if (!next) {
        return current;
      }

      roomRef.current = next;
      saveActiveRoom(next);
      void persistRoom(next);
      return next;
    });

    setRecentRooms(loadRecentRooms());
  }, []);

  const fetchRoomFromServer = useCallback(async (roomCode: string) => {
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from(ROOM_TABLE)
      .select('game_state')
      .eq('room_code', roomCode)
      .single();

    if (error || !data?.game_state) {
      return null;
    }

    return normalizeRoomSnapshot(data.game_state as RoomSnapshot);
  }, []);

  const isCurrentClientHost = useCallback((snapshot?: RoomSnapshot | null) => {
    const target = snapshot ?? roomRef.current;
    return Boolean(
      target && target.syncMode === 'online' && target.hostClientId === clientId.current
    );
  }, []);

  const forceResyncCheck = useCallback(async () => {
    const current = roomRef.current;
    if (!current || current.syncMode !== 'online') {
      return;
    }

    const serverRoom = await fetchRoomFromServer(current.roomCode);
    if (!serverRoom) {
      return;
    }

    const mismatch =
      current.revision !== serverRoom.revision ||
      current.checksum !== serverRoom.checksum ||
      current.hostClientId !== serverRoom.hostClientId;

    if (mismatch) {
      hydrateRoom(serverRoom);
      setStatus('Resynced with host');
    }
  }, [fetchRoomFromServer, hydrateRoom]);

  const sendHostHeartbeat = useCallback(async () => {
    const current = roomRef.current;
    if (!current || !isCurrentClientHost(current) || !syncChannelRef.current) {
      return;
    }

    const sentAt = new Date().toISOString();
    lastHostHeartbeatRef.current = sentAt;

    const payload: SyncBroadcastPayload = {
      type: 'host-heartbeat',
      roomCode: current.roomCode,
      hostClientId: clientId.current,
      revision: current.revision,
      checksum: current.checksum,
      sentAt
    };

    await syncChannelRef.current.send({
      type: 'broadcast',
      event: 'host-heartbeat',
      payload
    });
  }, [isCurrentClientHost]);

  const stopHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const stopResyncTimer = useCallback(() => {
    if (resyncTimerRef.current) {
      window.clearInterval(resyncTimerRef.current);
      resyncTimerRef.current = null;
    }
  }, []);

  const applyIntentAsHost = useCallback(
    async (envelope: SyncIntentEnvelope) => {
      const current = roomRef.current;
      if (!current || current.syncMode !== 'online' || !isCurrentClientHost(current)) {
        return;
      }

      const mutated = applyIntentToRoom(current, envelope);

      const next = normalizeRoomSnapshot(
        bumpRoomRevision({
          ...mutated,
          hostClientId: clientId.current,
          lastHeartbeatAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      );

      if (!next) {
        return;
      }

      hydrateRoom(next);
      await persistRoom(next);

      if (syncChannelRef.current) {
        const payload: SyncBroadcastPayload = {
          type: 'state-changed',
          roomCode: next.roomCode,
          hostClientId: clientId.current,
          revision: next.revision,
          checksum: next.checksum,
          sentAt: new Date().toISOString()
        };

        await syncChannelRef.current.send({
          type: 'broadcast',
          event: 'state-changed',
          payload
        });
      }
    },
    [hydrateRoom, isCurrentClientHost]
  );

  const maybeElectHost = useCallback(
    async (clients: Record<string, ConnectedClient>) => {
      const current = roomRef.current;
      if (!current || current.syncMode !== 'online') {
        return;
      }

      const latestHeartbeatAt = lastHostHeartbeatRef.current ?? current.lastHeartbeatAt;
      const hostPresent = current.hostClientId ? Boolean(clients[current.hostClientId]) : false;
      const hostStale = isHostHeartbeatStale(latestHeartbeatAt);

      if (hostPresent && !hostStale) {
        return;
      }

      const electedClientId = electNextHost(clients);
      if (!electedClientId || electedClientId !== clientId.current) {
        return;
      }

      const electedRoom = normalizeRoomSnapshot(
        bumpRoomRevision({
          ...current,
          hostClientId: clientId.current,
          lastHeartbeatAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      );

      if (!electedRoom) {
        return;
      }

      hydrateRoom(electedRoom);
      await persistRoom(electedRoom);

      if (syncChannelRef.current) {
        const payload: SyncBroadcastPayload = {
          type: 'host-elected',
          roomCode: electedRoom.roomCode,
          hostClientId: clientId.current,
          revision: electedRoom.revision,
          checksum: electedRoom.checksum,
          sentAt: new Date().toISOString()
        };

        await syncChannelRef.current.send({
          type: 'broadcast',
          event: 'host-elected',
          payload
        });
      }

      setStatus('You are now the host');
    },
    [hydrateRoom]
  );

  const handleHostHeartbeat = useCallback(
    async (payload: any) => {
      const current = roomRef.current;
      if (!current || current.syncMode !== 'online') {
        return;
      }

      lastHostHeartbeatRef.current = payload?.sentAt ?? new Date().toISOString();

      const mismatch =
        current.revision !== payload?.revision ||
        current.checksum !== payload?.checksum ||
        current.hostClientId !== payload?.hostClientId;

      if (mismatch) {
        await forceResyncCheck();
      }
    },
    [forceResyncCheck]
  );

  const handleStateChanged = useCallback(
    async (payload: any) => {
      const current = roomRef.current;
      if (!current || current.syncMode !== 'online') {
        return;
      }

      const mismatch =
        current.revision !== payload?.revision ||
        current.checksum !== payload?.checksum ||
        current.hostClientId !== payload?.hostClientId;

      if (mismatch) {
        await forceResyncCheck();
      }
    },
    [forceResyncCheck]
  );

  const handleHostElected = useCallback(
    async (payload: any) => {
      const current = roomRef.current;
      if (!current || current.syncMode !== 'online') {
        return;
      }

      const next = normalizeRoomSnapshot({
        ...current,
        hostClientId: payload?.hostClientId,
        lastHeartbeatAt: payload?.sentAt ?? new Date().toISOString(),
        revision: payload?.revision ?? current.revision,
        checksum: payload?.checksum ?? current.checksum
      });

      if (next) {
        hydrateRoom(next);
      }

      await forceResyncCheck();
    },
    [forceResyncCheck, hydrateRoom]
  );

  const handleIntent = useCallback(
    async (broadcast: any) => {
      const current = roomRef.current;
      if (!current || current.syncMode !== 'online') {
        return;
      }

      const envelope = broadcast?.payload as SyncIntentEnvelope | undefined;
      if (!envelope) {
        return;
      }

      if (!isCurrentClientHost(current)) {
        return;
      }

      if (processedIntentIdsRef.current.has(envelope.id)) {
        return;
      }

      processedIntentIdsRef.current.add(envelope.id);

      if (processedIntentIdsRef.current.size > 200) {
        const trimmed = Array.from(processedIntentIdsRef.current).slice(-100);
        processedIntentIdsRef.current = new Set(trimmed);
      }

      await applyIntentAsHost(envelope);
    },
    [applyIntentAsHost, isCurrentClientHost]
  );

  const subscribeToRoom = useCallback(
    async (roomCode: string, displayName = 'Guest') => {
      if (!supabase) {
        return;
      }

      roomSubRef.current?.unsubscribe?.();
      presenceChannelRef.current?.unsubscribe?.();
      syncChannelRef.current?.unsubscribe?.();

      roomSubRef.current = supabase
        .channel(`room-row:${roomCode}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: ROOM_TABLE,
            filter: `room_code=eq.${roomCode}`
          },
          (payload: any) => {
            const nextRoom = normalizeRoomSnapshot(payload.new?.game_state as RoomSnapshot);
            if (nextRoom) {
              hydrateRoom(nextRoom);
            }
          }
        )
        .subscribe();

      const presenceChannel = supabase.channel(`room-presence:${roomCode}`, {
        config: {
          presence: {
            key: clientId.current
          }
        }
      });

      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState() as Record<string, ConnectedClient[]>;
          const next: Record<string, ConnectedClient> = {};

          Object.entries(state).forEach(([key, value]) => {
            const first = value[0];
            if (first) {
              next[key] = {
                clientId: key,
                name: first.name ?? 'Guest',
                seatId: first.seatId,
                joinedAt: first.joinedAt ?? new Date().toISOString()
              };
            }
          });

          setConnectedClients(next);
          void maybeElectHost(next);
        })
        .subscribe(async (subscribeStatus: string) => {
          if (subscribeStatus === 'SUBSCRIBED') {
            await presenceChannel.track({
              clientId: clientId.current,
              name: displayName,
              seatId: focusedSeatId ?? undefined,
              joinedAt: new Date().toISOString()
            });
          }
        });

      presenceChannelRef.current = presenceChannel;

      const syncChannel = supabase
        .channel(`room-sync:${roomCode}`)
        .on('broadcast', { event: 'host-heartbeat' }, ({ payload }: any) => {
          void handleHostHeartbeat(payload);
        })
        .on('broadcast', { event: 'state-changed' }, ({ payload }: any) => {
          void handleStateChanged(payload);
        })
        .on('broadcast', { event: 'intent' }, ({ payload }: any) => {
          void handleIntent(payload);
        })
        .on('broadcast', { event: 'host-elected' }, ({ payload }: any) => {
          void handleHostElected(payload);
        })
        .subscribe();

      syncChannelRef.current = syncChannel;
    },
    [
      focusedSeatId,
      handleHostHeartbeat,
      handleHostElected,
      handleIntent,
      handleStateChanged,
      hydrateRoom,
      maybeElectHost
    ]
  );

  const claimSeat = useCallback(
    async (nextRoomInput: RoomSnapshot, preferredSeatId?: string) => {
      const nextRoom = normalizeRoomSnapshot(nextRoomInput);
      if (!nextRoom || nextRoom.syncMode !== 'online') {
        return null;
      }

      const alreadyControlled = nextRoom.players.find(
        (player) => player.controllerClientId === clientId.current
      );
      if (alreadyControlled) {
        saveSeatAssignment(nextRoom.roomCode, alreadyControlled.id);
        setFocusedSeatId(alreadyControlled.id);
        return alreadyControlled.id;
      }

      const savedSeatId = loadSeatAssignment(nextRoom.roomCode);
      const preferred = preferredSeatId ?? savedSeatId ?? undefined;

      const requestedSeat = preferred
        ? nextRoom.players.find(
            (player) =>
              player.id === preferred &&
              (!player.controllerClientId || player.controllerClientId === clientId.current)
          )
        : null;

      const openSeat =
        requestedSeat ?? nextRoom.players.find((player) => !player.controllerClientId) ?? null;

      if (!openSeat) {
        return null;
      }

      const claimedRoom = normalizeRoomSnapshot(
        bumpRoomRevision({
          ...nextRoom,
          players: nextRoom.players.map((player) =>
            player.id === openSeat.id
              ? {
                  ...player,
                  controllerClientId: clientId.current
                }
              : player
          ),
          updatedAt: new Date().toISOString()
        })
      );

      if (!claimedRoom) {
        return null;
      }

      hydrateRoom(claimedRoom);
      saveSeatAssignment(claimedRoom.roomCode, openSeat.id);
      await persistRoom(claimedRoom);
      return openSeat.id;
    },
    [hydrateRoom]
  );

  const createRoom = useCallback(
    async (mode: SyncMode, settingsInput: Partial<RoomSettings> = {}) => {
      const baseRoom = createMockRoom(settingsInput);

      const nextRoom = normalizeRoomSnapshot(
        refreshRoomChecksum({
          ...baseRoom,
          syncMode: mode,
          hostClientId: mode === 'online' ? clientId.current : undefined,
          lastHeartbeatAt: new Date().toISOString(),
          actionLog: mode === 'online' ? [] : baseRoom.actionLog
        })
      );

      if (!nextRoom) {
        return;
      }

      hydrateRoom(nextRoom);
      setStatus(mode === 'online' ? 'Creating synced room…' : 'Created local room');

      if (mode === 'online' && supabase) {
        const { error } = await supabase.from(ROOM_TABLE).insert({
          room_code: nextRoom.roomCode,
          room_name: nextRoom.roomName,
          format: nextRoom.format,
          starting_life: nextRoom.startingLife,
          game_state: nextRoom
        });

        if (error) {
          console.error(error);
          setStatus('Supabase insert failed, using local mode instead');

          const fallback = normalizeRoomSnapshot({
            ...nextRoom,
            syncMode: 'local',
            hostClientId: undefined
          });

          if (fallback) {
            hydrateRoom(fallback);
          }
          return;
        }

        await subscribeToRoom(nextRoom.roomCode, 'Host');
        await claimSeat(nextRoom, nextRoom.players[0]?.id);
        setStatus('Synced room ready');
      }
    },
    [claimSeat, hydrateRoom, subscribeToRoom]
  );

  const joinRoom = useCallback(
    async (roomCode: string) => {
      const normalizedCode = normalizeRoomCode(roomCode);
      setJoinCode(normalizedCode);

      if (!supabase) {
        setStatus('Supabase is not configured. Join works after env vars are added.');
        return;
      }

      setStatus(`Joining ${normalizedCode}…`);

      const serverRoom = await fetchRoomFromServer(normalizedCode);

      if (!serverRoom) {
        setStatus('Room not found');
        return;
      }

      hydrateRoom(serverRoom);
      await subscribeToRoom(normalizedCode, 'Guest');
      await claimSeat(serverRoom);
      setStatus('Joined synced room');
    },
    [claimSeat, fetchRoomFromServer, hydrateRoom, subscribeToRoom]
  );

  const sendIntent = useCallback(
    async (intent: SyncIntent, actorName = 'You') => {
      const current = roomRef.current;
      if (!current) {
        return;
      }

      const envelope: SyncIntentEnvelope = {
        id: newId(),
        clientId: clientId.current,
        actorName,
        sentAt: new Date().toISOString(),
        intent
      };

      if (current.syncMode === 'local') {
        const next = normalizeRoomSnapshot(
          bumpRoomRevision({
            ...applyIntentToRoom(current, envelope),
            updatedAt: new Date().toISOString()
          })
        );

        if (!next) {
          return;
        }

        hydrateRoom(next);
        await persistRoom(next);
        return;
      }

      if (isCurrentClientHost(current)) {
        await applyIntentAsHost(envelope);
        return;
      }

      if (!syncChannelRef.current) {
        setStatus('Sync channel unavailable, attempting resync…');
        await forceResyncCheck();
        return;
      }

      const payload: SyncBroadcastPayload = {
        type: 'intent',
        roomCode: current.roomCode,
        payload: envelope
      };

      await syncChannelRef.current.send({
        type: 'broadcast',
        event: 'intent',
        payload
      });

      setStatus('Sent to host…');
    },
    [applyIntentAsHost, forceResyncCheck, hydrateRoom, isCurrentClientHost]
  );

  const adjustLife = useCallback(
    async (seatId: string, amount: number, actor = 'You') => {
      await sendIntent({ kind: 'life', seatId, amount }, actor);
    },
    [sendIntent]
  );

  const adjustPoison = useCallback(
    async (seatId: string, amount: number, actor = 'You') => {
      await sendIntent({ kind: 'poison', seatId, amount }, actor);
    },
    [sendIntent]
  );

  const adjustCommanderTax = useCallback(
    async (seatId: string, commanderIndex: number, amount: number, actor = 'You') => {
      await sendIntent({ kind: 'commander_tax', seatId, commanderIndex, amount }, actor);
    },
    [sendIntent]
  );

  const adjustCommanderDamage = useCallback(
    async (targetSeatId: string, sourceCommanderKey: string, amount: number, actor = 'You') => {
      await sendIntent(
        { kind: 'commander_damage', targetSeatId, sourceCommanderKey, amount },
        actor
      );
    },
    [sendIntent]
  );

  const renamePlayer = useCallback(
    async (seatId: string, playerName: string) => {
      await sendIntent({ kind: 'rename_player', seatId, playerName }, 'You');
    },
    [sendIntent]
  );

  const setTurnSeatIndex = useCallback(
    async (seatIndex: number) => {
      await sendIntent({ kind: 'set_turn', seatIndex }, 'System');
    },
    [sendIntent]
  );

  const resetGame = useCallback(async () => {
    await sendIntent({ kind: 'reset_game' }, 'System');
    setStatus('Game reset');
  }, [sendIntent]);

  const newGameWithSettings = useCallback(
    async (settings: Partial<RoomSettings>) => {
      await sendIntent({ kind: 'new_game_with_settings', settings }, 'System');
      setStatus('New game ready');
    },
    [sendIntent]
  );

  const revertLogAction = useCallback(
    async (actionId: string) => {
      await sendIntent({ kind: 'revert_log_action', actionId }, 'System');
    },
    [sendIntent]
  );

  const leaveRoom = useCallback(() => {
    const activeRoom = roomRef.current;

    if (activeRoom?.syncMode === 'online') {
      const releasedRoom = normalizeRoomSnapshot(
        bumpRoomRevision({
          ...activeRoom,
          hostClientId:
            activeRoom.hostClientId === clientId.current ? undefined : activeRoom.hostClientId,
          players: activeRoom.players.map((player) =>
            player.controllerClientId === clientId.current
              ? { ...player, controllerClientId: undefined }
              : player
          ),
          updatedAt: new Date().toISOString()
        })
      );

      if (releasedRoom) {
        void persistRoom(releasedRoom);
      }

      clearSeatAssignment(activeRoom.roomCode);
    }

    roomSubRef.current?.unsubscribe?.();
    presenceChannelRef.current?.unsubscribe?.();
    syncChannelRef.current?.unsubscribe?.();

    roomSubRef.current = null;
    presenceChannelRef.current = null;
    syncChannelRef.current = null;

    stopHeartbeatTimer();
    stopResyncTimer();

    clearActiveRoom();
    roomRef.current = null;
    setRoom(null);
    setConnectedClients({});
    setJoinCode('');
    setFocusedSeatId(null);
    setStatus('Back in lobby');
  }, [stopHeartbeatTimer, stopResyncTimer]);

  useEffect(() => {
    if (!room || room.syncMode !== 'online') {
      return;
    }

    const controlledSeat = room.players.find(
      (player) => player.controllerClientId === clientId.current
    );

    if (controlledSeat) {
      if (focusedSeatId !== controlledSeat.id) {
        setFocusedSeatId(controlledSeat.id);
        saveSeatAssignment(room.roomCode, controlledSeat.id);
      }
      return;
    }

    void claimSeat(room);
  }, [claimSeat, focusedSeatId, room]);

  useEffect(() => {
    if (!presenceChannelRef.current || !room || room.syncMode !== 'online') {
      return;
    }

    const controlledSeat =
      room.players.find((player) => player.controllerClientId === clientId.current) ??
      room.players.find((player) => player.id === focusedSeatId);

    void presenceChannelRef.current.track({
      clientId: clientId.current,
      name: controlledSeat?.playerName ?? 'Guest',
      seatId: controlledSeat?.id,
      joinedAt: new Date().toISOString()
    });
  }, [focusedSeatId, room]);

  useEffect(() => {
    if (!room || room.syncMode !== 'online') {
      stopResyncTimer();
      return;
    }

    stopResyncTimer();
    resyncTimerRef.current = window.setInterval(() => {
      void forceResyncCheck();
    }, RESYNC_MS);

    void forceResyncCheck();

    return () => {
      stopResyncTimer();
    };
  }, [forceResyncCheck, room?.roomCode, room?.syncMode, stopResyncTimer]);

  useEffect(() => {
    if (!room || room.syncMode !== 'online' || room.hostClientId !== clientId.current) {
      stopHeartbeatTimer();
      return;
    }

    stopHeartbeatTimer();
    void sendHostHeartbeat();

    heartbeatTimerRef.current = window.setInterval(() => {
      void sendHostHeartbeat();
    }, HEARTBEAT_MS);

    return () => {
      stopHeartbeatTimer();
    };
  }, [
    room?.hostClientId,
    room?.roomCode,
    room?.syncMode,
    sendHostHeartbeat,
    stopHeartbeatTimer
  ]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void forceResyncCheck();
      }
    };

    const onOnline = () => {
      void forceResyncCheck();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [forceResyncCheck]);

  useEffect(() => {
    return () => {
      roomSubRef.current?.unsubscribe?.();
      presenceChannelRef.current?.unsubscribe?.();
      syncChannelRef.current?.unsubscribe?.();
      stopHeartbeatTimer();
      stopResyncTimer();
    };
  }, [stopHeartbeatTimer, stopResyncTimer]);

  const connectedCount = useMemo(
    () => Object.keys(connectedClients).length,
    [connectedClients]
  );

  return {
    room,
    joinCode,
    setJoinCode,
    createRoom,
    joinRoom,
    adjustLife,
    adjustPoison,
    adjustCommanderTax,
    adjustCommanderDamage,
    renamePlayer,
    resetGame,
    newGameWithSettings,
    revertLogAction,
    status,
    recentRooms,
    connectedClients,
    connectedCount,
    isOnline: Boolean(isOnline),
    hasSupabase,
    setTurnSeatIndex,
    leaveRoom,
    focusedSeatId
  };
}