-- Run this in the Supabase SQL Editor for the shared IECES project.
-- It lets a signed-in Portal adviser save Religion, Tribe, Address, and Phil-IRI category
-- for learners in the adviser's Org Chart class. The function is intentionally
-- narrower than granting unrestricted UPDATE access on public.students.

begin;

alter table public.students
  add column if not exists religion text,
  add column if not exists tribe text,
  add column if not exists address text,
  add column if not exists reading_category text;

create or replace function public.save_advisory_demographics(p_updates jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(coalesce(p_updates, '[]'::jsonb)) <> 'array' then
    raise exception 'p_updates must be a JSON array';
  end if;

  with requested as (
    select
      nullif(trim(item ->> 'id'), '') as id,
      nullif(trim(item ->> 'religion'), '') as religion,
      nullif(trim(item ->> 'tribe'), '') as tribe,
      nullif(trim(item ->> 'address'), '') as address,
      case
        when nullif(trim(item ->> 'reading_category'), '') in
          ('NGS', 'FF', 'FE', 'IF', 'IE', 'INDF', 'INDE', 'NA')
        then nullif(trim(item ->> 'reading_category'), '')
        else null
      end as reading_category
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) as item
  ),
  permitted as (
    select distinct requested.*
    from requested
    join public.students learner
      on learner.id::text = requested.id
     and learner.school_id = '126001'
    join public.portal_profile portal
      on portal.id = (select auth.uid())
    left join public.org_chart adviser
      on lower(trim(adviser.first_name)) = lower(trim(portal.first_name))
     and lower(trim(adviser.family_name)) = lower(trim(portal.family_name))
     and lower(coalesce(adviser.category, '')) = 'teaching'
     and (
       lower(coalesce(adviser.teaching_type, '')) = 'adviser'
       or coalesce(adviser.is_grade_chairman, false)
     )
    where
      portal.role = 'admin'
      or (
        portal.role = 'grade_chairman'
        and (
          learner.grade_level::text = portal.grade_level_assigned::text
          or upper(coalesce(learner.section, '')) like
             '%' || upper(coalesce(adviser.grade_level, '')) || '%'
        )
      )
      or (
        portal.role = 'adviser'
        and (
          learner.adviser_id = portal.id
          or learner.adviser_id = adviser.id
          or (
            upper(coalesce(learner.section, '')) like
              '%' || upper(coalesce(adviser.family_name, '')) || '%'
            and (
              learner.grade_level::text =
                regexp_replace(coalesce(adviser.grade_level, ''), '[^0-9]', '', 'g')
              or upper(coalesce(learner.section, '')) like
                '%' || upper(coalesce(adviser.grade_level, '')) || '%'
            )
          )
        )
      )
  )
  update public.students as learner
  set
    religion = permitted.religion,
    tribe = permitted.tribe,
    address = permitted.address,
    reading_category = permitted.reading_category,
    updated_at = now()
  from permitted
  where learner.id::text = permitted.id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.save_advisory_demographics(jsonb) from public;
revoke all on function public.save_advisory_demographics(jsonb) from anon;
grant execute on function public.save_advisory_demographics(jsonb) to authenticated;

comment on function public.save_advisory_demographics(jsonb) is
  'Safely updates Religion, Tribe, Address, and Phil-IRI category for learners in the signed-in Portal adviser class.';

commit;
