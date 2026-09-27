import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { createNutritionReportExcel, excelDate, nutritionReportFilename } from "../src/lib/nutritionReportExcel.mjs";

// Layout: seal row 1, titles 2-5, meta 7, table header 8-9, learners from row 10,
// one empty row, tallies, formula, then the "Prepared by" block.
const meta = { gradeClassLabel: "Grade 4 - Test", weighingDate: "2026-06-09", periodLabel: "Baseline", schoolYear: "2026-2027", schoolYearLabel: "Baseline SY 2026-2027" };
const learner = (name, sex, bmiStatus = "Normal", hfaStatus = "Normal") => ({ name, birthdate: "2016-02-29", report: { weightKg: 30.5, heightMeters: 1.43, heightSquaredMeters: 2.0449, bmi: 14.9, ageYearMonth: "10.10", sex, bmiStatus, hfaStatus } });
const read = (bytes) => Object.fromEntries(Object.entries(unzipSync(bytes)).filter(([name]) => /\.(xml|rels)$/.test(name)).map(([name, value]) => [name, strFromU8(value)]));
const value = (sheet, address) => new RegExp(`<c r="${address}"[^>]*>(.*?)</c>`).exec(sheet)?.[1];
const row = (sheet, number) => new RegExp(`<row r="${number}"[^>]*>(.*?)</row>`).exec(sheet)?.[1];
const rows = [learner("ALPHA, Girl", "F", "Wasted"), learner("ZETA, Boy", "M"), learner("=A&B <Test>", "M", "Obese", "Tall")];
const bytes = createNutritionReportExcel(rows, meta, "TEST ADVISER");
const files = read(bytes);
const sheet = files["xl/worksheets/sheet1.xml"];
assert.equal(String.fromCharCode(...bytes.slice(0, 2)), "PK");
assert.match(sheet, /dimension ref="A1:K27"/);
assert.match(value(sheet, "A7"), /Date of Weighing: June 09, 2026/);
assert.match(value(sheet, "F7"), /Grade 4 - Test/);
// Boys first, then girls; names are numbered; '=' stays text, never a formula.
assert.match(value(sheet, "A10"), /1\. =A&amp;B &lt;Test&gt;/);
assert.match(value(sheet, "A11"), /2\. ZETA, Boy/);
assert.match(value(sheet, "A12"), /3\. ALPHA, Girl/);
assert.equal(value(sheet, "B10"), `<v>${excelDate("2016-02-29")}</v>`);
assert.equal(value(sheet, "C10"), "<v>30.5</v>");
assert.equal(value(sheet, "D10"), "<v>1.43</v>");
assert.equal(value(sheet, "G10"), "<v>10</v>");
assert.equal(value(sheet, "H10"), "<v>10</v>");
// Exactly one empty row after the last learner, then the tallies.
assert.doesNotMatch(row(sheet, 13), /<v>|<is>/);
assert.match(value(sheet, "A14"), /Body Mass Index/);
assert.equal(value(sheet, "B15"), "<v>2</v>");
assert.equal(value(sheet, "C15"), "<v>1</v>");
assert.equal(value(sheet, "D15"), "<v>3</v>");
assert.equal(value(sheet, "C17"), "<v>1</v>");
assert.equal(value(sheet, "B20"), "<v>1</v>");
assert.equal(value(sheet, "I19"), "<v>1</v>");
assert.match(value(sheet, "J23"), /Prepared by:/);
assert.match(value(sheet, "J26"), /TEST ADVISER/);
assert.match(files["xl/workbook.xml"], /\$A\$1:\$K\$27/);
assert.match(files["xl/workbook.xml"], /\$8:\$9/);
assert.doesNotMatch(Object.values(files).join(""), /POLIQUIT|ABDAH|Larrachochea|<f>/);
assert.equal(excelDate("06/09/2026"), 46182);
assert.equal(excelDate("2016-02-29"), 42429);
assert.equal(excelDate("2015-02-29"), null);
assert.equal(excelDate(""), null);
assert.equal(nutritionReportFilename(meta, "ROSALIE E. POLIQUIT"), "IECES_NS_Report_Baseline_2026_ROSALIE_E_POLIQUIT.xlsx");
assert.equal(nutritionReportFilename(meta, "JUAN DELA PEÑA"), "IECES_NS_Report_Baseline_2026_JUAN_DELA_PENA.xlsx");
assert.equal(nutritionReportFilename(meta, ""), "IECES_NS_Report_Baseline_2026.xlsx");

// No padding rows: 60 learners end at row 69, one empty row, tallies from 71.
const manyRows = Array.from({ length: 60 }, (_, i) => learner(`LEARNER ${String(i + 1).padStart(2, "0")}`, i % 2 ? "F" : "M"));
const largeBytes = createNutritionReportExcel(manyRows, { ...meta, periodLabel: "Endline", schoolYearLabel: "Endline SY 2026-2027" }, "TEST ADVISER");
const large = read(largeBytes)["xl/worksheets/sheet1.xml"];
assert.match(large, /dimension ref="A1:K84"/);
assert.match(value(large, "A69"), /60\. LEARNER/);
assert.doesNotMatch(row(large, 70), /<v>|<is>/);
assert.equal(value(large, "D72"), "<v>60</v>");
assert.match(large, /fitToHeight="0"/);
const missing = learner("NO MEASUREMENT", "F", "—", "—");
missing.birthdate = "";
missing.report.weightKg = missing.report.heightMeters = missing.report.heightSquaredMeters = missing.report.bmi = null;
const missingSheet = read(createNutritionReportExcel([missing], meta, ""))["xl/worksheets/sheet1.xml"];
assert.match(value(missingSheet, "C10"), /—/);
assert.equal(value(missingSheet, "D13"), "<v>0</v>");
const emptySheet = read(createNutritionReportExcel([], meta, ""))["xl/worksheets/sheet1.xml"];
assert.equal(value(emptySheet, "D12"), "<v>0</v>");
// With seal bytes the drawing is embedded.
const withSeal = read(createNutritionReportExcel(rows, meta, "TEST ADVISER", new Uint8Array([137, 80, 78, 71])));
assert.ok(withSeal["xl/drawings/drawing1.xml"]);
assert.match(withSeal["xl/worksheets/sheet1.xml"], /<drawing r:id="rId1"\/>/);

const out = await mkdtemp(join(tmpdir(), "ieces-export-test-"));
await writeFile(join(out, "report.xlsx"), createNutritionReportExcel(manyRows.slice(0, 25), meta, "TEST ADVISER"));
await writeFile(join(out, "large-report.xlsx"), largeBytes);
console.log(`Export checks passed: layout, one empty row after learners, typed values, escaping, dates, tallies, filename, missing data, 60 learners, seal.\nVisual QA fixtures: ${out}`);
