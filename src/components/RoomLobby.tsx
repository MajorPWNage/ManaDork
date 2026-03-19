import { useEffect, useMemo, useRef, useState } from 'react';
import { buildRoomSettings, getDefaultStartingLife } from '../lib/roomSettings';
import type { RoomSettings } from '../types';

interface RoomLobbyProps {
  joinCode: string;
  setJoinCode: (value: string) => void;
  createLocalRoom: (settings: Partial<RoomSettings>) => void;
  createOnlineRoom: (settings: Partial<RoomSettings>, hostOnlyMode: boolean) => void;
  joinRoom: () => void;
  joinRoomByCode?: (roomCode: string) => void;
  recentRooms: string[];
  hasSupabase: boolean;
}

const playerCounts = [2, 3, 4, 5, 6, 7, 8];

export function RoomLobby({
  joinCode,
  setJoinCode,
  createLocalRoom,
  createOnlineRoom,
  joinRoom,
  joinRoomByCode,
  recentRooms,
  hasSupabase
}: RoomLobbyProps) {
  const [settings, setSettings] = useState<RoomSettings>(() => buildRoomSettings());
  const [hostOnlyMode, setHostOnlyMode] = useState(false);
  const hasAttemptedAutoJoin = useRef(false);

  const canCreate = useMemo(
    () => settings.playerCount >= 2 && settings.startingLife > 0,
    [settings]
  );

  const updateSettings = (patch: Partial<RoomSettings>) => {
    setSettings((current) => buildRoomSettings({ ...current, ...patch }));
  };

  useEffect(() => {
    if (hasAttemptedAutoJoin.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room')?.trim().toUpperCase();

    if (!roomFromUrl) {
      return;
    }

    hasAttemptedAutoJoin.current = true;
    setJoinCode(roomFromUrl);

    if (joinRoomByCode) {
      joinRoomByCode(roomFromUrl);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [joinRoomByCode, setJoinCode]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-8 text-white">
      <div className="grid w-full gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <section className="rounded-[32px] border border-white/10 bg-black/30 p-6 shadow-glow backdrop-blur">
          <div className="mb-6 inline-flex items-center rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-200">
            Commander-first • mobile-first • realtime-ready
          </div>

          <h1 className="max-w-2xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            ManaDork keeps the life totals loud and the friction quiet.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
            Start a local pod in one tap, or spin up a synced room so every phone stays locked to the same board state.
            Life totals stay huge, commander stats stay close, and the interface stays thumb-friendly.
          </p>

          <div className="mt-8 rounded-[28px] border border-white/10 bg-zinc-950/70 p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Room settings</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Build the pod first. More game types and add-ons can plug in later.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
                Ready for expansion
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Player count
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {playerCounts.map((count) => (
                    <button
                      key={count}
                      onClick={() => updateSettings({ playerCount: count })}
                      className={`rounded-2xl px-3 py-3 text-sm font-bold transition ${
                        settings.playerCount === count
                          ? 'bg-white text-zinc-950'
                          : 'border border-white/10 bg-white/5 text-white'
                      }`}
                      type="button"
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Starting life
                </div>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={settings.startingLife}
                  onChange={(event) =>
                    updateSettings({
                      startingLife: Number(event.target.value || getDefaultStartingLife(settings.format))
                    })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-lg font-semibold text-white outline-none placeholder:text-zinc-600"
                />
                <div className="mt-2 text-xs text-zinc-500">
                  Commander defaults to 40, but you can set any custom value for house rules or variants.
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Future settings hooks
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300">
                  Game type
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300">
                  Add-ons
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300">
                  Variant rules
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300">
                  Extra counters
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => createLocalRoom(settings)}
              disabled={!canCreate}
              className="rounded-3xl border border-white/10 bg-white px-5 py-5 text-left text-zinc-950 shadow-glow transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em]">Local only</div>
              <div className="mt-2 text-2xl font-black">Create {settings.playerCount}-player pod</div>
              <div className="mt-2 text-sm text-zinc-700">
                {settings.startingLife} starting life on a single device.
              </div>
            </button>

            <div className="rounded-3xl border border-cyan-400/25 bg-cyan-500/10 px-5 py-5 text-white shadow-glow">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Online sync</div>
              <div className="mt-2 text-2xl font-black">
                {hostOnlyMode ? 'Create host display room' : 'Create synced room'}
              </div>
              <div className="mt-2 text-sm text-cyan-100/80">
                {hasSupabase
                  ? hostOnlyMode
                    ? 'This device becomes the host or judge display and does not claim a player seat.'
                    : `${settings.playerCount} players, ${settings.startingLife} life, live across devices.`
                  : 'Add Supabase env vars to enable sync.'}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Host only mode</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      Show the full board on this device without using a player slot.
                    </div>
                  </div>

                  <button
                    onClick={() => setHostOnlyMode((value) => !value)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      hostOnlyMode ? 'bg-cyan-400' : 'bg-white/10'
                    }`}
                    type="button"
                    aria-pressed={hostOnlyMode}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                        hostOnlyMode ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </label>
              </div>

              <button
                onClick={() => createOnlineRoom(settings, hostOnlyMode)}
                disabled={!hasSupabase || !canCreate}
                className="mt-4 w-full rounded-2xl bg-white px-4 py-4 text-sm font-bold uppercase tracking-[0.16em] text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
              >
                {hostOnlyMode ? 'Create host room' : 'Create synced room'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-black/30 p-6 shadow-glow backdrop-blur">
          <h2 className="text-xl font-bold text-white">Join a room</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Paste a room code or pick a recent room. Great for kitchen-table pods and remote chaos alike.
          </p>

          <div className="mt-5 flex gap-3">
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              className="flex-1 rounded-2xl border border-white/10 bg-zinc-950/80 px-4 py-4 text-lg font-semibold tracking-[0.28em] text-white outline-none ring-0 placeholder:text-zinc-600"
            />
            <button
              onClick={joinRoom}
              className="rounded-2xl border border-white/10 bg-white px-5 py-4 text-sm font-bold uppercase tracking-[0.16em] text-zinc-950"
              type="button"
            >
              Join
            </button>
          </div>

          <div className="mt-6">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Recent rooms
            </div>
            <div className="flex flex-wrap gap-2">
              {recentRooms.length === 0 ? (
                <span className="text-sm text-zinc-500">No saved rooms yet.</span>
              ) : (
                recentRooms.map((roomCode) => (
                  <button
                    key={roomCode}
                    onClick={() => setJoinCode(roomCode)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200"
                    type="button"
                  >
                    {roomCode}
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}