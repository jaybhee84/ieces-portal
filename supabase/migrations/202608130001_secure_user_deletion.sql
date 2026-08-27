-- Run this migration in BOTH the shared IECES and BMI Supabase projects.
-- Only users explicitly added here may invoke destructive admin operations.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
drop policy if exists "Admins can read their own authorization" on public.admin_users;
create policy "Admins can read their own authorization"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id);
revoke all on public.admin_users from anon;
grant select on public.admin_users to authenticated;
-- Add each dashboard administrator after replacing the email address.
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'admin@example.com'
-- on conflict (user_id) do nothing;

-- Ensure a conventional profiles.id foreign key is removed automatically
-- when its Auth account is deleted. This only changes an existing FK that
-- points from public.profiles(id) to auth.users(id).
do $$
declare
  fk_name text;
begin
  select c.conname into fk_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where c.contype = 'f'
    and n.nspname = 'public'
    and t.relname = 'profiles'
    and c.confrelid = 'auth.users'::regclass
  limit 1;

  if fk_name is not null then
    execute format('alter table public.profiles drop constraint %I', fk_name);
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;
