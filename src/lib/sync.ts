import type { ConnectedClient, RoomSnapshot } from '../types';

export const HEARTBEAT_MS = 30_000;
export const RESYNC_MS = 120_000;
export const HOST_STALE_MS = 90_000;

function djb2Hash(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function stableSyncPayload(room: RoomSnapshot) {
  return JSON.stringify({
    roomCode: room.roomCode,
    format: room.format,
    startingLife: room.startingLife,
    settings: room.settings,
    turnSeatIndex: room.turnSeatIndex,
    players: room.players.map((player) => ({
      id: player.id,
      seatIndex: player.seatIndex,
      playerName: player.playerName,
      color: player.color,
      life: player.life,
      poison: player.poison,
      commanderNames: player.commanderNames,
      commanderTax: player.commanderTax,
      commanderDamageTaken: player.commanderDamageTaken,
      avatarUrl: player.avatarUrl ?? '',
      backgroundUrl: player.backgroundUrl ?? '',
      controllerClientId: player.controllerClientId ?? ''
    })),
    actionLog: room.actionLog.map((action) => ({
      id: action.id,
      actor: action.actor,
      description: action.description,
      reversible: action.reversible ?? false,
      undo: action.undo ?? null
    })),
    hostClientId: room.hostClientId ?? '',
    revision: room.revision
  });
}

export function computeRoomChecksum(room: RoomSnapshot) {
  return djb2Hash(stableSyncPayload(room));
}

export function refreshRoomChecksum(room: RoomSnapshot): RoomSnapshot {
  return {
    ...room,
    checksum: computeRoomChecksum(room)
  };
}

export function bumpRoomRevision(room: RoomSnapshot): RoomSnapshot {
  const next = {
    ...room,
    revision: room.revision + 1
  };
  return refreshRoomChecksum(next);
}

export function electNextHost(clients: Record<string, ConnectedClient>): string | null {
  const sorted = Object.values(clients)
    .filter((client) => client.clientId)
    .sort((a, b) => {
      const timeA = new Date(a.joinedAt).getTime();
      const timeB = new Date(b.joinedAt).getTime();

      if (timeA !== timeB) {
        return timeA - timeB;
      }

      return a.clientId.localeCompare(b.clientId);
    });

  return sorted[0]?.clientId ?? null;
}

export function isHostHeartbeatStale(lastHeartbeatAt?: string) {
  if (!lastHeartbeatAt) {
    return true;
  }

  return Date.now() - new Date(lastHeartbeatAt).getTime() > HOST_STALE_MS;
}