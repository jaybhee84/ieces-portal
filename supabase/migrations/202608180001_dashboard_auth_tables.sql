-- ─────────────────────────────────────────────────────────────────────────────
-- Dashboard Manager: per-app whitelist + profile tables
-- Part of PROJECT RISING shared Supabase project (joilvslvsioayrjshuxg)
-- ─────────────────────────────────────────────────────────────────────────────

-- Allowed emails whitelist ─────────────────────────────────────────────────
create table if not exists dashboard_allowed_users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  added_by   text,
  created_at timestamptz default now()
);
-- Per-app profile (separate from bmi_profiles, profiles, etc.) ────────────
-- A user can have one row here even if they already have a profile in
-- another app's table — the same auth.users.id is reused, only this
-- table is app-specific.
create table if not exists dashboard_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  role         text default 'user',
  created_at   timestamptz default now(),
  unique (user_id)  -- one dashboard profile per auth user
);
-- RLS ────────────────────────────────────────────────────────────────────────
alter table dashboard_allowed_users enable row level security;
alter table dashboard_profiles      enable row level security;
-- Anon can read the whitelist so the edge function (which runs with the
-- service role key) can check it, and so the admin UI can list entries
-- without needing a service role key on the client.
create policy "anon read allowed_users"
  on dashboard_allowed_users for select to anon using (true);
-- Authenticated admin can insert/delete allowed emails from the UI.
create policy "authenticated manage allowed_users"
  on dashboard_allowed_users for all to authenticated using (true);
-- Users can read their own dashboard profile.
create policy "own profile read"
  on dashboard_profiles for select to authenticated
  using (user_id = auth.uid());
-- Service role has full access (used by the edge function).
create policy "service role full access profiles"
  on dashboard_profiles for all to service_role using (true);
