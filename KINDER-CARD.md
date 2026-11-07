# Kindergarten class card

Kindergarten advisers see **Kinder Class Card** in place of the Form 137 tab.
Grades 1–6 keep SF10-ES. The card is a school adaptation of Annex E, DepEd
Order 015, s. 2026, printed pages 41–42:
https://www.deped.gov.ph/wp-content/uploads/DO_s2026_015r.pdf

The interface separates assessment entry from the printable two-page card.
It includes 60 competencies in the four groups of the Annex E progress report,
three term ratings (BG, DV, CO), narrative comments, attendance, and parent
signature spaces. These report groups differ from the six developmental
domains listed in the MATATAG curriculum reference. September attendance is
split between Terms 1 and 2 as shown in Annex E; do not count the same days twice.
The certificate of transfer is included only when the teacher explicitly checks
the confirmation. No numeric grades, averages, automatic promotion decisions,
or generated signatures are used.

**Save Information** saves the card in Supabase's `kindergarten_progress_cards`
table, keyed by learner and school year, using the authorized
`save_current_kinder_progress` function. Apply
`supabase/migrations/20261107010000_kinder_progress_cards.sql` to the shared
database before using this feature. Authorization follows the existing learner
access rules, and the server validates descriptive ratings and attendance.

Supabase is the authoritative copy. Successful saves also keep a local offline
backup; a local storage failure does not invalidate a database save. Previously
loaded cards can be viewed offline, but editing/saving requires internet.
Existing device-only drafts are retained: select the learner while online and
use Save Information to upload the local draft when no database card exists.
An existing cloud card always takes precedence. A failed online load blocks
editing and saving to prevent accidentally overwriting an unseen cloud record.
After deployment, verify access from an actual teacher account and a second device.

Save before leaving the tab. Validate the school adaptation with the school head
before issuing it as the school's official report. It does not replace the ECCD
checklist. The current-year roster is used.
