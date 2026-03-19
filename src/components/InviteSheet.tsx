import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getRoomInviteUrl } from '../lib/invite';
import type { RoomSnapshot } from '../types';

interface InviteSheetProps {
  room: RoomSnapshot;
  onClose: () => void;
}

export function InviteSheet({ room, onClose }: InviteSheetProps) {
  const inviteUrl = useMemo(() => getRoomInviteUrl(room.roomCode), [room.roomCode]);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 1800);
    } catch {
      setCopyStatus('failed');
      window.setTimeout(() => setCopyStatus('idle'), 1800);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join ${room.roomName}`,
          text: `Join room ${room.roomCode}`,
          url: inviteUrl
        });
      } else {
        await handleCopy();
      }
    } catch {
      // user canceled or share failed
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-zinc-950 p-4 text-white shadow-glow">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black">Invite players</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
              Room {room.roomCode}
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

        <div className="rounded-3xl border border-white/10 bg-white p-4">
          <div className="flex justify-center">
            <QRCodeSVG
              value={inviteUrl}
              size={220}
              marginSize={8}
              bgColor="#ffffff"
              fgColor="#111111"
              title={`Join room ${room.roomCode}`}
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Invite link
          </div>
          <div className="break-all text-sm text-zinc-200">{inviteUrl}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={handleShare}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-zinc-950"
            type="button"
          >
            Share
          </button>

          <button
            onClick={handleCopy}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
            type="button"
          >
            {copyStatus === 'copied'
              ? 'Copied'
              : copyStatus === 'failed'
              ? 'Copy failed'
              : 'Copy link'}
          </button>
        </div>

        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Scan the QR code or open the link on another device to jump straight into this room.
        </p>
      </div>
    </div>
  );
}