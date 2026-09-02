-- Allow authorized Portal staff to maintain parent/guardian names and the
-- learner contact number from the Advisory Class roster.

begin;

alter table public.students
  add column if not exists guardian_type text,
  add column if not exists guardian_contact_name text;

update public.students
set guardian_type = case
      when nullif(trim(guardian_name), '') is not null then
        coalesce(
          nullif(substring(guardian_name from '\(([^()]*)\)\s*$'), ''),
          'Other Legal Guardian'
        )
      when nullif(trim(father_name), '') is not null then 'Father'
      when nullif(trim(mother_name), '') is not null then 'Mother'
      else null
    end,
    guardian_contact_name = case
      when nullif(trim(guardian_name), '') is not null then
        upper(nullif(trim(regexp_replace(guardian_name, '\s*\([^()]*\)\s*$', '')), ''))
      else coalesce(
        upper(nullif(trim(father_name), '')),
        upper(nullif(trim(mother_name), ''))
      )
    end
where guardian_type is null
  and guardian_contact_name is null;

create or replace function public.save_advisory_contacts(p_updates jsonb)
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

  with requested as (
    select
      nullif(trim(item ->> 'id'), '') as id,
      nullif(trim(item ->> 'guardian_type'), '') as guardian_type,
      upper(nullif(trim(item ->> 'guardian_contact_name'), '')) as guardian_contact_name,
      nullif(trim(item ->> 'contact_number'), '') as contact_number
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) item
  ), permitted as (
    select requested.*
    from requested
    where requested.id is not null
      and public.can_manage_student_form_137(requested.id)
  )
  update public.students learner
  set guardian_type = permitted.guardian_type,
      guardian_contact_name = permitted.guardian_contact_name,
      contact_number = permitted.contact_number,
      updated_at = now()
  from permitted
  where learner.id::text = permitted.id
    and learner.school_id::text = '126001';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.save_advisory_contacts(jsonb)
  from public, anon;
grant execute on function public.save_advisory_contacts(jsonb)
  to authenticated;

comment on function public.save_advisory_contacts(jsonb) is
  'Updates parent, guardian, and contact details for learners managed by the signed-in Portal user.';

commit;
