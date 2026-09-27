import React from "react";
import { learnerDisplayName } from "../lib/learnerRoster";

const number = (value, digits) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const date = (value, long = false) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "—";
  if (long) return parsed.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" });
  // Matches the "mm/dd/yyyy" column header.
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(parsed.getMonth() + 1)}/${pad(parsed.getDate())}/${parsed.getFullYear()}`;
};

// Width of a name in em (Arial), so print CSS can shrink long names to one line.
let measureContext = null;
const textEm = (text) => {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return 0;
  measureContext.font = "100px Arial, Helvetica, sans-serif";
  return measureContext.measureText(text).width / 100;
};

export default function NutritionPrintTable({ rows, weighingDate, gradeClass }) {
  const ordered = [...rows].sort((a, b) =>
    (a.report.sex === "M" ? 0 : 1) - (b.report.sex === "M" ? 0 : 1) ||
    learnerDisplayName(a.student).localeCompare(learnerDisplayName(b.student)));
  return <div className="nsr-reference-print">
    <div className="nsr-reference-meta"><strong>Date of Weighing: {date(weighingDate, true)}</strong><strong>{gradeClass}</strong></div>
    <table className="nsr-reference-table">
      <colgroup>{[25, 10, 6, 7, 3.5, 7, 3, 3, 6, 14, 15.5].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
      <thead>
        <tr>
          <th rowSpan={2}>Names</th><th rowSpan={2}>Birthday<br />mm/dd/yyyy</th>
          <th rowSpan={2}>Weight<br />(kg)</th><th rowSpan={2}>Height<br />(meters)</th>
          <th rowSpan={2}>Sex</th><th rowSpan={2}>Height²<br />(m²)</th>
          <th colSpan={2}>Age</th><th rowSpan={2}>Body<br />Mass<br />Index</th>
          <th rowSpan={2}>Nutritional Status</th><th rowSpan={2}>Height-For-Age</th>
        </tr><tr><th>y</th><th>m</th></tr>
      </thead>
      <tbody>{ordered.map(({ student, report }, index) => {
        const [years, months] = String(report.ageYearMonth).split('.');
        const name = `${index + 1}. ${learnerDisplayName(student)}`;
        return <tr key={student.id}>
          <td className="nsr-reference-name"><div><span style={{ "--name-em": textEm(name) || undefined }}>{name}</span></div></td>
          <td>{date(student.birthdate)}</td><td>{report.weightKg ?? "—"}</td>
          <td>{number(report.heightMeters, 3)}</td><td>{report.sex}</td>
          <td>{number(report.heightSquaredMeters, 4)}</td><td>{years}</td><td>{months ?? "—"}</td>
          <td>{number(report.bmi, 2)}</td><td>{report.bmiStatus}</td><td>{report.hfaStatus}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
