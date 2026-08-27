-- Keep the Dashboard Manager synchronized with BMI profile changes in the
-- shared IECES Supabase project.
begin;
-- The BMI desktop app signs in by username while Supabase Auth signs in by
-- email. The dashboard uses this same resolver so both apps authenticate the
-- exact same auth.users/bmi_profiles identity.
create or replace function public.get_email_by_username(lookup_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.bmi_profiles
  where lower(username) = lower(trim(lookup_username))
  limit 1;
$$;
revoke all on function public.get_email_by_username(text) from public;
grant execute on function public.get_email_by_username(text) to anon, authenticated;
-- Let an open dashboard refresh immediately after a BMI profile is created or
-- updated. Existing rows remain protected by bmi_profiles RLS policies.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bmi_profiles'
  ) then
    alter publication supabase_realtime add table public.bmi_profiles;
  end if;
end
$$;
commit;
