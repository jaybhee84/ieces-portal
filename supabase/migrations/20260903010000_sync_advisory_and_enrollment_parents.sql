-- Two data-loss bugs found while investigating a learner whose Enrollment
-- Form and Advisory Class showed different names/guardians for the same LRN:
--
-- 1. save_advisory_middle_initials overwrote the FULL middle_name column with
--    just a single letter (e.g. "MARIANO" -> "M"). Enrollment, Advisory, and
--    Form 137 now use students.middle_name as their one canonical data column.
--    learnerMiddleInitial() derives the abbreviated roster display when needed.
--
-- 2. Advisory Class stores its parent/guardian contact in guardian_type /
--    guardian_contact_name, a separate pair of columns from the father_name /
--    mother_name that Enrollment Form and Form 137 read. Naming a "Father" or
--    "Mother" guardian in Advisory Class never used to reach father_name /
--    mother_name at all, so it stayed invisible on Enrollment Form. This
--    migration keeps them in sync going forward (Enrollment Form already
--    mirrors the other direction as of this same change).

begin;

alter table public.students
  add column if not exists father_contact_number text,
  add column if not exists mother_contact_number text,
  add column if not exists guardian_contact_number text;

create or replace function public.save_advisory_middle_names(p_updates jsonb)
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
      upper(nullif(trim(item ->> 'middle_name'), '')) as middle_name
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) item
  ), permitted as (
    select requested.*
    from requested
    where requested.id is not null
      and public.can_manage_student_form_137(requested.id)
  )
  update public.students learner
  set middle_name = permitted.middle_name,
      -- `name` is retained for the BMI application. Keep that compatibility
      -- value synchronized, but build it from the preserved full middle name
      -- instead of shortening it to the Advisory-only initial.
      name = nullif(
        trim(concat_ws(
          ', ',
          nullif(trim(learner.family_name), ''),
          nullif(
            trim(concat_ws(
              ' ',
              nullif(trim(learner.first_name), ''),
              permitted.middle_name
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

-- Form 137 previously saved edited learner names only inside its JSON snapshot.
-- Replace the deployed RPC so its learner-name fields update the same canonical
-- students columns used by Enrollment and Advisory.
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
    family_name = upper(nullif(trim(p_form_data ->> 'lastName'), '')),
    first_name = upper(nullif(trim(p_form_data ->> 'firstName'), '')),
    middle_name = upper(nullif(trim(p_form_data ->> 'middleName'), '')),
    -- Retained only for BMI compatibility; it mirrors the canonical parts.
    name = nullif(trim(concat_ws(
      ', ',
      upper(nullif(trim(p_form_data ->> 'lastName'), '')),
      nullif(trim(concat_ws(
        ' ',
        upper(nullif(trim(p_form_data ->> 'firstName'), '')),
        upper(nullif(trim(p_form_data ->> 'middleName'), ''))
      )), '')
    )), ''),
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
  'Saves Form 137 and synchronizes its learner name to the canonical students name columns.';

-- Convert an Advisory full name such as "PEDRO S. SANTA" into the Enrollment
-- representation "SANTA, PEDRO, S.". Already-separated Enrollment names are
-- normalized to the same three-part representation.
create or replace function public.normalize_enrollment_person_name(raw_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := upper(nullif(trim(regexp_replace(raw_name, '\s+', ' ', 'g')), ''));
  comma_parts text[];
  word_parts text[];
  family_part text;
  first_part text;
  middle_part text;
begin
  if cleaned is null then
    return null;
  end if;

  if position(',' in cleaned) > 0 then
    comma_parts := regexp_split_to_array(cleaned, '\s*,\s*');
    family_part := nullif(trim(comma_parts[1]), '');
    first_part := nullif(trim(comma_parts[2]), '');
    if array_length(comma_parts, 1) > 2 then
      middle_part := nullif(trim(array_to_string(comma_parts[3:array_length(comma_parts, 1)], ' ')), '');
    elsif first_part is not null and position(' ' in first_part) > 0 then
      word_parts := regexp_split_to_array(first_part, '\s+');
      first_part := word_parts[1];
      middle_part := nullif(array_to_string(word_parts[2:array_length(word_parts, 1)], ' '), '');
    end if;
  else
    word_parts := regexp_split_to_array(cleaned, '\s+');
    if array_length(word_parts, 1) = 1 then
      family_part := word_parts[1];
    else
      first_part := word_parts[1];
      family_part := word_parts[array_length(word_parts, 1)];
      if array_length(word_parts, 1) > 2 then
        middle_part := array_to_string(word_parts[2:array_length(word_parts, 1) - 1], ' ');
      end if;
    end if;
  end if;

  return nullif(trim(concat_ws(', ', family_part, first_part, middle_part)), '');
end;
$$;

-- Repair legacy parent duplication. Preserve the parent in its canonical
-- father_name/mother_name column, then clear the duplicate guardian contact.
-- guardian_name is cleared only when it contains that same parent, so a
-- genuinely different legal guardian is preserved.
update public.students learner
set father_name = case
      when learner.guardian_type = 'Father'
        then coalesce(
          public.normalize_enrollment_person_name(learner.guardian_contact_name),
          learner.father_name
        )
      else learner.father_name
    end,
    mother_name = case
      when learner.guardian_type = 'Mother'
        then coalesce(
          public.normalize_enrollment_person_name(learner.guardian_contact_name),
          learner.mother_name
        )
      else learner.mother_name
    end,
    guardian_name = case
      when learner.guardian_type = 'Father'
       and public.normalize_enrollment_person_name(
         regexp_replace(coalesce(learner.guardian_name, ''), '\s*\([^()]*\)\s*$', '')
       ) = coalesce(
         public.normalize_enrollment_person_name(learner.guardian_contact_name),
         learner.father_name
       ) then null
      when learner.guardian_type = 'Mother'
       and public.normalize_enrollment_person_name(
         regexp_replace(coalesce(learner.guardian_name, ''), '\s*\([^()]*\)\s*$', '')
       ) = coalesce(
         public.normalize_enrollment_person_name(learner.guardian_contact_name),
         learner.mother_name
       ) then null
      else learner.guardian_name
    end,
    guardian_contact_name = null,
    father_contact_number = case
      when learner.guardian_type = 'Father'
        then coalesce(learner.father_contact_number, learner.contact_number)
      else learner.father_contact_number
    end,
    mother_contact_number = case
      when learner.guardian_type = 'Mother'
        then coalesce(learner.mother_contact_number, learner.contact_number)
      else learner.mother_contact_number
    end,
    updated_at = now()
where learner.guardian_type in ('Father', 'Mother')
  and (
    nullif(trim(learner.guardian_contact_name), '') is not null
    or nullif(trim(learner.guardian_name), '') is not null
  );

-- Save an existing learner's editable Enrollment details through the same
-- authorization used by Advisory and Form 137. A direct table UPDATE can be
-- silently filtered to zero rows by RLS, which previously produced a false
-- success message in the Portal.
create or replace function public.save_existing_student_details(
  p_student_id text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_learner public.students%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(trim(p_student_id), '') is null
     or jsonb_typeof(coalesce(p_details, 'null'::jsonb)) <> 'object' then
    raise exception 'Student ID and learner details are required';
  end if;

  if not public.can_manage_student_form_137(p_student_id) then
    raise exception 'You cannot update this learner' using errcode = '42501';
  end if;

  update public.students learner
  set family_name = upper(nullif(trim(p_details ->> 'family_name'), '')),
      first_name = upper(nullif(trim(p_details ->> 'first_name'), '')),
      middle_name = upper(nullif(trim(p_details ->> 'middle_name'), '')),
      name = nullif(trim(concat_ws(
        ', ',
        upper(nullif(trim(p_details ->> 'family_name'), '')),
        nullif(trim(concat_ws(
          ' ',
          upper(nullif(trim(p_details ->> 'first_name'), '')),
          upper(nullif(trim(p_details ->> 'middle_name'), ''))
        )), '')
      )), ''),
      birthdate = case
        when nullif(trim(p_details ->> 'birthdate'), '') is null then null
        else trim(p_details ->> 'birthdate')::date
      end,
      age = case
        when nullif(trim(p_details ->> 'age'), '') ~ '^\d+$'
          then (p_details ->> 'age')::integer
        else null
      end,
      sex = upper(nullif(trim(p_details ->> 'sex'), '')),
      tribe = nullif(trim(p_details ->> 'tribe'), ''),
      religion = nullif(trim(p_details ->> 'religion'), ''),
      is_4ps = coalesce((p_details ->> 'is_4ps')::boolean, false),
      reading_category = nullif(trim(p_details ->> 'reading_category'), ''),
      contact_number = nullif(trim(p_details ->> 'contact_number'), ''),
      father_contact_number = nullif(trim(p_details ->> 'father_contact_number'), ''),
      mother_contact_number = nullif(trim(p_details ->> 'mother_contact_number'), ''),
      guardian_contact_number = nullif(trim(p_details ->> 'guardian_contact_number'), ''),
      photo_url = nullif(trim(p_details ->> 'photo_url'), ''),
      father_name = public.normalize_enrollment_person_name(p_details ->> 'father_name'),
      mother_name = public.normalize_enrollment_person_name(p_details ->> 'mother_name'),
      guardian_name = upper(nullif(trim(p_details ->> 'guardian_name'), '')),
      guardian_type = nullif(trim(p_details ->> 'guardian_type'), ''),
      guardian_contact_name = case
        when nullif(trim(p_details ->> 'guardian_type'), '') in ('Father', 'Mother')
          then null
        else upper(nullif(trim(p_details ->> 'guardian_contact_name'), ''))
      end,
      address = nullif(trim(p_details ->> 'address'), ''),
      updated_at = now()
  where learner.id::text = trim(p_student_id)
    and learner.school_id::text = '126001'
  returning learner.* into saved_learner;

  if not found then
    raise exception 'Learner was not found';
  end if;

  return to_jsonb(saved_learner);
end;
$$;

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
      guardian_contact_name = case
        when permitted.guardian_type in ('Father', 'Mother') then null
        else permitted.guardian_contact_name
      end,
      contact_number = permitted.contact_number,
      father_contact_number = case
        when permitted.guardian_type = 'Father' then permitted.contact_number
        else learner.father_contact_number
      end,
      mother_contact_number = case
        when permitted.guardian_type = 'Mother' then permitted.contact_number
        else learner.mother_contact_number
      end,
      guardian_contact_number = case
        when permitted.guardian_type not in ('Father', 'Mother')
          then permitted.contact_number
        else learner.guardian_contact_number
      end,
      -- Keep father_name / mother_name (what Enrollment Form and Form 137
      -- read) in sync when the guardian named here is explicitly the father
      -- or mother. A Grandmother/Aunt/etc guardian never touches these.
      father_name = case
        when permitted.guardian_type = 'Father' and permitted.guardian_contact_name is not null
          then public.normalize_enrollment_person_name(permitted.guardian_contact_name)
        else learner.father_name
      end,
      mother_name = case
        when permitted.guardian_type = 'Mother' and permitted.guardian_contact_name is not null
          then public.normalize_enrollment_person_name(permitted.guardian_contact_name)
        else learner.mother_name
      end,
      updated_at = now()
  from permitted
  where learner.id::text = permitted.id
    and learner.school_id::text = '126001';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.save_advisory_middle_names(jsonb)
  from public, anon;
grant execute on function public.save_advisory_middle_names(jsonb)
  to authenticated;

revoke all on function public.save_existing_student_details(text, jsonb)
  from public, anon;
grant execute on function public.save_existing_student_details(text, jsonb)
  to authenticated;

-- Prevent older Portal clients from calling the function that reduced a full
-- middle name to one letter. The column itself is retained for other apps.
revoke all on function public.save_advisory_middle_initials(jsonb)
  from public, anon, authenticated;

revoke all on function public.save_advisory_contacts(jsonb)
  from public, anon;
grant execute on function public.save_advisory_contacts(jsonb)
  to authenticated;

comment on function public.save_advisory_middle_names(jsonb) is
  'Updates the canonical full students.middle_name value for learners managed by the signed-in Portal user.';
comment on function public.save_advisory_contacts(jsonb) is
  'Updates parent, guardian, and contact details, parsing Father/Mother full names into the Enrollment name format before mirroring them into father_name/mother_name.';

commit;
