-- Store each learner's Form 137 on the existing students row, partitioned by
-- school year. The server determines the current school year so clients cannot
-- overwrite a prior-year entry accidentally.

begin;

alter table public.students
  add column if not exists form_137_records jsonb not null default '{}'::jsonb;

alter table public.students
  drop constraint if exists students_form_137_records_object_check;

alter table public.students
  add constraint students_form_137_records_object_check
  check (jsonb_typeof(form_137_records) = 'object');

comment on column public.students.form_137_records is
  'SF10-ES/Form 137 data keyed by canonical school year (for example 2026-2027).';

create or replace function public.can_manage_student_form_137(
  candidate_student_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students learner
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
    where learner.id::text = nullif(trim(candidate_student_id), '')
      and learner.school_id::text = '126001'
      and (
        lower(coalesce(portal.role, '')) = 'admin'
        or (
          lower(coalesce(portal.role, '')) = 'grade_chairman'
          and (
            learner.grade_level::text = portal.grade_level_assigned::text
            or regexp_replace(coalesce(learner.grade_level::text, ''), '[^0-9]', '', 'g') =
               regexp_replace(coalesce(adviser.grade_level, ''), '[^0-9]', '', 'g')
          )
        )
        or (
          lower(coalesce(portal.role, '')) = 'adviser'
          and (
            learner.adviser_id::text in (portal.id::text, adviser.id::text)
            or (
              learner.adviser_id is null
              and upper(coalesce(learner.section, '')) like
                  '%' || upper(trim(coalesce(adviser.family_name, ''))) || '%'
              and regexp_replace(coalesce(learner.grade_level::text, ''), '[^0-9]', '', 'g') =
                  regexp_replace(coalesce(adviser.grade_level, ''), '[^0-9]', '', 'g')
            )
          )
        )
      )
  );
$$;

revoke all on function public.can_manage_student_form_137(text)
  from public, anon, authenticated;

create or replace function public.save_current_student_form_137(
  p_student_id text,
  p_form_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_today date := timezone('Asia/Manila', now())::date;
  school_year_start integer;
  current_school_year text;
  saved_record jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(trim(p_student_id), '') is null then
    raise exception 'Student ID is required';
  end if;

  if jsonb_typeof(coalesce(p_form_data, 'null'::jsonb)) <> 'object' then
    raise exception 'Form 137 data must be a JSON object';
  end if;

  if nullif(trim(p_form_data ->> 'learnerId'), '') is not null
     and trim(p_form_data ->> 'learnerId') <> trim(p_student_id) then
    raise exception 'Form 137 learner ID does not match the students row';
  end if;

  if octet_length(p_form_data::text) > 1048576 then
    raise exception 'Form 137 data exceeds the 1 MB limit';
  end if;

  if not public.can_manage_student_form_137(p_student_id) then
    raise exception 'You cannot update Form 137 for this learner'
      using errcode = '42501';
  end if;

  school_year_start := case
    when extract(month from local_today) >= 6
      then extract(year from local_today)::integer
    else extract(year from local_today)::integer - 1
  end;
  current_school_year := school_year_start::text || '-' ||
    (school_year_start + 1)::text;

  saved_record := jsonb_build_object(
    'school_year', current_school_year,
    'saved_at', now(),
    'saved_by', (select auth.uid()),
    'data', p_form_data
  );

  update public.students
  set
    form_137_records = jsonb_set(
      coalesce(form_137_records, '{}'::jsonb),
      array[current_school_year],
      saved_record,
      true
    ),
    updated_at = now()
  where id::text = trim(p_student_id)
    and school_id::text = '126001';

  if not found then
    raise exception 'Learner was not found';
  end if;

  return saved_record;
end;
$$;

revoke all on function public.save_current_student_form_137(text, jsonb)
  from public, anon;
grant execute on function public.save_current_student_form_137(text, jsonb)
  to authenticated;

comment on function public.save_current_student_form_137(text, jsonb) is
  'Saves Form 137 data on an authorized students row under the server-calculated current school year.';

create or replace function public.get_current_student_form_137(
  p_student_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  local_today date := timezone('Asia/Manila', now())::date;
  school_year_start integer;
  current_school_year text;
  saved_record jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_student_form_137(p_student_id) then
    raise exception 'You cannot view Form 137 for this learner'
      using errcode = '42501';
  end if;

  school_year_start := case
    when extract(month from local_today) >= 6
      then extract(year from local_today)::integer
    else extract(year from local_today)::integer - 1
  end;
  current_school_year := school_year_start::text || '-' ||
    (school_year_start + 1)::text;

  select learner.form_137_records -> current_school_year
  into saved_record
  from public.students learner
  where learner.id::text = trim(p_student_id)
    and learner.school_id::text = '126001';

  return saved_record;
end;
$$;

revoke all on function public.get_current_student_form_137(text)
  from public, anon;
grant execute on function public.get_current_student_form_137(text)
  to authenticated;

comment on function public.get_current_student_form_137(text) is
  'Returns an authorized learner Form 137 entry for the server-calculated current school year.';

create or replace function public.get_student_form_137_history(
  p_student_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  saved_history jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_student_form_137(p_student_id) then
    raise exception 'You cannot view Form 137 history for this learner'
      using errcode = '42501';
  end if;

  select coalesce(learner.form_137_records, '{}'::jsonb)
  into saved_history
  from public.students learner
  where learner.id::text = trim(p_student_id)
    and learner.school_id::text = '126001';

  return coalesce(saved_history, '{}'::jsonb);
end;
$$;

revoke all on function public.get_student_form_137_history(text)
  from public, anon;
grant execute on function public.get_student_form_137_history(text)
  to authenticated;

comment on function public.get_student_form_137_history(text) is
  'Returns all saved school-year Form 137 snapshots for an authorized learner.';

commit;
