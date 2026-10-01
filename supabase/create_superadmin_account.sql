-- IECES Portal superadmin account (username: superadmin)
--
-- Run once in the Supabase SQL editor. This is NOT an automatic migration.
--
-- Before running:
--   1. In the SQL editor, replace CHANGE_ME below with the superadmin
--      password. Do not save the real password in this file: this repository
--      is public.
--   2. In IECES Dashboard Manager, add superadmin@ieces.local to the Portal
--      allowlist.
--
-- Non-destructive: creates the superadmin Auth user if it is missing and
-- inserts/updates only the single superadmin profile row. An existing Auth
-- user keeps its current password.

do $$
declare
  superadmin_email    constant text := 'superadmin@ieces.local';
  superadmin_password constant text := 'CHANGE_ME';
  auth_user_id uuid;
begin
  select id into auth_user_id
  from auth.users
  where lower(email) = lower(superadmin_email);

  if auth_user_id is null then
    if superadmin_password = 'CHANGE_ME' or length(superadmin_password) < 6 then
      raise exception
        'Replace CHANGE_ME with the superadmin password (at least 6 characters) before running.';
    end if;

    auth_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', auth_user_id,
      'authenticated', 'authenticated', lower(superadmin_email),
      extensions.crypt(superadmin_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), auth_user_id, auth_user_id::text, 'email',
      jsonb_build_object(
        'sub', auth_user_id::text,
        'email', lower(superadmin_email),
        'email_verified', true
      ),
      now(), now(), now()
    );
  end if;

  insert into public.portal_profile (
    id, email, real_email, auth_email, username,
    family_name, first_name, role
  ) values (
    auth_user_id, lower(superadmin_email), lower(superadmin_email),
    lower(superadmin_email), 'superadmin',
    'ADMIN', 'SUPER', 'admin'
  )
  on conflict (id) do update
    set username = 'superadmin',
        role = 'admin';
end;
$$;
