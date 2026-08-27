-- TARGET: shared IECES Supabase only.
-- PURPOSE: make the empty IECES students table compatible with the 588 BMI
-- students while retaining the IECES-specific columns and existing RLS setup.
-- This migration intentionally refuses to run if IECES students contains data.

begin;
do $$
begin
  if to_regclass('public.students') is null then
    raise exception 'public.students does not exist in the IECES project';
  end if;

  if exists (select 1 from public.students limit 1) then
    raise exception 'IECES students is not empty; migration stopped without changes';
  end if;
end
$$;
-- BMI uses stable text identifiers. IECES inserts that omit id will receive a
-- UUID string, so both applications can use the same primary key.
alter table public.students alter column id drop default;
alter table public.students alter column id type text using id::text;
alter table public.students alter column id set default gen_random_uuid()::text;
-- BMI records do not contain these IECES fields. They remain available and
-- will be populated when enrollment information is added through IECES.
alter table public.students alter column lrn drop not null;
alter table public.students alter column grade_level drop not null;
alter table public.students alter column section drop not null;
alter table public.students alter column adviser_name drop not null;
alter table public.students alter column family_name drop not null;
alter table public.students alter column first_name drop not null;
-- BMI columns missing from the original IECES table.
alter table public.students add column if not exists school_name text;
alter table public.students add column if not exists registry_no text;
alter table public.students add column if not exists name text;
alter table public.students add column if not exists parent_consent text default 'N';
alter table public.students add column if not exists member_4ps text default 'N';
alter table public.students add column if not exists records jsonb default '[]'::jsonb;
alter table public.students add column if not exists updated_at timestamptz not null default now();
alter table public.students add column if not exists photo_url text;
-- Used by the Portal code but absent from the exported IECES column list.
alter table public.students add column if not exists adviser_id uuid;
-- Keep BMI `name` and IECES split-name fields mutually compatible. A BMI name
-- formatted as "Family, First Middle" is split for Portal searches. A new
-- IECES enrollment automatically receives the BMI-compatible `name` value.
create or replace function public.sync_student_compatibility_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(trim(new.name), '') is null then
    new.name := nullif(trim(concat_ws(', ',
      nullif(trim(new.family_name), ''),
      nullif(trim(concat_ws(' ', new.first_name, new.middle_name)), '')
    )), '');
  end if;

  if nullif(trim(new.family_name), '') is null
     and nullif(trim(new.name), '') is not null then
    if position(',' in new.name) > 0 then
      new.family_name := nullif(trim(split_part(new.name, ',', 1)), '');
      new.first_name := nullif(trim(split_part(new.name, ',', 2)), '');
    else
      new.family_name := trim(new.name);
    end if;
  end if;

  -- Treat a positive value from either representation as authoritative. This
  -- avoids one column's default value erasing a value supplied by the other app.
  if coalesce(new.is_4ps, false)
     or upper(trim(coalesce(new.member_4ps, 'N'))) in ('Y', 'YES', 'TRUE', '1') then
    new.is_4ps := true;
    new.member_4ps := 'Y';
  else
    new.is_4ps := false;
    new.member_4ps := 'N';
  end if;

  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists sync_student_compatibility_fields on public.students;
create trigger sync_student_compatibility_fields
before insert or update on public.students
for each row execute function public.sync_student_compatibility_fields();
create index if not exists students_lrn_idx on public.students (lrn);
create index if not exists students_school_id_idx on public.students (school_id);
create index if not exists students_adviser_id_idx on public.students (adviser_id);
comment on table public.students is
  'Unified IECES and BMI student registry. BMI fields and IECES enrollment fields coexist.';
commit;
