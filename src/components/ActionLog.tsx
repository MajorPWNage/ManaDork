import type { GameAction } from '../types';

interface ActionLogProps {
  actions: GameAction[];
  listClassName?: string;
  onRevertAction?: (actionId: string) => void;
}

export function ActionLog({
  actions,
  listClassName = 'max-h-72',
  onRevertAction
}: ActionLogProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-4 shadow-glow backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">Action Log</h2>
        <span className="text-xs text-zinc-500">Tap X to revert</span>
      </div>

      <div className={`${listClassName} space-y-2 overflow-auto pr-1`}>
        {actions.length === 0 ? (
          <p className="text-sm text-zinc-500">No actions yet.</p>
        ) : (
          actions.map((action) => (
            <div key={action.id} className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-100">{action.description}</div>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      {action.actor}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {new Date(action.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {action.reversible && onRevertAction ? (
                  <button
                    onClick={() => onRevertAction(action.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-rose-400/20 bg-rose-500/10 text-sm font-bold text-rose-100 transition active:scale-[0.96]"
                    type="button"
                    aria-label={`Revert ${action.description}`}
                    title="Revert action"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}