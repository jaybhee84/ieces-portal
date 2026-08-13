-- IECES Portal profile migration
-- WARNING: This intentionally deletes every existing Supabase Auth account.

begin;

-- Learners must be detached before their old adviser accounts are deleted.
update public.students
set adviser_id = null
where adviser_id is not null;

-- Delete all existing accounts. Existing public.profiles rows should be removed
-- automatically if their id has an ON DELETE CASCADE reference to auth.users.
delete from auth.users;

create table if not exists public.portal_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null,
  family_name text not null,
  first_name text not null,
  middle_initial text,
  full_name text generated always as (
    trim(first_name || ' ' || coalesce(middle_initial || '. ', '') || family_name)
  ) stored,
  role text not null default 'adviser'
    check (role in ('adviser', 'grade_chairman', 'admin')),
  grade_level_assigned integer,
  section_assigned text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_profile_email_key unique (email),
  constraint portal_profile_username_key unique (username)
);

-- Replace any old students.adviser_id foreign key with the portal table link.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and t.relname = 'students'
      and exists (
        select 1
        from unnest(c.conkey) as key(attnum)
        join pg_attribute a
          on a.attrelid = t.oid and a.attnum = key.attnum
        where a.attname = 'adviser_id'
      )
  loop
    execute format(
      'alter table public.students drop constraint %I',
      constraint_name
    );
  end loop;
end $$;

alter table public.students
  add constraint students_adviser_id_fkey
  foreign key (adviser_id)
  references public.portal_profile(id)
  on delete set null;

-- Auth signup creates the matching portal profile using metadata sent by the app.
create or replace function public.handle_new_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.portal_profile (
    id, email, username, family_name, first_name, middle_initial
  ) values (
    new.id,
    lower(new.email),
    trim(new.raw_user_meta_data ->> 'username'),
    trim(new.raw_user_meta_data ->> 'family_name'),
    trim(new.raw_user_meta_data ->> 'first_name'),
    nullif(trim(new.raw_user_meta_data ->> 'middle_initial'), '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_portal_profile on auth.users;
create trigger on_auth_user_created_portal_profile
  after insert on auth.users
  for each row execute function public.handle_new_portal_user();

alter table public.portal_profile enable row level security;

-- Required because the login form resolves an email from a username before auth.
drop policy if exists "Portal profiles readable for login" on public.portal_profile;
create policy "Portal profiles readable for login"
  on public.portal_profile for select
  to anon, authenticated
  using (true);

drop policy if exists "Users update own portal profile" on public.portal_profile;
create policy "Users update own portal profile"
  on public.portal_profile for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select on public.portal_profile to anon, authenticated;
grant update on public.portal_profile to authenticated;

commit;

-- After confirming the app works, the unused old table can be removed separately:
-- drop table public.profiles;
