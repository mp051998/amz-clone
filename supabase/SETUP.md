# Supabase setup (one-time, ~3 minutes)

This connects the clone to a real database with email + password accounts.
Orders, cart, saved addresses and reviews move from browser cookies into
Postgres, scoped per user by row-level security.

## 1. Create the project
1. Go to https://supabase.com → sign in → **New project**.
2. Name it (e.g. `amz-clone`), pick a region near you, set a database password
   (you won't need it for the app), and create. Wait ~1 min for it to spin up.

## 2. Create the tables
1. In the project, open **SQL Editor → New query**.
2. Paste the entire contents of [`schema.sql`](./schema.sql) and click **Run**.
   You should see "Success. No rows returned."

## 3. Turn on email + password
1. **Authentication → Providers → Email**: make sure it's enabled.
2. For a demo, **Authentication → Sign In / Providers → Email → "Confirm email"**:
   turn **off** so new accounts work immediately without a confirmation email.
   (Leave it on if you'd rather verify emails — sign-in will then require the link.)

## 4. Grab the three keys
**Project Settings → API**, copy:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- (**service_role** key → `SUPABASE_SERVICE_ROLE_KEY` — optional, not needed now;
  row-level security runs every query as the signed-in user, so the anon key is enough.)

## 5. Give them to the app
- **Local:** copy `.env.example` to `.env.local` and paste the three values.
- **Production:** add the same three in **Vercel → Project → Settings →
  Environment Variables** (all three for the Production environment), then redeploy.

That's it — the app detects the env vars and switches from cookie mode to DB mode.
