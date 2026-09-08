import React, { useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { supabase } from "../lib/supabase";
import { orgAdviserName, profileName } from "../lib/orgAdvisers";
import { loadAdvisoryRoster } from "../lib/advisoryRosterData";
import {
  learnerDisplayName,
  learnerNutritionForPeriod,
  learnerNutritionReport,
} from "../lib/learnerRoster";
import { BAZ_META, getCurrentSchoolYear, HAZ_META } from "../lib/growth/bmi";
import educationSeal from "../image/deped-education-seal.png";
import "../styles/NutritionalStatus.css";

const SCHOOL_NAME = "Isabela East Central Elementary School";
const SCHOOL_ADDRESS = "Isabela City, Basilan";

const HFA_ROW_LABELS = {
  "Severely Stunted": "Sev. Stunted",
  Stunted: "Stunted",
  Normal: "Normal",
  Tall: "Tall",
};

const filenameSlug = (value) =>
  String(value || "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const titleCase = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

const formatDateMMDDYYYY = (value) => {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
};

const formatNumber = (value, digits) =>
  typeof value === "number" && !Number.isNaN(value) ? value.toFixed(digits) : "—";

const REPORT_COLUMNS = [
  "No.",
  "Names",
  "Birthday\nmm/dd/yyyy",
  "Weight\n(kg)",
  "Height\n(meters)",
  "Sex",
  "Height²\n(m²)",
  "Age\n(year) (month)",
  "Body Mass\nIndex",
  "Nutritional\nStatus",
  "Height-for-Age",
];

const downloadReportExcel = (rows, meta, bazSexTally, hazSexTally, preparedByName) => {
  const colCount = REPORT_COLUMNS.length;
  const headerCells = REPORT_COLUMNS.map(
    (label) => `<th>${label.replace(/\n/g, "<br/>")}</th>`,
  ).join("");
  const bodyRows = rows
    .map(
      ({ student, report }, index) => `<tr>
        <td>${index + 1}</td>
        <td style="text-align:left">${learnerDisplayName(student)}</td>
        <td>${formatDateMMDDYYYY(student.birthdate)}</td>
        <td>${report.weightKg ?? "—"}</td>
        <td>${formatNumber(report.heightMeters, 2)}</td>
        <td>${report.sex}</td>
        <td>${formatNumber(report.heightSquaredMeters, 4)}</td>
        <td>${report.ageYearMonth}</td>
        <td>${formatNumber(report.bmi, 1)}</td>
        <td>${report.bmiStatus}</td>
        <td>${report.hfaStatus}</td>
      </tr>`,
    )
    .join("");

  const tallyCells = (label, m, f, total) =>
    `<td style="text-align:left">${label}</td><td>${m}</td><td>${f}</td><td>${total}</td>`;
  const bazTallyLines = [
    ["No. of Cases", bazSexTally.totalM, bazSexTally.totalF, bazSexTally.total],
    ...BAZ_ORDER.map((label) => [
      label,
      bazSexTally.counts[label].M,
      bazSexTally.counts[label].F,
      bazSexTally.counts[label].M + bazSexTally.counts[label].F,
    ]),
  ];
  const hazTallyLines = [
    ["No. of Cases", hazSexTally.totalM, hazSexTally.totalF, hazSexTally.total],
    ...HAZ_ORDER.map((label) => [
      HFA_ROW_LABELS[label] || label,
      hazSexTally.counts[label].M,
      hazSexTally.counts[label].F,
      hazSexTally.counts[label].M + hazSexTally.counts[label].F,
    ]),
  ];
  const tallyRowsHtml = bazTallyLines
    .map((bazLine, index) => {
      const hazLine = hazTallyLines[index];
      return `<tr>${tallyCells(...bazLine)}<td style="border:0"></td>${hazLine ? tallyCells(...hazLine) : ""}</tr>`;
    })
    .join("");

  const html = `<html><head><meta charset="UTF-8"></head><body>
    <table border="1">
      <tr><td colspan="${colCount}" style="text-align:center;font-weight:bold;font-size:14pt">NUTRITIONAL STATUS REPORT</td></tr>
      <tr><td colspan="${colCount}" style="text-align:center;font-weight:bold">${SCHOOL_NAME}</td></tr>
      <tr><td colspan="${colCount}" style="text-align:center">${SCHOOL_ADDRESS}</td></tr>
      <tr><td colspan="${colCount}" style="text-align:center">${meta.schoolYearLabel}</td></tr>
      <tr><td colspan="${Math.ceil(colCount / 2)}">Date of Weighing: ${meta.dateOfWeighing}</td><td colspan="${Math.floor(colCount / 2)}">Grade/Class: ${meta.gradeClassLabel}</td></tr>
      <tr>${headerCells}</tr>
      ${bodyRows}
    </table>
    <br/>
    <table border="1">
      <tr><th>Body Mass Index</th><th>M</th><th>F</th><th>T</th><td style="border:0"></td><th>HFA</th><th>M</th><th>F</th><th>TOTAL</th></tr>
      ${tallyRowsHtml}
    </table>
    <br/>
    <table>
      <tr><td>Body Mass Index = Weight (kgs) / Height squared (m²)</td></tr>
    </table>
    <br/><br/>
    <table>
      <tr><td>Prepared by:</td></tr>
      <tr><td>&nbsp;</td></tr>
      <tr><td style="font-weight:bold;text-align:center">${preparedByName}</td></tr>
      <tr><td style="text-align:center">Class Adviser</td></tr>
    </table>
  </body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `IECES_NS_Report_${meta.periodLabel}_${filenameSlug(meta.gradeClassLabel)}_SY${meta.schoolYear}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const PERIOD_OPTIONS = [
  { value: "baseline", label: "Baseline" },
  { value: "endline", label: "Endline" },
];

const BAZ_ORDER = ["Severely Wasted", "Wasted", "Normal", "Overweight", "Obese"];
const HAZ_ORDER = ["Severely Stunted", "Stunted", "Normal", "Tall"];
const UNKNOWN_META = { color: "#6b7280", bg: "#f1f5f9" };

const tallyStatuses = (statuses, order) => {
  const counts = Object.fromEntries(order.map((label) => [label, 0]));
  let unknown = 0;
  statuses.forEach((status) => {
    if (status && status !== "—" && status in counts) {
      counts[status] += 1;
    } else {
      unknown += 1;
    }
  });
  return { counts, unknown };
};

// Male/Female/Total breakdown used by the report's "No. of Cases" tally
// tables (one for BMI-for-Age, one for Height-for-Age), matching the DepEd
// Nutritional Status Report format.
const buildSexTally = (rows, order, statusKey) => {
  const counts = Object.fromEntries(order.map((label) => [label, { M: 0, F: 0 }]));
  let totalM = 0;
  let totalF = 0;
  rows.forEach(({ report }) => {
    const status = report[statusKey];
    if (!status || status === "—" || !(status in counts)) return;
    const sexKey = report.sex === "F" ? "F" : "M";
    counts[status][sexKey] += 1;
    if (sexKey === "F") totalF += 1;
    else totalM += 1;
  });
  return { counts, totalM, totalF, total: totalM + totalF };
};

const StatusTile = ({ label, count, total, meta }) => {
  const percent = total ? Math.round((count / total) * 100) : 0;
  return (
    <div
      className="p-2 rounded-lg border-t-4 shadow-sm"
      style={{ background: meta.bg, borderTopColor: meta.color }}
    >
      <span
        className="block min-h-5 text-[9px] leading-tight font-bold"
        style={{ color: meta.color }}
      >
        {label}
      </span>
      <strong className="text-base" style={{ color: meta.color }}>
        {count}
      </strong>
      <small className="block text-[9px] font-semibold" style={{ color: meta.color }}>
        {total ? `${percent}%` : "—"}
      </small>
    </div>
  );
};

export function NutritionalStatus({ profile }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [orgAdviser, setOrgAdviser] = useState(null);
  const [period, setPeriod] = useState("baseline");
  const loadedProfileKeyRef = useRef("");

  const fetchStudents = async (showLoader = false) => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    if (showLoader) setLoading(true);
    const result = await loadAdvisoryRoster(profile);
    setOrgAdviser(result.orgAdviser);
    setStudents(result.students);
    setMessage(
      result.error ? `Unable to load learners: ${result.error.message}` : "",
    );
    setLoading(false);
  };

  useEffect(() => {
    const profileKey = [
      profile?.id,
      profile?.first_name,
      profile?.family_name,
      profile?.role,
      profile?.grade_level_assigned,
      profile?.test_access_scope,
    ].join(":");
    const showInitialLoader = loadedProfileKeyRef.current !== profileKey;
    loadedProfileKeyRef.current = profileKey;
    fetchStudents(showInitialLoader);

    const channel = supabase
      .channel("nutritional_status_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students" },
        () => fetchStudents(false),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    profile?.id,
    profile?.first_name,
    profile?.family_name,
    profile?.role,
    profile?.grade_level_assigned,
    profile?.test_access_scope,
  ]);

  const nutritionByStudent = students.map((student) =>
    learnerNutritionForPeriod(student, period),
  );
  const bazTally = tallyStatuses(
    nutritionByStudent.map((entry) => entry.bmi),
    BAZ_ORDER,
  );
  const hazTally = tallyStatuses(
    nutritionByStudent.map((entry) => entry.hfa),
    HAZ_ORDER,
  );
  const measured = nutritionByStudent.filter(
    (entry) => entry.bmi !== "—" || entry.hfa !== "—",
  ).length;

  const reportRows = [...students]
    .sort((left, right) =>
      learnerDisplayName(left).localeCompare(learnerDisplayName(right)),
    )
    .map((student) => ({
      student,
      report: learnerNutritionReport(student, period),
    }));

  const latestWeighingDate = reportRows
    .map(({ report }) => report.measurementDate)
    .filter(Boolean)
    .sort()
    .at(-1);

  const gradeClassLabel = titleCase(
    students[0]?.section ||
      (profile?.test_access_scope === "grade"
        ? String(profile.grade_level_assigned) === "0"
          ? "All Kinder Classes"
          : `All Grade ${profile.grade_level_assigned} Classes`
        : orgAdviser
          ? orgAdviserName(orgAdviser)
          : "—"),
  );

  const periodLabel =
    PERIOD_OPTIONS.find((option) => option.value === period)?.label || "Baseline";
  const schoolYear = getCurrentSchoolYear().replace(/[–—]/g, "-");

  const reportMeta = {
    dateOfWeighing: formatDateMMDDYYYY(latestWeighingDate),
    schoolYearLabel: `${periodLabel} SY ${schoolYear}`,
    gradeClassLabel,
    periodLabel,
    schoolYear,
  };

  const bazSexTally = buildSexTally(reportRows, BAZ_ORDER, "bmiStatus");
  const hazSexTally = buildSexTally(reportRows, HAZ_ORDER, "hfaStatus");
  const preparedByName = (
    orgAdviser ? orgAdviserName(orgAdviser) : profileName(profile)
  ).toUpperCase();

  return (
    <div>
      <div className="dash-card-header">
        <h2>
          Nutritional Status —{" "}
          {profile?.test_access_scope === "grade"
            ? `${String(profile.grade_level_assigned) === "0" ? "All Kinder Classes" : `All Grade ${profile.grade_level_assigned} Classes`}`
            : orgAdviser
              ? orgAdviserName(orgAdviser)
              : "Not linked in Org Chart"}
        </h2>
        <p>
          Total: {students.length} Learners &nbsp;|&nbsp; Measured:{" "}
          {measured} &nbsp;|&nbsp; No record: {students.length - measured}
        </p>
      </div>

      {students.length > 0 && (
        <div className="nsr-toolbar">
          <label className="nsr-period-select">
            <span>Period</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="nsr-btn-outline"
            onClick={() =>
              downloadReportExcel(
                reportRows,
                reportMeta,
                bazSexTally,
                hazSexTally,
                preparedByName,
              )
            }
          >
            <Download size={16} /> Download Excel
          </button>
          <button type="button" onClick={() => window.print()}>
            <Printer size={16} /> Print Report
          </button>
        </div>
      )}

      {message && (
        <div
          style={{
            background: "#e8f5e9",
            border: "1px solid #a5d6a7",
            color: "#2e7d32",
            padding: "8px 14px",
            borderRadius: "6px",
            marginBottom: "12px",
            fontSize: "0.85rem",
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
          Loading learners…
        </div>
      ) : students.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
          No learners found for this advisory class.
        </div>
      ) : (
        <>
          <div className="nsr-summary">
            <div className="p-3 rounded-xl bg-white shadow-[0_2px_14px_rgba(123,26,26,0.07)] border border-[#eee5e1] mb-3">
              <div className="mb-2">
                <h3 className="font-bold text-sm text-[#491919]">
                  BMI-for-Age (Weight Status)
                </h3>
                <p className="mt-0.5 text-[11px] text-[#7a6060]">
                  Severely Wasted, Wasted, Normal, Overweight, and Obese counts
                  across the advisory class.
                </p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-w-xl">
                {BAZ_ORDER.map((label) => (
                  <StatusTile
                    key={label}
                    label={label}
                    count={bazTally.counts[label]}
                    total={students.length}
                    meta={BAZ_META[label]}
                  />
                ))}
                <StatusTile
                  label="No Record"
                  count={bazTally.unknown}
                  total={students.length}
                  meta={UNKNOWN_META}
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white shadow-[0_2px_14px_rgba(123,26,26,0.07)] border border-[#eee5e1] mb-3">
              <div className="mb-2">
                <h3 className="font-bold text-sm text-[#491919]">
                  Height-for-Age (Stunting Status)
                </h3>
                <p className="mt-0.5 text-[11px] text-[#7a6060]">
                  Severely Stunted, Stunted, Normal, and Tall counts across the
                  advisory class.
                </p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-w-xl">
                {HAZ_ORDER.map((label) => (
                  <StatusTile
                    key={label}
                    label={label}
                    count={hazTally.counts[label]}
                    total={students.length}
                    meta={HAZ_META[label]}
                  />
                ))}
                <StatusTile
                  label="No Record"
                  count={hazTally.unknown}
                  total={students.length}
                  meta={UNKNOWN_META}
                />
              </div>
            </div>
          </div>

          <div className="nsr-report">
            <div className="nsr-report-header">
              <img src={educationSeal} alt="Department of Education seal" className="nsr-seal" />
              <h2>NUTRITIONAL STATUS REPORT</h2>
              <h3>{SCHOOL_NAME}</h3>
              <p>{SCHOOL_ADDRESS}</p>
              <p>{reportMeta.schoolYearLabel}</p>
            </div>
            <div className="nsr-report-meta">
              <span>
                <strong>Date of Weighing:</strong> {reportMeta.dateOfWeighing}
              </span>
              <span>
                <strong>Grade/Class:</strong> {reportMeta.gradeClassLabel}
              </span>
            </div>
            <div className="nsr-report-table-wrap">
              <table className="nsr-report-table">
                <thead>
                  <tr>
                    {REPORT_COLUMNS.map((label) => (
                      <th key={label}>
                        {label.split("\n").map((line, index) => (
                          <React.Fragment key={line}>
                            {index > 0 && <br />}
                            {line}
                          </React.Fragment>
                        ))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map(({ student, report }, index) => (
                    <tr key={student.id}>
                      <td className="nsr-no">{index + 1}</td>
                      <td className="nsr-name">
                        {learnerDisplayName(student)}
                      </td>
                      <td>{formatDateMMDDYYYY(student.birthdate)}</td>
                      <td>{report.weightKg ?? "—"}</td>
                      <td>{formatNumber(report.heightMeters, 2)}</td>
                      <td>{report.sex}</td>
                      <td>{formatNumber(report.heightSquaredMeters, 4)}</td>
                      <td>{report.ageYearMonth}</td>
                      <td>{formatNumber(report.bmi, 1)}</td>
                      <td>{report.bmiStatus}</td>
                      <td>{report.hfaStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="nsr-tally-section">
              <table className="nsr-tally-table">
                <thead>
                  <tr>
                    <th>Body Mass Index</th>
                    <th>M</th>
                    <th>F</th>
                    <th>T</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="nsr-tally-label">No. of Cases</td>
                    <td>{bazSexTally.totalM}</td>
                    <td>{bazSexTally.totalF}</td>
                    <td>{bazSexTally.total}</td>
                  </tr>
                  {BAZ_ORDER.map((label) => (
                    <tr key={label}>
                      <td className="nsr-tally-label">{label}</td>
                      <td>{bazSexTally.counts[label].M}</td>
                      <td>{bazSexTally.counts[label].F}</td>
                      <td>{bazSexTally.counts[label].M + bazSexTally.counts[label].F}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="nsr-bmi-formula">
                <strong>Body Mass Index =</strong>
                <div className="nsr-bmi-fraction">
                  <span>Weight (kgs)</span>
                  <span>Height squared (m²)</span>
                </div>
              </div>

              <table className="nsr-tally-table">
                <thead>
                  <tr>
                    <th>HFA</th>
                    <th>M</th>
                    <th>F</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="nsr-tally-label">No. of Cases</td>
                    <td>{hazSexTally.totalM}</td>
                    <td>{hazSexTally.totalF}</td>
                    <td>{hazSexTally.total}</td>
                  </tr>
                  {HAZ_ORDER.map((label) => (
                    <tr key={label}>
                      <td className="nsr-tally-label">{HFA_ROW_LABELS[label] || label}</td>
                      <td>{hazSexTally.counts[label].M}</td>
                      <td>{hazSexTally.counts[label].F}</td>
                      <td>{hazSexTally.counts[label].M + hazSexTally.counts[label].F}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="nsr-signature">
              <span className="nsr-signature-label">Prepared by:</span>
              <div className="nsr-signature-line" />
              <strong className="nsr-signature-name">{preparedByName || "—"}</strong>
              <span className="nsr-signature-title">Class Adviser</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
