-- Apply after the Admin Portal's supabase-teaching-loads.sql in the shared DB.
-- Adds read-only Portal access; existing Admin Portal policies stay in place.
begin;

create or replace function public.portal_can_read_teacher_workload(p_teacher_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller public.portal_profile%rowtype;
  matched_ids text[];
begin
  select * into caller from public.portal_profile where id = auth.uid();
  if not found then return false; end if;
  if not coalesce(public.is_app_email_allowed('portal', coalesce(caller.real_email, caller.email)), false) then
    return false;
  end if;
  if lower(coalesce(caller.role, '')) = 'admin'
     or (nullif(lower(public.dashboard_login_email('admin')), '') is not null
       and lower(coalesce(caller.auth_email, caller.email, '')) = lower(public.dashboard_login_email('admin')))
  then
    return true;
  end if;

  select array_agg(org.id::text) into matched_ids
  from public.org_chart org
  where lower(trim(org.first_name)) = lower(trim(caller.first_name))
    and lower(trim(org.family_name)) = lower(trim(caller.family_name))
    and lower(coalesce(org.category, '')) = 'teaching';

  -- Ambiguous names need an administrator to repair the teacher link.
  return coalesce(array_length(matched_ids, 1) = 1 and p_teacher_id = matched_ids[1], false);
end;
$$;

revoke all on function public.portal_can_read_teacher_workload(text) from public;
grant execute on function public.portal_can_read_teacher_workload(text) to authenticated;

drop policy if exists "portal teachers read own workload" on public.teaching_loads;
create policy "portal teachers read own workload"
on public.teaching_loads for select to authenticated
using (public.portal_can_read_teacher_workload(teacher_id));

grant select on public.teaching_loads to authenticated;
commit;
