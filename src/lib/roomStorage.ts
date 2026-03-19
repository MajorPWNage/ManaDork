import type { RoomSnapshot } from '../types';
import { newId } from './id';
import { normalizeRoomSnapshot } from './normalizeRoom';

const ACTIVE_ROOM_KEY = 'manaboard.active-room';
const RECENT_ROOMS_KEY = 'manaboard.recent-rooms';
const ROOM_SEAT_KEY_PREFIX = 'manaboard.room-seat:';
const CLIENT_ID_KEY = 'manaboard.client-id';
const ROOM_ROLE_KEY_PREFIX = 'manaboard.room-role:';

export function saveActiveRoom(room: RoomSnapshot) {
  localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(room));
  saveRecentRoom(room.roomCode);
}

export function loadActiveRoom(): RoomSnapshot | null {
  const value = localStorage.getItem(ACTIVE_ROOM_KEY);
  if (!value) {
    return null;
  }

  return normalizeRoomSnapshot(JSON.parse(value));
}

export function clearActiveRoom() {
  localStorage.removeItem(ACTIVE_ROOM_KEY);
}

export function loadRecentRooms(): string[] {
  const value = localStorage.getItem(RECENT_ROOMS_KEY);
  return value ? (JSON.parse(value) as string[]) : [];
}

export function saveRecentRoom(roomCode: string) {
  const next = [roomCode, ...loadRecentRooms().filter((value) => value !== roomCode)].slice(0, 6);
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(next));
}

export function saveSeatAssignment(roomCode: string, seatId: string) {
  localStorage.setItem(`${ROOM_SEAT_KEY_PREFIX}${roomCode}`, seatId);
}

export function loadSeatAssignment(roomCode: string): string | null {
  return localStorage.getItem(`${ROOM_SEAT_KEY_PREFIX}${roomCode}`);
}

export function clearSeatAssignment(roomCode: string) {
  localStorage.removeItem(`${ROOM_SEAT_KEY_PREFIX}${roomCode}`);
}

export function loadOrCreateClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = newId();
  localStorage.setItem(CLIENT_ID_KEY, next);
  return next;
}

export function saveRoomRole(roomCode: string, role: 'player' | 'host') {
  localStorage.setItem(`${ROOM_ROLE_KEY_PREFIX}${roomCode}`, role);
}

export function loadRoomRole(roomCode: string): 'player' | 'host' | null {
  const value = localStorage.getItem(`${ROOM_ROLE_KEY_PREFIX}${roomCode}`);
  return value === 'host' || value === 'player' ? value : null;
}

export function clearRoomRole(roomCode: string) {
  localStorage.removeItem(`${ROOM_ROLE_KEY_PREFIX}${roomCode}`);
}