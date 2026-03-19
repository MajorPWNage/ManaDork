import { useState, type ChangeEvent } from 'react';
import { buildRoomSettings, getDefaultStartingLife } from '../lib/roomSettings';
import type { RoomSettings } from '../types';

interface RoomSettingsSheetProps {
  initialSettings: RoomSettings;
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (settings: Partial<RoomSettings>) => void;
}

const playerCounts = [2, 3, 4, 5, 6, 7, 8];

export function RoomSettingsSheet({
  initialSettings,
  title,
  confirmLabel,
  onClose,
  onConfirm
}: RoomSettingsSheetProps) {
  const [settings, setSettings] = useState<RoomSettings>(() => buildRoomSettings(initialSettings));

  const updateSettings = (patch: Partial<RoomSettings>) => {
    setSettings((current) => buildRoomSettings({ ...current, ...patch }));
  };

  const handleStartingLifeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;

    updateSettings({
      startingLife: Number(rawValue || getDefaultStartingLife(settings.format))
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 sm:items-center">
      <button
        onClick={onClose}
        className="absolute inset-0"
        type="button"
        aria-label="Close room settings overlay"
      />

      <div className="relative w-full max-w-lg rounded-[28px] border border-white/10 bg-zinc-950 p-4 text-white shadow-glow">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black">{title}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
              Room setup
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
              onChange={handleStartingLifeChange}
              className="w-full rounded-2xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-lg font-semibold text-white outline-none placeholder:text-zinc-600"
            />

            <div className="mt-2 text-xs text-zinc-500">
              Commander default is 40. Set any custom value for house rules or variants.
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
            type="button"
          >
            Cancel
          </button>

          <button
            onClick={() => onConfirm(settings)}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-zinc-950"
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}