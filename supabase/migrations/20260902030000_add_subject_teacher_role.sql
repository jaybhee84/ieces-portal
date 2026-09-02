-- Add a third Portal teaching role for teaching personnel who are neither
-- advisory teachers nor grade chairmen in the shared Org Chart.

begin;

alter table public.portal_profile
  drop constraint if exists portal_profile_role_check;

alter table public.portal_profile
  add constraint portal_profile_role_check
  check (role in ('adviser', 'grade_chairman', 'subject_teacher', 'admin'));

update public.portal_profile portal
set role = case
      when coalesce(org.is_grade_chairman, false) then 'grade_chairman'
      when upper(trim(coalesce(org.teaching_type, ''))) = 'ADVISER' then 'adviser'
      else 'subject_teacher'
    end,
    grade_level_assigned = case
      when coalesce(org.is_grade_chairman, false)
        or upper(trim(coalesce(org.teaching_type, ''))) = 'ADVISER'
      then case
        when upper(trim(coalesce(org.grade_level, ''))) like 'KINDER%' then 0
        else nullif(regexp_replace(coalesce(org.grade_level, ''), '[^0-9]', '', 'g'), '')::integer
      end
      else null
    end,
    updated_at = now()
from public.org_chart org
where lower(trim(coalesce(org.category, ''))) = 'teaching'
  and lower(trim(org.first_name)) = lower(trim(portal.first_name))
  and lower(trim(org.family_name)) = lower(trim(portal.family_name))
  and portal.role <> 'admin';

commit;
