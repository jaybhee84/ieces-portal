import { useEffect, useState } from "react";

// Says where a saved photo that failed to load points, so it can be fixed.
const brokenPhotoReason = (photo) => {
  if (photo.startsWith("data:")) return "Saved photo is damaged. Retake it in Enrollment.";
  try {
    return `Saved photo could not be loaded from ${new URL(photo).hostname}`;
  } catch {
    return "Saved photo link is not valid. Retake it in Enrollment.";
  }
};

// Learner photo, or initials when there is none or it fails to load.
export default function LearnerAvatar({ photo, learner, label, size = "sm" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);
  const initials = `${String(learner.first_name || "").charAt(0)}${String(learner.family_name || "").charAt(0)}`;
  const sizeClass = size === "lg" ? " roster-avatar-lg" : "";

  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt={label}
        onError={() => setFailed(true)}
        className={`roster-avatar${sizeClass}`}
      />
    );
  }
  return (
    <span
      className={`roster-avatar roster-avatar-initials${sizeClass}${photo ? " is-broken" : ""}`}
      title={photo ? brokenPhotoReason(photo) : "No photo"}
      aria-label={label}
    >
      {initials || "?"}
    </span>
  );
}
