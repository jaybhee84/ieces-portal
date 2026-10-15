import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import LearnerAvatar from "./LearnerAvatar";
import {
  displayBirthdate,
  learnerAge,
  learnerDisplayName,
  learnerGenderLabel,
  learnerGradeLabel,
  learnerNutrition,
  nutritionBadgeClass,
} from "../lib/learnerRoster";
import { PHILIRI_READING_CATEGORIES } from "../lib/readingOptions";

const text = (value) => {
  const trimmed = String(value ?? "").trim();
  return trimmed && trimmed !== "—" ? trimmed : null;
};

function Field({ label, value, mono = false }) {
  return (
    <div className="learner-details-field">
      <dt>{label}</dt>
      <dd className={value ? (mono ? "is-mono" : undefined) : "is-empty"}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="learner-details-section">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

// Read-only view of everything on file for one learner, opened from the
// Advisory Class roster. `learner` already includes any unsaved table edits.
export default function LearnerDetailsDialog({ learner, hasUnsavedChanges, onClose }) {
  const closeButton = useRef(null);

  useEffect(() => {
    // Focus for keyboard users without showing a ring on a mouse open.
    closeButton.current?.focus({ focusVisible: false });
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const name = learnerDisplayName(learner);
  const nutrition = learnerNutrition(learner);
  const ageValue = String(learnerAge(learner) ?? "");
  const age = /^\d+$/.test(ageValue) ? ageValue : null;
  const reading = PHILIRI_READING_CATEGORIES.find(
    (category) => category.value === learner.reading_category,
  );
  const guardianType = text(learner.guardian_type);
  const guardianName =
    guardianType === "Father"
      ? text(learner.father_name)
      : guardianType === "Mother"
        ? text(learner.mother_name)
        : text(learner.guardian_contact_name) || text(learner.guardian_name);
  const street = text(learner.street_address);
  const barangay = text(learner.barangay);

  return (
    <div className="learner-details-overlay">
      <div
        className="learner-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learner-details-title"
      >
        <header className="learner-details-header">
          <LearnerAvatar
            photo={learner.photo_url || learner.photo}
            learner={learner}
            label={`${name} photo`}
            size="lg"
          />
          <div className="learner-details-heading">
            <h2 id="learner-details-title">{name}</h2>
            <p>
              {[learnerGradeLabel(learner), learnerGenderLabel(learner), age ? `${age} years old` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="learner-details-lrn">
              LRN <span>{text(learner.lrn) || "not set"}</span>
            </p>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="learner-details-close"
            onClick={onClose}
            aria-label="Close learner details"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {hasUnsavedChanges && (
          <p className="learner-details-note">
            Includes changes in the table that are not saved yet.
          </p>
        )}

        <div className="learner-details-body">
          <Section title="Personal">
            <Field label="Birthdate" value={text(displayBirthdate(learner.birthdate))} />
            <Field label="Age" value={age} />
            <Field label="Religion" value={text(learner.religion)} />
            <Field label="Tribe / ethnic group" value={text(learner.tribe)} />
            <Field label="4P's beneficiary" value={learner.is_4ps ? "Yes" : "No"} />
            <Field label="Reading level (Phil-IRI)" value={reading?.label || text(learner.reading_category)} />
          </Section>

          <Section title="Parents and guardian">
            <Field label="Father" value={text(learner.father_name)} />
            <Field label="Father's contact" value={text(learner.father_contact_number)} mono />
            <Field label="Mother (maiden name)" value={text(learner.mother_name)} />
            <Field label="Mother's contact" value={text(learner.mother_contact_number)} mono />
            <Field
              label="Guardian"
              value={guardianName ? `${guardianName}${guardianType ? ` (${guardianType})` : ""}` : guardianType}
            />
            <Field label="Guardian's contact" value={text(learner.guardian_contact_number)} mono />
            <Field label="Main contact number" value={text(learner.contact_number)} mono />
          </Section>

          <Section title="Address">
            <Field label="Street / sitio" value={street} />
            <Field label="Barangay" value={barangay} />
            <Field label="Full address" value={text(learner.address)} />
          </Section>

          <Section title="Class and health">
            <Field label="Grade level" value={learnerGradeLabel(learner)} />
            <Field label="Section" value={text(learner.section)} />
            <Field label="Adviser" value={text(learner.adviser_name)} />
            <Field label="School year" value={text(learner.school_year)} />
            <div className="learner-details-field">
              <dt>BMI status</dt>
              <dd>
                <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-bold ${nutritionBadgeClass(nutrition.bmi)}`}>
                  {nutrition.bmi}
                </span>
              </dd>
            </div>
            <div className="learner-details-field">
              <dt>Height-for-age</dt>
              <dd>
                <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-bold ${nutritionBadgeClass(nutrition.hfa)}`}>
                  {nutrition.hfa}
                </span>
              </dd>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
