create table if not exists public.bulletin_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  summary text check (summary is null or char_length(summary) <= 500),
  body text,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  is_published boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bulletin_announcements_public_idx
  on public.bulletin_announcements (is_published, published_at desc);
alter table public.bulletin_announcements enable row level security;
create policy "public read active bulletin announcements"
  on public.bulletin_announcements
  for select
  to anon
  using (
    is_published = true
    and (expires_at is null or expires_at >= now())
  );
create policy "dashboard users read bulletin announcements"
  on public.bulletin_announcements
  for select
  to authenticated
  using (
    exists (
      select 1 from public.dashboard_profiles
      where dashboard_profiles.user_id = auth.uid()
    )
  );
create policy "dashboard users create bulletin announcements"
  on public.bulletin_announcements
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.dashboard_profiles
      where dashboard_profiles.user_id = auth.uid()
    )
  );
create policy "dashboard users update bulletin announcements"
  on public.bulletin_announcements
  for update
  to authenticated
  using (
    exists (
      select 1 from public.dashboard_profiles
      where dashboard_profiles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.dashboard_profiles
      where dashboard_profiles.user_id = auth.uid()
    )
  );
create policy "dashboard users delete bulletin announcements"
  on public.bulletin_announcements
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.dashboard_profiles
      where dashboard_profiles.user_id = auth.uid()
    )
  );
grant select on public.bulletin_announcements to anon;
grant select, insert, update, delete on public.bulletin_announcements to authenticated;
alter publication supabase_realtime add table public.bulletin_announcements;
