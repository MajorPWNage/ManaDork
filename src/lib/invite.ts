export function getRoomInviteUrl(roomCode: string) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('room', roomCode);
  return url.toString();
}