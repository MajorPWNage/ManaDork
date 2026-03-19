import { motion } from 'framer-motion';
import type { PlayerSeat } from '../types';
import { Badge } from './Badge';

interface OpponentDamageTarget {
  seatId: string;
  label: string;
  damageKey: string;
  currentDamage: number;
}

interface PlayerPanelProps {
  player: PlayerSeat;
  isActiveTurn: boolean;
  opponentDamageTargets: OpponentDamageTarget[];
  onRenamePlayer: (name: string) => void;
  onAddLife: (amount: number) => void;
  onAddPoison: (amount: number) => void;
  onAddTax: (commanderIndex: number, amount: number) => void;
  onAddCommanderDamage: (sourceKey: string, amount: number) => void;
  onTurn: () => void;
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid h-14 min-w-14 place-items-center rounded-2xl border border-white/10 bg-black/35 text-2xl font-semibold text-white shadow-glow transition active:scale-[0.98] sm:h-16 sm:min-w-16 sm:text-3xl"
      type="button"
    >
      {label}
    </button>
  );
}

export function PlayerPanel({
  player,
  isActiveTurn,
  opponentDamageTargets,
  onRenamePlayer,
  onAddLife,
  onAddPoison,
  onAddTax,
  onAddCommanderDamage,
  onTurn
}: PlayerPanelProps) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-glow"
      style={{ boxShadow: isActiveTurn ? `0 0 0 1px ${player.color}, 0 0 48px rgba(255,255,255,0.08)` : undefined }}
    >
      {player.backgroundUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${player.backgroundUrl})` }}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/45 to-black/80" />

      <div className="relative flex h-full min-h-[18rem] flex-col p-3 sm:min-h-[21rem] sm:p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
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
              <div className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-400">
                {player.commanderNames.filter(Boolean).join(' • ') || 'Commander'}
              </div>
            </div>
          </div>

          <button
            onClick={onTurn}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${
              isActiveTurn ? 'bg-white text-zinc-900' : 'border border-white/10 bg-black/30 text-zinc-300'
            }`}
            type="button"
          >
            {isActiveTurn ? 'Turn' : 'Set Turn'}
          </button>
        </div>

        <div className="grid flex-1 grid-cols-[3.5rem,1fr,3.5rem] gap-2 sm:grid-cols-[4.25rem,1fr,4.25rem]">
          <div className="flex flex-col justify-end gap-2">
            <button onClick={() => onAddLife(-1)} className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-black/35 text-2xl font-semibold shadow-glow sm:h-16 sm:text-3xl" type="button">-1</button>
            <button onClick={() => onAddLife(-5)} className="grid h-14 place-items-center rounded-2xl border border-white/10 bg-black/35 text-2xl font-semibold shadow-glow sm:h-16 sm:text-3xl" type="button">-5</button>
          </div>

          <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/10 bg-black/25 px-2 py-6 text-center backdrop-blur-sm">
            <motion.div
              key={player.life}
              initial={{ scale: 0.92, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.16 }}
              className="leading-none text-[4.25rem] font-black tracking-tight text-white sm:text-[5.5rem]"
            >
              {player.life}
            </motion.div>
            <div className="mt-2 text-xs uppercase tracking-[0.25em] text-zinc-400">Life</div>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <ActionButton label="+1" onClick={() => onAddLife(1)} />
            <ActionButton label="+5" onClick={() => onAddLife(5)} />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2 text-left">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Badge>Poison</Badge>
              <div className="text-xl font-bold text-white">{player.poison}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onAddPoison(-1)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white"
                type="button"
              >
                -1
              </button>
              <button
                onClick={() => onAddPoison(1)}
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
                  <div className="truncate text-xs uppercase tracking-[0.14em] text-zinc-400">{name || `Commander ${commanderIndex + 1}`}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onAddTax(commanderIndex, -1)}
                      className="rounded-lg border border-white/10 px-2 py-1 text-sm font-semibold text-white"
                      type="button"
                    >
                      -2
                    </button>
                    <span className="text-lg font-bold text-white">{(player.commanderTax[commanderIndex] ?? 0) * 2}</span>
                    <button
                      onClick={() => onAddTax(commanderIndex, 1)}
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

        <div className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-3">
  <div className="mb-2 flex items-center justify-between">
    <Badge>Commander damage taken</Badge>
    <div className="text-sm text-zinc-400">Tap opponent to add 1</div>
  </div>

  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {opponentDamageTargets.length === 0 ? (
      <div className="col-span-full text-sm text-zinc-500">Add more players to track commander damage.</div>
    ) : (
      opponentDamageTargets.map((target) => (
        <button
          key={target.seatId}
          onClick={() => onAddCommanderDamage(target.damageKey, 1)}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition active:scale-[0.98]"
          type="button"
        >
          <div className="truncate text-xs uppercase tracking-[0.14em] text-zinc-400">{target.label}</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-sm text-zinc-300">Damage</span>
            <span className="text-xl font-bold text-white">{target.currentDamage}</span>
          </div>
        </button>
      ))
    )}
  </div>
</div>
      </div>
    </motion.section>
  );
}
