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
    select distinct requested.*
    from requested
    join public.students learner
      on learner.id::text = requested.id and learner.school_id::text = '126001'
    join public.portal_profile portal on portal.id = (select auth.uid())
    join public.org_chart adviser
      on lower(trim(adviser.first_name)) = lower(trim(portal.first_name))
     and lower(trim(adviser.family_name)) = lower(trim(portal.family_name))
     and lower(coalesce(adviser.category, '')) = 'teaching'
     and (lower(coalesce(adviser.teaching_type, '')) = 'adviser'
          or coalesce(adviser.is_grade_chairman, false))
    where learner.adviser_id::text in (portal.id::text, adviser.id::text)
       or upper(coalesce(learner.section, '')) like
          '%' || upper(trim(adviser.family_name)) || '%'
  )
  update public.students learner
  set lrn = permitted.lrn, updated_at = now()
  from permitted where learner.id::text = permitted.id;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.save_advisory_lrns(jsonb) from public, anon;
grant execute on function public.save_advisory_lrns(jsonb) to authenticated;

commit;
