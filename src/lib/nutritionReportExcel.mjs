import { strToU8, zipSync } from "fflate";

// Builds the Nutritional Status Report as .xlsx with the same layout as the
// on-screen report and its Legal printout (see NutritionPrintTable.jsx).

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const BAZ = ["Severely Wasted", "Wasted", "Normal", "Overweight", "Obese"];
const HAZ = ["Severely Stunted", "Stunted", "Normal", "Tall"];
const HAZ_LABELS = { "Severely Stunted": "Sev. Stunted" };
const COLS = "ABCDEFGHIJK".split("");
// Printed table proportions, widened so Arial headers fit Excel's character widths.
const WIDTHS = [27, 11.5, 7, 8.5, 4.3, 7.5, 3.3, 3.3, 6.5, 15, 16];
const EMU_PER_PX = 9525;
const SEAL_PX = 48; // 36pt
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

// "June 09, 2026", as printed after "Date of Weighing:".
function longDate(value) {
  const serial = excelDate(value);
  if (serial == null) return "—";
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return date.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric", timeZone: "UTC" });
}

// Style indexes into STYLES_XML's cellXfs.
const S = {
  plain: 0, title: 1, subtitle: 2, metaLeft: 3, metaRight: 4, th: 5, thBold: 6,
  name: 7, center: 8, date: 9, dec3: 10, dec4: 11, dec2: 12, tallyTh: 13, tallyTd: 14,
  formula: 15, signLabel: 16, signLine: 17, signName: 18, signTitle: 19,
};

const font = (size, { bold = false, color = "FF000000" } = {}) =>
  `<font>${bold ? "<b/>" : ""}<sz val="${size}"/><color rgb="${color}"/><name val="Arial"/><family val="2"/></font>`;
const thin = (color) => `<left style="thin"><color rgb="${color}"/></left><right style="thin"><color rgb="${color}"/></right><top style="thin"><color rgb="${color}"/></top><bottom style="thin"><color rgb="${color}"/></bottom>`;
const xf = (fontId, { fill = 0, border = 0, numFmt = 0, h = "center", v = "center", wrap = false, shrink = false } = {}) =>
  `<xf numFmtId="${numFmt}" fontId="${fontId}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${h}" vertical="${v}"${wrap ? ' wrapText="1"' : ""}${shrink ? ' shrinkToFit="1"' : ""}/></xf>`;

const STYLES_XML = `<styleSheet xmlns="${NS}">
<numFmts count="4"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/><numFmt numFmtId="165" formatCode="0.000"/><numFmt numFmtId="166" formatCode="0.0000"/><numFmt numFmtId="167" formatCode="0.00"/></numFmts>
<fonts count="7">${[
  font(10), font(10, { bold: true }), font(11), font(11, { bold: true }),
  font(7), font(11, { color: "FF4A4040" }), font(11, { bold: true, color: "FF211B1B" }),
].join("")}</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2EDE9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="4"><border><left/><right/><top/><bottom/><diagonal/></border><border>${thin("FF000000")}<diagonal/></border><border>${thin("FF999999")}<diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF333333"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="20">${[
  xf(0, { h: "general" }),
  xf(6), xf(5), xf(1, { h: "left" }), xf(1, { h: "right" }),
  xf(0, { border: 1, wrap: true }), xf(1, { border: 1, wrap: true }),
  xf(0, { border: 1, h: "left", shrink: true }), xf(0, { border: 1 }),
  xf(0, { border: 1, numFmt: 164 }), xf(0, { border: 1, numFmt: 165 }), xf(0, { border: 1, numFmt: 166 }), xf(0, { border: 1, numFmt: 167 }),
  xf(1, { border: 2, fill: 2 }), xf(0, { border: 2 }),
  xf(4, { h: "left" }), xf(2, { h: "left", v: "bottom" }), xf(0, { border: 3 }), xf(6), xf(5),
].join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(address, style, value) {
  const attrs = `r="${address}" s="${style}"`;
  if (value == null || value === "") return `<c ${attrs}/>`;
  if (typeof value === "number") return `<c ${attrs}><v>${value}</v></c>`;
  if (Array.isArray(value)) {
    // Rich text runs: [[text, bold], ...]
    const runs = value.map(([text, bold]) => `<r><rPr>${bold ? "<b/>" : ""}<sz val="7"/><rFont val="Arial"/></rPr><t xml:space="preserve">${xml(text)}</t></r>`).join("");
    return `<c ${attrs} t="inlineStr"><is>${runs}</is></c>`;
  }
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

/** Create the report workbook. `seal` is optional PNG bytes for the DepEd seal. */
export function createNutritionReportExcel(inputRows, meta, preparedByName, seal = null) {
  // Boys first, then girls, alphabetical — the same order as the printout.
  const rows = [...inputRows].sort((a, b) => {
    const rank = sex => sex === "M" ? 0 : sex === "F" ? 1 : 2;
    return rank(a.report.sex) - rank(b.report.sex) || a.name.localeCompare(b.name);
  });
  const sheetRows = [];
  const merges = [];
  let r = 0;
  // Adds one row. cells: { A: [style, value], ... }; every column gets a cell so borders render.
  const add = (height, cells = {}, fill = S.plain) => {
    r++;
    const xmlCells = COLS.map(col => {
      const [style, value] = cells[col] || [fill, null];
      return cellXml(`${col}${r}`, style, value);
    }).join("");
    sheetRows.push(`<row r="${r}" ht="${height}" customHeight="1">${xmlCells}</row>`);
    return r;
  };
  const merge = (from, to, row, row2 = row) => merges.push(`${from}${row}:${to}${row2}`);
  const across = (style, value) => ({ A: [style, value] });

  // Header: seal above the centered title block.
  const sealRow = add(seal ? 40 : 6);
  for (const [style, text] of [[S.title, "NUTRITIONAL STATUS REPORT"], [S.title, "Isabela East Central Elementary School"],
    [S.subtitle, "Isabela City, Basilan"], [S.subtitle, meta.schoolYearLabel]]) {
    merge("A", "K", add(14, across(style, text)));
  }
  add(6);
  const metaRow = add(15, { A: [S.metaLeft, `Date of Weighing: ${longDate(meta.weighingDate)}`], F: [S.metaRight, meta.gradeClassLabel] });
  merge("A", "E", metaRow); merge("F", "K", metaRow);

  // Table header (two rows, "Age" spans y / m).
  const h1 = add(27, {
    A: [S.th, "Names"], B: [S.th, "Birthday\nmm/dd/yyyy"], C: [S.th, "Weight\n(kg)"], D: [S.th, "Height\n(meters)"],
    E: [S.th, "Sex"], F: [S.th, "Height²\n(m²)"], G: [S.th, "Age"], H: [S.th, null], I: [S.th, "Body\nMass\nIndex"],
    J: [S.thBold, "Nutritional\nStatus"], K: [S.thBold, "Height-For-Age"],
  }, S.th);
  const h2 = add(13, { G: [S.thBold, "y"], H: [S.thBold, "m"], J: [S.thBold, null], K: [S.thBold, null] }, S.th);
  for (const col of "ABCDEFIJK") merge(col, col, h1, h2);
  merge("G", "H", h1);

  rows.forEach(({ name, birthdate, report }, i) => {
    const [years, months] = String(report.ageYearMonth ?? "").split(".");
    const whole = value => value === undefined || value === "" ? "—" : Number.isFinite(Number(value)) ? Number(value) : value;
    add(13.5, {
      A: [S.name, `${i + 1}. ${name}`], B: [S.date, excelDate(birthdate) ?? "—"], C: [S.center, numeric(report.weightKg) ?? "—"],
      D: [S.dec3, numeric(report.heightMeters) ?? "—"], E: [S.center, report.sex], F: [S.dec4, numeric(report.heightSquaredMeters) ?? "—"],
      G: [S.center, whole(years)], H: [S.center, whole(months)], I: [S.dec2, numeric(report.bmi) ?? "—"],
      J: [S.center, report.bmiStatus], K: [S.center, report.hfaStatus],
    });
  });

  // Exactly one empty row after the last learner, then the tallies side by side:
  // BMI in A–D, HFA in F–K (label F:H).
  add(13.5);
  const baz = tally(rows, "bmiStatus", BAZ);
  const haz = tally(rows, "hfaStatus", HAZ);
  const th = add(13.5, {
    A: [S.tallyTh, "Body Mass Index"], B: [S.tallyTh, "M"], C: [S.tallyTh, "F"], D: [S.tallyTh, "T"],
    F: [S.tallyTh, "HFA"], G: [S.tallyTh, null], H: [S.tallyTh, null], I: [S.tallyTh, "M"], J: [S.tallyTh, "F"], K: [S.tallyTh, "TOTAL"],
  });
  merge("F", "H", th);
  ["No. of Cases", ...BAZ].forEach((label, i) => {
    const [bm, bf] = baz[i];
    const cells = { A: [S.tallyTd, label], B: [S.tallyTd, bm], C: [S.tallyTd, bf], D: [S.tallyTd, bm + bf] };
    if (i < haz.length) {
      const [hm, hf] = haz[i];
      const hLabel = i === 0 ? "No. of Cases" : HAZ_LABELS[HAZ[i - 1]] || HAZ[i - 1];
      Object.assign(cells, { F: [S.tallyTd, hLabel], G: [S.tallyTd, null], H: [S.tallyTd, null], I: [S.tallyTd, hm], J: [S.tallyTd, hf], K: [S.tallyTd, hm + hf] });
    }
    const row = add(13.5, cells);
    if (i < haz.length) merge("F", "H", row);
  });
  const formula = add(12, { A: [S.formula, [["Body Mass Index = ", true], ["Weight (kgs) / Height squared (m²)", false]]] });
  merge("A", "E", formula);

  // Signature block on the right, with one blank line under "Prepared by:".
  add(12);
  const label = add(15, { J: [S.signLabel, "Prepared by:"] }); merge("J", "K", label);
  add(15);
  const line = add(15, { J: [S.signLine, null], K: [S.signLine, null] }); merge("J", "K", line);
  const nameRow = add(15, { J: [S.signName, preparedByName || "—"] }); merge("J", "K", nameRow);
  const titleRow = add(15, { J: [S.signTitle, "Class Adviser"] }); merge("J", "K", titleRow);
  const endRow = r;

  const sheetName = String(meta.gradeClassLabel || "Nutritional Status")
    .replace(/[\u0000-\u001F\[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").slice(0, 31).replace(/'+$/g, "") || "Nutritional Status";
  const printName = xml(`'${sheetName.replace(/'/g, "''")}'`);
  const files = {};
  const addXml = (name, content) => { files[name] = strToU8(documentXml(content)); };
  const relationships = entries => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join("")}</Relationships>`;
  addXml("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${seal ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}</Types>`);
  addXml("_rels/.rels", relationships([["rId1", "officeDocument", "xl/workbook.xml"]]));
  addXml("xl/_rels/workbook.xml.rels", relationships([["rId1", "worksheet", "worksheets/sheet1.xml"], ["rId2", "styles", "styles.xml"]]));
  addXml("xl/styles.xml", STYLES_XML);
  addXml("xl/workbook.xml", `<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">${printName}!$A$1:$K$${endRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">${printName}!$${h1}:$${h2}</definedName></definedNames></workbook>`);

  let drawing = "";
  if (seal) {
    // Center the seal horizontally over the sheet's used width.
    const colPx = WIDTHS.map(w => Math.trunc(w * 7 + 5));
    let x = (colPx.reduce((a, b) => a + b, 0) - SEAL_PX) / 2;
    let col = 0;
    while (x >= colPx[col]) x -= colPx[col++];
    files["xl/media/seal.png"] = seal;
    addXml("xl/worksheets/_rels/sheet1.xml.rels", relationships([["rId1", "drawing", "../drawings/drawing1.xml"]]));
    addXml("xl/drawings/_rels/drawing1.xml.rels", relationships([["rId1", "image", "../media/seal.png"]]));
    const size = SEAL_PX * EMU_PER_PX;
    addXml("xl/drawings/drawing1.xml", `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}"><xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${Math.round(x * EMU_PER_PX)}</xdr:colOff><xdr:row>${sealRow - 1}</xdr:row><xdr:rowOff>${2 * EMU_PER_PX}</xdr:rowOff></xdr:from><xdr:ext cx="${size}" cy="${size}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="DepEd seal"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size}" cy="${size}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
    drawing = '<drawing r:id="rId1"/>';
  }
  const columns = WIDTHS.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
  addXml("xl/worksheets/sheet1.xml", `<worksheet xmlns="${NS}" xmlns:r="${REL}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:K${endRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${h2}" topLeftCell="A${h2 + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${h2 + 1}" sqref="A${h2 + 1}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols><sheetData>${sheetRows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.35" right="0.35" top="0.35" bottom="0.35" header="0.2" footer="0.2"/><pageSetup paperSize="5" orientation="portrait" fitToWidth="1" fitToHeight="0"/>${drawing}</worksheet>`);
  return zipSync(files, { level: 6 });
}

// IECES_NS_Report_<Period>_<school-year start>_<Adviser>.xlsx,
// e.g. IECES_NS_Report_Baseline_2026_ROSALIE_E_POLIQUIT.xlsx
export function nutritionReportFilename(meta, preparedByName) {
  // Accents are dropped (Peña -> Pena) so the name is safe on every file system.
  const slug = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const startYear = /\d{4}/.exec(String(meta.schoolYear || ""))?.[0] || "";
  return `${["IECES_NS_Report", slug(meta.periodLabel), startYear, slug(preparedByName)].filter(Boolean).join("_")}.xlsx`;
}

// The source seal is 4267px; a 192px copy keeps the file small and still prints sharp at 36pt.
async function loadSeal() {
  try {
    // Imported lazily so the workbook builder also runs under plain Node (tests).
    const { default: sealUrl } = await import("../image/deped.png");
    const image = new Image();
    image.src = sealUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 192;
    canvas.getContext("2d").drawImage(image, 0, 0, 192, 192);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null; // The report is still useful without the seal.
  }
}

export async function downloadNutritionReportExcel(rows, meta, preparedByName) {
  const bytes = createNutritionReportExcel(rows, meta, preparedByName, await loadSeal());
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nutritionReportFilename(meta, preparedByName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser/Electron consume the download before releasing its bytes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
