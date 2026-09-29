# Database setup

The storefront runs on Supabase:
- Postgres holds the catalog, carts, orders, addresses and reviews.
- Supabase Auth handles email + password accounts.
- The schema, row-level security and business logic are versioned SQL in
  [`migrations/`](./migrations).
- The catalog seed is generated from [`seed/`](./seed).

The API reference is [`docs/API.md`](../docs/API.md).

## Local (Docker)

Requirements: Docker Desktop running and Node 20+. The CLI runs through `npx`.

```bash
npx supabase start        # first run pulls images (~2 min); prints URLs + keys
npm run db:reset          # (re)apply migrations + seed.sql → fresh database
npm run db:types          # regenerate lib/db/database.types.ts after schema changes
```

`supabase start` prints the local API URL and keys. Put them in `.env.local`
(see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<printed "anon key" / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<printed "service_role key" / secret key>
```

The local services are:
- **Studio:** http://127.0.0.1:54323
- **Mail catcher:** http://127.0.0.1:54324. Email confirmation is off locally,
  so sign-up works immediately.
- **Postgres:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

### Catalog seed

`supabase/seed.sql` is generated. Don't edit it by hand:

```bash
# edit supabase/seed/catalog-us.json / catalog-in.json, then
npm run db:seed:build     # → supabase/seed.sql
npm run db:reset
```

### Tests

```bash
npm test                  # unit/component tests (jsdom)
npm run test:db           # integration tests against the local stack (needs .env.local)
```

The DB suite creates and deletes its own throwaway users. The Stripe webhook
test only runs when `STRIPE_SECRET_KEY` is set. It creates and expires real
test-mode Checkout Sessions.

## Hosted Supabase (production)

1. **Create a project.** On https://supabase.com, choose **New project** and pick a
   region near your Vercel region.
2. **Link and push the schema** from this directory. You will be asked for the
   database password.
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push             # applies supabase/migrations/*
   ```
3. **Seed the catalog.** This only needs doing once, and `db push` does not run seeds:
   ```bash
   psql "$(npx supabase db url --linked)" -f supabase/seed.sql
   ```
   (or paste `seed.sql` into the dashboard's SQL editor).
4. **Configure auth.** Go to **Authentication → Providers → Email** and make sure it
   is enabled. For a demo, turn **Confirm email** off. If you keep it on,
   `POST /auth/signup` returns `202 confirmationRequired`. Then set **URL
   Configuration → Site URL** to the deployed origin.
5. **Get the keys.** Under **Project Settings → API**, copy the Project URL, the
   anon/publishable key and the service_role/secret key.

## Automatic migrations (GitHub Actions)

`.github/workflows/supabase-migrations.yml` keeps the hosted schema in step with
`supabase/migrations/`, so you don't run `db push` by hand:

- **Pull requests** that touch `supabase/` or `test/integration/` start a fresh
  local Supabase in CI. That applies every migration and the seed. The job then
  runs `npm run test:db` against it and adds the list of migrations that merging
  would apply to the job summary.
- **Pushes to `main`** that add migrations run the same checks, including the
  drift check below, then `supabase db push` to the hosted project. Seeds are
  never pushed. Only one push runs at a time, and a push never starts while
  hosted has drifted.
- **Every day at 05:23 UTC** the drift check runs on its own. It catches changes
  made directly on the hosted project, for example in the dashboard. GitHub
  emails you when a scheduled run fails. It also pauses schedules in repos with
  no activity for 60 days.
- **Actions → Supabase migrations → Run workflow** does the same on demand.

### Drift check

The **Hosted matches migrations** job fails when any of these is true:

1. **The history doesn't match.** Hosted has applied a migration that isn't in
   `supabase/migrations/`, for example one pushed from a branch that was never
   merged. Merge that branch, or fix the record with `supabase migration repair`.
2. **A migration is out of order.** A migration that isn't applied yet is older
   than the newest applied one, so `db push` would skip it. Give it a newer
   timestamp.
3. **The schema differs.** The job builds a database from the migrations hosted
   has applied and runs `supabase db diff` against hosted for the `public` and
   `private` schemas. Any difference fails the job, and the job summary shows the
   SQL. If the change was intended, capture it with
   `npx supabase db diff --linked -f <name>` and commit it. Otherwise, undo it on
   hosted.

Supabase-managed schemas aren't compared: our trigger on `auth.users` and the
storage policies for `product-images` live there, and diffing those schemas
reports Supabase platform upgrades rather than our changes.

One-time setup in **GitHub → Settings → Secrets and variables → Actions**:

| Name | Kind | Value |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | secret | a personal access token from supabase.com → **Account → Access Tokens** |
| `SUPABASE_PROJECT_REF` | variable | the project ref (the subdomain of `NEXT_PUBLIC_SUPABASE_URL`) |
| `SUPABASE_DB_PASSWORD` | secret, optional | the database password; without it the CLI signs in with a temporary login role |

Vercel deploys `main` at the same time as the migration job, so for a minute or
two new code can run against the old schema. Keep migrations additive, and make
code tolerate a missing column or function until the push lands (as
`is_admin()` does: an error reads as "not an admin"). Split destructive changes
(drop or rename) into a later migration, once no deployed code uses the old shape.

## Stripe (card payments)

Card checkout uses Stripe-hosted Checkout in test mode. Without `STRIPE_SECRET_KEY`
the card option is hidden, and the other payment methods still place real orders.

1. Under **Dashboard → Developers → API keys** (test mode), copy the secret key and
   set it as `STRIPE_SECRET_KEY`.
2. Set up the webhook. It confirms orders even if the shopper never returns to the
   site, and it releases stock when a session expires unpaid.
   - **Deployed:** go to **Developers → Webhooks → Add endpoint** and enter
     `https://<host>/api/v1/webhooks/stripe`. Add these events:
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.expired` and `checkout.session.async_payment_failed`.
     Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
   - **Local:** run
     `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe`. It
     prints a `whsec_…` secret for `.env.local`.

## Vercel environment

Set these for **Production** (and Preview if used), then redeploy:

| Variable | Secret? | Needed for |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | no | everything |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (RLS-protected) | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | card payment confirmation, webhook, releasing stock |
| `STRIPE_SECRET_KEY` | **yes** | card payments |
| `STRIPE_WEBHOOK_SECRET` | **yes** | `/api/v1/webhooks/stripe` |

## Housekeeping

`public.purge_stale_guest_carts(interval default '30 days')` deletes idle guest
carts. It is service-role only. Schedule it with pg_cron (**Database →
Extensions → pg_cron**):

```sql
select cron.schedule('purge-guest-carts', '0 4 * * *', $$select public.purge_stale_guest_carts()$$);
```
