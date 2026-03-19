import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionLog } from './ActionLog';
import { Badge } from './Badge';
import { PlayerPanel } from './PlayerPanel';
import { InviteSheet } from './InviteSheet';
import { RoomSettingsSheet } from './RoomSettingsSheet';
import { buildRoomSettings } from '../lib/roomSettings';
import type { PlayerSeat, RoomSettings, RoomSnapshot } from '../types';

interface GameBoardProps {
  room: RoomSnapshot;
  status: string;
  connectedCount: number;
  isOnline: boolean;
  focusedSeatId: string | null;
  onAdjustLife: (seatId: string, amount: number) => void;
  onAdjustPoison: (seatId: string, amount: number) => void;
  onAdjustTax: (seatId: string, commanderIndex: number, amount: number) => void;
  onAdjustCommanderDamage: (seatId: string, sourceKey: string, amount: number) => void;
  onRenamePlayer: (seatId: string, playerName: string) => void;
  onRevertLogAction: (actionId: string) => void;
  onReset: () => void;
  onNewGameWithSettings: (settings: Partial<RoomSettings>) => void;
  onSetTurn: (seatIndex: number) => void;
  onLeave: () => void;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function ControlButton({
  children,
  onClick,
  primary = false,
  danger = false
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  let className =
    'rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] border border-white/10 bg-white/5 text-white';

  if (primary) {
    className = 'rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-[0.99] bg-white text-zinc-950';
  }

  if (danger) {
    className =
      'rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] border border-rose-400/20 bg-rose-500/10 text-rose-100';
  }

  return (
    <button onClick={onClick} className={className} type="button">
      {children}
    </button>
  );
}

function getDamageDealtBy(sourcePlayer: PlayerSeat, targetPlayer: PlayerSeat) {
  return sourcePlayer.commanderNames.reduce((sum, _name, commanderIndex) => {
    const key = `${sourcePlayer.id}:${commanderIndex}`;
    return sum + (targetPlayer.commanderDamageTaken[key] ?? 0);
  }, 0);
}

function OpponentPeekSheet({
  me,
  opponent,
  onClose
}: {
  me: PlayerSeat;
  opponent: PlayerSeat;
  onClose: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const damageDealtByMe = getDamageDealtBy(me, opponent);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-zinc-950 p-4 text-white shadow-glow">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/35 text-lg font-semibold"
              style={{ outline: `2px solid ${opponent.color}` }}
            >
              {opponent.avatarUrl ? (
                <img src={opponent.avatarUrl} alt={opponent.playerName} className="h-full w-full object-cover" />
              ) : (
                opponent.playerName.slice(0, 1)
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">{opponent.playerName}</div>
              <div className="truncate text-xs uppercase tracking-[0.18em] text-zinc-400">
                {opponent.commanderNames.filter(Boolean).join(' • ') || 'Commander'}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold"
            type="button"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">Current Life</div>
            <div className="mt-1 text-3xl font-black">{opponent.life}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">Commander Damage by You</div>
            <div className="mt-1 text-3xl font-black">{damageDealtByMe}</div>
          </div>
        </div>

        <button
          onClick={() => setShowMore((value) => !value)}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold"
          type="button"
        >
          {showMore ? 'Hide Details' : 'More Details'}
        </button>

        {showMore ? (
          <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Poison</span>
              <span className="font-semibold">{opponent.poison}</span>
            </div>

            {opponent.commanderNames.map((name, index) => (
              <div key={`${opponent.id}-details-${index}`} className="flex items-center justify-between gap-4">
                <span className="truncate text-zinc-400">{name || `Commander ${index + 1}`} Tax</span>
                <span className="shrink-0 font-semibold">{(opponent.commanderTax[index] ?? 0) * 2}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FocusedSeatCard({
  player,
  opponents,
  isActiveTurn,
  onRenamePlayer,
  onAdjustLife,
  onAdjustPoison,
  onAdjustTax,
  onAdjustCommanderDamage,
  onTurn
}: {
  player: PlayerSeat;
  opponents: PlayerSeat[];
  isActiveTurn: boolean;
  onRenamePlayer: (name: string) => void;
  onAdjustLife: (amount: number) => void;
  onAdjustPoison: (amount: number) => void;
  onAdjustTax: (commanderIndex: number, amount: number) => void;
  onAdjustCommanderDamage: (sourceKey: string, amount: number) => void;
  onTurn: () => void;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-glow"
      style={{
        boxShadow: isActiveTurn ? `0 0 0 1px ${player.color}, 0 0 48px rgba(255,255,255,0.08)` : undefined
      }}
    >
      {player.backgroundUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${player.backgroundUrl})` }}
        />
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/45 to-black/80" />

      <div className="relative flex min-h-[calc(100dvh-13rem)] flex-col p-3 sm:p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/35 text-lg font-semibold text-white"
              style={{ outline: `2px solid ${player.color}` }}
            >
              {player.avatarUrl ? (
                <img src={player.avatarUrl} alt={player.playerName} className="h-full w-full object-cover" />
              ) : (
                player.playerName.slice(0, 1)
              )}
            </div>

            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={player.playerName}
                onChange={(event) => onRenamePlayer(event.target.value)}
                placeholder={`Player ${player.seatIndex + 1}`}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-base font-semibold text-white outline-none transition placeholder:text-zinc-500 focus:border-white/20"
              />
              <div className="mt-2 truncate text-xs uppercase tracking-[0.18em] text-zinc-400">
                {player.commanderNames.filter(Boolean).join(' • ') || 'Commander'}
              </div>
            </div>
          </div>

          <button
            onClick={onTurn}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${
              isActiveTurn ? 'bg-white text-zinc-900' : 'border border-white/10 bg-black/30 text-zinc-300'
            }`}
            type="button"
          >
            {isActiveTurn ? 'Turn' : 'Set Turn'}
          </button>
        </div>

        <div className="grid flex-1 grid-cols-[3.5rem,1fr,3.5rem] gap-2 sm:grid-cols-[4.25rem,1fr,4.25rem]">
          <div className="flex flex-col justify-end gap-2">
            <button
              onClick={() => onAdjustLife(-1)}
              className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-black/35 text-2xl font-semibold shadow-glow sm:h-16 sm:text-3xl"
              type="button"
            >
              -1
            </button>
            <button
              onClick={() => onAdjustLife(-5)}
              className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-black/35 text-2xl font-semibold shadow-glow sm:h-16 sm:text-3xl"
              type="button"
            >
              -5
            </button>
          </div>

          <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/10 bg-black/25 px-2 py-6 text-center backdrop-blur-sm">
            <div className="leading-none text-[4.25rem] font-black tracking-tight text-white sm:text-[5.5rem]">
              {player.life}
            </div>
            <div className="mt-2 text-xs uppercase tracking-[0.25em] text-zinc-400">Life</div>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <button
              onClick={() => onAdjustLife(1)}
              className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-black/35 text-2xl font-semibold shadow-glow sm:h-16 sm:text-3xl"
              type="button"
            >
              +1
            </button>
            <button
              onClick={() => onAdjustLife(5)}
              className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-black/35 text-2xl font-semibold shadow-glow sm:h-16 sm:text-3xl"
              type="button"
            >
              +5
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Badge>Poison</Badge>
              <div className="text-xl font-bold text-white">{player.poison}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onAdjustPoison(-1)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white"
                type="button"
              >
                -1
              </button>
              <button
                onClick={() => onAdjustPoison(1)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white"
                type="button"
              >
                +1
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Badge>Commander Tax</Badge>
              <div className="text-sm text-zinc-400">per commander</div>
            </div>
            <div className="space-y-2">
              {player.commanderNames.map((name, commanderIndex) => (
                <div key={`${player.id}-tax-${commanderIndex}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  <div className="truncate text-xs uppercase tracking-[0.14em] text-zinc-400">
                    {name || `Commander ${commanderIndex + 1}`}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onAdjustTax(commanderIndex, -1)}
                      className="rounded-lg border border-white/10 px-2 py-1 text-sm font-semibold text-white"
                      type="button"
                    >
                      -2
                    </button>
                    <span className="text-lg font-bold text-white">{(player.commanderTax[commanderIndex] ?? 0) * 2}</span>
                    <button
                      onClick={() => onAdjustTax(commanderIndex, 1)}
                      className="rounded-lg border border-white/10 px-2 py-1 text-sm font-semibold text-white"
                      type="button"
                    >
                      +2
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <Badge>Commander damage taken</Badge>
            <div className="text-sm text-zinc-400">Tap opponent to add 1</div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {opponents.map((opponent) => {
              const currentDamage = opponent.commanderNames.reduce((sum, _name, commanderIndex) => {
                const key = `${opponent.id}:${commanderIndex}`;
                return sum + (player.commanderDamageTaken[key] ?? 0);
              }, 0);

              return (
                <button
                  key={opponent.id}
                  onClick={() => onAdjustCommanderDamage(`${opponent.id}:0`, 1)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition active:scale-[0.98]"
                  type="button"
                >
                  <div className="truncate text-xs uppercase tracking-[0.14em] text-zinc-400">{opponent.playerName}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm text-zinc-300">Damage</span>
                    <span className="text-xl font-bold text-white">{currentDamage}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function GameBoard({
  room,
  status,
  connectedCount,
  isOnline,
  focusedSeatId,
  onAdjustLife,
  onAdjustPoison,
  onAdjustTax,
  onAdjustCommanderDamage,
  onRenamePlayer,
  onRevertLogAction,
  onReset,
  onNewGameWithSettings,
  onSetTurn,
  onLeave
}: GameBoardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hostViewEnabled, setHostViewEnabled] = useState(false);

  const effectiveSettings =
    room.settings ??
    buildRoomSettings({
      format: room.format,
      playerCount: room.players.length,
      startingLife: room.startingLife
    });

  const focusedPlayer = useMemo(() => {
    if (!isOnline || !focusedSeatId) {
      return null;
    }

    return room.players.find((player) => player.id === focusedSeatId) ?? null;
  }, [focusedSeatId, isOnline, room.players]);

  const isHostClient = useMemo(() => {
    return Boolean(
      isOnline &&
        focusedPlayer &&
        focusedPlayer.controllerClientId &&
        room.hostClientId &&
        focusedPlayer.controllerClientId === room.hostClientId
    );
  }, [focusedPlayer, isOnline, room.hostClientId]);

  const opponents = useMemo(() => {
    if (!focusedPlayer) {
      return [];
    }

    return room.players.filter((player) => player.id !== focusedPlayer.id);
  }, [focusedPlayer, room.players]);

  const selectedOpponent = useMemo(
    () => opponents.find((player) => player.id === selectedOpponentId) ?? null,
    [opponents, selectedOpponentId]
  );

  const showFullBoard = !isOnline || (isHostClient && hostViewEnabled);

  useEffect(() => {
    if (!isOnline) {
      setHostViewEnabled(false);
      return;
    }

    if (!isHostClient) {
      setHostViewEnabled(false);
    }
  }, [isHostClient, isOnline, room.roomCode]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    if (menuOpen || inviteOpen || settingsOpen || selectedOpponent) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [inviteOpen, menuOpen, selectedOpponent, settingsOpen]);

  useEffect(() => {
    if (showFullBoard || !focusedPlayer) {
      return;
    }

    const onScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 260;
      setDockExpanded(nearBottom);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, [focusedPlayer, showFullBoard]);

  const mobileMenu = (
    <div className={`fixed inset-0 z-40 xl:hidden ${menuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <button
        onClick={() => setMenuOpen(false)}
        className={`absolute inset-0 bg-black/70 transition ${menuOpen ? 'opacity-100' : 'opacity-0'}`}
        type="button"
        aria-label="Close room menu overlay"
      />

      <aside
        className={`absolute right-0 top-0 h-[100dvh] w-[min(92vw,24rem)] overflow-y-auto border-l border-white/10 bg-zinc-950/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-glow backdrop-blur-xl transition-transform ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black">{room.roomName}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">Room menu</div>
          </div>

          <button
            onClick={() => setMenuOpen(false)}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white"
            type="button"
            aria-label="Close room menu"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {isOnline && isHostClient ? (
            <ControlButton
              onClick={() => {
                setHostViewEnabled((value) => !value);
                setMenuOpen(false);
              }}
            >
              {hostViewEnabled ? 'Player View' : 'Host View'}
            </ControlButton>
          ) : null}

          <ControlButton
            onClick={() => {
              setInviteOpen(true);
              setMenuOpen(false);
            }}
          >
            Invite
          </ControlButton>

          <ControlButton
            onClick={() => {
              onReset();
              setMenuOpen(false);
            }}
          >
            Reset
          </ControlButton>

          <ControlButton
            onClick={() => {
              setSettingsOpen(true);
              setMenuOpen(false);
            }}
            primary
          >
            New Game
          </ControlButton>

          <ControlButton
            onClick={() => {
              onLeave();
              setMenuOpen(false);
            }}
            danger
          >
            Leave Room
          </ControlButton>
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-black/30 p-4 shadow-glow">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge>{room.format}</Badge>
            <Badge>Room {room.roomCode}</Badge>
            <Badge>{isOnline ? `${connectedCount} connected` : 'Local mode'}</Badge>
            {isOnline && isHostClient ? <Badge>Host</Badge> : null}
            {isOnline && isHostClient && hostViewEnabled ? <Badge>Host View</Badge> : null}
          </div>
          <p className="text-sm text-zinc-300">{status}</p>
        </div>

        <div className="mt-4">
          <ActionLog
            actions={room.actionLog}
            listClassName="max-h-[55dvh]"
            onRevertAction={onRevertLogAction}
          />
        </div>
      </aside>
    </div>
  );

  const commonOverlays = (
    <>
      {inviteOpen ? <InviteSheet room={room} onClose={() => setInviteOpen(false)} /> : null}

      {settingsOpen ? (
        <RoomSettingsSheet
          initialSettings={effectiveSettings}
          title="Start new game"
          confirmLabel="Start new game"
          onClose={() => setSettingsOpen(false)}
          onConfirm={(settings) => {
            onNewGameWithSettings(settings);
            setSettingsOpen(false);
          }}
        />
      ) : null}

      {mobileMenu}
    </>
  );

  if (showFullBoard) {
    return (
      <main className="mx-auto min-h-screen max-w-[1400px] px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] text-white sm:px-4 lg:px-6">
        <header className="z-20 mb-3 rounded-[28px] border border-white/10 bg-zinc-950/85 p-3 shadow-glow backdrop-blur-xl xl:sticky xl:top-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-black tracking-tight sm:text-xl">{room.roomName}</h1>
                <Badge>{room.format}</Badge>
                <Badge>Room {room.roomCode}</Badge>
                <Badge>{isOnline ? `${connectedCount} connected` : 'Local mode'}</Badge>
                {isOnline && isHostClient ? <Badge>Host</Badge> : null}
                {isOnline && isHostClient && hostViewEnabled ? <Badge>Host View</Badge> : null}
              </div>
              <div className="mt-2 text-xs text-zinc-400 sm:text-sm">{status}</div>
            </div>

            <button
              onClick={() => setMenuOpen(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white xl:hidden"
              type="button"
              aria-label="Open room menu"
            >
              <MenuIcon />
            </button>
          </div>

          <div className="mt-3 hidden flex-wrap gap-2 xl:flex">
            {isOnline && isHostClient ? (
              <ControlButton onClick={() => setHostViewEnabled((value) => !value)}>
                {hostViewEnabled ? 'Player View' : 'Host View'}
              </ControlButton>
            ) : null}

            <ControlButton onClick={() => setInviteOpen(true)}>Invite</ControlButton>
            <ControlButton onClick={onReset}>Reset</ControlButton>
            <ControlButton onClick={() => setSettingsOpen(true)} primary>
              New Game
            </ControlButton>
            <ControlButton onClick={onLeave} danger>
              Leave Room
            </ControlButton>
          </div>
        </header>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr),22rem]">
          <div className="grid auto-rows-fr gap-3 md:grid-cols-2">
            {room.players.map((player) => {
              const opponentDamageTargets = room.players
                .filter((other) => other.id !== player.id)
                .map((other) => ({
                  seatId: other.id,
                  label: other.playerName,
                  damageKey: `${other.id}:0`,
                  currentDamage: other.commanderNames.reduce((sum, _name, commanderIndex) => {
                    const key = `${other.id}:${commanderIndex}`;
                    return sum + (player.commanderDamageTaken[key] ?? 0);
                  }, 0)
                }));

              return (
                <PlayerPanel
                  key={player.id}
                  player={player}
                  opponentDamageTargets={opponentDamageTargets}
                  isActiveTurn={room.turnSeatIndex === player.seatIndex}
                  onRenamePlayer={(name) => onRenamePlayer(player.id, name)}
                  onAddLife={(amount) => onAdjustLife(player.id, amount)}
                  onAddPoison={(amount) => onAdjustPoison(player.id, amount)}
                  onAddTax={(commanderIndex, amount) => onAdjustTax(player.id, commanderIndex, amount)}
                  onAddCommanderDamage={(sourceKey, amount) => onAdjustCommanderDamage(player.id, sourceKey, amount)}
                  onTurn={() => onSetTurn(player.seatIndex)}
                />
              );
            })}
          </div>

          <div className="hidden space-y-3 xl:block">
            <section className="rounded-3xl border border-white/10 bg-black/30 p-4 shadow-glow backdrop-blur">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">Board notes</h2>
              <div className="space-y-3 text-sm leading-6 text-zinc-300">
                <p>Life totals stay center stage. Poison, commander tax, and commander damage live directly below each player so extra stats stay close but never steal the spotlight.</p>
                <p>Host View turns an online room into a shared judge or TV board without consuming a player seat.</p>
                <p>Reset re-applies the current room settings and clears the log. New Game opens room setup so the pod can be rebuilt cleanly.</p>
              </div>
            </section>

            <ActionLog
              actions={room.actionLog}
              listClassName="max-h-[28rem]"
              onRevertAction={onRevertLogAction}
            />
          </div>
        </section>

        {commonOverlays}
      </main>
    );
  }

  if (!focusedPlayer) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 text-white">
        <div className="rounded-3xl border border-white/10 bg-black/30 px-6 py-4 text-sm text-zinc-300 shadow-glow backdrop-blur">
          Waiting for seat assignment…
        </div>
        {commonOverlays}
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-3 pb-44 pt-[max(0.75rem,env(safe-area-inset-top))] text-white sm:px-4">
      <header className="mb-3 rounded-[24px] border border-white/10 bg-zinc-950/85 p-3 shadow-glow backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-black tracking-tight sm:text-xl">{room.roomName}</h1>
              <Badge>{room.format}</Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge>Room {room.roomCode}</Badge>
              <Badge>{connectedCount} connected</Badge>
            </div>

            <div className="mt-2 text-xs text-zinc-400 sm:text-sm">{status}</div>
          </div>

          <button
            onClick={() => setMenuOpen(true)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white xl:hidden"
            type="button"
            aria-label="Open room menu"
          >
            <MenuIcon />
          </button>

          <div className="hidden gap-2 xl:flex">
            {isOnline && isHostClient ? (
              <ControlButton onClick={() => setHostViewEnabled((value) => !value)}>
                {hostViewEnabled ? 'Player View' : 'Host View'}
              </ControlButton>
            ) : null}

            <ControlButton onClick={() => setInviteOpen(true)}>Invite</ControlButton>
            <ControlButton onClick={onReset}>Reset</ControlButton>
            <ControlButton onClick={() => setSettingsOpen(true)} primary>
              New Game
            </ControlButton>
            <ControlButton onClick={onLeave} danger>
              Leave Room
            </ControlButton>
          </div>
        </div>
      </header>

      <FocusedSeatCard
        player={focusedPlayer}
        opponents={opponents}
        isActiveTurn={room.turnSeatIndex === focusedPlayer.seatIndex}
        onRenamePlayer={(name) => onRenamePlayer(focusedPlayer.id, name)}
        onAdjustLife={(amount) => onAdjustLife(focusedPlayer.id, amount)}
        onAdjustPoison={(amount) => onAdjustPoison(focusedPlayer.id, amount)}
        onAdjustTax={(commanderIndex, amount) => onAdjustTax(focusedPlayer.id, commanderIndex, amount)}
        onAdjustCommanderDamage={(sourceKey, amount) => onAdjustCommanderDamage(focusedPlayer.id, sourceKey, amount)}
        onTurn={() => onSetTurn(focusedPlayer.seatIndex)}
      />

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-zinc-950/92 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl transition-transform duration-200"
        style={{
          transform: dockExpanded || selectedOpponent ? 'translateY(0)' : 'translateY(calc(100% - 5rem))'
        }}
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">Opponents</div>
            <button
              onClick={() => setDockExpanded((value) => !value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white"
              type="button"
            >
              {dockExpanded ? 'Minimize' : 'Expand'}
            </button>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto">
            {opponents.map((player) => {
              const dealtByMe = getDamageDealtBy(focusedPlayer, player);

              return (
                <button
                  key={player.id}
                  onClick={() => setSelectedOpponentId(player.id)}
                  className="flex min-w-[5rem] shrink-0 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2"
                  type="button"
                >
                  <div
                    className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/35 text-sm font-semibold"
                    style={{ outline: `2px solid ${player.color}` }}
                  >
                    {player.avatarUrl ? (
                      <img src={player.avatarUrl} alt={player.playerName} className="h-full w-full object-cover" />
                    ) : (
                      player.playerName.slice(0, 1)
                    )}
                  </div>

                  <div className="max-w-[4.5rem] truncate text-xs font-semibold">{player.playerName}</div>

                  {dockExpanded || selectedOpponentId === player.id ? (
                    <>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Life {player.life}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Cmd {dealtByMe}</div>
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedOpponent ? (
        <OpponentPeekSheet
          me={focusedPlayer}
          opponent={selectedOpponent}
          onClose={() => setSelectedOpponentId(null)}
        />
      ) : null}

      {commonOverlays}
    </main>
  );
}