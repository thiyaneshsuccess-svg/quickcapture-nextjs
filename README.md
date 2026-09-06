# QuickCapture

A minimal, mobile-first task capture app: open the app, type one line, press
Enter, and continue — under two seconds, no accounts, no friction.

Built from the full product & engineering specification (PRD, technical
requirements, flow spec, UI/UX brief, schema, implementation plan).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Server-side persistence** through API routes with a file-backed store
  (atomic, locked writes to `data/tasks.json`)

## Run it

```bash
cd quickcapture
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## API

| Method | Path                    | Purpose                          |
| ------ | ----------------------- | -------------------------------- |
| GET    | `/api/tasks?status=…`   | List tasks (`all/pending/done`) + counts |
| POST   | `/api/tasks`            | Create task (`{ text }`)         |
| PATCH  | `/api/tasks/:id`        | Toggle completion (`{ completed }`) |
| DELETE | `/api/tasks/completed`  | Remove completed tasks           |
| DELETE | `/api/tasks`            | Remove all tasks                 |

Server-side rules: trim + validate text (1–500 chars), server-generated IDs
and timestamps, `completed_at`/`updated_at` invariants, newest-first ordering
with a stable tiebreaker for rapid captures.

## Persistence model

The default store (`lib/tasks/store.ts`) writes `data/tasks.json` atomically
with an O_EXCL lock file and stale-lock recovery, so refresh/reopen and
concurrent requests are safe without any external services.

### Upgrading to Postgres/Supabase

1. Create the tables: run `supabase/schema.sql` (includes the completion-rule
   trigger).
2. `npm install @supabase/supabase-js`
3. Re-implement `lib/tasks/store.ts` against the Supabase client — the API
   routes and UI are store-agnostic and need no changes.
4. Set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (or your Postgres
   connection string) in `.env.local`; keep secrets server-side only.

## Deploy

### Option A — Docker (any host, file-backed persistence)

```bash
docker build -t quickcapture .
docker run -p 3000:3000 -v quickcapture-data:/app/data quickcapture
# or: docker compose up --build
```

Mount a volume at `/app/data` (or set `QUICKCAPTURE_DATA_DIR`) so tasks
survive container restarts. `/health` is available for load balancers and
uptime checks.

### Option B — Render (one-click blueprint)

1. Push this folder to a GitHub repository.
2. On render.com: **New + → Blueprint** → pick the repo → **Apply**.
3. Render builds the Dockerfile, attaches a 1 GB disk at `/app/data`, and
   uses `/health` as the health check. You get a live HTTPS URL.

### Option C — Vercel + Supabase (serverless)

The file store doesn't fit serverless (no writable persistent disk), so pair
Vercel with Postgres:

1. Create a Supabase project and run `supabase/schema.sql`.
2. Implement the Supabase variant of `lib/tasks/store.ts` (see
   "Upgrading to Postgres/Supabase" above).
3. Push to GitHub and import the repo on Vercel; set the database env vars
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) in the Vercel dashboard —
   secrets stay server-side.

## Design notes

- Optimistic create/toggle with rollback on failure; the server response is
  always the reconciliation authority (keeps rapid captures ordered).
- Counts and filters are derived client-side — zero extra requests.
- Clear completed executes immediately; Clear all requires confirmation.
- 44px+ touch targets, visible focus states, semantic checkbox labels,
  per-filter empty states, and light/dark themes.
