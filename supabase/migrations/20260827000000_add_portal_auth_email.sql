-- Isolate IECES Portal authentication from every other IECES application.
-- Existing Portal users keep their current auth.users row, email, and password.

begin;

alter table public.portal_profile
  add column if not exists real_email text,
  add column if not exists auth_email text;

-- Backfill only missing values. No Auth identity is changed or recreated.
update public.portal_profile
set real_email = lower(trim(email))
where real_email is null;

update public.portal_profile portal
set auth_email = lower(trim(auth_user.email))
from auth.users auth_user
where portal.id = auth_user.id
  and portal.auth_email is null;

update public.portal_profile
set auth_email = lower(trim(email))
where auth_email is null;

alter table public.portal_profile
  alter column real_email set not null,
  alter column auth_email set not null;

create unique index if not exists portal_profile_real_email_lower_key
  on public.portal_profile (lower(real_email));
create unique index if not exists portal_profile_auth_email_lower_key
  on public.portal_profile (lower(auth_email));
create unique index if not exists portal_profile_username_lower_key
  on public.portal_profile (lower(username));

-- Legacy client signup remains operational during a staged rollout. Scoped
-- users are inserted by portal-register and deliberately ignored here.
create or replace function public.handle_new_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'app_source' = 'ieces_portal' then
    insert into public.portal_profile (
      id, email, real_email, auth_email, username,
      family_name, first_name, middle_initial
    ) values (
      new.id, lower(new.email), lower(new.email), lower(new.email),
      lower(trim(new.raw_user_meta_data ->> 'username')),
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

-- Resolve login without granting anonymous enumeration access to the table.
create or replace function public.resolve_portal_login(candidate_identifier text)
returns table(auth_email text, real_email text)
language sql
stable
security definer
set search_path = public
as $$
  select portal.auth_email, portal.real_email
  from public.portal_profile portal
  where lower(portal.username) = lower(trim(candidate_identifier))
     or lower(portal.real_email) = lower(trim(candidate_identifier))
  limit 1;
$$;

revoke all on function public.resolve_portal_login(text) from public;
grant execute on function public.resolve_portal_login(text) to anon, authenticated;

alter table public.portal_profile enable row level security;

drop policy if exists "Portal profiles readable for login" on public.portal_profile;
drop policy if exists "Users read own portal profile" on public.portal_profile;
create policy "Users read own portal profile"
  on public.portal_profile for select
  to authenticated
  using (auth.uid() = id);

revoke select on public.portal_profile from anon;
grant select on public.portal_profile to authenticated;

commit;
