import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { adviserGradeKey, orgAdviserName } from "../lib/orgAdvisers";
import { PHILIRI_READING_CATEGORIES } from "../lib/readingOptions";

// List of all 45 Barangays in Isabela City
const ISABELA_CITY_BARANGAYS = [
  "Aguada",
  "Balatanay",
  "Baluno",
  "Begang",
  "Binuangan",
  "Busay",
  "Cabunbata",
  "Calvario",
  "Carbon",
  "Diki",
  "Doña Ramona T. Alano",
  "Isabela Eastside",
  "Isabela Proper",
  "Kapatagan Grande",
  "Kapayawan",
  "Kaumpurnah Zone I",
  "Kaumpurnah Zone II",
  "Kaumpurnah Zone III",
  "Kumalarang",
  "La Piedad",
  "Lampinigan",
  "Lanote",
  "Lukbuton",
  "Lumbang",
  "Makiri",
  "Maligue",
  "Marang-Marang",
  "Marketsite",
  "Masula",
  "Menzi",
  "Panigayan",
  "Panunsulan",
  "Port Area",
  "Riverside",
  "San Rafael",
  "Santa Barbara",
  "Santa Cruz",
  "Seaside",
  "Small Kapatagan",
  "Sumagdang",
  "Sunrise Village",
  "Tabiawan",
  "Tabuk",
  "Tampalan",
  "Timpul",
];

// Indigenous Peoples / Ethnic Groups in Western Mindanao
const TRIBES_WESTERN_MINDANAO = [
  "Subanen / Subanon",
  "Yakan",
  "Sama / Samal",
  "Sama Badjao / Bajau",
  "Sama Bangingi",
  "Tausug",
  "Maranao",
  "Maguindanaon",
  "Kalibugan / Kolibugan",
  "Iranun",
  "Visayan / Bisaya",
  "Chavacano",
  "Tagalog",
  "Other / Non-IP",
];

// Primary Religions in Western Mindanao
const RELIGIONS_WESTERN_MINDANAO = [
  "Islam",
  "Roman Catholic",
  "Evangelical / Protestant",
  "Seventh-day Adventist",
  "Iglesia ni Cristo",
  "Jehovah's Witnesses",
  "Bible Baptist Church",
  "United Church of Christ in the Philippines (UCCP)",
  "Church of Jesus Christ of Latter-day Saints (Mormon)",
  "Other Religion",
];

const IECES_SCHOOL_NAME = "Isabela East Central Elementary School";

const cameraPreferenceScore = (device) => {
  const label = String(device?.label || "").toLowerCase();
  if (/nc beauty|virtual|obs|snap camera|manycam|xsplit|ndi camera/.test(label)) {
    return -100;
  }
  if (/usb|webcam|logitech|brio|c920|c922|external|hd pro|lifecam/.test(label)) {
    return 100;
  }
  if (/integrated|built-in|facetime|front camera/.test(label)) return 10;
  return 50;
};

const parseStoredName = (value) => {
  const cleaned = String(value || "").trim();
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (!cleaned) return { family_name: "", first_name: "", middle_name: "" };

  // Canonical Enrollment value: FAMILY, FIRST, MIDDLE. Also accept old
  // "FAMILY, FIRST MIDDLE" and Advisory's natural "FIRST MIDDLE FAMILY".
  if (parts.length >= 2) {
    const givenParts = parts.length === 2 ? parts[1].split(/\s+/) : [];
    return {
      family_name: parts[0] || "",
      first_name: parts.length === 2 ? givenParts[0] || "" : parts[1] || "",
      middle_name:
        parts.length === 2 ? givenParts.slice(1).join(" ") : parts.slice(2).join(" "),
    };
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  return {
    family_name: words.length > 1 ? words.at(-1) : words[0] || "",
    first_name: words.length > 1 ? words[0] : "",
    middle_name: words.length > 2 ? words.slice(1, -1).join(" ") : "",
  };
};

function getCurrentSchoolYear() {
  const today = new Date();
  const year = today.getFullYear();
  const startYear = today.getMonth() >= 5 ? year : year - 1;
  return `${startYear}–${startYear + 1}`;
}

export function EnrollmentForm({ profile }) {
  const [advisers, setAdvisers] = useState([]);
  const [adviserLoadError, setAdviserLoadError] = useState("");
  const [existingLearnerId, setExistingLearnerId] = useState(null);
  const [lrnLookupMessage, setLrnLookupMessage] = useState("");
  const [lrnDuplicateCount, setLrnDuplicateCount] = useState(0);
  const [advisoryGuardianHint, setAdvisoryGuardianHint] = useState(null);

  // Parent details & status flags
  const [father, setFather] = useState({
    family_name: "",
    first_name: "",
    middle_name: "",
    contact_number: "",
  });
  const [fatherDeceased, setFatherDeceased] = useState(false);

  const [mother, setMother] = useState({
    family_name: "",
    first_name: "",
    middle_name: "",
    contact_number: "",
  });
  const [motherDeceased, setMotherDeceased] = useState(false);

  // Guardian state
  const [hasGuardian, setHasGuardian] = useState(false);
  const [guardian, setGuardian] = useState({
    family_name: "",
    first_name: "",
    middle_name: "",
    relationship: "",
    contact_number: "",
  });

  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [streetAddress, setStreetAddress] = useState("");

  const [formData, setFormData] = useState({
    grade_level: "",
    lrn: "",
    family_name: "",
    first_name: "",
    middle_name: "",
    birthdate: "",
    age: "",
    gender: "Male",
    tribe: "",
    religion: "",
    is_4ps_beneficiary: false,
    reading_category: "",
    father_name: "",
    mother_name: "",
    guardian_name: "",
    contact_number: "",
    address: "",
    adviser_id: "",
    photo_url: "",
  });

  // Modal notification state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successNotice, setSuccessNotice] = useState({
    title: "Learner Registration Successful!",
    message: "The learner has been registered successfully.",
  });
  useEffect(() => {
    if (!showSuccessModal) return undefined;
    const timer = window.setTimeout(() => setShowSuccessModal(false), 4500);
    return () => window.clearTimeout(timer);
  }, [showSuccessModal]);
  const assignedGrade = adviserGradeKey(profile?.grade_level_assigned);
  const hasAssignedGrade = ["0", "1", "2", "3", "4", "5", "6"].includes(
    assignedGrade,
  );
  const locksAssignedGrade =
    ["adviser", "grade_chairman"].includes(
      String(profile?.role || "").toLowerCase(),
    ) && hasAssignedGrade;

  useEffect(() => {
    if (!locksAssignedGrade) return;
    setFormData((current) =>
      current.grade_level === assignedGrade
        ? current
        : { ...current, grade_level: assignedGrade, adviser_id: "" },
    );
  }, [assignedGrade, locksAssignedGrade]);
  const [errorMessage, setErrorMessage] = useState("");

  // Webcam states & refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [activeCameraLabel, setActiveCameraLabel] = useState("");

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported on this machine.");
      }

      stopCamera();

      let devices = await navigator.mediaDevices.enumerateDevices();
      let cameras = devices.filter((device) => device.kind === "videoinput");

      // Device names are hidden until camera permission has been granted.
      if (cameras.some((camera) => !camera.label)) {
        const permissionStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        permissionStream.getTracks().forEach((track) => track.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
        cameras = devices.filter((device) => device.kind === "videoinput");
      }

      const selectedCamera = [...cameras].sort(
        (a, b) => cameraPreferenceScore(b) - cameraPreferenceScore(a),
      )[0];

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(selectedCamera?.deviceId
            ? { deviceId: { exact: selectedCamera.deviceId } }
            : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActiveCameraLabel(selectedCamera?.label || "Default camera");
      setIsCameraActive(true);
    } catch (err) {
      alert("Unable to access camera: " + err.message);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setActiveCameraLabel("");
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const context = canvas.getContext("2d");
      canvas.width = video.videoWidth || 300;
      canvas.height = video.videoHeight || 300;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL("image/jpeg");
      setCapturedPhoto(imageData);
      setFormData((prev) => ({ ...prev, photo_url: imageData }));
      stopCamera();
    }
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    setFormData((prev) => ({ ...prev, photo_url: "" }));
    startCamera();
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    const lrn = formData.lrn.trim();
    if (lrn.length !== 12) {
      setExistingLearnerId(null);
      setLrnLookupMessage("");
      setLrnDuplicateCount(0);
      setAdvisoryGuardianHint(null);
      return undefined;
    }

    let cancelled = false;
    const lookupLearner = async () => {
      setLrnLookupMessage("Looking up learner...");
      // Fetch every row for this LRN (not just one): the same LRN can end up on
      // more than one students row, and silently taking a single "latest updated"
      // row was masking correct data (e.g. father's name, middle name) that only
      // existed on an older duplicate.
      const { data: rows, error } = await supabase
        .from("students")
        .select("*")
        .eq("lrn", lrn)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setLrnLookupMessage(`Could not look up LRN: ${error.message}`);
        setLrnDuplicateCount(0);
        return;
      }
      if (!rows || rows.length === 0) {
        setExistingLearnerId(null);
        setLrnLookupMessage("New learner LRN. Enter the enrollment details.");
        setLrnDuplicateCount(0);
        setAdvisoryGuardianHint(null);
        return;
      }

      // Merge every field across all matching rows: take the first non-empty
      // value, scanning from most- to least-recently updated. This way a value
      // that only survives on one duplicate (e.g. father_name) still shows up.
      const pick = (field) => {
        for (const row of rows) {
          const value = row[field];
          if (value !== null && value !== undefined && String(value).trim() !== "") {
            return value;
          }
        }
        return "";
      };
      const data = {
        id: rows[0].id,
        family_name: pick("family_name"),
        first_name: pick("first_name"),
        middle_name: pick("middle_name"),
        birthdate: pick("birthdate"),
        age: pick("age"),
        gender: pick("gender"),
        sex: pick("sex"),
        tribe: pick("tribe"),
        religion: pick("religion"),
        is_4ps: rows.some((row) => Boolean(row.is_4ps)),
        reading_category: pick("reading_category"),
        contact_number: pick("contact_number"),
        father_contact_number: pick("father_contact_number"),
        mother_contact_number: pick("mother_contact_number"),
        guardian_contact_number: pick("guardian_contact_number"),
        photo_url: pick("photo_url"),
        father_name: pick("father_name"),
        mother_name: pick("mother_name"),
        guardian_type: pick("guardian_type"),
        guardian_contact_name: pick("guardian_contact_name"),
        address: pick("address"),
      };

      // Older Advisory saves kept a Father/Mother only in the guardian columns.
      // Treat that value as the parent-name fallback so Enrollment immediately
      // displays it; submitting the form persists it into father_name/mother_name.
      const guardianType = String(data.guardian_type || "").trim().toLowerCase();
      const advisoryFather =
        guardianType === "father" ? data.guardian_contact_name : "";
      const advisoryMother =
        guardianType === "mother" ? data.guardian_contact_name : "";
      const effectiveFatherName = data.father_name || advisoryFather;
      const effectiveMotherName = data.mother_name || advisoryMother;
      const fatherData = parseStoredName(effectiveFatherName);
      const motherData = parseStoredName(effectiveMotherName);
      fatherData.contact_number = data.father_contact_number ||
        (guardianType === "father" ? data.contact_number : "");
      motherData.contact_number = data.mother_contact_number ||
        (guardianType === "mother" ? data.contact_number : "");
      const address = String(data.address || "");
      const barangayMatch = address.match(/Brgy\.\s*([^,]+)/i);
      const street = address.split(/,?\s*Brgy\./i)[0].trim();
      setExistingLearnerId(data.id);
      setFatherDeceased(String(effectiveFatherName).toUpperCase() === "DECEASED");
      setMotherDeceased(String(effectiveMotherName).toUpperCase() === "DECEASED");
      setFather(fatherData);
      setMother(motherData);
      if (data.guardian_name) {
        const guardianName = String(data.guardian_name).replace(/\s*\([^()]*\)\s*$/, "");
        setGuardian({
          ...parseStoredName(guardianName),
          relationship:
            String(data.guardian_name).match(/\(([^()]*)\)\s*$/)?.[1] || "",
          contact_number: data.guardian_contact_number ||
            (!["father", "mother"].includes(guardianType) ? data.contact_number : ""),
        });
        setHasGuardian(true);
      } else {
        setGuardian({
          family_name: "",
          first_name: "",
          middle_name: "",
          relationship: "",
          contact_number: "",
        });
        setHasGuardian(false);
      }
      // Advisory Class stores its parent/guardian contact in separate
      // guardian_type / guardian_contact_name columns, not father_name /
      // mother_name. If those were never filled in here, surface what was
      // recorded in Advisory Class as a hint instead of leaving it hidden.
      setAdvisoryGuardianHint(
        !data.father_name &&
          !data.mother_name &&
          data.guardian_contact_name &&
          !["father", "mother"].includes(guardianType)
          ? { type: data.guardian_type || "Guardian", name: data.guardian_contact_name }
          : null,
      );
      setSelectedBarangay(barangayMatch?.[1]?.trim() || "");
      setStreetAddress(street);
      setCapturedPhoto(data.photo_url || null);
      setFormData((current) => ({
        ...current,
        family_name: data.family_name || "",
        first_name: data.first_name || "",
        middle_name: data.middle_name || "",
        birthdate: data.birthdate ? String(data.birthdate).slice(0, 10) : "",
        age: data.age ?? "",
        gender: ["F", "FEMALE", "GIRL"].includes(
          String(data.gender || data.sex || "").toUpperCase(),
        ) ? "Female" : "Male",
        tribe: data.tribe || "",
        religion: data.religion || "",
        is_4ps_beneficiary: Boolean(data.is_4ps),
        reading_category: data.reading_category || "",
        contact_number: data.contact_number || "",
        photo_url: data.photo_url || "",
      }));
      setLrnDuplicateCount(rows.length);
      setLrnLookupMessage(
        rows.length > 1
          ? `Warning: ${rows.length} records share this LRN. Fields below were merged from all of them, but please double-check every value — ask an admin to remove the duplicate record(s) in Supabase so this doesn't keep happening.`
          : "Existing learner found. Details were prefilled and remain editable.",
      );
    };
    lookupLearner();
    return () => { cancelled = true; };
  }, [formData.lrn]);

  const handleBirthdateChange = (e) => {
    const dob = e.target.value;
    let computedAge = "";
    if (dob) {
      const birthDateObj = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDateObj.getFullYear();
      const m = today.getMonth() - birthDateObj.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) {
        age--;
      }
      computedAge = age >= 0 ? age : "";
    }
    setFormData((prev) => ({ ...prev, birthdate: dob, age: computedAge }));
  };

  // Fetch available advisers matching selected Grade Level
  useEffect(() => {
    async function fetchAdvisers() {
      if (!formData.grade_level) {
        setAdvisers([]);
        setAdviserLoadError("");
        setFormData((prev) => ({ ...prev, adviser_id: "" }));
        return;
      }

      const { data, error } = await supabase
        .from("org_chart")
        .select(
          "id, first_name, middle_name, family_name, grade_level, teaching_type, is_grade_chairman",
        )
        .eq("category", "teaching");

      if (!error && data) {
        const selectedGrade =
          formData.grade_level === "0"
            ? "KINDER"
            : `GRADE ${formData.grade_level}`;

        const matchingAdvisers = data
          .filter((teacher) => {
            const teachingType = String(teacher.teaching_type || "").toUpperCase();
            const gradeLevel = String(teacher.grade_level || "").toUpperCase();
            return (
              (teachingType === "ADVISER" || teacher.is_grade_chairman) &&
              gradeLevel === selectedGrade
            );
          })
          .map((teacher) => ({
            ...teacher,
            full_name: orgAdviserName(teacher),
          }))
          .sort(
            (a, b) =>
              Number(Boolean(b.is_grade_chairman)) -
                Number(Boolean(a.is_grade_chairman)) ||
              a.full_name.localeCompare(b.full_name),
          );

        setAdvisers(matchingAdvisers);
        setAdviserLoadError("");
      } else {
        setAdvisers([]);
        setAdviserLoadError(
          `Unable to load advisers from the organizational chart: ${error?.message || "Unknown error"}`,
        );
      }
      setFormData((prev) => ({ ...prev, adviser_id: "" }));
    }
    fetchAdvisers();
  }, [formData.grade_level]);

  const formatFullName = (person) => {
    const parts = [
      person.family_name,
      person.first_name,
      person.middle_name,
    ].filter(Boolean);
    return parts.join(", ");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .select("school_id,name")
      .eq("name", IECES_SCHOOL_NAME)
      .maybeSingle();

    if (schoolError || !school?.school_id) {
      setErrorMessage(
        "Enrollment cannot be linked to IECES because its School ID is missing from the shared school registry.",
      );
      return;
    }

    const constructedFather = fatherDeceased
      ? "DECEASED"
      : formatFullName(father);
    const constructedMother = motherDeceased
      ? "DECEASED"
      : formatFullName(mother);

    const constructedGuardian = hasGuardian
      ? `${formatFullName(guardian)}${guardian.relationship ? ` (${guardian.relationship})` : ""}`
      : "";

    const fullAddress = selectedBarangay
      ? `${streetAddress ? streetAddress + ", " : ""}Brgy. ${selectedBarangay}, Isabela City, Basilan`
      : "";

    // Advisory Class reads its guardian contact from guardian_type /
    // guardian_contact_name, a separate pair of columns from father_name /
    // mother_name. Keep them in sync here (father wins, then mother) so a
    // parent entered on this form also shows up as the Advisory guardian
    // contact instead of silently staying invisible over there.
    const guardianFromParent =
      constructedFather && constructedFather !== "DECEASED"
        ? { guardian_type: "Father", guardian_contact_name: null }
        : constructedMother && constructedMother !== "DECEASED"
          ? { guardian_type: "Mother", guardian_contact_name: null }
          : null;

    const { gender, is_4ps_beneficiary, ...editableData } = formData;
    const payload = {
      ...editableData,
      sex: gender === "Female" ? "F" : "M",
      is_4ps: is_4ps_beneficiary,
      school_id: String(school.school_id).trim(),
      school_name: school.name || IECES_SCHOOL_NAME,
      school_year: getCurrentSchoolYear(),
      father_name: constructedFather,
      mother_name: constructedMother,
      father_contact_number: father.contact_number?.trim() || null,
      mother_contact_number: mother.contact_number?.trim() || null,
      guardian_contact_number: hasGuardian
        ? guardian.contact_number?.trim() || null
        : null,
      guardian_name: constructedGuardian,
      // Retained for Auto ID/BMI compatibility while those apps still expect
      // one contact field. Prefer the chosen legal guardian, then either parent.
      contact_number:
        (hasGuardian ? guardian.contact_number?.trim() : "") ||
        father.contact_number?.trim() ||
        mother.contact_number?.trim() ||
        null,
      address: fullAddress,
      ...(guardianFromParent || {}),
    };

    // Finding an existing LRN means this is a details edit, not reenrollment or
    // a class transfer. Keep its current school year, grade, and adviser intact.
    const {
      grade_level: _gradeLevel,
      adviser_id: _adviserId,
      school_id: _schoolId,
      school_name: _schoolName,
      school_year: _schoolYear,
      ...existingLearnerChanges
    } = payload;

    const saveResult = existingLearnerId
      ? await supabase.rpc("save_existing_student_details", {
          p_student_id: String(existingLearnerId),
          p_details: existingLearnerChanges,
        })
      : await supabase.from("students").insert([payload]).select().single();
    const { data: savedLearner, error } = saveResult;

    if (error) {
      setErrorMessage(
        `${existingLearnerId ? "Failed to update learner" : "Failed to enroll learner"}: ${error.message}`,
      );
    } else {
      setSuccessNotice(
        existingLearnerId
          ? {
              title: "Learner Details Updated!",
              message:
                "The edited learner data was saved. The existing grade and advisory assignment were not changed.",
            }
          : {
              title: "Learner Registration Successful!",
              message:
                "The learner has been registered and assigned to the selected advisory class.",
            },
      );
      setShowSuccessModal(true);
      if (savedLearner?.id) {
        window.dispatchEvent(
          new CustomEvent("ieces:students-updated", {
            detail: { updates: [savedLearner] },
          }),
        );
      }
      stopCamera();
      setCapturedPhoto(null);

      // Reset all inputs & dropdowns to default empty states
      setFather({ family_name: "", first_name: "", middle_name: "", contact_number: "" });
      setFatherDeceased(false);
      setMother({ family_name: "", first_name: "", middle_name: "", contact_number: "" });
      setMotherDeceased(false);
      setHasGuardian(false);
      setGuardian({
        family_name: "",
        first_name: "",
        middle_name: "",
        relationship: "",
        contact_number: "",
      });
      setSelectedBarangay("");
      setStreetAddress("");
      setExistingLearnerId(null);
      setLrnLookupMessage("");

      setFormData({
        grade_level: "",
        lrn: "",
        family_name: "",
        first_name: "",
        middle_name: "",
        birthdate: "",
        age: "",
        gender: "Male",
        tribe: "",
        religion: "",
        is_4ps_beneficiary: false,
        reading_category: "",
        father_name: "",
        mother_name: "",
        guardian_name: "",
        contact_number: "",
        address: "",
        adviser_id: "",
        photo_url: "",
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200 relative">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-3">
        Learners Information
      </h2>

      {/* Error Message Banner if submission fails */}
      {errorMessage && (
        <div className="p-4 mb-6 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200">
          {errorMessage}
        </div>
      )}

      {/* Compact save confirmation card */}
      {showSuccessModal && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-xl animate-fadeIn"
        >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-800">{successNotice.title}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">{successNotice.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ×
            </button>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* LEFT SIDE: Form Inputs */}
          <div className="lg:col-span-2 space-y-6">
            {/* Grade Level, Adviser, LRN */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Grade Level
                </label>
                {locksAssignedGrade ? (
                  <input
                    type="text"
                    value={assignedGrade === "0" ? "Kindergarten" : `Grade ${assignedGrade}`}
                    readOnly
                    className="w-full p-2.5 border rounded-lg bg-slate-100 text-sm font-bold text-slate-700 cursor-not-allowed"
                  />
                ) : (
                  <select
                    value={formData.grade_level}
                    onChange={(e) =>
                      setFormData({ ...formData, grade_level: e.target.value })
                    }
                    className="w-full p-2.5 border rounded-lg bg-slate-50 focus:bg-white text-sm"
                    required
                  >
                    <option value="">-- Select Grade Level --</option>
                    <option value="0">Kindergarten</option>
                    {[1, 2, 3, 4, 5, 6].map((g) => (
                      <option key={g} value={g}>Grade {g}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Assigned Adviser
                </label>
                <select
                  value={formData.adviser_id}
                  onChange={(e) =>
                    setFormData({ ...formData, adviser_id: e.target.value })
                  }
                  className="w-full p-2.5 border rounded-lg bg-slate-50 focus:bg-white text-sm"
                  required
                >
                  <option value="">-- Select Adviser --</option>
                  {advisers.map((adv) => (
                    <option key={adv.id} value={adv.id}>
                      {adv.full_name}
                      {adv.is_grade_chairman ? " (Grade Chairman)" : ""}
                    </option>
                  ))}
                </select>
                {adviserLoadError && (
                  <p className="mt-1 text-xs text-red-600">
                    {adviserLoadError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  LRN (12 Digits Only)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength="12"
                  pattern="\d{12}"
                  placeholder="123456789012"
                  value={formData.lrn}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d{0,12}$/.test(val)) {
                      setFormData({ ...formData, lrn: val });
                    }
                  }}
                  className="w-full p-2.5 border rounded-lg text-sm"
                  required
                />
                {lrnLookupMessage && (
                  <p
                    className={`mt-1 text-xs ${
                      lrnDuplicateCount > 1
                        ? "font-semibold text-amber-600"
                        : existingLearnerId
                          ? "text-emerald-600"
                          : "text-slate-500"
                    }`}
                  >
                    {lrnLookupMessage}
                  </p>
                )}
              </div>
            </div>

            {/* Learner Name (ALL CAPS) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Family Name
                </label>
                <input
                  type="text"
                  value={formData.family_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      family_name: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm uppercase"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      first_name: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm uppercase"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Middle Name
                </label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      middle_name: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm uppercase"
                />
              </div>
            </div>

            {/* Birthdate, Age, Gender */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Birthdate
                </label>
                <input
                  type="date"
                  value={formData.birthdate}
                  onChange={handleBirthdateChange}
                  className="w-full p-2.5 border rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Calculated Age
                </label>
                <input
                  type="number"
                  value={formData.age}
                  readOnly
                  className="w-full p-2.5 border rounded-lg text-sm bg-slate-100 font-bold text-blue-600 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) =>
                    setFormData({ ...formData, gender: e.target.value })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            {/* Demographics: Tribe & Religion Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Tribe / Ethnic Group
                </label>
                <select
                  value={formData.tribe}
                  onChange={(e) =>
                    setFormData({ ...formData, tribe: e.target.value })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                  required
                >
                  <option value="">-- Select Tribe --</option>
                  {TRIBES_WESTERN_MINDANAO.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Religion
                </label>
                <select
                  value={formData.religion}
                  onChange={(e) =>
                    setFormData({ ...formData, religion: e.target.value })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                  required
                >
                  <option value="">-- Select Religion --</option>
                  {RELIGIONS_WESTERN_MINDANAO.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center mt-6">
                <label className="flex items-center cursor-pointer gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.is_4ps_beneficiary}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        is_4ps_beneficiary: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  4P's Beneficiary
                </label>
              </div>
            </div>

            {/* Phil-IRI Reading Category */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Phil-IRI Reading Category
                </label>
                <select
                  value={formData.reading_category}
                  onChange={(e) =>
                    setFormData({ ...formData, reading_category: e.target.value })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                >
                  <option value="">-- Select Reading Category (optional) --</option>
                  {PHILIRI_READING_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-0.5">
                <p className="text-xs text-slate-400 leading-snug">
                  Based on Phil-IRI pre/post assessment. Leave blank if not yet assessed.
                </p>
              </div>
            </div>

            {/* Father's Name Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Father's Name
                </label>
                {hasGuardian && (
                  <label className="flex items-center gap-1.5 text-xs text-red-600 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fatherDeceased}
                      onChange={(e) => {
                        setFatherDeceased(e.target.checked);
                        if (e.target.checked) {
                          setFather({
                            family_name: "",
                            first_name: "",
                            middle_name: "",
                          });
                        }
                      }}
                      className="w-3.5 h-3.5 text-red-600 rounded"
                    />
                    Deceased / Not Applicable
                  </label>
                )}
              </div>

              {advisoryGuardianHint?.type === "Father" && (
                <p className="mb-2 text-xs text-amber-600">
                  Advisory Class has "{advisoryGuardianHint.name}" recorded as this learner's guardian contact, but no official father's name is on file here yet. Advisory Class saves that contact separately, so please type the father's name into the fields below to record it for enrollment.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input
                  type="text"
                  placeholder={
                    fatherDeceased ? "DECEASED" : "Father's Family Name"
                  }
                  value={fatherDeceased ? "" : father.family_name}
                  disabled={fatherDeceased}
                  onChange={(e) =>
                    setFather({
                      ...father,
                      family_name: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm uppercase disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <input
                  type="text"
                  placeholder={
                    fatherDeceased ? "DECEASED" : "Father's First Name"
                  }
                  value={fatherDeceased ? "" : father.first_name}
                  disabled={fatherDeceased}
                  onChange={(e) =>
                    setFather({
                      ...father,
                      first_name: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm uppercase disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <input
                  type="text"
                  placeholder={
                    fatherDeceased ? "DECEASED" : "Father's Middle Name"
                  }
                  value={fatherDeceased ? "" : father.middle_name}
                  disabled={fatherDeceased}
                  onChange={(e) =>
                    setFather({
                      ...father,
                      middle_name: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm uppercase disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <input
                  type="tel"
                  placeholder="Father's Contact Number"
                  value={fatherDeceased ? "" : father.contact_number || ""}
                  disabled={fatherDeceased}
                  onChange={(e) =>
                    setFather({ ...father, contact_number: e.target.value })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Mother's Name Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Mother's Maiden Name
                </label>
                {hasGuardian && (
                  <label className="flex items-center gap-1.5 text-xs text-red-600 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={motherDeceased}
                      onChange={(e) => {
                        setMotherDeceased(e.target.checked);
                        if (e.target.checked) {
                          setMother({
                            family_name: "",
                            first_name: "",
                            middle_name: "",
                          });
                        }
                      }}
                      className="w-3.5 h-3.5 text-red-600 rounded"
                    />
                    Deceased / Not Applicable
                  </label>
                )}
              </div>

              {advisoryGuardianHint?.type === "Mother" && (
                <p className="mb-2 text-xs text-amber-600">
                  Advisory Class has "{advisoryGuardianHint.name}" recorded as this learner's guardian contact, but no official mother's name is on file here yet. Advisory Class saves that contact separately, so please type the mother's name into the fields below to record it for enrollment.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input
                  type="text"
                  placeholder={
                    motherDeceased ? "DECEASED" : "Mother's Family Name"
                  }
                  value={motherDeceased ? "" : mother.family_name}
                  disabled={motherDeceased}
                  onChange={(e) =>
                    setMother({
                      ...mother,
                      family_name: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm uppercase disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <input
                  type="text"
                  placeholder={
                    motherDeceased ? "DECEASED" : "Mother's First Name"
                  }
                  value={motherDeceased ? "" : mother.first_name}
                  disabled={motherDeceased}
                  onChange={(e) =>
                    setMother({
                      ...mother,
                      first_name: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm uppercase disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <input
                  type="text"
                  placeholder={
                    motherDeceased ? "DECEASED" : "Mother's Middle Name"
                  }
                  value={motherDeceased ? "" : mother.middle_name}
                  disabled={motherDeceased}
                  onChange={(e) =>
                    setMother({
                      ...mother,
                      middle_name: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm uppercase disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <input
                  type="tel"
                  placeholder="Mother's Contact Number"
                  value={motherDeceased ? "" : mother.contact_number || ""}
                  disabled={motherDeceased}
                  onChange={(e) =>
                    setMother({ ...mother, contact_number: e.target.value })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Guardian Section */}
            <div className="border-t pt-4">
              <label className="flex items-center cursor-pointer gap-2 text-sm font-bold text-slate-700 uppercase mb-3">
                <input
                  type="checkbox"
                  checked={hasGuardian}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHasGuardian(checked);
                    if (!checked) {
                      setFatherDeceased(false);
                      setMotherDeceased(false);
                    }
                  }}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                Guardian (Other than Parents / Orphan)
              </label>

              {!hasGuardian && (
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Guardian Contact Number
                  </label>
                  <input
                    type="tel"
                    value=""
                    disabled
                    placeholder="Select Guardian first"
                    className="w-full p-2.5 border rounded-lg text-sm bg-slate-100 text-slate-400 cursor-not-allowed"
                  />
                </div>
              )}

              {hasGuardian && (
                <div className="p-4 bg-slate-50 border rounded-lg space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                        Guardian Family Name
                      </label>
                      <input
                        type="text"
                        value={guardian.family_name}
                        onChange={(e) =>
                          setGuardian({
                            ...guardian,
                            family_name: e.target.value.toUpperCase(),
                          })
                        }
                        className="w-full p-2.5 border rounded-lg text-sm uppercase bg-white"
                        required={hasGuardian}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                        Guardian First Name
                      </label>
                      <input
                        type="text"
                        value={guardian.first_name}
                        onChange={(e) =>
                          setGuardian({
                            ...guardian,
                            first_name: e.target.value.toUpperCase(),
                          })
                        }
                        className="w-full p-2.5 border rounded-lg text-sm uppercase bg-white"
                        required={hasGuardian}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                        Guardian Middle Name
                      </label>
                      <input
                        type="text"
                        value={guardian.middle_name}
                        onChange={(e) =>
                          setGuardian({
                            ...guardian,
                            middle_name: e.target.value.toUpperCase(),
                          })
                        }
                        className="w-full p-2.5 border rounded-lg text-sm uppercase bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                      Relationship to Guardian
                    </label>
                    <select
                      value={guardian.relationship}
                      onChange={(e) =>
                        setGuardian({
                          ...guardian,
                          relationship: e.target.value,
                        })
                      }
                      className="w-full p-2.5 border rounded-lg text-sm bg-white"
                      required={hasGuardian}
                    >
                      <option value="">-- Select Relationship --</option>
                      <option value="Grandfather">Grandfather</option>
                      <option value="Grandmother">Grandmother</option>
                      <option value="Aunt">Aunt</option>
                      <option value="Uncle">Uncle</option>
                      <option value="Sibling">Sibling</option>
                      <option value="Other Legal Guardian">
                        Other Legal Guardian
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                      Guardian Contact Number
                    </label>
                    <input
                      type="tel"
                      value={guardian.contact_number || ""}
                      onChange={(e) =>
                        setGuardian({ ...guardian, contact_number: e.target.value })
                      }
                      className="w-full p-2.5 border rounded-lg text-sm bg-white"
                      required={hasGuardian}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Address Section */}
            <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Barangay (Isabela City)
                </label>
                <select
                  value={selectedBarangay}
                  onChange={(e) => setSelectedBarangay(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                  required
                >
                  <option value="">-- Select Barangay --</option>
                  {ISABELA_CITY_BARANGAYS.map((bgy) => (
                    <option key={bgy} value={bgy}>
                      {bgy}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Street / House No. / Sitio
                </label>
                <input
                  type="text"
                  placeholder="e.g., Zone 2, Pundakit St."
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: Webcam & Photo Capture Panel */}
          <div className="lg:col-span-1 p-5 bg-slate-50 border rounded-xl flex flex-col items-center justify-start sticky top-4">
            <label className="block text-xs font-bold text-slate-600 uppercase mb-4 text-center">
              Learner Photo
            </label>

            <div className="w-52 h-52 bg-slate-200 rounded-lg overflow-hidden border border-slate-300 flex items-center justify-center mb-4 relative shadow-inner">
              {capturedPhoto ? (
                <img
                  src={capturedPhoto}
                  alt="Learner"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover ${
                    !isCameraActive ? "hidden" : ""
                  }`}
                />
              )}

              {!isCameraActive && !capturedPhoto && (
                <span className="text-slate-400 text-xs font-medium text-center px-4">
                  No Photo Captured
                </span>
              )}
            </div>

            {/* Camera Controls */}
            <div className="flex flex-col gap-2 w-full max-w-[208px]">
              {!isCameraActive && !capturedPhoto && (
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full bg-slate-700 hover:bg-slate-800 text-white text-xs py-2.5 rounded-lg font-semibold transition-colors"
                >
                  Start Camera
                </button>
              )}

              {isCameraActive && (
                <>
                  {activeCameraLabel && (
                    <p className="text-[11px] text-slate-500 text-center truncate">
                      {activeCameraLabel}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2.5 rounded-lg font-semibold transition-colors"
                  >
                    Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="w-full bg-gray-500 hover:bg-gray-600 text-white text-xs py-2.5 rounded-lg font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}

              {capturedPhoto && (
                <button
                  type="button"
                  onClick={retakePhoto}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs py-2.5 rounded-lg font-semibold transition-colors"
                >
                  Retake Photo
                </button>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full max-w-[208px] mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow transition-colors"
            >
              Submit
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
