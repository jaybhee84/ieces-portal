-- TARGET: shared IECES Supabase only.
-- BMI's existing 588 rows share a placeholder LRN, so LRN cannot currently be
-- a unique key. Registry numbers are unique in the validated BMI export.
begin;
alter table public.students
  drop constraint if exists students_lrn_key;
drop index if exists public.students_lrn_key;
create index if not exists students_lrn_idx
  on public.students (lrn);
create unique index if not exists students_registry_no_unique_idx
  on public.students (registry_no)
  where registry_no is not null and trim(registry_no) <> '';
commit;
