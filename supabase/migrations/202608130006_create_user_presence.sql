-- TARGET: shared IECES Supabase only.
create table if not exists public.user_presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null check (app_id in ('report', 'portal', 'media', 'bmi', 'admin')),
  email text,
  status text not null default 'online' check (status in ('online', 'offline')),
  last_seen timestamptz not null default now(),
  primary key (user_id, app_id)
);
alter table public.user_presence enable row level security;
drop policy if exists "Authenticated users can read presence" on public.user_presence;
create policy "Authenticated users can read presence" on public.user_presence
for select to authenticated using (true);
drop policy if exists "Users can create own presence" on public.user_presence;
create policy "Users can create own presence" on public.user_presence
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can update own presence" on public.user_presence;
create policy "Users can update own presence" on public.user_presence
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users can delete own presence" on public.user_presence;
create policy "Users can delete own presence" on public.user_presence
for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.user_presence to authenticated;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_presence'
  ) then
    alter publication supabase_realtime add table public.user_presence;
  end if;
end
$$;
