-- IECES Portal profile setup
-- Non-destructive: does not delete or alter public.profiles or existing accounts.

begin;

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

-- Auth signup creates the matching portal profile using metadata sent by the app.
create or replace function public.handle_new_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ignore Auth accounts created by other apps sharing this Supabase project.
  if new.raw_user_meta_data ->> 'app_source' = 'ieces_portal' then
    insert into public.portal_profile (
      id, email, username, family_name, first_name, middle_initial
    ) values (
      new.id,
      lower(new.email),
      trim(new.raw_user_meta_data ->> 'username'),
      upper(trim(new.raw_user_meta_data ->> 'family_name')),
      upper(trim(new.raw_user_meta_data ->> 'first_name')),
      nullif(upper(trim(new.raw_user_meta_data ->> 'middle_initial')), '')
    );
  end if;
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
