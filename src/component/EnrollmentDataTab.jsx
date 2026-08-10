import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

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

export function EnrollmentDataTab() {
  const [students, setStudents] = useState([]);

  // Individual filter states for each demographic card
  const [selectedReligionGrade, setSelectedReligionGrade] = useState("ALL");
  const [selectedTribeGrade, setSelectedTribeGrade] = useState("ALL");
  const [selectedBarangayGrade, setSelectedBarangayGrade] = useState("ALL");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data, error } = await supabase.from("students").select("*");
    if (error) {
      console.error("Error fetching students:", error);
    } else {
      setStudents(data || []);
    }
  };

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

  const readingCategories = [
    "Non-Reader",
    "Frustration",
    "Instructional",
    "Independent",
  ];

  // Enrolment Overall Totals
  const grandTotalEnrolled = students.length;

  // Reading Assessment Totals per Category
  const getCategoryTotal = (cat) => {
    return students.filter(
      (s) =>
        Number(s.grade_level) >= 1 &&
        Number(s.grade_level) <= 6 &&
        (s.reading_level || "Non-Reader") === cat,
    ).length;
  };

  const grandTotalReading = students.filter(
    (s) => Number(s.grade_level) >= 1 && Number(s.grade_level) <= 6,
  ).length;

  return (
    <div className="space-y-8">
      {/* 1. ENROLMENT SUMMARY */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Enrolment Summary
        </h2>

        {/* Constrained width container to prevent max-width stretched table */}
        <div className="max-w-2xl">
          <table className="w-full text-left border-collapse text-sm border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-xs font-bold uppercase border-b border-slate-300">
                <th className="p-3 border-r border-slate-300 w-48 text-center">
                  GRADE LEVEL / GENDER
                </th>
                <th className="p-3 border-r border-slate-300 text-center">
                  4P'S BENEFICIARIES
                </th>
                <th className="p-3 text-center w-28">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {gradeLevels.map((lvl) => {
                const glStudents = students.filter((s) => {
                  if (lvl.key === "SNED") {
                    return String(s.grade_level).toUpperCase() === "SNED";
                  }
                  return Number(s.grade_level) === lvl.key;
                });

                const males = glStudents.filter((s) => s.gender === "Male");
                const females = glStudents.filter((s) => s.gender === "Female");

                const male4psCount = males.filter(
                  (s) => s.is_4ps_beneficiary || s.is_4ps,
                ).length;
                const female4psCount = females.filter(
                  (s) => s.is_4ps_beneficiary || s.is_4ps,
                ).length;

                return (
                  <React.Fragment key={lvl.label}>
                    {/* Grade Level Header Row (Left-Aligned) */}
                    <tr className="bg-slate-100 border-t-2 border-b border-slate-300">
                      <td
                        colSpan="3"
                        className="p-2.5 px-4 font-bold text-slate-800 text-xs uppercase tracking-wider text-left"
                      >
                        {lvl.label}
                      </td>
                    </tr>

                    {/* Male Row */}
                    <tr className="hover:bg-slate-50 transition-colors border-b border-slate-200">
                      <td className="p-3 font-bold text-blue-600 border-r border-slate-200 text-center">
                        MALE
                      </td>
                      <td className="p-3 font-semibold text-slate-700 border-r border-slate-200 text-center">
                        {male4psCount}
                      </td>
                      <td className="p-3 font-bold text-slate-800 text-center">
                        {males.length}
                      </td>
                    </tr>

                    {/* Female Row */}
                    <tr className="hover:bg-slate-50 transition-colors border-b border-slate-200">
                      <td className="p-3 font-bold text-pink-600 border-r border-slate-200 text-center">
                        FEMALE
                      </td>
                      <td className="p-3 font-semibold text-slate-700 border-r border-slate-200 text-center">
                        {female4psCount}
                      </td>
                      <td className="p-3 font-bold text-slate-800 text-center">
                        {females.length}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black border-t-2 border-slate-300 text-slate-900">
                <td
                  colSpan="2"
                  className="p-3 border-r border-slate-300 text-right uppercase tracking-wider"
                >
                  GRAND TOTAL ENROLLED:
                </td>
                <td className="p-3 text-center text-base font-black">
                  {grandTotalEnrolled}
                </td>
              </tr>
            </tfoot>
          </table>
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
          Reading Level Assessment Summary (Grade 1 - Grade 6)
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
              {readingCategories.map((cat) => {
                const catTotal = getCategoryTotal(cat);

                return (
                  <tr
                    key={cat}
                    className="hover:bg-slate-50 transition-colors border-b border-slate-200"
                  >
                    <td className="p-3 font-bold text-slate-700 border-r border-slate-200">
                      {cat}
                    </td>
                    {readingGrades.map((g) => {
                      const count = students.filter(
                        (s) =>
                          Number(s.grade_level) === g.key &&
                          (s.reading_level || "Non-Reader") === cat,
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
                    (s) => Number(s.grade_level) === g.key,
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
