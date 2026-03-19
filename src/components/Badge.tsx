import { PropsWithChildren } from 'react';

export function Badge({ children }: PropsWithChildren) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-300">
      {children}
    </span>
  );
}
