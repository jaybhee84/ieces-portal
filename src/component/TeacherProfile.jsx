import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  adviserGradeKey,
  findOrgAdviserForProfile,
  findOrgTeacherForProfile,
  isOrgAdviser,
  orgTeachingRole,
} from "../lib/orgAdvisers";

const PHOTO_FIELDS = [
  "photo_url",
  "photo",
  "avatar_url",
  "profile_picture",
  "profile_picture_url",
  "image_url",
  "image",
];

// Shown in the named sections below, so they are left out of "Other details".
const SECTIONED_FIELDS = new Set([
  ...PHOTO_FIELDS,
  "first_name",
  "middle_name",
  "middle_initial",
  "family_name",
  "last_name",
  "suffix",
  "birthdate",
  "name",
  "full_name",
  "category",
  "teaching_type",
  "grade_level",
  "section",
  "section_assigned",
  "is_grade_chairman",
]);

// Internal bookkeeping columns that mean nothing to a teacher.
const isInternalField = (key) =>
  key === "id" ||
  key === "status" ||
  key.endsWith("_id") ||
  key.endsWith("_at") ||
  /^(sort|display)?_?(order|index|position_order)$/.test(key) ||
  /password|token|secret/.test(key);

const ROLE_LABELS = {
  adviser: "Class Adviser",
  grade_chairman: "Grade Chairman",
  subject_teacher: "Subject Teacher",
  admin: "Administrator",
};

const fieldLabel = (key) =>
  key
    .replace(/^is_/, "")
    .replace(/_/g, " ")
    .replace(/\b(id|lrn|tin|gsis|sss|no)\b/gi, (word) => word.toUpperCase())
    .replace(/^\w|\s\w/g, (letter) => letter.toUpperCase());

const fieldValue = (key, value) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value).trim();
  if (/date|birth/.test(key) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(`${text.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }
  return text;
};

// Completed years as of today, from a YYYY-MM-DD birthdate.
const ageLabel = (birthdate) => {
  const [year, month, day] = String(birthdate || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const today = new Date();
  let age = today.getFullYear() - year;
  if (
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day)
  ) {
    age -= 1;
  }
  return age >= 0 ? `${age} years old` : "";
};

const hasValue = (value) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== "" &&
  !(Array.isArray(value) && value.length === 0);

const gradeLabel = (value) => {
  const grade = adviserGradeKey(value);
  if (!grade) return "";
  if (grade === "0") return "Kinder";
  if (grade === "SNED") return "SNED";
  return /^[1-6]$/.test(grade) ? `Grade ${grade}` : String(value);
};

function DetailGroup({ title, rows }) {
  const visibleRows = rows.filter(([, value]) => hasValue(value));
  if (!visibleRows.length) return null;
  return (
    <section className="teacher-profile-group">
      <h3>{title}</h3>
      <dl>
        {visibleRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Same bucket and folder the admin portal's Org Chart page uploads to; the
// website and admin portal read the resulting org_chart.photo_url.
const PHOTO_BUCKET = "org-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_SIDE = 1200;

// Phone photos are far larger than any place this picture is shown.
const downscalePhoto = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(
        1,
        MAX_PHOTO_SIDE / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Could not read this image.")),
        "image/jpeg",
        0.9,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This file is not a readable image."));
    };
    image.src = objectUrl;
  });

// showAccount is off while a superadmin is viewing another teacher, because
// the sign-in details would be the superadmin's, not that teacher's. In that
// view the photo upload saves to the teacher being viewed, which the server
// allows only for a Portal administrator.
export function TeacherProfile({ profile, showAccount = true, onSaved }) {
  const [orgTeacher, setOrgTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  // null while viewing; holds the form values while editing.
  const [infoDraft, setInfoDraft] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadedPhoto, setUploadedPhoto] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState(null);
  // A chosen picture is only previewed; nothing is uploaded until Save.
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const photoInput = useRef(null);

  const clearPendingPhoto = () => {
    setPendingPhoto((pending) => {
      if (pending) URL.revokeObjectURL(pending.previewUrl);
      return null;
    });
  };

  const handlePhotoSelected = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoMessage({ error: true, text: "Choose a JPG or PNG picture." });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoMessage({ error: true, text: "The picture must be 5 MB or smaller." });
      return;
    }

    clearPendingPhoto();
    setPendingPhoto({ file, previewUrl: URL.createObjectURL(file) });
    setPhotoMessage({
      error: false,
      text: "Preview only. Click Save photo to keep this picture.",
    });
  };

  const handleSavePhoto = async () => {
    if (!pendingPhoto) return;

    setUploading(true);
    setPhotoMessage(null);
    try {
      const photo = await downscalePhoto(pendingPhoto.file);
      const family = String(orgTeacher?.family_name || profile?.family_name || "TEACHER")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_");
      const path = `staff/${Date.now()}_${family}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, photo, { contentType: "image/jpeg" });
      if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      const { error: saveError } = await supabase.rpc("save_my_org_chart_photo", {
        p_photo_url: urlData.publicUrl,
        p_org_id: showAccount ? null : String(orgTeacher.id),
      });
      if (saveError) {
        throw new Error(`The photo could not be saved to your record: ${saveError.message}`);
      }

      setUploadedPhoto(urlData.publicUrl);
      clearPendingPhoto();
      setPhotoMessage({
        error: false,
        text: "Photo saved. The website and admin portal now show this picture.",
      });
    } catch (error) {
      setPhotoMessage({
        error: true,
        text: error.message || "The photo could not be uploaded.",
      });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadTeacher = async () => {
      setLoading(true);
      setErrorMessage("");
      const { data, error } = await supabase.from("org_chart").select("*");
      if (!active) return;
      if (error) {
        setOrgTeacher(null);
        setErrorMessage(
          "Could not load your record from the Org Chart. Check your connection and reopen this tab.",
        );
      } else {
        const rows = data || [];
        setOrgTeacher(
          findOrgAdviserForProfile(profile, rows.filter(isOrgAdviser)) ||
            findOrgTeacherForProfile(profile, rows),
        );
      }
      setLoading(false);
    };
    loadTeacher();
    return () => {
      active = false;
    };
  }, [profile?.id, profile?.first_name, profile?.family_name]);

  const person = orgTeacher || {};
  const firstName = person.first_name || profile?.first_name;
  const middleName =
    person.middle_name || profile?.middle_name || profile?.middle_initial;
  const familyName = person.family_name || profile?.family_name;
  const fullName =
    [firstName, middleName, familyName, person.suffix].filter(Boolean).join(" ") ||
    profile?.full_name ||
    "Teacher";
  const role = orgTeachingRole(orgTeacher) || profile?.role;
  const birthdate = String(person.birthdate || "").slice(0, 10);

  const startEditingInfo = () => {
    setInfoMessage(null);
    setInfoDraft({
      family_name: person.family_name || "",
      first_name: person.first_name || "",
      middle_name: person.middle_name || "",
      birthdate,
    });
  };

  const setInfoField = (field, uppercase = false) => (event) => {
    const value = uppercase ? event.target.value.toUpperCase() : event.target.value;
    setInfoDraft((draft) => ({ ...draft, [field]: value }));
  };

  const handleSaveInfo = async (event) => {
    event.preventDefault();
    const next = {
      family_name: infoDraft.family_name.trim(),
      first_name: infoDraft.first_name.trim(),
      middle_name: infoDraft.middle_name.trim(),
      birthdate: infoDraft.birthdate || null,
    };
    if (!next.family_name || !next.first_name) {
      setInfoMessage({ error: true, text: "Family name and first name are required." });
      return;
    }

    setSavingInfo(true);
    setInfoMessage(null);
    const { error } = await supabase.rpc("save_my_org_chart_personal_info", {
      p_family_name: next.family_name,
      p_first_name: next.first_name,
      p_middle_name: next.middle_name,
      p_birthdate: next.birthdate,
      p_org_id: showAccount ? null : String(orgTeacher.id),
    });
    setSavingInfo(false);

    if (error) {
      setInfoMessage({
        error: true,
        text: `Your changes could not be saved: ${error.message}`,
      });
      return;
    }

    setOrgTeacher((current) => ({
      ...current,
      ...next,
      middle_name: next.middle_name || null,
    }));
    setInfoDraft(null);
    setInfoMessage({ error: false, text: "Personal information saved." });
    // The dashboard holds its own copy of the name, which decides the
    // teacher's role and class, so it has to reload after a change.
    onSaved?.();
  };

  const savedPhoto =
    uploadedPhoto || PHOTO_FIELDS.map((field) => person[field]).find(Boolean);
  const photo = pendingPhoto?.previewUrl || savedPhoto;
  const canUploadPhoto = Boolean(orgTeacher);
  const grade =
    role === "subject_teacher"
      ? ""
      : gradeLabel(person.grade_level || profile?.grade_level_assigned);
  const section =
    person.section || person.section_assigned || profile?.section_assigned;

  const otherRows = Object.entries(person)
    .filter(
      ([key, value]) =>
        !SECTIONED_FIELDS.has(key) && !isInternalField(key) && hasValue(value),
    )
    .map(([key, value]) => [fieldLabel(key), fieldValue(key, value)]);

  return (
    <div className="dash-card teacher-profile">
      <div className="dash-card-header">
        <h2>Teacher Profile</h2>
        <p>Your record as kept in the school Org Chart.</p>
      </div>

      {loading ? (
        <p className="teacher-profile-status">Loading teacher profile…</p>
      ) : (
        <>
          {errorMessage && (
            <p className="teacher-profile-status teacher-profile-error">
              {errorMessage}
            </p>
          )}

          <div className="teacher-profile-summary">
            {photo ? (
              <img
                src={photo}
                alt={`${fullName} profile`}
                className="teacher-profile-photo"
              />
            ) : (
              <div
                className="teacher-profile-photo teacher-profile-photo-empty"
                aria-label="No profile photo"
              >
                No photo
              </div>
            )}
            <div>
              <h3>{fullName}</h3>
              <p>
                {[ROLE_LABELS[role] || role, grade, section]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {canUploadPhoto && (
                <div className="teacher-profile-upload">
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={handlePhotoSelected}
                  />
                  <div className="teacher-profile-upload-actions">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => photoInput.current?.click()}
                    >
                      {pendingPhoto
                        ? "Choose another"
                        : savedPhoto
                          ? "Change photo"
                          : "Upload photo"}
                    </button>
                    {pendingPhoto && (
                      <>
                        <button
                          type="button"
                          className="is-primary"
                          disabled={uploading}
                          onClick={handleSavePhoto}
                        >
                          {uploading ? "Saving…" : "Save photo"}
                        </button>
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => {
                            clearPendingPhoto();
                            setPhotoMessage(null);
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                  <span>
                    Passport-style portrait, JPG or PNG, up to 5 MB. Also shown
                    on the school website and admin portal.
                  </span>
                </div>
              )}
              {photoMessage && (
                <p
                  className={`teacher-profile-photo-message${photoMessage.error ? " is-error" : ""}`}
                  role="status"
                >
                  {photoMessage.text}
                </p>
              )}
            </div>
          </div>

          {!orgTeacher && !errorMessage && (
            <p className="teacher-profile-status">
              No matching record was found in the Org Chart, so only your Portal
              account details are shown. Ask the administrator to check that
              your name there matches your Portal name.
            </p>
          )}

          <div className="teacher-profile-groups">
            <section className="teacher-profile-group">
              <h3>
                Personal information
                {orgTeacher && !infoDraft && (
                  <button type="button" onClick={startEditingInfo}>
                    Edit
                  </button>
                )}
              </h3>
              {infoDraft ? (
                <form className="teacher-profile-form" onSubmit={handleSaveInfo}>
                  <label>
                    <span>Family name</span>
                    <input
                      type="text"
                      value={infoDraft.family_name}
                      onChange={setInfoField("family_name", true)}
                      maxLength={100}
                      required
                      autoFocus
                    />
                  </label>
                  <label>
                    <span>First name</span>
                    <input
                      type="text"
                      value={infoDraft.first_name}
                      onChange={setInfoField("first_name", true)}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    <span>Middle name</span>
                    <input
                      type="text"
                      value={infoDraft.middle_name}
                      onChange={setInfoField("middle_name", true)}
                      maxLength={100}
                    />
                  </label>
                  <label>
                    <span>Birthdate</span>
                    <input
                      type="date"
                      value={infoDraft.birthdate}
                      onChange={setInfoField("birthdate")}
                      min="1900-01-01"
                      max={new Date().toISOString().slice(0, 10)}
                    />
                  </label>
                  <label>
                    <span>Age</span>
                    <output>{ageLabel(infoDraft.birthdate) || "—"}</output>
                  </label>
                  {infoMessage?.error && (
                    <p className="teacher-profile-photo-message is-error" role="alert">
                      {infoMessage.text}
                    </p>
                  )}
                  <div className="teacher-profile-form-actions">
                    <button type="submit" className="is-primary" disabled={savingInfo}>
                      {savingInfo ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={savingInfo}
                      onClick={() => {
                        setInfoDraft(null);
                        setInfoMessage(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <dl>
                    {[
                      ["Family name", familyName],
                      ["First name", firstName],
                      ["Middle name", middleName],
                      ["Suffix", person.suffix],
                      ["Birthdate", birthdate ? fieldValue("birthdate", birthdate) : ""],
                      ["Age", ageLabel(birthdate)],
                    ]
                      .filter(([label, value]) => hasValue(value) || label === "Birthdate")
                      .map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{hasValue(value) ? value : "Not set"}</dd>
                        </div>
                      ))}
                  </dl>
                  {infoMessage && !infoMessage.error && (
                    <p className="teacher-profile-photo-message" role="status">
                      {infoMessage.text}
                    </p>
                  )}
                </>
              )}
            </section>
            <DetailGroup
              title="Teaching assignment"
              rows={[
                ["Role", ROLE_LABELS[role] || role],
                ["Category", person.category],
                ["Teaching type", person.teaching_type],
                ["Grade level", grade],
                ["Section", section],
                [
                  "Grade chairman",
                  orgTeacher ? (person.is_grade_chairman ? "Yes" : "No") : "",
                ],
              ]}
            />
            {showAccount && (
              <DetailGroup
                title="Portal account"
                rows={[
                  ["Username", profile?.username],
                  ["Email", profile?.real_email || profile?.email],
                ]}
              />
            )}
            <DetailGroup title="Other details" rows={otherRows} />
          </div>

          <p className="teacher-profile-note">
            You can edit your personal information and photo here. Your teaching
            assignment is maintained by the administrator in IECES Dashboard
            Manager; report anything incorrect so it can be fixed there.
          </p>
        </>
      )}
    </div>
  );
}
