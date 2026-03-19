import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMockRoom } from '../data/mockRoom';
import { newId } from '../lib/id';
import { hasSupabase, supabase } from '../lib/supabase';
import { buildRoomSettings } from '../lib/roomSettings';
import { normalizeRoomSnapshot } from '../lib/normalizeRoom';
import {
  clearActiveRoom,
  clearRoomRole,
  clearSeatAssignment,
  loadActiveRoom,
  loadOrCreateClientId,
  loadRecentRooms,
  loadRoomRole,
  loadSeatAssignment,
  saveActiveRoom,
  saveRoomRole,
  saveSeatAssignment
} from '../lib/roomStorage';
import type {
  ClientRoomRole,
  GameAction,
  GameActionUndo,
  PlayerSeat,
  RoomSettings,
  RoomSnapshot,
  SyncMode
} from '../types';

const ROOM_TABLE = 'rooms';
const seatColors = ['#a855f7', '#38bdf8', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#eab308', '#6366f1'];

type PresenceEntry = {
  name: string;
  seatId?: string;
  joinedAt?: string;
};

function stampAction(
  actor: string,
  description: string,
  options?: {
    reversible?: boolean;
    undo?: GameActionUndo;
  }
): GameAction {
  return {
    id: newId(),
    actor,
    description,
    createdAt: new Date().toISOString(),
    reversible: options?.reversible ?? false,
    undo: options?.undo
  };
}

function clonePlayers(players: PlayerSeat[]) {
  return players.map((player) => ({
    ...player,
    commanderNames: [...player.commanderNames],
    commanderTax: [...player.commanderTax],
    commanderDamageTaken: { ...player.commanderDamageTaken }
  }));
}

function pushUndo(room: RoomSnapshot): RoomSnapshot['undoStack'][number] {
  return {
    players: clonePlayers(room.players),
    actionLog: [...room.actionLog],
    turnSeatIndex: room.turnSeatIndex
  };
}

function withChange(
  room: RoomSnapshot,
  actor: string,
  description: string,
  mutate: (draftPlayers: PlayerSeat[]) => PlayerSeat[],
  options?: {
    reversible?: boolean;
    undo?: GameActionUndo;
  }
): RoomSnapshot {
  const players = mutate(clonePlayers(room.players));

  return {
    ...room,
    players,
    actionLog: [stampAction(actor, description, options), ...room.actionLog].slice(0, 40),
    undoStack: [pushUndo(room), ...room.undoStack].slice(0, 12),
    updatedAt: new Date().toISOString()
  };
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toUpperCase();
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
  const [room, setRoom] = useState<RoomSnapshot | null>(() => loadActiveRoom());
  const [joinCode, setJoinCode] = useState('');
  const [recentRooms, setRecentRooms] = useState<string[]>(() => loadRecentRooms());
  const [status, setStatus] = useState<string>('Ready');
  const [connectedClients, setConnectedClients] = useState<Record<string, PresenceEntry>>({});
  const [clientRoomRole, setClientRoomRole] = useState<ClientRoomRole>(() => {
  const active = loadActiveRoom();
    if (!active || active.syncMode !== 'online') {
      return 'player';
    }

    return loadRoomRole(active.roomCode) ?? 'player';
  });
  const [focusedSeatId, setFocusedSeatId] = useState<string | null>(() => {
    const active = loadActiveRoom();
    if (!active || active.syncMode !== 'online') {
      return null;
    }

    const clientId = loadOrCreateClientId();
    const controlledSeat = active.players.find((player) => player.controllerClientId === clientId);
    return controlledSeat?.id ?? loadSeatAssignment(active.roomCode);
  });

  const clientId = useRef(loadOrCreateClientId());
  const presenceChannelRef = useRef<any>(null);
  const roomSubRef = useRef<any>(null);

  const isOnline = room?.syncMode === 'online';

  const hydrateRoom = useCallback((nextRoom: RoomSnapshot) => {
    const normalizedRoom = normalizeRoomSnapshot(nextRoom);

    setRoom(normalizedRoom);
    saveActiveRoom(normalizedRoom);
    setRecentRooms(loadRecentRooms());

    if (normalizedRoom.syncMode === 'online') {
      const localRole = loadRoomRole(normalizedRoom.roomCode) ?? clientRoomRole;
      setClientRoomRole(localRole);

      if (localRole === 'host') {
        setFocusedSeatId(null);
      } else {
        const controlledSeat = normalizedRoom.players.find(
          (player) => player.controllerClientId === clientId.current
        );
        const nextSeatId = controlledSeat?.id ?? loadSeatAssignment(normalizedRoom.roomCode);
        setFocusedSeatId(nextSeatId ?? null);

        if (nextSeatId) {
          saveSeatAssignment(normalizedRoom.roomCode, nextSeatId);
        }
      }
    } else {
      setFocusedSeatId(null);
      setClientRoomRole('player');
    }
  }, []);

  const claimSeat = useCallback(
    async (nextRoom: RoomSnapshot, preferredSeatId?: string) => {
      if (nextRoom.syncMode !== 'online') {
        return null;
      }
      const localRole = loadRoomRole(nextRoom.roomCode) ?? clientRoomRole;

      if (localRole === 'host') {
        setFocusedSeatId(null);
        return null;
      }

      const alreadyControlled = nextRoom.players.find((player) => player.controllerClientId === clientId.current);
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
        requestedSeat ??
        nextRoom.players.find((player) => !player.controllerClientId) ??
        nextRoom.players[0];

      if (!openSeat) {
        return null;
      }

      const claimedRoom: RoomSnapshot = {
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
      };

      hydrateRoom(claimedRoom);
      saveSeatAssignment(claimedRoom.roomCode, openSeat.id);
      await persistRoom(claimedRoom);
      return openSeat.id;
    },
    [hydrateRoom]
  );

  const subscribeToRoom = useCallback(
    async (roomCode: string, displayName = 'Guest') => {
      if (!supabase) {
        return;
      }

      roomSubRef.current?.unsubscribe?.();
      presenceChannelRef.current?.unsubscribe?.();

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
            const nextRoom = payload.new?.game_state;
              if (nextRoom) {
                hydrateRoom(normalizeRoomSnapshot(nextRoom));
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
          const state = presenceChannel.presenceState() as Record<string, PresenceEntry[]>;
          const next: Record<string, PresenceEntry> = {};

          Object.entries(state).forEach(([key, value]) => {
            const first = value[0];
            if (first) {
              next[key] = first;
            }
          });

          setConnectedClients(next);
        })
        .subscribe(async (subscribeStatus: string) => {
          if (subscribeStatus === 'SUBSCRIBED') {
            await presenceChannel.track({
              name: displayName,
              seatId: focusedSeatId ?? undefined,
              role: loadRoomRole(roomCode) ?? clientRoomRole,
              joinedAt: new Date().toISOString()
            });
          }
        });

      presenceChannelRef.current = presenceChannel;
    },
    [focusedSeatId, hydrateRoom]
  );

  const createRoom = useCallback(
  async (
    mode: SyncMode,
    settingsInput: Partial<RoomSettings> = {},
    role: ClientRoomRole = 'player'
  ) => {
    const baseRoom = createMockRoom(settingsInput);

    const nextRoom: RoomSnapshot = {
      ...baseRoom,
      syncMode: mode,
      actionLog: [stampAction('System', `${mode === 'online' ? 'Online' : 'Local'} room created`)]
    };

    hydrateRoom(nextRoom);
    if (mode === 'online') {
      saveRoomRole(nextRoom.roomCode, role);
      setClientRoomRole(role);
    }
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

        const fallback: RoomSnapshot = {
          ...nextRoom,
          syncMode: 'local'
        };

        hydrateRoom(fallback);
        return;
      }

      await subscribeToRoom(nextRoom.roomCode, 'Host');
      if (role !== 'host') {
        await claimSeat(nextRoom, nextRoom.players[0]?.id);
      }
      setStatus('Synced room ready');
    }
  },
  [claimSeat, hydrateRoom, subscribeToRoom]
);

  const joinRoom = useCallback(
    async (roomCode: string) => {
      const normalized = normalizeRoomCode(roomCode);
      setJoinCode(normalized);
      saveRoomRole(normalized, 'player');
      setClientRoomRole('player');

      if (!supabase) {
        setStatus('Supabase is not configured. Join works after env vars are added.');
        return;
      }

      setStatus(`Joining ${normalized}…`);

      const { data, error } = await supabase
        .from(ROOM_TABLE)
        .select('game_state')
        .eq('room_code', normalized)
        .single();

      if (error || !data?.game_state) {
        setStatus('Room not found');
        return;
      }

      const nextRoom = normalizeRoomSnapshot(data.game_state);
      hydrateRoom(nextRoom);
      await subscribeToRoom(normalized, 'Guest');
      await claimSeat(nextRoom);
      setStatus('Joined synced room');
    },
    [claimSeat, hydrateRoom, subscribeToRoom]
  );

  const updateRoom = useCallback(async (updater: (current: RoomSnapshot) => RoomSnapshot) => {
    setRoom((current) => {
      if (!current) {
        return current;
      }

      const next = updater(current);
      saveActiveRoom(next);
      void persistRoom(next);
      return next;
    });

    setRecentRooms(loadRecentRooms());
  }, []);

  const newGameWithSettings = useCallback(
  async (settingsInput: Partial<RoomSettings>) => {
    await updateRoom((current) => {
      const settings = buildRoomSettings({
        ...current.settings,
        ...settingsInput
      });

      const players = Array.from({ length: settings.playerCount }, (_, seatIndex) => {
        const existing = current.players[seatIndex];
        const commanderSlots = existing?.commanderNames.length ?? 1;

        return {
          id: existing?.id ?? newId(),
          seatIndex,
          playerName: existing?.playerName ?? `Player ${seatIndex + 1}`,
          userLabel: existing?.userLabel,
          color: existing?.color ?? seatColors[seatIndex % seatColors.length],
          life: settings.startingLife,
          poison: 0,
          commanderNames:
            existing?.commanderNames && existing.commanderNames.length > 0
              ? [...existing.commanderNames]
              : [`Commander ${seatIndex + 1}`],
          commanderTax: Array.from({ length: commanderSlots }, () => 0),
          commanderDamageTaken: {},
          avatarUrl: existing?.avatarUrl ?? '',
          backgroundUrl: existing?.backgroundUrl ?? '',
          controllerClientId: current.syncMode === 'online' ? existing?.controllerClientId : undefined
        };
      });

      return {
        ...current,
        format: settings.format,
        startingLife: settings.startingLife,
        settings,
        players,
        actionLog: [],
        undoStack: [],
        turnSeatIndex: 0,
        updatedAt: new Date().toISOString()
      };
    });

    setStatus('New game ready');
  },
  [updateRoom]
);

  const adjustLife = useCallback(
  async (seatId: string, amount: number, actor = 'You') => {
    await updateRoom((current) =>
      withChange(
        current,
        actor,
        `${current.players.find((player) => player.id === seatId)?.playerName ?? 'Player'} ${amount > 0 ? 'gains' : 'loses'} ${Math.abs(amount)} life`,
        (players) =>
          players.map((player) =>
            player.id === seatId
              ? {
                  ...player,
                  life: player.life + amount
                }
              : player
          ),
        {
          reversible: true,
          undo: {
            kind: 'life',
            seatId,
            amount
          }
        }
      )
    );
  },
  [updateRoom]
);

  const adjustPoison = useCallback(
  async (seatId: string, amount: number, actor = 'You') => {
    await updateRoom((current) =>
      withChange(
        current,
        actor,
        `Poison counter ${amount > 0 ? 'added to' : 'removed from'} ${current.players.find((player) => player.id === seatId)?.playerName ?? 'player'}`,
        (players) =>
          players.map((player) =>
            player.id === seatId
              ? {
                  ...player,
                  poison: Math.max(0, player.poison + amount)
                }
              : player
          ),
        {
          reversible: true,
          undo: {
            kind: 'poison',
            seatId,
            amount
          }
        }
      )
    );
  },
  [updateRoom]
);

  const adjustCommanderTax = useCallback(
  async (seatId: string, commanderIndex: number, amount: number, actor = 'You') => {
    await updateRoom((current) =>
      withChange(
        current,
        actor,
        `Commander tax updated for ${current.players.find((player) => player.id === seatId)?.playerName ?? 'player'}`,
        (players) =>
          players.map((player) => {
            if (player.id !== seatId) {
              return player;
            }

            const commanderTax = [...player.commanderTax];
            commanderTax[commanderIndex] = Math.max(0, (commanderTax[commanderIndex] ?? 0) + amount);

            return {
              ...player,
              commanderTax
            };
          }),
        {
          reversible: true,
          undo: {
            kind: 'commander_tax',
            seatId,
            commanderIndex,
            amount
          }
        }
      )
    );
  },
  [updateRoom]
);

  const adjustCommanderDamage = useCallback(
  async (targetSeatId: string, sourceCommanderKey: string, amount: number, actor = 'You') => {
    await updateRoom((current) =>
      withChange(
        current,
        actor,
        `Commander damage updated on ${current.players.find((player) => player.id === targetSeatId)?.playerName ?? 'player'}`,
        (players) =>
          players.map((player) => {
            if (player.id !== targetSeatId) {
              return player;
            }

            const nextDamage = Math.max(0, (player.commanderDamageTaken[sourceCommanderKey] ?? 0) + amount);

            return {
              ...player,
              commanderDamageTaken: {
                ...player.commanderDamageTaken,
                [sourceCommanderKey]: nextDamage
              }
            };
          }),
        {
          reversible: true,
          undo: {
            kind: 'commander_damage',
            targetSeatId,
            sourceCommanderKey,
            amount
          }
        }
      )
    );
  },
  [updateRoom]
);

  const renamePlayer = useCallback(
    async (seatId: string, playerName: string) => {
      await updateRoom((current) => ({
        ...current,
        players: current.players.map((player) => (player.id === seatId ? { ...player, playerName } : player)),
        updatedAt: new Date().toISOString()
      }));
    },
    [updateRoom]
  );

  const setCommanderName = useCallback(
    async (seatId: string, commanderIndex: number, name: string) => {
      await updateRoom((current) => ({
        ...current,
        players: current.players.map((player) => {
          if (player.id !== seatId) {
            return player;
          }

          const commanderNames = [...player.commanderNames];
          commanderNames[commanderIndex] = name;

          return {
            ...player,
            commanderNames
          };
        }),
        updatedAt: new Date().toISOString()
      }));
    },
    [updateRoom]
  );

  const setPlayerMedia = useCallback(
    async (seatId: string, patch: Pick<PlayerSeat, 'avatarUrl' | 'backgroundUrl'>) => {
      await updateRoom((current) => ({
        ...current,
        players: current.players.map((player) => (player.id === seatId ? { ...player, ...patch } : player)),
        updatedAt: new Date().toISOString()
      }));
    },
    [updateRoom]
  );

  const setTurnSeatIndex = useCallback(
    async (seatIndex: number) => {
      await updateRoom((current) => ({
        ...current,
        turnSeatIndex: seatIndex,
        actionLog: [stampAction('System', `${current.players[seatIndex]?.playerName ?? 'Player'} has the turn`), ...current.actionLog].slice(0, 40),
        undoStack: [pushUndo(current), ...current.undoStack].slice(0, 12),
        updatedAt: new Date().toISOString()
      }));
    },
    [updateRoom]
  );

  const undo = useCallback(async () => {
    await updateRoom((current) => {
      const [last, ...rest] = current.undoStack;
      if (!last) {
        return current;
      }

      return {
        ...current,
        players: clonePlayers(last.players),
        actionLog: [stampAction('System', 'Undo applied'), ...last.actionLog].slice(0, 40),
        turnSeatIndex: last.turnSeatIndex,
        undoStack: rest,
        updatedAt: new Date().toISOString()
      };
    });
  }, [updateRoom]);

  const resetGame = useCallback(async () => {
    await updateRoom((current) => ({
      ...current,
      players: current.players.map((player) => ({
        ...player,
        life: current.settings.startingLife,
        poison: 0,
        commanderTax: player.commanderTax.map(() => 0),
        commanderDamageTaken: {}
      })),
      actionLog: [],
      undoStack: [],
      turnSeatIndex: 0,
      updatedAt: new Date().toISOString()
    }));

    setStatus('Game reset');
  }, [updateRoom]);

  const newGameSamePlayers = useCallback(async () => {
    await updateRoom((current) => ({
      ...current,
      players: current.players.map((player) => ({
        ...player,
        life: current.startingLife,
        poison: 0,
        commanderTax: player.commanderTax.map(() => 0),
        commanderDamageTaken: {}
      })),
      actionLog: [stampAction('System', 'New game started with same pod')],
      undoStack: [],
      turnSeatIndex: 0,
      updatedAt: new Date().toISOString()
    }));
  }, [updateRoom]);

  const revertLogAction = useCallback(
  async (actionId: string) => {
    await updateRoom((current) => {
      const action = current.actionLog.find((entry) => entry.id === actionId);

      if (!action || !action.reversible || !action.undo) {
        return current;
      }

      const undo = action.undo;
      const nextPlayers = clonePlayers(current.players);

      switch (undo.kind) {
        case 'life': {
          const player = nextPlayers.find((entry) => entry.id === undo.seatId);
          if (player) {
            player.life -= undo.amount;
          }
          break;
        }

        case 'poison': {
          const player = nextPlayers.find((entry) => entry.id === undo.seatId);
          if (player) {
            player.poison = Math.max(0, player.poison - undo.amount);
          }
          break;
        }

        case 'commander_tax': {
          const player = nextPlayers.find((entry) => entry.id === undo.seatId);
          if (player) {
            const nextTax = [...player.commanderTax];
            nextTax[undo.commanderIndex] = Math.max(
              0,
              (nextTax[undo.commanderIndex] ?? 0) - undo.amount
            );
            player.commanderTax = nextTax;
          }
          break;
        }

        case 'commander_damage': {
          const player = nextPlayers.find((entry) => entry.id === undo.targetSeatId);
          if (player) {
            const currentValue = player.commanderDamageTaken[undo.sourceCommanderKey] ?? 0;
            player.commanderDamageTaken = {
              ...player.commanderDamageTaken,
              [undo.sourceCommanderKey]: Math.max(0, currentValue - undo.amount)
            };
          }
          break;
        }

        default:
          return current;
      }

      return {
        ...current,
        players: nextPlayers,
        actionLog: current.actionLog.filter((entry) => entry.id !== actionId),
        updatedAt: new Date().toISOString()
      };
    });
  },
  [updateRoom]
);

  const leaveRoom = useCallback(() => {
    const activeRoom = room;

    if (activeRoom?.syncMode === 'online') {
      const releasedRoom: RoomSnapshot = {
        ...activeRoom,
        players: activeRoom.players.map((player) =>
          player.controllerClientId === clientId.current
            ? { ...player, controllerClientId: undefined }
            : player
        ),
        updatedAt: new Date().toISOString()
      };

      void persistRoom(releasedRoom);
      clearSeatAssignment(activeRoom.roomCode);
      clearRoomRole(activeRoom.roomCode);
    }

    roomSubRef.current?.unsubscribe?.();
    presenceChannelRef.current?.unsubscribe?.();
    roomSubRef.current = null;
    presenceChannelRef.current = null;

    clearActiveRoom();
    setRoom(null);
    setConnectedClients({});
    setJoinCode('');
    setFocusedSeatId(null);
    setStatus('Back in lobby');
    setClientRoomRole('player');
  }, [room]);

  useEffect(() => {
    if (!room || room.syncMode !== 'online') {
      return;
    }

    const controlledSeat = room.players.find((player) => player.controllerClientId === clientId.current);
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

    const controlledSeat = room.players.find((player) => player.controllerClientId === clientId.current);

    void presenceChannelRef.current.track({
      name: controlledSeat?.playerName ?? (clientRoomRole === 'host' ? 'Host Display' : 'Guest'),
      seatId: controlledSeat?.id,
      role: clientRoomRole,
      joinedAt: new Date().toISOString()
    });
  }, [focusedSeatId, room]);

  useEffect(() => {
    return () => {
      roomSubRef.current?.unsubscribe?.();
      presenceChannelRef.current?.unsubscribe?.();
    };
  }, []);

  const connectedCount = useMemo(() => Object.keys(connectedClients).length, [connectedClients]);

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
    setCommanderName,
    setPlayerMedia,
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
    focusedSeatId,
    clientRoomRole
  };
}