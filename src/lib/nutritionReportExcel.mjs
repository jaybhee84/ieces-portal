import { strToU8, zipSync } from "fflate";
import layout from "./nutritionReportLayout.json" with { type: "json" };

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const BAZ = ["Severely Wasted", "Wasted", "Normal", "Overweight", "Obese"];
const HAZ = ["Severely Stunted", "Stunted", "Normal", "Tall"];
const xml = (value) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const documentXml = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
const numeric = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;

// Use UTC calendar dates so exports do not shift birthdays with the user's timezone.
export function excelDate(value) {
  const text = String(value || "");
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!iso && !us) return null;
  const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(us[3]), Number(us[1]), Number(us[2])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return (date.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
}

function cellXml(address, style, value) {
  const attrs = `r="${address}" s="${style}"`;
  if (value == null || value === "") return `<c ${attrs}/>`;
  if (typeof value === "number") return `<c ${attrs}><v>${value}</v></c>`;
  // Inline strings also keep names beginning with '=' from becoming formulas.
  return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function tally(rows, key, labels) {
  const counts = Object.fromEntries(labels.map(label => [label, { M: 0, F: 0 }]));
  for (const { report } of rows) {
    if (counts[report[key]] && ["M", "F"].includes(report.sex)) counts[report[key]][report.sex]++;
  }
  const lines = labels.map(label => [counts[label].M, counts[label].F]);
  return [lines.reduce(([m, f], line) => [m + line[0], f + line[1]], [0, 0]), ...lines];
}

/** Create the BMI app's report layout using the selected portal report snapshot.
 * The layout contains styles and fixed labels only, never the reference roster.
 * Values stay consistent with the portal's existing nutrition calculations.
 */
export function createNutritionReportExcel(inputRows, meta, preparedByName) {
  const rows = [...inputRows].sort((a, b) => {
    const rank = sex => sex === "M" ? 0 : sex === "F" ? 1 : 2;
    return rank(a.report.sex) - rank(b.report.sex) || a.name.localeCompare(b.name);
  });
  const count = Math.max(25, rows.length);
  const shift = count - 25;
  const endRow = 48 + shift;
  const move = ref => ref.replace(/(\$?[A-Z]+)(\$?)(\d+)/g, (_, col, dollar, r) => `${col}${dollar}${Number(r) >= 34 ? Number(r) + shift : r}`);
  const values = {
    A4: meta.schoolYearLabel,
    D6: excelDate(meta.dateOfWeighing),
    M6: `Grade/Class: ${meta.gradeClassLabel}`,
    G46: preparedByName || "—",
  };
  for (const [lines, cols] of [[tally(rows, "bmiStatus", BAZ), ["D", "E", "F"]], [tally(rows, "hfaStatus", HAZ), ["I", "J", "K"]]]) {
    lines.forEach(([m, f], i) => {
      values[`${cols[0]}${36 + i}`] = m;
      values[`${cols[1]}${36 + i}`] = f;
      values[`${cols[2]}${36 + i}`] = m + f;
    });
  }
  const rowXml = (number, height, cells) => `<row r="${number}" ht="${height}" customHeight="1">${cells}</row>`;
  const staticRow = row => rowXml(row.number >= 34 ? row.number + shift : row.number, row.height,
    row.cells.map(([col, style, value]) => {
      const ref = `${col}${row.number}`;
      return cellXml(move(ref), style, Object.hasOwn(values, ref) ? values[ref] : value);
    }).join(""));
  const prototype = layout.rows.find(row => row.number === 9);
  const body = Array.from({ length: count }, (_, i) => {
    const entry = rows[i];
    const report = entry?.report;
    const data = report ? {
      A: i + 1, B: entry.name, D: excelDate(entry.birthdate), E: numeric(report.weightKg),
      F: numeric(report.heightMeters), G: report.sex, H: numeric(report.heightSquaredMeters),
      I: report.ageYearMonth, L: numeric(report.bmi), M: report.bmiStatus, N: report.hfaStatus,
    } : {};
    return rowXml(i + 9, 18, prototype.cells.map(([col, style]) => cellXml(`${col}${i + 9}`, style, data[col])).join(""));
  }).join("");
  const merges = layout.merges.filter(ref => !/^(B9:|I9:)/.test(ref)).map(move);
  for (let r = 9; r < 9 + count; r++) merges.push(`B${r}:C${r}`, `I${r}:K${r}`);
  const sheetName = String(meta.gradeClassLabel || "Nutritional Status")
    .replace(/[\u0000-\u001F\[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").slice(0, 31).replace(/'+$/g, "") || "Nutritional Status";
  const printName = xml(`'${sheetName.replace(/'/g, "''")}'`);
  const files = Object.fromEntries(Object.entries(layout.assets).map(([name, base64]) => [name, Uint8Array.from(atob(base64), c => c.charCodeAt(0))]));
  const addXml = (name, content) => { files[name] = strToU8(documentXml(content)); };
  addXml("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  const relationships = entries => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join("")}</Relationships>`;
  addXml("_rels/.rels", relationships([["rId1", "officeDocument", "xl/workbook.xml"]]));
  addXml("xl/_rels/workbook.xml.rels", relationships([["rId1", "worksheet", "worksheets/sheet1.xml"], ["rId2", "styles", "styles.xml"], ["rId3", "theme", "theme/theme1.xml"]]));
  addXml("xl/worksheets/_rels/sheet1.xml.rels", relationships([["rId1", "drawing", "../drawings/drawing1.xml"]]));
  addXml("xl/workbook.xml", `<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">${printName}!$A$1:$N$${endRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">${printName}!$7:$8</definedName></definedNames></workbook>`);
  const columns = layout.columns.map(col => `<col min="${col.min}" max="${col.max}" width="${col.width}" customWidth="1"/>`).join("");
  addXml("xl/worksheets/sheet1.xml", `<worksheet xmlns="${NS}" xmlns:r="${REL}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:N${endRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A9" sqref="A9"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols><sheetData>${layout.rows.filter(row => row.number < 9).map(staticRow).join("")}${body}${layout.rows.filter(row => row.number >= 34).map(staticRow).join("")}</sheetData><mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.2" footer="0.2"/><pageSetup paperSize="14" orientation="portrait" fitToWidth="1" fitToHeight="${count <= 25 ? 1 : 0}"/><drawing r:id="rId1"/></worksheet>`);
  files["xl/drawings/drawing1.xml"] = strToU8(layout.drawing.replace(/<xdr:row>(\d+)<\/xdr:row>/g, (match, r) => Number(r) >= 34 ? `<xdr:row>${Number(r) + shift}</xdr:row>` : match));
  return zipSync(files, { level: 6 });
}

export function nutritionReportFilename(meta) {
  const slug = value => String(value || "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `IECES_NS_Report_${slug(meta.periodLabel)}_${slug(meta.gradeClassLabel)}_SY${String(meta.schoolYear).replace(/[^0-9-]/g, "")}.xlsx`;
}

export function downloadNutritionReportExcel(rows, meta, preparedByName) {
  const bytes = createNutritionReportExcel(rows, meta, preparedByName);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nutritionReportFilename(meta);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser/Electron consume the download before releasing its bytes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
