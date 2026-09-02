-- Let Portal administrators exercise chairman workflows while remaining
-- signed in as themselves. The client-selected adviser still determines the
-- grade/class shown; ordinary adviser and chairman permissions are unchanged.

begin;

create or replace function public.enforce_chairman_learner_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.adviser_id is not distinct from old.adviser_id then
    return new;
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  if not exists (
    select 1
    from public.portal_profile profile
    left join public.org_chart chairman
      on lower(trim(chairman.first_name)) = lower(trim(profile.first_name))
     and lower(trim(chairman.family_name)) = lower(trim(profile.family_name))
     and lower(coalesce(chairman.category, '')) = 'teaching'
     and coalesce(chairman.is_grade_chairman, false)
    where profile.id = auth.uid()
      and (
        lower(coalesce(profile.role, '')) = 'admin'
        or lower(coalesce(profile.auth_email, profile.email, '')) =
           lower(coalesce(public.dashboard_login_email('admin'), ''))
        or chairman.id is not null
      )
  ) then
    raise exception 'Only a grade chairman or Portal administrator may transfer learners between advisory classes.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_chairman_learner_transfer() from public;

create or replace function public.get_chairman_advisory_learners(
  candidate_adviser_id text
)
returns setof public.students
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  chairman_grade text;
  user_is_admin boolean := false;
  selected_adviser public.org_chart%rowtype;
begin
  select exists (
    select 1
    from public.portal_profile profile
    where profile.id = auth.uid()
      and (
        lower(coalesce(profile.role, '')) = 'admin'
        or lower(coalesce(profile.auth_email, profile.email, '')) =
           lower(coalesce(public.dashboard_login_email('admin'), ''))
      )
  ) into user_is_admin;

  if not user_is_admin then
    select chairman.grade_level
    into chairman_grade
    from public.portal_profile profile
    join public.org_chart chairman
      on lower(trim(chairman.first_name)) = lower(trim(profile.first_name))
     and lower(trim(chairman.family_name)) = lower(trim(profile.family_name))
     and lower(coalesce(chairman.category, '')) = 'teaching'
     and coalesce(chairman.is_grade_chairman, false)
    where profile.id = auth.uid()
    limit 1;

    if chairman_grade is null then
      raise exception 'Only a grade chairman or Portal administrator may view transfer rosters.'
        using errcode = '42501';
    end if;
  end if;

  select adviser.*
  into selected_adviser
  from public.org_chart adviser
  where adviser.id::text = trim(candidate_adviser_id)
    and lower(coalesce(adviser.category, '')) = 'teaching'
    and (
      lower(coalesce(adviser.teaching_type, '')) = 'adviser'
      or coalesce(adviser.is_grade_chairman, false)
    )
    and (
      user_is_admin
      or regexp_replace(coalesce(adviser.grade_level, ''), '[^0-9]', '', 'g') =
         regexp_replace(chairman_grade, '[^0-9]', '', 'g')
    )
  limit 1;

  if selected_adviser.id is null then
    raise exception 'The selected adviser is not available to this user.'
      using errcode = '42501';
  end if;

  return query
  select learner.*
  from public.students learner
  where learner.school_id::text = '126001'
    and (
      learner.adviser_id::text = selected_adviser.id::text
      or exists (
        select 1 from public.portal_profile portal
        where learner.adviser_id::text = portal.id::text
          and lower(trim(portal.first_name)) = lower(trim(selected_adviser.first_name))
          and lower(trim(portal.family_name)) = lower(trim(selected_adviser.family_name))
      )
      or exists (
        select 1 from public.profiles legacy
        where learner.adviser_id::text = legacy.id::text
          and lower(trim(legacy.first_name)) = lower(trim(selected_adviser.first_name))
          and lower(trim(legacy.family_name)) = lower(trim(selected_adviser.family_name))
      )
      or upper(coalesce(learner.section, '')) like
        '%' || upper(trim(selected_adviser.family_name)) || '%'
    );
end;
$$;

revoke all on function public.get_chairman_advisory_learners(text)
  from public, anon;
grant execute on function public.get_chairman_advisory_learners(text)
  to authenticated;

commit;
