import type { PlayerSeat, RoomSnapshot } from '../types';
import { buildRoomSettings } from './roomSettings';
import { newId } from './id';
import { refreshRoomChecksum } from './sync';

const seatColors = ['#a855f7', '#38bdf8', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#eab308', '#6366f1'];

export function normalizeRoomSnapshot(input: any): RoomSnapshot {
  const playerCount = Array.isArray(input?.players) ? input.players.length : 4;

  const settings = buildRoomSettings({
    format: input?.settings?.format ?? input?.format ?? 'commander',
    playerCount: input?.settings?.playerCount ?? playerCount,
    startingLife: input?.settings?.startingLife ?? input?.startingLife ?? 40,
    features: input?.settings?.features
  });

  const players: PlayerSeat[] = (input?.players ?? [])
    .slice(0, settings.playerCount)
    .map((player: any, seatIndex: number) => {
      const commanderNames =
        Array.isArray(player?.commanderNames) && player.commanderNames.length > 0
          ? [...player.commanderNames]
          : [`Commander ${seatIndex + 1}`];

      return {
        id: player?.id ?? newId(),
        seatIndex: typeof player?.seatIndex === 'number' ? player.seatIndex : seatIndex,
        playerName: player?.playerName ?? `Player ${seatIndex + 1}`,
        userLabel: player?.userLabel,
        color: player?.color ?? seatColors[seatIndex % seatColors.length],
        life: typeof player?.life === 'number' ? player.life : settings.startingLife,
        poison: typeof player?.poison === 'number' ? player.poison : 0,
        commanderNames,
        commanderTax:
          Array.isArray(player?.commanderTax) && player.commanderTax.length > 0
            ? [...player.commanderTax]
            : Array.from({ length: commanderNames.length }, () => 0),
        commanderDamageTaken:
          player?.commanderDamageTaken && typeof player.commanderDamageTaken === 'object'
            ? { ...player.commanderDamageTaken }
            : {},
        avatarUrl: player?.avatarUrl ?? '',
        backgroundUrl: player?.backgroundUrl ?? '',
        controllerClientId: player?.controllerClientId
      };
    });

  const normalized: RoomSnapshot = {
    id: input?.id ?? newId(),
    roomCode: input?.roomCode ?? 'LOCAL',
    roomName: input?.roomName ?? 'Kitchen Table Commander',
    format: settings.format,
    startingLife: settings.startingLife,
    settings,
    syncMode: input?.syncMode ?? 'local',
    players,
    actionLog: Array.isArray(input?.actionLog) ? input.actionLog : [],
    turnSeatIndex: typeof input?.turnSeatIndex === 'number' ? input.turnSeatIndex : 0,
    undoStack: Array.isArray(input?.undoStack) ? input.undoStack : [],
    createdAt: input?.createdAt ?? new Date().toISOString(),
    updatedAt: input?.updatedAt ?? new Date().toISOString(),
    hostClientId: input?.hostClientId,
    revision: typeof input?.revision === 'number' ? input.revision : 1,
    checksum: typeof input?.checksum === 'string' ? input.checksum : '',
    lastHeartbeatAt:
      input?.lastHeartbeatAt ??
      input?.updatedAt ??
      input?.createdAt ??
      new Date().toISOString()
  };

  return normalized.checksum ? normalized : refreshRoomChecksum(normalized);
}