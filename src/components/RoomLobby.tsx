import { useEffect, useMemo, useRef, useState } from 'react';
import { buildRoomSettings } from '../lib/roomSettings';
import type { RoomSettings } from '../types';

interface RoomLobbyProps {
  joinCode: string;
  setJoinCode: (value: string) => void;
  createLocalRoom: (settings: Partial<RoomSettings>) => void;
  createOnlineRoom: (settings: Partial<RoomSettings>) => void;
  joinRoom: () => void;
  joinRoomByCode: (roomCode: string) => void;
  recentRooms: string[];
  hasSupabase: boolean;
}

const playerCounts = [2, 3, 4, 5, 6, 7, 8];

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
      {children}
    </span>
  );
}

function SettingPillButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-3 py-3 text-sm font-bold transition ${
        active
          ? 'bg-white text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.12)]'
          : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
      }`}
      type="button"
    >
      {children}
    </button>
  );
}

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
  // ---------------------------------------------------------------------------
  // Room setup state
  // Central place for the new-room options you expose on the lobby screen.
  // This is a good place to add future toggles like game type, variants,
  // extra counters, planechase, monarch, etc.
  // ---------------------------------------------------------------------------
  const [settings, setSettings] = useState<RoomSettings>(() => buildRoomSettings());
  const autoJoinedRef = useRef(false);

  const canCreate = useMemo(
    () => settings.playerCount >= 2 && settings.startingLife > 0,
    [settings]
  );

  const updateSettings = (patch: Partial<RoomSettings>) => {
    setSettings((current) => buildRoomSettings({ ...current, ...patch }));
  };

  // ---------------------------------------------------------------------------
  // Invite-link auto join
  // Reads ?room=ABCD12 from the URL so shared links and QR codes can drop
  // people directly into a room.
  // autoJoinedRef prevents duplicate joins in React StrictMode/dev.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (autoJoinedRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room')?.trim().toUpperCase();

    if (!roomFromUrl) {
      return;
    }

    autoJoinedRef.current = true;
    setJoinCode(roomFromUrl);
    joinRoomByCode(roomFromUrl);

    // Optional cleanup so refreshes do not keep retriggering the auto-join.
    window.history.replaceState({}, '', window.location.pathname);
  }, [joinRoomByCode, setJoinCode]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-8 text-white">
      <div className="grid w-full gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        {/* -------------------------------------------------------------------
            Left column: hero + room creation
            This is the main “showpiece” section and the easiest area to
            personalize with branding, flavor text, feature callouts, etc.
           ------------------------------------------------------------------- */}
        <section className="rounded-[32px] border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(8,25,34,0.96),rgba(8,12,20,0.96))] p-6 shadow-[0_0_40px_rgba(0,150,200,0.08)] backdrop-blur">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <SectionBadge>ManaDork</SectionBadge>
            <SectionBadge>Mobile-first</SectionBadge>
            <SectionBadge>Realtime-ready</SectionBadge>
          </div>

          <h1 className="max-w-2xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            Track the whole table without fighting the screen.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
            Build a pod, launch a synced room, and keep life totals front and center.
            ManaDork is tuned for fast in-person play, giant readable numbers, and
            smooth phone use around a real Commander table.
          </p>

          {/* -----------------------------------------------------------------
              Room settings panel
              Add future room options here. This panel is intentionally built as
              a reusable control cluster rather than a one-off card.
             ----------------------------------------------------------------- */}
          <div className="mt-8 rounded-[28px] border border-white/10 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Room settings</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Set the pod size and starting life now. This layout is ready for
                  future format and rules options.
                </p>
              </div>

              <SectionBadge>Expandable</SectionBadge>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {/* Player count */}
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Player count
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {playerCounts.map((count) => (
                    <SettingPillButton
                      key={count}
                      active={settings.playerCount === count}
                      onClick={() => updateSettings({ playerCount: count })}
                    >
                      {count}
                    </SettingPillButton>
                  ))}
                </div>
              </div>

              {/* Starting life */}
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
                      startingLife: Number(event.target.value || 40)
                    })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-lg font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/30 focus:bg-zinc-950"
                />
                <div className="mt-2 text-xs text-zinc-500">
                  Commander default is 40, but house rules and other formats can use
                  whatever you need.
                </div>
              </div>
            </div>

            {/* Future hooks */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Future settings hooks
              </div>
              <div className="flex flex-wrap gap-2">
                <SectionBadge>Game type</SectionBadge>
                <SectionBadge>Variant rules</SectionBadge>
                <SectionBadge>Add-ons</SectionBadge>
                <SectionBadge>Extra counters</SectionBadge>
              </div>
            </div>
          </div>

          {/* -----------------------------------------------------------------
              Room creation buttons
              Good place to personalize button styling, labels, or add feature
              marketing text later.
             ----------------------------------------------------------------- */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => createLocalRoom(settings)}
              disabled={!canCreate}
              className="rounded-3xl border border-white/10 bg-white px-5 py-5 text-left text-zinc-950 shadow-[0_0_30px_rgba(255,255,255,0.08)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em]">Local play</div>
              <div className="mt-2 text-2xl font-black">
                Create {settings.playerCount}-player game
              </div>
              <div className="mt-2 text-sm text-zinc-700">
                {settings.startingLife} starting life on one device.
              </div>
            </button>

            <button
              onClick={() => createOnlineRoom(settings)}
              disabled={!hasSupabase || !canCreate}
              className="rounded-3xl border border-cyan-400/25 bg-cyan-500/10 px-5 py-5 text-left text-white shadow-[0_0_30px_rgba(0,200,255,0.08)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">
                Online sync
              </div>
              <div className="mt-2 text-2xl font-black">Create synced room</div>
              <div className="mt-2 text-sm text-cyan-100/80">
                {hasSupabase
                  ? `${settings.playerCount} players, ${settings.startingLife} life, live across devices.`
                  : 'Add Supabase env vars to enable sync.'}
              </div>
            </button>
          </div>
        </section>

        {/* -------------------------------------------------------------------
            Right column: join room + recent rooms
            This is the easiest spot to add branding art, release notes, patch
            notes, or "how to join" tips later.
           ------------------------------------------------------------------- */}
        <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,20,0.9),rgba(10,10,14,0.92))] p-6 shadow-[0_0_40px_rgba(0,0,0,0.2)] backdrop-blur">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SectionBadge>Quick join</SectionBadge>
            <SectionBadge>Share links</SectionBadge>
            <SectionBadge>Recent rooms</SectionBadge>
          </div>

          <h2 className="text-xl font-bold text-white">Join a room</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Paste a room code or tap a recent room. Invite links and QR codes can
            also bring players straight here.
          </p>

          {/* Join form */}
          <div className="mt-5 flex gap-3">
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              className="flex-1 rounded-2xl border border-white/10 bg-zinc-950/80 px-4 py-4 text-lg font-semibold tracking-[0.28em] text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/30 focus:bg-zinc-950"
            />
            <button
              onClick={joinRoom}
              className="rounded-2xl border border-white/10 bg-white px-5 py-4 text-sm font-bold uppercase tracking-[0.16em] text-zinc-950 transition hover:translate-y-[-1px]"
              type="button"
            >
              Join
            </button>
          </div>

          {/* Recent rooms */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
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
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
                    type="button"
                  >
                    {roomCode}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Optional polish / messaging block */}
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4">
            <div className="text-sm font-semibold text-white">Showcase-ready tip</div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              This panel is a nice place for your logo, changelog notes, custom flavor
              text, or a short “how it works” explanation before you show it off.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}