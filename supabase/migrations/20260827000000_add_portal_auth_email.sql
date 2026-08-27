-- Give IECES Portal its own Auth login identity per real email.
-- Existing profiles retain their current Auth email for backward compatibility;
-- newly registered profiles use a hidden portal-scoped Auth email.

begin;

alter table public.portal_profile
  add column if not exists auth_email text;

update public.portal_profile
set auth_email = lower(email)
where auth_email is null;

alter table public.portal_profile
  alter column auth_email set not null;

create unique index if not exists portal_profile_auth_email_key
  on public.portal_profile (auth_email);

-- Keep the legacy trigger compatible with the new column. The new registration
-- Edge Function creates app-scoped users without app_source metadata, so it
-- inserts the profile itself and this trigger intentionally ignores them.
create or replace function public.handle_new_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'app_source' = 'ieces_portal' then
    insert into public.portal_profile (
      id, email, auth_email, username, family_name, first_name, middle_initial
    ) values (
      new.id,
      lower(new.email),
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

commit;
