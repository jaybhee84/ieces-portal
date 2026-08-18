import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

// List of all 45 Barangays in Isabela City
const ISABELA_CITY_BARANGAYS = [
  "Aguada",
  "Balatanay",
  "Baluno",
  "Begang",
  "Binuangan",
  "Busay",
  "Cabunbata",
  "Cawa-Cawa",
  "Communal",
  "Isabela East Port (Poblacion)",
  "Isabela West Port (Poblacion)",
  "Kapatagan Grande",
  "Kaumpurnah Zone I",
  "Kaumpurnah Zone II",
  "Kaumpurnah Zone III",
  "Kapayawan",
  "Laisan",
  "Limpapa",
  "Lugbung",
  "Lukbuton",
  "Lumbang",
  "Makiri",
  "Malim",
  "Marang-Marang",
  "Matarling",
  "Matatag",
  "Menzi",
  "Malamawi",
  "Panunsulan",
  "Port Area",
  "Riverside",
  "San Rafael",
  "Santa Clara",
  "Santa Cruz",
  "Seaside",
  "Small Kapatagan",
  "Sumagdang",
  "Sungkayut",
  "Tabuk",
  "Tampalan",
  "Tebiah",
  "Tunghatang",
  "Unsang",
  "Upper Hingabu",
  "Upper Port Area",
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

// Phil-IRI Reading Categories
const PHILIRI_READING_CATEGORIES = [
  { value: "NGS", label: "Non-Grade Level / Non-Standard (NGS)" },
  { value: "FF", label: "Frustration — Filipino (FF)" },
  { value: "FE", label: "Frustration — English (FE)" },
  { value: "IF", label: "Instructional — Filipino (IF)" },
  { value: "IE", label: "Instructional — English (IE)" },
  { value: "INDF", label: "Independent — Filipino (INDF)" },
  { value: "INDE", label: "Independent — English (INDE)" },
  { value: "NA", label: "Not Yet Assessed (NA)" },
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

export function EnrollmentForm() {
  const [advisers, setAdvisers] = useState([]);
  const [adviserLoadError, setAdviserLoadError] = useState("");

  // Parent details & status flags
  const [father, setFather] = useState({
    family_name: "",
    first_name: "",
    middle_name: "",
  });
  const [fatherDeceased, setFatherDeceased] = useState(false);

  const [mother, setMother] = useState({
    family_name: "",
    first_name: "",
    middle_name: "",
  });
  const [motherDeceased, setMotherDeceased] = useState(false);

  // Guardian state
  const [hasGuardian, setHasGuardian] = useState(false);
  const [guardian, setGuardian] = useState({
    family_name: "",
    first_name: "",
    middle_name: "",
    relationship: "",
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
  const [errorMessage, setErrorMessage] = useState("");

  // Webcam states & refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 300, height: 300 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
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
            return teachingType === "ADVISER" && gradeLevel === selectedGrade;
          })
          .map((teacher) => ({
            ...teacher,
            full_name: [
              teacher.first_name,
              teacher.middle_name,
              teacher.family_name,
            ]
              .filter(Boolean)
              .join(" "),
          }))
          .sort((a, b) => a.full_name.localeCompare(b.full_name));

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
      ? `${streetAddress ? streetAddress + ", " : ""}Brgy. ${selectedBarangay}, Isabela City`
      : "";

    const payload = {
      ...formData,
      father_name: constructedFather,
      mother_name: constructedMother,
      guardian_name: constructedGuardian,
      address: fullAddress,
    };

    const { error } = await supabase.from("students").insert([payload]);

    if (error) {
      setErrorMessage(`Failed to enroll learner: ${error.message}`);
    } else {
      setShowSuccessModal(true);
      stopCamera();
      setCapturedPhoto(null);

      // Reset all inputs & dropdowns to default empty states
      setFather({ family_name: "", first_name: "", middle_name: "" });
      setFatherDeceased(false);
      setMother({ family_name: "", first_name: "", middle_name: "" });
      setMotherDeceased(false);
      setHasGuardian(false);
      setGuardian({
        family_name: "",
        first_name: "",
        middle_name: "",
        relationship: "",
      });
      setSelectedBarangay("");
      setStreetAddress("");

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
        Learner Enrollment Data
      </h2>

      {/* Error Message Banner if submission fails */}
      {errorMessage && (
        <div className="p-4 mb-6 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200">
          {errorMessage}
        </div>
      )}

      {/* CENTERED SUCCESS NOTIFICATION MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 transform transition-all scale-100">
            {/* Green Check Icon */}
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8"
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

            <h3 className="text-xl font-bold text-slate-800 mb-2">
              Submission Successful!
            </h3>
            <p className="text-slate-600 text-sm mb-6">
              The learner's enrollment details have been submitted and saved
              successfully.
            </p>

            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow transition-colors text-sm"
            >
              Close
            </button>
          </div>
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
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
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
                    if (/^\d*$/.test(val)) {
                      setFormData({ ...formData, lrn: val });
                    }
                  }}
                  className="w-full p-2.5 border rounded-lg text-sm"
                  required
                />
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                </div>
              )}
            </div>

            {/* Contact & Address Section */}
            <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Contact Number
                </label>
                <input
                  type="text"
                  value={formData.contact_number}
                  onChange={(e) =>
                    setFormData({ ...formData, contact_number: e.target.value })
                  }
                  className="w-full p-2.5 border rounded-lg text-sm"
                  required
                />
              </div>

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
