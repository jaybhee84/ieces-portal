-- Let a teacher upload their own profile photo from IECES Portal.
--
-- The photo goes to the same place the admin portal's Org Chart page uses:
-- the org-photos bucket, staff/ folder, with its public URL written to
-- org_chart.photo_url. The school website and the admin portal already read
-- that column, so all three show the same picture.
--
-- Teachers get no general write access to org_chart: the function below only
-- sets photo_url, and only on the caller's own Org Chart row.

begin;

drop policy if exists "Portal teachers upload org photos" on storage.objects;
create policy "Portal teachers upload org photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'org-photos'
    and (storage.foldername(name))[1] = 'staff'
  );

-- p_org_id is for a Portal administrator setting another teacher's photo
-- (superadmin test view). Everyone else leaves it null and updates their own.
drop function if exists public.save_my_org_chart_photo(text);

create or replace function public.save_my_org_chart_photo(
  p_photo_url text,
  p_org_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  matched_ids text[];
  updated_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(p_photo_url, '') not like
     '%/storage/v1/object/public/org-photos/staff/%'
  then
    raise exception 'The photo must be uploaded to the Org Chart photo folder.'
      using errcode = '42501';
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
      raise exception 'Only a Portal administrator may set another teacher''s photo.'
        using errcode = '42501';
    end if;

    update public.org_chart
    set photo_url = p_photo_url
    where id::text = trim(p_org_id);
    get diagnostics updated_count = row_count;

    if updated_count = 0 then
      raise exception 'That teacher was not found in the Org Chart.';
    end if;

    return p_photo_url;
  end if;

  select array_agg(org.id::text)
  into matched_ids
  from public.portal_profile profile
  join public.org_chart org
    on lower(trim(org.first_name)) = lower(trim(profile.first_name))
   and lower(trim(org.family_name)) = lower(trim(profile.family_name))
   and lower(coalesce(org.category, '')) = 'teaching'
  where profile.id = caller_id;

  if matched_ids is null then
    raise exception 'Your name was not found in the Org Chart, so the photo could not be saved.'
      using errcode = '42501';
  end if;

  if array_length(matched_ids, 1) > 1 then
    raise exception 'More than one Org Chart record matches your name. Ask the administrator to set your photo.'
      using errcode = '42501';
  end if;

  update public.org_chart
  set photo_url = p_photo_url
  where id::text = matched_ids[1];

  return p_photo_url;
end;
$$;

revoke all on function public.save_my_org_chart_photo(text, text) from public, anon;
grant execute on function public.save_my_org_chart_photo(text, text) to authenticated;

commit;
