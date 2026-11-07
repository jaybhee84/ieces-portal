# Class Schedule & Workload

The teacher Portal reads the Admin Portal's existing `teaching_loads` table in
the shared Supabase project. It matches the current teacher to `org_chart`
using the existing Portal teacher matching helper and filters by `teacher_id`
and school year. Superadmin test views use the selected teacher profile.

Schedules are read-only here. Make assignments in Admin Portal → Teaching Load,
then use Refresh in the teacher Portal. Returning focus to the Portal also
refreshes the schedule. Previously loaded queries use the existing offline cache.

## Database access

Apply `supabase/migrations/20261107000000_portal_teacher_workload_read.sql`
to the shared Supabase project after the Admin Portal's
`supabase-teaching-loads.sql`. It permits authorized Portal teachers to read
their own assignments and Portal administrators to read test-user assignments.
It grants no new insert/update/delete permissions. Ambiguous exact name matches
are denied rather than exposing another teacher's schedule.

Existing Admin Portal policies are retained. Live database deployment and
teacher-account access must be verified after applying the migration.

Workload totals follow the Admin Portal: teaching and advisory minutes count
together, ancillary minutes separately, and daily averages divide the weekly
total by five weekdays. Overlapping assignments count separately, as in Admin.
