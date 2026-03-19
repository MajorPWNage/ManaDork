export type GameFormat = 'commander' | 'standard';
export type SyncMode = 'local' | 'online';
export type ClientRoomRole = 'player' | 'host';

export interface RoomFeatureFlags {
  commanderDamage: boolean;
  poison: boolean;
  commanderTax: boolean;
  turnIndicator: boolean;
  partnerCommanders: boolean;
}

export interface RoomSettings {
  format: GameFormat;
  playerCount: number;
  startingLife: number;
  features: RoomFeatureFlags;
}

export interface ConnectedClient {
  clientId: string;
  name: string;
  seatId?: string;
  joinedAt: string;
}

export type GameActionUndo =
  | {
      kind: 'life';
      seatId: string;
      amount: number;
    }
  | {
      kind: 'poison';
      seatId: string;
      amount: number;
    }
  | {
      kind: 'commander_tax';
      seatId: string;
      commanderIndex: number;
      amount: number;
    }
  | {
      kind: 'commander_damage';
      targetSeatId: string;
      sourceCommanderKey: string;
      amount: number;
    };

export interface GameAction {
  id: string;
  actor: string;
  description: string;
  createdAt: string;
  reversible?: boolean;
  undo?: GameActionUndo;
}

export interface PlayerSeat {
  id: string;
  seatIndex: number;
  playerName: string;
  userLabel?: string;
  color: string;
  life: number;
  poison: number;
  commanderNames: string[];
  commanderTax: number[];
  commanderDamageTaken: Record<string, number>;
  avatarUrl?: string;
  backgroundUrl?: string;
  controllerClientId?: string;
}

export interface RoomSnapshot {
  id: string;
  roomCode: string;
  roomName: string;
  format: GameFormat;
  startingLife: number;
  settings: RoomSettings;
  syncMode: SyncMode;
  players: PlayerSeat[];
  actionLog: GameAction[];
  turnSeatIndex: number;
  undoStack: Array<{
    players: PlayerSeat[];
    actionLog: GameAction[];
    turnSeatIndex: number;
  }>;
  createdAt: string;
  updatedAt: string;
}