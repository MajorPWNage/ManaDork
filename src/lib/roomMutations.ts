import { newId } from './id';
import { buildRoomSettings } from './roomSettings';
import type {
  GameAction,
  GameActionUndo,
  PlayerSeat,
  RoomSettings,
  RoomSnapshot,
  SyncIntentEnvelope
} from '../types';

const seatColors = ['#a855f7', '#38bdf8', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#eab308', '#6366f1'];

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

export function clonePlayers(players: PlayerSeat[]) {
  return players.map((player) => ({
    ...player,
    commanderNames: [...player.commanderNames],
    commanderTax: [...player.commanderTax],
    commanderDamageTaken: { ...player.commanderDamageTaken }
  }));
}

export function pushUndo(room: RoomSnapshot): RoomSnapshot['undoStack'][number] {
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

function revertLogAction(current: RoomSnapshot, actionId: string): RoomSnapshot {
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
  }

  return {
    ...current,
    players: nextPlayers,
    actionLog: current.actionLog.filter((entry) => entry.id !== actionId),
    updatedAt: new Date().toISOString()
  };
}

function buildNewPlayersFromSettings(current: RoomSnapshot, settingsInput: Partial<RoomSettings>) {
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

  return { settings, players };
}

export function applyIntentToRoom(
  current: RoomSnapshot,
  envelope: SyncIntentEnvelope
): RoomSnapshot {
  const actor = envelope.actorName || 'You';
  const intent = envelope.intent;

  switch (intent.kind) {
    case 'life':
      return withChange(
        current,
        actor,
        `${current.players.find((player) => player.id === intent.seatId)?.playerName ?? 'Player'} ${intent.amount > 0 ? 'gains' : 'loses'} ${Math.abs(intent.amount)} life`,
        (players) =>
          players.map((player) =>
            player.id === intent.seatId
              ? { ...player, life: player.life + intent.amount }
              : player
          ),
        {
          reversible: true,
          undo: {
            kind: 'life',
            seatId: intent.seatId,
            amount: intent.amount
          }
        }
      );

    case 'poison':
      return withChange(
        current,
        actor,
        `Poison counter ${intent.amount > 0 ? 'added to' : 'removed from'} ${current.players.find((player) => player.id === intent.seatId)?.playerName ?? 'player'}`,
        (players) =>
          players.map((player) =>
            player.id === intent.seatId
              ? { ...player, poison: Math.max(0, player.poison + intent.amount) }
              : player
          ),
        {
          reversible: true,
          undo: {
            kind: 'poison',
            seatId: intent.seatId,
            amount: intent.amount
          }
        }
      );

    case 'commander_tax':
      return withChange(
        current,
        actor,
        `Commander tax updated for ${current.players.find((player) => player.id === intent.seatId)?.playerName ?? 'player'}`,
        (players) =>
          players.map((player) => {
            if (player.id !== intent.seatId) {
              return player;
            }

            const commanderTax = [...player.commanderTax];
            commanderTax[intent.commanderIndex] = Math.max(
              0,
              (commanderTax[intent.commanderIndex] ?? 0) + intent.amount
            );

            return {
              ...player,
              commanderTax
            };
          }),
        {
          reversible: true,
          undo: {
            kind: 'commander_tax',
            seatId: intent.seatId,
            commanderIndex: intent.commanderIndex,
            amount: intent.amount
          }
        }
      );

    case 'commander_damage':
      return withChange(
        current,
        actor,
        `Commander damage updated on ${current.players.find((player) => player.id === intent.targetSeatId)?.playerName ?? 'player'}`,
        (players) =>
          players.map((player) => {
            if (player.id !== intent.targetSeatId) {
              return player;
            }

            const nextDamage = Math.max(
              0,
              (player.commanderDamageTaken[intent.sourceCommanderKey] ?? 0) + intent.amount
            );

            return {
              ...player,
              commanderDamageTaken: {
                ...player.commanderDamageTaken,
                [intent.sourceCommanderKey]: nextDamage
              }
            };
          }),
        {
          reversible: true,
          undo: {
            kind: 'commander_damage',
            targetSeatId: intent.targetSeatId,
            sourceCommanderKey: intent.sourceCommanderKey,
            amount: intent.amount
          }
        }
      );

    case 'rename_player':
      return {
        ...current,
        players: current.players.map((player) =>
          player.id === intent.seatId
            ? { ...player, playerName: intent.playerName }
            : player
        ),
        updatedAt: new Date().toISOString()
      };

    case 'set_turn':
      return {
        ...current,
        turnSeatIndex: intent.seatIndex,
        actionLog: [
          stampAction('System', `${current.players[intent.seatIndex]?.playerName ?? 'Player'} has the turn`),
          ...current.actionLog
        ].slice(0, 40),
        undoStack: [pushUndo(current), ...current.undoStack].slice(0, 12),
        updatedAt: new Date().toISOString()
      };

    case 'reset_game':
      return {
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
      };

    case 'new_game_with_settings': {
      const { settings, players } = buildNewPlayersFromSettings(current, intent.settings);

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
    }

    case 'revert_log_action':
      return revertLogAction(current, intent.actionId);

    default:
      return current;
  }
}