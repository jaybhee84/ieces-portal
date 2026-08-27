-- Allow registered Dashboard Manager accounts to read the user directories
-- they manage. This is intentionally separate from is_bmi_manager(), because
-- that helper also grants write access to BMI operational data.
begin;
create or replace function public.is_dashboard_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dashboard_profiles p
    where p.user_id = auth.uid()
  );
$$;
revoke all on function public.is_dashboard_manager() from public, anon;
grant execute on function public.is_dashboard_manager() to authenticated;
drop policy if exists "Dashboard managers can read shared profiles"
  on public.profiles;
create policy "Dashboard managers can read shared profiles"
on public.profiles
for select to authenticated
using (public.is_dashboard_manager());
drop policy if exists "Dashboard managers can read BMI profiles"
  on public.bmi_profiles;
create policy "Dashboard managers can read BMI profiles"
on public.bmi_profiles
for select to authenticated
using (public.is_dashboard_manager());
grant select on public.profiles to authenticated;
grant select on public.bmi_profiles to authenticated;
commit;
