-- save_advisory_lrns used a hand-rolled permission join that only matched an
-- adviser by exact org_chart name lookup, with no path for admin or
-- grade_chairman roles. That meant the "permitted" CTE could silently match
-- zero rows for those users: the update affected nothing, but since the
-- function still returned normally (no exception), the app reported success.
-- Switch to the same public.can_manage_student_form_137() check already used
-- by save_advisory_birthdates and save_advisory_middle_names so LRN saves
-- follow the same authorization rules as the rest of Advisory Class.

begin;

create or replace function public.save_advisory_lrns(p_updates jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare updated_count integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_updates, '[]'::jsonb)) <> 'array' then
    raise exception 'p_updates must be a JSON array';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) item
    where nullif(trim(item ->> 'lrn'), '') is not null
      and trim(item ->> 'lrn') !~ '^[0-9]{12}$'
  ) then raise exception 'LRN must contain exactly 12 digits'; end if;

  with requested as (
    select nullif(trim(item ->> 'id'), '') id,
           nullif(trim(item ->> 'lrn'), '') lrn
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) item
  ), permitted as (
    select requested.*
    from requested
    where requested.id is not null
      and public.can_manage_student_form_137(requested.id)
  )
  update public.students learner
  set lrn = permitted.lrn, updated_at = now()
  from permitted
  where learner.id::text = permitted.id
    and learner.school_id::text = '126001';
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.save_advisory_lrns(jsonb) from public, anon;
grant execute on function public.save_advisory_lrns(jsonb) to authenticated;

commit;
