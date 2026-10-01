-- Let a teacher edit their own personal information from IECES Portal's
-- Teacher Profile: family name, first name, middle name and birthdate.
--
-- The Org Chart and the Portal profile are linked by first + family name, and
-- that link decides the teacher's role and advisory class. So a name change is
-- written to both tables in one transaction; changing only one would cut the
-- teacher off from their class.
--
-- Teachers get no general write access to org_chart: the function below only
-- touches these four fields, and only on the caller's own Org Chart row.

begin;

alter table public.org_chart
  add column if not exists birthdate date;

-- p_org_id is for a Portal administrator editing another teacher (superadmin
-- test view). Everyone else leaves it null and edits their own record.
create or replace function public.save_my_org_chart_personal_info(
  p_family_name text,
  p_first_name text,
  p_middle_name text,
  p_birthdate date,
  p_org_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_family text := upper(trim(coalesce(p_family_name, '')));
  new_first text := upper(trim(coalesce(p_first_name, '')));
  new_middle text := nullif(upper(trim(coalesce(p_middle_name, ''))), '');
  target_id text;
  matched_ids text[];
  old_family text;
  old_first text;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if new_family = '' or new_first = '' then
    raise exception 'Family name and first name are required.';
  end if;

  if p_birthdate is not null
     and (p_birthdate > current_date or p_birthdate < date '1900-01-01')
  then
    raise exception 'Enter a valid birthdate.';
  end if;

  if nullif(trim(p_org_id), '') is not null then
    if not exists (
      select 1
      from public.portal_profile profile
      where profile.id = caller_id
        and (
          lower(coalesce(profile.role, '')) = 'admin'
          or lower(coalesce(profile.auth_email, profile.email, '')) =
             lower(coalesce(public.dashboard_login_email('admin'), ''))
        )
    ) then
      raise exception 'Only a Portal administrator may edit another teacher''s information.'
        using errcode = '42501';
    end if;
    target_id := trim(p_org_id);
  else
    select array_agg(org.id::text)
    into matched_ids
    from public.portal_profile profile
    join public.org_chart org
      on lower(trim(org.first_name)) = lower(trim(profile.first_name))
     and lower(trim(org.family_name)) = lower(trim(profile.family_name))
     and lower(coalesce(org.category, '')) = 'teaching'
    where profile.id = caller_id;

    if matched_ids is null then
      raise exception 'Your name was not found in the Org Chart, so the changes could not be saved.'
        using errcode = '42501';
    end if;

    if array_length(matched_ids, 1) > 1 then
      raise exception 'More than one Org Chart record matches your name. Ask the administrator to update your information.'
        using errcode = '42501';
    end if;
    target_id := matched_ids[1];
  end if;

  select org.family_name, org.first_name
  into old_family, old_first
  from public.org_chart org
  where org.id::text = target_id;

  if not found then
    raise exception 'That teacher was not found in the Org Chart.';
  end if;

  -- Another staff member already using the new name would make the
  -- name-based link ambiguous.
  if exists (
    select 1
    from public.org_chart other
    where other.id::text <> target_id
      and lower(trim(other.first_name)) = lower(new_first)
      and lower(trim(other.family_name)) = lower(new_family)
  ) then
    raise exception 'Another Org Chart record already uses that first and family name.';
  end if;

  update public.org_chart
  set family_name = new_family,
      first_name = new_first,
      middle_name = new_middle,
      birthdate = p_birthdate
  where id::text = target_id;

  -- Keep the linked Portal account(s) on the same name.
  update public.portal_profile profile
  set family_name = new_family,
      first_name = new_first,
      middle_initial = left(new_middle, 1),
      updated_at = now()
  where (
      nullif(trim(p_org_id), '') is null
      and profile.id = caller_id
    )
    or (
      nullif(trim(p_org_id), '') is not null
      and lower(trim(profile.first_name)) = lower(trim(old_first))
      and lower(trim(profile.family_name)) = lower(trim(old_family))
    );
end;
$$;

revoke all on function public.save_my_org_chart_personal_info(text, text, text, date, text)
  from public, anon;
grant execute on function public.save_my_org_chart_personal_info(text, text, text, date, text)
  to authenticated;

commit;
