-- Reclassify existing Portal users from IECES Report's authoritative Org Chart.
-- Registration already applies this rule to new accounts; this migration fixes
-- accounts created before that server-side check existed.

begin;

update public.portal_profile as portal
set role = case
      when coalesce(org.is_grade_chairman, false) then 'grade_chairman'
      else 'adviser'
    end,
    grade_level_assigned = case
      when upper(trim(coalesce(org.grade_level, ''))) = '0'
        or upper(trim(coalesce(org.grade_level, ''))) like 'KINDER%'
        then 0
      when substring(coalesce(org.grade_level, '') from '([1-6])') is not null
        then substring(coalesce(org.grade_level, '') from '([1-6])')::integer
      else portal.grade_level_assigned
    end,
    updated_at = now()
from public.org_chart as org
where portal.role <> 'admin'
  and lower(trim(coalesce(org.category, ''))) = 'teaching'
  and upper(trim(coalesce(org.first_name, ''))) =
      upper(trim(coalesce(portal.first_name, '')))
  and upper(trim(coalesce(org.family_name, ''))) =
      upper(trim(coalesce(portal.family_name, '')));

commit;
