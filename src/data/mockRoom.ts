import type { RoomSettings, RoomSnapshot } from '../types';
import { newId } from '../lib/id';
import { buildRoomSettings } from '../lib/roomSettings';

const palette = ['#a855f7', '#38bdf8', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#eab308', '#6366f1'];

const slug = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export function createMockRoom(settingsInput: Partial<RoomSettings> = {}): RoomSnapshot {
  const settings = buildRoomSettings(settingsInput);
  const roomCode = slug();
  const now = new Date().toISOString();

  return {
    id: newId(),
    roomCode,
    roomName: 'Kitchen Table Commander',
    format: settings.format,
    startingLife: settings.startingLife,
    settings,
    syncMode: 'local',
    turnSeatIndex: 0,
    actionLog: [
      {
        id: newId(),
        actor: 'System',
        description: 'Game created',
        createdAt: now
      }
    ],
    undoStack: [],
    createdAt: now,
    updatedAt: now,
    players: Array.from({ length: settings.playerCount }, (_, seatIndex) => ({
      id: newId(),
      seatIndex,
      playerName: `Player ${seatIndex + 1}`,
      userLabel: seatIndex === 0 ? 'You' : undefined,
      color: palette[seatIndex % palette.length],
      life: settings.startingLife,
      poison: 0,
      commanderNames: [`Commander ${seatIndex + 1}`],
      commanderTax: [0],
      commanderDamageTaken: {},
      avatarUrl: '',
      backgroundUrl: ''
    }))
  };
}