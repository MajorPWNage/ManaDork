# ManaBoard starter

A mobile-first MTG life tracker designed for Commander pods, with local mode now and Supabase-backed realtime sync when environment variables are configured.

## What this starter includes

- React + TypeScript + Tailwind CSS
- PWA-ready Vite setup
- 4-player Commander board with giant life totals
- Large thumb-friendly life controls
- Poison counters
- Commander tax
- Commander damage quick controls
- Action log
- Undo, reset, and new game actions
- Local persistence for recent rooms and active room
- Supabase-based room sync hook and Presence channel scaffolding

## Recommended architecture

### Frontend

- `App.tsx`: switches between lobby and active game
- `RoomLobby`: create or join a room
- `GameBoard`: shared board shell with top controls and action log
- `PlayerPanel`: reusable seat UI for life and tracked stats
- `useRoomState`: state orchestration, local persistence, room sync, presence

### Backend

Use Supabase for:

- anonymous auth or optional signed-in auth later
- Postgres storage of room snapshots
- Realtime row subscriptions for room updates
- Presence channels for connected device indicators
- Storage buckets later for avatars and animated backgrounds

### State strategy

The starter intentionally uses a **room snapshot model**:

- Every room stores a single `game_state` JSON payload in `rooms`
- Clients subscribe to the room row and hydrate instantly on change
- An append-only `room_events` table is recommended for future undo, analytics, and match history

This is fast to build and easy to reason about. Later you can evolve to a reducer-based action stream if you need stronger conflict resolution.

## Local development

```bash
npm install
npm run dev
```

## Supabase setup

Create `.env`:

```bash
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Then run the SQL in `supabase/schema.sql`.

## Realtime sync flow

1. Host creates a room and inserts a row into `public.rooms`
2. `game_state` contains the full live snapshot
3. Each client subscribes to `postgres_changes` on that room row
4. Each update writes a fresh snapshot to the row
5. Presence channel tracks connected devices for UI badges

## Next features to add

- seat claiming and explicit controller ownership
- per-opponent commander damage matrix editor
- partner commander UI
- room share links
- avatars and animated backgrounds stored in Supabase Storage
- monarch, initiative, energy, experience, planechase
- reducer-based optimistic updates with conflict handling
- match history screen
- offline queue for reconnect merge behavior

## Suggested production hardening

- require auth for updates
- add seat ownership rules in RLS
- store actions in `room_events` on every mutation
- perform updates through Supabase Edge Functions or Postgres RPC for authoritative undo
- add room expiration / archive flow
- compress or trim oversized snapshots when long logs accumulate
