import type { GameFormat, RoomSettings } from '../types';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getDefaultStartingLife(format: GameFormat) {
  return format === 'commander' ? 40 : 20;
}

export function buildRoomSettings(overrides: Partial<RoomSettings> = {}): RoomSettings {
  const format = overrides.format ?? 'commander';

  return {
    format,
    playerCount: clamp(overrides.playerCount ?? 4, 2, 8),
    startingLife: clamp(overrides.startingLife ?? getDefaultStartingLife(format), 1, 999),
    features: {
      commanderDamage: format === 'commander',
      poison: true,
      commanderTax: format === 'commander',
      turnIndicator: true,
      partnerCommanders: false,
      ...overrides.features
    }
  };
}