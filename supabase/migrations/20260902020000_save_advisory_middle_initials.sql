-- Allow authorized Portal staff to correct a learner's middle initial from the
-- Advisory Class roster and keep the legacy full-name field synchronized.

begin;

create or replace function public.save_advisory_middle_initials(p_updates jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer := 0;
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
    where nullif(trim(item ->> 'middle_initial'), '') is not null
      and upper(trim(item ->> 'middle_initial')) !~ '^[A-Z]$'
  ) then
    raise exception 'Middle initial must contain one letter';
  end if;

  with requested as (
    select
      nullif(trim(item ->> 'id'), '') as id,
      upper(nullif(trim(item ->> 'middle_initial'), '')) as middle_initial
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) item
  ), permitted as (
    select requested.*
    from requested
    where requested.id is not null
      and public.can_manage_student_form_137(requested.id)
  )
  update public.students learner
  set middle_name = permitted.middle_initial,
      name = nullif(
        trim(concat_ws(
          ', ',
          nullif(trim(learner.family_name), ''),
          nullif(
            trim(concat_ws(
              ' ',
              nullif(trim(learner.first_name), ''),
              permitted.middle_initial
            )),
            ''
          )
        )),
        ''
      ),
      updated_at = now()
  from permitted
  where learner.id::text = permitted.id
    and learner.school_id::text = '126001';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.save_advisory_middle_initials(jsonb)
  from public, anon;
grant execute on function public.save_advisory_middle_initials(jsonb)
  to authenticated;

comment on function public.save_advisory_middle_initials(jsonb) is
  'Updates one-letter learner middle initials for learners managed by the signed-in Portal user.';

commit;
