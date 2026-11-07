-- Kindergarten cards share learner authorization with Form 137, but use their
-- own table and validation. They must never overwrite the learner's SF10 data.
begin;

create table if not exists public.kindergarten_progress_cards (
  student_id text not null,
  school_year text not null check (school_year ~ '^\d{4}-\d{4}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  primary key (student_id, school_year)
);
alter table public.kindergarten_progress_cards enable row level security;

create or replace function public.can_manage_kinder_progress(candidate_student_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_manage_student_form_137(candidate_student_id)
    and exists (
      select 1 from public.students learner
      where learner.id::text = candidate_student_id
        and (lower(trim(learner.grade_level::text)) in ('0', 'kinder', 'kindergarten'))
    ) and exists (
      select 1 from public.portal_profile profile where profile.id = auth.uid()
        and public.is_app_email_allowed('portal', coalesce(profile.real_email, profile.email))
    );
$$;
revoke all on function public.can_manage_kinder_progress(text) from public, anon;
grant execute on function public.can_manage_kinder_progress(text) to authenticated;

drop policy if exists "authorized teachers read kinder cards" on public.kindergarten_progress_cards;
create policy "authorized teachers read kinder cards" on public.kindergarten_progress_cards
for select to authenticated using (public.can_manage_kinder_progress(student_id));
grant select on public.kindergarten_progress_cards to authenticated;

create or replace function public.save_current_kinder_progress(p_student_id text, p_card jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := timezone('Asia/Manila', now())::date;
  start_year integer;
  current_year text;
  rating record;
  item jsonb;
  field text;
begin
  if auth.uid() is null or not public.can_manage_kinder_progress(p_student_id) then
    raise exception 'You cannot save a Kindergarten card for this learner' using errcode = '42501';
  end if;
  if jsonb_typeof(p_card) is distinct from 'object' or octet_length(p_card::text) > 65536 then
    raise exception 'Invalid Kindergarten card';
  end if;
  start_year := extract(year from today)::integer - case when extract(month from today) < 6 then 1 else 0 end;
  current_year := start_year::text || '-' || (start_year + 1)::text;
  if p_card->>'learnerId' is distinct from p_student_id or p_card->>'schoolYear' is distinct from current_year then
    raise exception 'Learner or school year does not match the current record';
  end if;
  foreach field in array array['name','lrn','birthdate','section','adviser','principal','ageBeginning','ageEnd'] loop
    if jsonb_typeof(p_card->field) is distinct from 'string' or length(p_card->>field) > 250 then
      raise exception 'Invalid card field: %', field;
    end if;
  end loop;
  if jsonb_typeof(p_card->'certifyTransfer') is distinct from 'boolean'
     or jsonb_typeof(p_card->'ratings') is distinct from 'object'
     or jsonb_typeof(p_card->'comments') is distinct from 'array'
     or jsonb_typeof(p_card->'attendance') is distinct from 'array' then
    raise exception 'Invalid card structure';
  end if;
  if jsonb_array_length(p_card->'comments') <> 3 or jsonb_array_length(p_card->'attendance') <> 12 then
    raise exception 'Three term comments and twelve attendance rows are required';
  end if;
  for rating in select key, value from jsonb_each(p_card->'ratings') loop
    if rating.key !~ '^(motor-[1-5]|social-[1-7]|cognitive-([1-9]|1[0-9]|20)|language-([1-9]|1[0-9]|2[0-8]))$'
       or jsonb_typeof(rating.value) is distinct from 'array' then
      raise exception 'Invalid competency rating';
    end if;
    if jsonb_array_length(rating.value) <> 3 then raise exception 'Three term ratings are required'; end if;
    for item in select value from jsonb_array_elements(rating.value) loop
      if item not in ('""'::jsonb, '"BG"'::jsonb, '"DV"'::jsonb, '"CO"'::jsonb) then
        raise exception 'Only BG, DV, CO or blank ratings are allowed';
      end if;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements(p_card->'comments') loop
    if jsonb_typeof(item) is distinct from 'string' or length(item #>> '{}') > 800 then
      raise exception 'Term comments must be text of at most 800 characters';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_card->'attendance') loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid attendance row'; end if;
    foreach field in array array['days', 'present'] loop
      if not (item ? field) or (item->>field is null)
        or (item->>field <> '' and (item->>field !~ '^\d{1,2}$')) then
        raise exception 'Attendance must be a whole number from 0 to 31 or blank';
      end if;
      if item->>field <> '' and (item->>field)::integer > 31 then raise exception 'Attendance exceeds 31 days'; end if;
    end loop;
    if item->>'present' <> '' and (item->>'days' = '' or (item->>'present')::integer > (item->>'days')::integer) then
      raise exception 'Days present cannot exceed class days';
    end if;
  end loop;

  insert into public.kindergarten_progress_cards(student_id, school_year, data, updated_by)
  values (p_student_id, current_year, p_card, auth.uid())
  on conflict (student_id, school_year) do update
    set data = excluded.data, updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('data', p_card, 'saved_at', now());
end;
$$;
revoke all on function public.save_current_kinder_progress(text, jsonb) from public, anon;
grant execute on function public.save_current_kinder_progress(text, jsonb) to authenticated;
commit;
