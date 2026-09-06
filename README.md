# QuickCapture

A minimal, mobile-first task capture app: open the app, type one line, press
Enter, and continue — under two seconds, no accounts, no friction.

Built from the full product & engineering specification (PRD, technical
requirements, flow spec, UI/UX brief, schema, implementation plan).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Server-side persistence** through API routes with two interchangeable
  stores behind one facade (`lib/tasks/store.ts`): a file-backed store
  (atomic, locked writes to `data/tasks.json`) and a **Postgres store**
  (activated automatically when `DATABASE_URL` is set)

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

The store is chosen by environment — no code changes anywhere else:

| `DATABASE_URL` | Backend | File |
| -------------- | ------- | ---- |
| unset | File-backed JSON (`data/tasks.json`, atomic + locked) | `lib/tasks/file-store.ts` |
| set | Postgres (Render, Supabase, Neon, local docker…) | `lib/tasks/postgres-store.ts` |

The file store writes atomically with an O_EXCL lock file and stale-lock
recovery. The Postgres store uses one shared lazy `pg` Pool (works with
warm serverless invocations) and parameterized queries only.

### Wiring a Postgres backend

1. Provision Postgres (Render free Postgres, Supabase, Neon, or local:
   `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`).
2. Apply the schema once: `psql "$DATABASE_URL" -f db/schema.sql`
   (idempotent; includes the completion-rule trigger).
3. Set `DATABASE_URL` in `.env.local` / your host's dashboard — secrets stay
   server-side only. Restart the app; `GET /health` then reports
   `"backend": "postgres", "database": "up"`.

Works as-is with Supabase's connection string too — no Supabase client
needed (the old `supabase/schema.sql` remains for reference).

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

### Option B — Render (blueprint: web service + Postgres)

1. Push this folder to a GitHub repository.
2. On render.com: **New + → Blueprint** → pick the repo → **Apply**.
3. Render builds the Dockerfile and provisions the free Postgres instance
   from the blueprint; `DATABASE_URL` is injected automatically, so tasks
   survive redeploys and restarts even on the web service's free plan.
4. First boot only: apply `db/schema.sql` once (Render free Postgres does
   not run init scripts for you), then the service is fully durable.

### Option C — Vercel + Postgres (serverless)

The file store doesn't fit serverless (no writable persistent disk), so pair
Vercel with Postgres (Supabase, Neon, Render…):

1. Provision Postgres and apply `db/schema.sql` once.
2. Push to GitHub and import the repo on Vercel (or connect the existing
   project).
3. In the Vercel dashboard set the env var `DATABASE_URL` (Production +
   Preview + Development) and redeploy — the Postgres store activates
   automatically; verify with `GET /health` → `"backend": "postgres"`.
   Secrets stay server-side.

## Design notes

- Optimistic create/toggle with rollback on failure; the server response is
  always the reconciliation authority (keeps rapid captures ordered).
- Counts and filters are derived client-side — zero extra requests.
- Clear completed executes immediately; Clear all requires confirmation.
- 44px+ touch targets, visible focus states, semantic checkbox labels,
  per-filter empty states, and light/dark themes.
