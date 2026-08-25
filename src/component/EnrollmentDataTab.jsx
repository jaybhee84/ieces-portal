import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  adviserGradeKey,
  isOrgAdviser,
  learnerBelongsToOrgAdviser,
  legacyProfileIdsForOrgAdviser,
  orgAdviserName,
} from "../lib/orgAdvisers";
import { PHILIRI_READING_CATEGORIES } from "../lib/readingOptions";

const IECES_SCHOOL_ID = "126001";
const PAGE_SIZE = 1000;

// Predefined lists matching the Enrollment Form options
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

const normalizedGender = (student) =>
  String(student.gender || student.sex || "").trim().toUpperCase();

const summarize = (studentList) => ({
  total: studentList.length,
  male: studentList.filter((student) =>
    ["M", "MALE", "BOY"].includes(normalizedGender(student)),
  ).length,
  female: studentList.filter((student) =>
    ["F", "FEMALE", "GIRL"].includes(normalizedGender(student)),
  ).length,
  beneficiaries: studentList.filter(
    (student) => student.is_4ps_beneficiary || student.is_4ps,
  ).length,
});

const enrollmentTimestamp = (student) =>
  student.created_at ||
  student.enrolled_at ||
  student.enrollment_date ||
  student.date_enrolled;

const manilaDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type)?.value;
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
};

export function EnrollmentDataTab() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [orgAdvisers, setOrgAdvisers] = useState([]);
  const [portalProfiles, setPortalProfiles] = useState([]);
  const [legacyProfiles, setLegacyProfiles] = useState([]);

  // Individual filter states for each demographic card
  const [selectedReligionGrade, setSelectedReligionGrade] = useState("ALL");
  const [selectedTribeGrade, setSelectedTribeGrade] = useState("ALL");
  const [selectedBarangayGrade, setSelectedBarangayGrade] = useState("ALL");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("school_id", IECES_SCHOOL_ID)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Error fetching students:", error);
        setLoadError(error.message);
        setLoading(false);
        return;
      }

      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
    }

    const [orgResult, profileResult, legacyProfileResult] = await Promise.all([
      supabase.from("org_chart").select("*"),
      supabase.from("portal_profile").select("*"),
      supabase.from("profiles").select("*"),
    ]);

    if (orgResult.error) {
      setLoadError(`Unable to load advisers from the Org Chart: ${orgResult.error.message}`);
    }

    setStudents(rows);
    setOrgAdvisers((orgResult.data || []).filter(isOrgAdviser));
    setPortalProfiles(profileResult.data || []);
    setLegacyProfiles(legacyProfileResult.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("portal:enrollment-summary")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students" },
        fetchData,
      )
      .subscribe();

    const orgChannel = supabase
      .channel("portal:enrollment-org-advisers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "org_chart" },
        fetchData,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(orgChannel);
    };
  }, [fetchData]);

  const extractBarangay = (address) => {
    if (!address) return "";
    const match = address.match(/Brgy\.\s*([^,]+)/i);
    return match ? match[1].trim() : address;
  };

  // Calculates aggregated total counts and filters out any entries with 0 counts
  const getActiveCountsOnly = (predefinedList, keyFn, targetGrade) => {
    const counts = {};

    const filteredStudents = students.filter((s) => {
      if (targetGrade === "ALL") return true;
      if (targetGrade === "SNED") {
        return String(s.grade_level).toUpperCase() === "SNED";
      }
      return Number(s.grade_level) === Number(targetGrade);
    });

    filteredStudents.forEach((s) => {
      const val = keyFn(s);
      if (val) {
        const match = predefinedList.find(
          (opt) => opt.toLowerCase() === val.toLowerCase(),
        );
        const key = match || val;
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    return counts;
  };

  const religionCounts = getActiveCountsOnly(
    RELIGIONS_WESTERN_MINDANAO,
    (s) => s.religion?.trim(),
    selectedReligionGrade,
  );
  const tribeCounts = getActiveCountsOnly(
    TRIBES_WESTERN_MINDANAO,
    (s) => s.tribe?.trim(),
    selectedTribeGrade,
  );
  const barangayCounts = getActiveCountsOnly(
    ISABELA_CITY_BARANGAYS,
    (s) => extractBarangay(s.address),
    selectedBarangayGrade,
  );

  const gradeLevels = [
    { key: 0, label: "KINDER" },
    { key: 1, label: "GRADE 1" },
    { key: 2, label: "GRADE 2" },
    { key: 3, label: "GRADE 3" },
    { key: 4, label: "GRADE 4" },
    { key: 5, label: "GRADE 5" },
    { key: 6, label: "GRADE 6" },
    { key: "SNED", label: "SNED" },
  ];

  const readingGrades = [
    { key: 1, label: "Grade 1" },
    { key: 2, label: "Grade 2" },
    { key: 3, label: "Grade 3" },
    { key: 4, label: "Grade 4" },
    { key: 5, label: "Grade 5" },
    { key: 6, label: "Grade 6" },
  ];

  const overallSummary = useMemo(() => summarize(students), [students]);
  const today = manilaDateKey(new Date());
  const enrolledToday = students.filter(
    (student) => manilaDateKey(enrollmentTimestamp(student)) === today,
  ).length;
  const gradeSummaries = gradeLevels.map((level) => {
    const matchingStudents = students.filter((student) => {
      if (level.key === "SNED") {
        return String(student.grade_level).toUpperCase() === "SNED";
      }
      return Number(student.grade_level) === level.key;
    });
    return { ...level, ...summarize(matchingStudents) };
  });
  const advisoryRows = useMemo(
    () =>
      orgAdvisers
        .map((adviser) => {
          const assignmentIds = new Set([
            ...legacyProfileIdsForOrgAdviser(adviser, portalProfiles),
            ...legacyProfileIdsForOrgAdviser(adviser, legacyProfiles),
          ]);
          const assignedStudents = students.filter((student) =>
            learnerBelongsToOrgAdviser(
              student,
              adviser,
              [...assignmentIds],
            ),
          );
          return { adviser, ...summarize(assignedStudents) };
        })
        .sort(
          (left, right) =>
            adviserGradeKey(left.adviser.grade_level).localeCompare(
              adviserGradeKey(right.adviser.grade_level),
              undefined,
              { numeric: true },
            ) || orgAdviserName(left.adviser).localeCompare(orgAdviserName(right.adviser)),
        ),
    [legacyProfiles, orgAdvisers, portalProfiles, students],
  );
  const advisoryGradeGroups = gradeLevels.map((grade) => ({
    ...grade,
    rows: advisoryRows.filter(
      (row) => adviserGradeKey(row.adviser.grade_level) === String(grade.key),
    ),
  }));

  // Reading Assessment Totals per Category
  const getCategoryTotal = (cat) => {
    return students.filter(
      (s) =>
        Number(s.grade_level) >= 1 &&
        Number(s.grade_level) <= 6 &&
        s.reading_category === cat,
    ).length;
  };

  const grandTotalReading = students.filter(
    (s) =>
      Number(s.grade_level) >= 1 &&
      Number(s.grade_level) <= 6 &&
      PHILIRI_READING_CATEGORIES.some(
        (category) => category.value === s.reading_category,
      ),
  ).length;

  return (
    <div className="space-y-8">
      {/* 1. ENROLLMENT SUMMARY */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold text-[#7b1a1a]">
              Learner Enrollment
            </h2>
            <p className="mt-1 text-xs text-[#7a6060]">
              Live school-wide totals for School ID {IECES_SCHOOL_ID}.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="self-start px-4 py-2 rounded-lg border border-[#7b1a1a] bg-white text-[#7b1a1a] text-xs font-extrabold hover:bg-[#fff7ec] disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loadError && (
          <div className="mb-5 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
            Unable to load enrollment data: {loadError}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            ["Total Learners", overallSummary.total],
            ["Enrolled Today", enrolledToday],
            ["Male", overallSummary.male],
            ["Female", overallSummary.female],
          ].map(([label, value]) => (
            <div
              key={label}
              className="p-4 rounded-xl bg-white border-t-[3px] border-[#7b1a1a] shadow-[0_2px_12px_rgba(123,26,26,0.07)]"
            >
              <span className="block min-h-7 text-[11px] font-bold text-[#806868]">
                {label}
              </span>
              <strong className="text-2xl text-[#7b1a1a]">{value}</strong>
            </div>
          ))}
        </div>

        <div className="p-5 rounded-xl bg-white shadow-[0_2px_14px_rgba(123,26,26,0.07)] border border-[#eee5e1]">
          <div className="mb-4">
            <h3 className="font-bold text-[#491919]">Enrollment by Grade Level</h3>
            <p className="mt-1 text-xs text-[#7a6060]">
              Live totals from Kinder through Grade 6 and SNED.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {gradeSummaries.map((row) => (
              <div
                key={row.key}
                className="p-3.5 rounded-lg border border-[#e6d9d4] bg-[#fcfaf9]"
              >
                <span className="block text-[11px] font-bold text-[#806868]">
                  {row.label}
                </span>
                <strong className="block my-1 text-2xl text-[#7b1a1a]">
                  {row.total}
                </strong>
                <small className="block text-[11px] font-semibold text-[#806868]">
                  {row.male} Male · {row.female} Female
                </small>
                <small className="block mt-1 text-[10px] font-bold text-[#9a6a19]">
                  {row.beneficiaries} 4Ps beneficiaries
                </small>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 p-5 rounded-xl bg-white border-2 border-[#e2c36b] shadow-[0_2px_14px_rgba(123,26,26,0.07)]">
          <div className="mb-4">
            <h3 className="font-bold text-[#491919]">Advisory Classes</h3>
            <p className="mt-1 text-xs text-[#7a6060]">
              Adviser names and grade assignments come directly from the organizational chart.
            </p>
          </div>
          {advisoryRows.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed border-[#d9c9c3] text-center text-sm text-[#7a6060]">
              No advisers are currently assigned in the Org Chart.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
              {advisoryGradeGroups.map((group) => (
                <section
                  key={group.key}
                  className="overflow-hidden rounded-xl border border-[#e3d4ce] bg-white"
                >
                  <header className="min-h-[58px] px-3 py-2.5 bg-[#7b1a1a] text-white flex flex-col justify-center">
                    <h4 className="m-0 text-xs font-extrabold uppercase tracking-wide">
                      {group.label}
                    </h4>
                    <span className="mt-0.5 text-[10px] font-semibold text-white/75">
                      {group.rows.reduce((total, row) => total + row.total, 0)} learners · {group.rows.length} adviser{group.rows.length === 1 ? "" : "s"}
                    </span>
                  </header>
                  <div className="divide-y divide-[#eee5e1]">
                    {group.rows.length === 0 ? (
                      <div className="p-4 text-xs italic text-[#9a8585]">
                        No adviser assigned
                      </div>
                    ) : (
                      group.rows.map((row) => (
                        <div
                          key={row.adviser.id}
                          className="p-3 bg-[#fcfaf9] hover:bg-[#fff7ec]"
                        >
                          <strong className="block text-xs leading-snug text-[#491919]">
                            {orgAdviserName(row.adviser)}
                          </strong>
                          <span className="block mt-1 text-[10px] text-[#806868]">
                            {row.total} learners · {row.male} Male · {row.female} Female
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* DEMOGRAPHIC CATEGORIES CARDS WITH GRADE FILTER DROPDOWNS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 items-start">
          {/* Religion Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
              <h3 className="font-bold text-slate-800 text-sm uppercase">
                Religion
              </h3>
              <select
                value={selectedReligionGrade}
                onChange={(e) => setSelectedReligionGrade(e.target.value)}
                className="text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer uppercase"
              >
                <option value="ALL">All Levels</option>
                {gradeLevels.map((gl) => (
                  <option key={gl.key} value={gl.key}>
                    {gl.label}
                  </option>
                ))}
              </select>
            </div>
            {Object.keys(religionCounts).length === 0 ? (
              <p className="text-xs text-slate-400 italic">No data recorded</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-slate-700">
                {Object.entries(religionCounts).map(([rel, count]) => (
                  <li
                    key={rel}
                    className="flex justify-between items-center border-b border-slate-100 pb-1"
                  >
                    <span className="font-medium text-xs">{rel}</span>
                    <span className="font-bold px-2 py-0.5 rounded border text-xs text-blue-700 bg-blue-50 border-blue-200">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tribe Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
              <h3 className="font-bold text-slate-800 text-sm uppercase">
                Tribe
              </h3>
              <select
                value={selectedTribeGrade}
                onChange={(e) => setSelectedTribeGrade(e.target.value)}
                className="text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer uppercase"
              >
                <option value="ALL">All Levels</option>
                {gradeLevels.map((gl) => (
                  <option key={gl.key} value={gl.key}>
                    {gl.label}
                  </option>
                ))}
              </select>
            </div>
            {Object.keys(tribeCounts).length === 0 ? (
              <p className="text-xs text-slate-400 italic">No data recorded</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-slate-700">
                {Object.entries(tribeCounts).map(([tr, count]) => (
                  <li
                    key={tr}
                    className="flex justify-between items-center border-b border-slate-100 pb-1"
                  >
                    <span className="font-medium text-xs">{tr}</span>
                    <span className="font-bold px-2 py-0.5 rounded border text-xs text-blue-700 bg-blue-50 border-blue-200">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Barangay Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
              <h3 className="font-bold text-slate-800 text-sm uppercase">
                Barangay
              </h3>
              <select
                value={selectedBarangayGrade}
                onChange={(e) => setSelectedBarangayGrade(e.target.value)}
                className="text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer uppercase"
              >
                <option value="ALL">All Levels</option>
                {gradeLevels.map((gl) => (
                  <option key={gl.key} value={gl.key}>
                    {gl.label}
                  </option>
                ))}
              </select>
            </div>
            {Object.keys(barangayCounts).length === 0 ? (
              <p className="text-xs text-slate-400 italic">No data recorded</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-slate-700">
                {Object.entries(barangayCounts).map(([brgy, count]) => (
                  <li
                    key={brgy}
                    className="flex justify-between items-center border-b border-slate-100 pb-1"
                  >
                    <span className="font-medium text-xs">{brgy}</span>
                    <span className="font-bold px-2 py-0.5 rounded border text-xs text-blue-700 bg-blue-50 border-blue-200">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 2. READING LEVEL ASSESSMENT SUMMARY (GRADE 1 TO 6) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Phil-IRI Reading Assessment Summary (Grade 1 - Grade 6)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-xs font-bold uppercase border-b border-slate-300">
                <th className="p-3 border-r border-slate-300">
                  READING CATEGORY
                </th>
                {readingGrades.map((g) => (
                  <th
                    key={g.key}
                    className="p-3 border-r border-slate-300 text-center"
                  >
                    {g.label.toUpperCase()}
                  </th>
                ))}
                <th className="p-3 text-center">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {PHILIRI_READING_CATEGORIES.map((category) => {
                const catTotal = getCategoryTotal(category.value);

                return (
                  <tr
                    key={category.value}
                    className="hover:bg-slate-50 transition-colors border-b border-slate-200"
                  >
                    <td className="p-3 font-bold text-slate-700 border-r border-slate-200">
                      {category.label}
                    </td>
                    {readingGrades.map((g) => {
                      const count = students.filter(
                        (s) =>
                          Number(s.grade_level) === g.key &&
                          s.reading_category === category.value,
                      ).length;

                      return (
                        <td
                          key={g.key}
                          className="p-3 text-center text-slate-700 border-r border-slate-200"
                        >
                          {count}
                        </td>
                      );
                    })}
                    <td className="p-3 font-extrabold text-slate-800 text-center">
                      {catTotal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black border-t-2 border-slate-300 text-slate-900">
                <td className="p-3 border-r border-slate-300 uppercase tracking-wider">
                  GRAND TOTAL
                </td>
                {readingGrades.map((g) => {
                  const gradeTotal = students.filter(
                    (s) =>
                      Number(s.grade_level) === g.key &&
                      PHILIRI_READING_CATEGORIES.some(
                        (category) => category.value === s.reading_category,
                      ),
                  ).length;
                  return (
                    <td
                      key={g.key}
                      className="p-3 text-center font-bold text-slate-900 border-r border-slate-300"
                    >
                      {gradeTotal}
                    </td>
                  );
                })}
                <td className="p-3 text-center text-base font-black">
                  {grandTotalReading}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
