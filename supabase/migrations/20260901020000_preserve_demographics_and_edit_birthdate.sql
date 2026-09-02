-- Keep Portal-only learner details from being erased by partial/upsert updates
-- from the shared BMI application, and allow authorized Portal staff to edit
-- learner birthdates from Advisory Class.

begin;

create or replace function public.preserve_student_portal_demographics()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(trim(new.religion), '') is null
     and nullif(trim(old.religion), '') is not null then
    new.religion := old.religion;
  end if;

  if nullif(trim(new.tribe), '') is null
     and nullif(trim(old.tribe), '') is not null then
    new.tribe := old.tribe;
  end if;

  if nullif(trim(new.address), '') is null
     and nullif(trim(old.address), '') is not null then
    new.address := old.address;
  end if;

  -- BMI historically used this generic fallback when it did not have the
  -- learner's complete Portal address. Do not replace a saved address with it
  -- as a side effect of changing the birthdate.
  if new.birthdate is distinct from old.birthdate
     and upper(trim(coalesce(new.address, ''))) in
       ('ISABELA CITY', 'ISABELA CITY, BASILAN')
     and nullif(trim(old.address), '') is not null then
    new.address := old.address;
  end if;

  if nullif(trim(new.reading_category), '') is null
     and nullif(trim(old.reading_category), '') is not null then
    new.reading_category := old.reading_category;
  end if;

  return new;
end;
$$;

drop trigger if exists preserve_student_portal_demographics on public.students;
create trigger preserve_student_portal_demographics
before update on public.students
for each row execute function public.preserve_student_portal_demographics();

create or replace function public.save_advisory_birthdates(p_updates jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer := 0;
  local_today date := timezone('Asia/Manila', now())::date;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_updates, '[]'::jsonb)) <> 'array' then
    raise exception 'p_updates must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) item
    where nullif(trim(item ->> 'birthdate'), '') is not null
      and trim(item ->> 'birthdate') !~ '^\d{4}-\d{2}-\d{2}$'
  ) then
    raise exception 'Birthdate must use YYYY-MM-DD format';
  end if;

  with requested as (
    select
      nullif(trim(item ->> 'id'), '') as id,
      case
        when nullif(trim(item ->> 'birthdate'), '') is null then null
        else trim(item ->> 'birthdate')::date
      end as birthdate
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) item
  ), permitted as (
    select requested.*
    from requested
    where requested.id is not null
      and (requested.birthdate is null or requested.birthdate <= local_today)
      and public.can_manage_student_form_137(requested.id)
  )
  update public.students learner
  set birthdate = permitted.birthdate,
      updated_at = now()
  from permitted
  where learner.id::text = permitted.id
    and learner.school_id::text = '126001';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.save_advisory_birthdates(jsonb)
  from public, anon;
grant execute on function public.save_advisory_birthdates(jsonb)
  to authenticated;

comment on function public.save_advisory_birthdates(jsonb) is
  'Updates learner birthdates for authorized Portal advisers, chairmen, and administrators.';

commit;
