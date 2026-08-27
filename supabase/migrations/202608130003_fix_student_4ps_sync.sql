-- TARGET: shared IECES Supabase only.
-- Run after 202608130002_unify_students_for_bmi.sql and before importing BMI.
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
