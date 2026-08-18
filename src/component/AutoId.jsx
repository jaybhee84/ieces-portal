import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { QRCodeSVG } from "qrcode.react";
import idTemplate from "../image/id-template.png";

// ─── Constants ────────────────────────────────────────────────────────────────
const LS_KEY_NAME = "autoid_principal_name";
const LS_KEY_POS = "autoid_principal_pos";

const PRINCIPAL_POSITIONS = [
  "Principal I",
  "Principal II",
  "Principal III",
  "Principal IV",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function deriveValidity(sy) {
  if (!sy) return null;
  const s = String(sy).trim();
  const range = s.match(/(\d{4})[–\-](\d{4})/);
  if (range) return `S.Y. ${range[1]} – ${range[2]}`;
  const single = s.match(/(\d{4})/);
  if (single) {
    const e = +single[1];
    return `S.Y. ${e - 1} – ${e}`;
  }
  return null;
}
function deriveYearToken(sy) {
  if (!sy) return String(new Date().getFullYear());
  const s = String(sy).trim();
  const range = s.match(/(\d{4})[–\-](\d{4})/);
  if (range) return range[2];
  const single = s.match(/(\d{4})/);
  return single ? single[1] : String(new Date().getFullYear());
}
function formatName(first, middle, family, suffix) {
  const f = (first || "").trim().toUpperCase();
  const m = (middle || "").trim().toUpperCase();
  const l = (family || "").trim().toUpperCase();
  const s = (suffix || "").trim().toUpperCase();
  const mi = m ? m.charAt(0) + "." : "";
  return [f, mi, l, s].filter(Boolean).join(" ");
}
function formatGradeSection(rawGrade, rawSection) {
  const gradeNum = parseInt(rawGrade, 10);
  const isKinder =
    rawGrade === 0 ||
    isNaN(gradeNum) ||
    String(rawGrade).toUpperCase() === "KINDER";
  let secStr = String(rawSection || "UNASSIGNED").trim();
  secStr =
    secStr.replace(/^(GRADE\s*\d+|KINDER)\s*[-–]\s*/i, "").trim() || secStr;
  return isKinder ? `Kinder - ${secStr}` : `Grade ${gradeNum} - ${secStr}`;
}
function gradeTag(rawGrade) {
  const gradeNum = parseInt(rawGrade, 10);
  const isKinder =
    rawGrade === 0 ||
    isNaN(gradeNum) ||
    String(rawGrade).toUpperCase() === "KINDER";
  return isKinder ? "GK" : `G${gradeNum}`;
}
const ov = (top, left, width, height, extra = {}) => ({
  position: "absolute",
  top: `${top}px`,
  left: `${left}px`,
  ...(width !== undefined ? { width: `${width}px` } : {}),
  ...(height !== undefined ? { height: `${height}px` } : {}),
  ...extra,
});

// ─── ID Card renderer (shared between screen and print) ───────────────────────
// Returns the two card divs only — no wrappers
function IdCards({ front, back, card }) {
  return (
    <>
      {/* FRONT */}
      <div style={card("0px 0px")}>
        {/* Photo */}
        <div
          style={ov(145, 23, 121, 166, {
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "#bbb",
          })}
        >
          {front.photoUrl && (
            <img
              src={front.photoUrl}
              alt="Student"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          )}
        </div>
        {/* LRN */}
        <div
          style={ov(178, 201, 140, undefined, {
            fontSize: "10px",
            fontWeight: "800",
            color: "#111",
            fontFamily: "monospace",
            letterSpacing: "0.3px",
            lineHeight: "1",
          })}
        >
          {front.lrn}
        </div>
        {/* Student ID */}
        <div
          style={ov(210, 229, 110, undefined, {
            fontSize: "9.5px",
            fontWeight: "800",
            color: "#111",
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            lineHeight: "1",
          })}
        >
          {front.studentIdFmt}
        </div>
        {/* Grade & Section */}
        <div
          style={ov(264, 137, 182, 40, {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "9.5px",
            fontWeight: "900",
            color: "#7b0000",
            textAlign: "center",
            lineHeight: "1.2",
            padding: "0 4px",
          })}
        >
          {front.gradeSectionStr}
        </div>
        {/* Name */}
        <div
          style={ov(358, 22, 306, 37, {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: front.fullName.length > 22 ? "11px" : "13.5px",
            fontWeight: "900",
            color: "#000",
            textAlign: "center",
            letterSpacing: "0.3px",
            lineHeight: "1.1",
            padding: "0 8px",
            overflow: "hidden",
          })}
        >
          {front.fullName}
        </div>
        {/* Principal */}
        <div style={ov(418, 22, 306, undefined, { textAlign: "center" })}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: "900",
              color: "#D4AF37",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
              lineHeight: "1.3",
            }}
          >
            {front.principalName}
          </div>
          <div
            style={{
              fontSize: "7.5px",
              fontWeight: "700",
              color: "#fff",
              textTransform: "uppercase",
              marginTop: "2px",
              letterSpacing: "0.5px",
              lineHeight: "1.3",
            }}
          >
            {front.principalPos}
          </div>
        </div>
      </div>

      {/* BACK */}
      <div style={card("-350px 0px")}>
        {/* Address */}
        <div
          style={ov(170, 23, 301, undefined, {
            fontSize: "9.5px",
            fontWeight: "700",
            color: "#111",
            lineHeight: "1.4",
          })}
        >
          {back.address}
        </div>
        {/* Guardian Name */}
        <div
          style={ov(289, 122, 210, undefined, {
            fontSize: "9px",
            fontWeight: "800",
            color: "#111",
            lineHeight: "1",
          })}
        >
          {back.guardName}
        </div>
        {/* Relation */}
        <div
          style={ov(315, 145, 187, undefined, {
            fontSize: "9px",
            fontWeight: "800",
            color: "#111",
            lineHeight: "1",
          })}
        >
          {back.guardRel}
        </div>
        {/* Contact */}
        <div
          style={ov(341, 122, 210, undefined, {
            fontSize: "9px",
            fontWeight: "800",
            color: "#111",
            fontFamily: "monospace",
            lineHeight: "1",
          })}
        >
          {back.contactNum}
        </div>
        {/* QR Code */}
        <div
          style={ov(392, 235, 75, 76, {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#fff",
            borderRadius: "4px",
          })}
        >
          <QRCodeSVG
            value={back.qrPayload}
            size={68}
            level="M"
            style={{ display: "block" }}
          />
        </div>
      </div>
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AutoId({ profile }) {
  const [learners, setLearners] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState("");

  // Load saved principal from localStorage on mount
  const [principalName, setPrincipalName] = useState(
    () => localStorage.getItem(LS_KEY_NAME) || "JOCELYN R. BUENAVENTURA",
  );
  const [principalPos, setPrincipalPos] = useState(
    () => localStorage.getItem(LS_KEY_POS) || "Principal I",
  );

  const printRef = useRef(null);

  useEffect(() => {
    fetchLearners();
  }, [profile?.id ?? profile]);

  const fetchLearners = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .order("family_name", { ascending: true });
      if (!error && data) {
        setLearners(data);
        if (data.length > 0) setSelectedId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ── Save principal ────────────────────────────────────────────────────────
  const savePrincipal = () => {
    localStorage.setItem(LS_KEY_NAME, principalName);
    localStorage.setItem(LS_KEY_POS, principalPos);
    setSavedMsg("✓ Saved!");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  // ── Print (Folio 8.5 × 13 in) ────────────────────────────────────────────
  // Strategy: open a hidden window, inject the rendered card HTML + inline
  // styles + the template image as a data-URL, trigger print, close.
  const handlePrint = async () => {
    // Convert template image to data-URL so the print window can load it
    const toDataUrl = (url) =>
      new Promise((res) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          res(c.toDataURL("image/png"));
        };
        img.src = url;
      });

    const templateDataUrl = await toDataUrl(idTemplate);

    // Build card HTML string using inline styles (same values as screen)
    const cardStyle = (bgPos) =>
      `width:350px;height:530px;` +
      `background-image:url('${templateDataUrl}');` +
      `background-position:${bgPos};background-size:700px 530px;` +
      `background-repeat:no-repeat;position:relative;` +
      `border-radius:16px;overflow:hidden;flex-shrink:0;`;

    const o = (t, l, w, h, s) =>
      `position:absolute;top:${t}px;left:${l}px;` +
      (w !== undefined ? `width:${w}px;` : "") +
      (h !== undefined ? `height:${h}px;` : "") +
      s;

    const photoHtml = photoUrl
      ? `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
      : "";

    const nameFs = fullName.length > 22 ? "11px" : "13.5px";

    const frontHtml = `
      <div style="${cardStyle("0px 0px")}">
        <div style="${o(145, 23, 121, 166, "border-radius:8px;overflow:hidden;background:#bbb;")}">
          ${photoHtml}
        </div>
        <div style="${o(178, 201, 140, undefined, "font-size:10px;font-weight:800;color:#111;font-family:monospace;letter-spacing:0.3px;line-height:1;")}">
          ${lrn}
        </div>
        <div style="${o(210, 229, 110, undefined, "font-size:9.5px;font-weight:800;color:#111;font-family:monospace;white-space:nowrap;line-height:1;")}">
          ${studentIdFmt}
        </div>
        <div style="${o(264, 137, 182, 40, "display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:900;color:#7b0000;text-align:center;line-height:1.2;padding:0 4px;")}">
          ${gradeSectionStr}
        </div>
        <div style="${o(358, 22, 306, 37, `display:flex;align-items:center;justify-content:center;font-size:${nameFs};font-weight:900;color:#000;text-align:center;letter-spacing:0.3px;line-height:1.1;padding:0 8px;overflow:hidden;`)}">
          ${fullName}
        </div>
        <div style="${o(418, 22, 306, undefined, "text-align:center;")}">
          <div style="font-size:11px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:0.5px;text-shadow:0 1px 2px rgba(0,0,0,0.6);line-height:1.3;">
            ${principalName.toUpperCase()}
          </div>
          <div style="font-size:7.5px;font-weight:700;color:#fff;text-transform:uppercase;margin-top:2px;letter-spacing:0.5px;line-height:1.3;">
            ${principalPos}
          </div>
        </div>
      </div>`;

    // QR as SVG data-URL
    const qrCanvas = document.createElement("canvas");
    const qrSize = 68;
    qrCanvas.width = qrSize;
    qrCanvas.height = qrSize;
    // Use qrcode library to draw — we read the SVG from DOM instead
    const qrEl = printRef.current?.querySelector("svg");
    const qrDataUrl = qrEl
      ? "data:image/svg+xml;base64," +
        btoa(new XMLSerializer().serializeToString(qrEl))
      : "";

    const backHtml = `
      <div style="${cardStyle("-350px 0px")}">
        <div style="${o(170, 23, 301, undefined, "font-size:9.5px;font-weight:700;color:#111;line-height:1.4;")}">
          ${address}
        </div>
        <div style="${o(289, 122, 210, undefined, "font-size:9px;font-weight:800;color:#111;line-height:1;")}">
          ${guardName}
        </div>
        <div style="${o(315, 145, 187, undefined, "font-size:9px;font-weight:800;color:#111;line-height:1;")}">
          ${guardRel}
        </div>
        <div style="${o(341, 122, 210, undefined, "font-size:9px;font-weight:800;color:#111;font-family:monospace;line-height:1;")}">
          ${contactNum}
        </div>
        <div style="${o(392, 235, 75, 76, "display:flex;align-items:center;justify-content:center;background:#fff;border-radius:4px;")}">
          ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:68px;height:68px;display:block;" />` : ""}
        </div>
      </div>`;

    // Folio: 8.5 × 13 in
    // Cards are 350×530px — lay them out in 2 rows × 2 cols centered on the page
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Student ID – ${fullName}</title>
<style>
  @page { size: 8.5in 13in; margin: 0.4in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 8.5in; min-height: 13in;
    font-family: system-ui, sans-serif;
    background: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0.3in;
    padding: 0;
  }
  .print-title {
    font-size: 13pt;
    font-weight: 700;
    color: #7b0000;
    text-align: center;
    padding: 0.1in 0 0;
    letter-spacing: 0.03em;
  }
  .card-row {
    display: flex;
    gap: 0.25in;
    justify-content: center;
    align-items: flex-start;
  }
</style>
</head>
<body>
  <div class="print-title">ISABELA EAST CENTRAL ELEMENTARY SCHOOL — Student ID</div>
  <div class="card-row">
    ${frontHtml}
    ${backHtml}
  </div>
</body>
</html>`;

    const win = window.open(
      "",
      "_blank",
      "width=816,height=1056,menubar=no,toolbar=no,location=no",
    );
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 800);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const idx = learners.findIndex((l) => String(l.id) === String(selectedId));
  const raw = learners[idx] || {};
  const enrolledSY = raw.school_year || raw.sy || null;
  const validity =
    deriveValidity(enrolledSY) ||
    `S.Y. ${new Date().getFullYear() - 1} – ${new Date().getFullYear()}`;
  const yearToken = deriveYearToken(enrolledSY);
  const gt = gradeTag(raw.grade_level);
  const seqNum = String(idx >= 0 ? idx + 1 : 1).padStart(4, "0");
  const studentIdFmt = `${yearToken}-${gt}-${seqNum}`;
  const fullName = formatName(
    raw.first_name,
    raw.middle_name,
    raw.family_name,
    raw.suffix || raw.name_suffix,
  );
  const gradeSectionStr = formatGradeSection(raw.grade_level, raw.section);
  const address = raw.address || "Isabela City, Basilan";
  const guardName = (
    raw.guardian_name ||
    raw.father_name ||
    raw.mother_name ||
    "N/A"
  ).toUpperCase();
  const guardRel = (
    raw.guardian_relationship || "PARENT/GUARDIAN"
  ).toUpperCase();
  const contactNum = raw.contact_number || "N/A";
  const lrn = raw.lrn || "";
  const photoUrl = raw.photo_url || null;

  const qrPayload = JSON.stringify({
    lrn,
    studentId: studentIdFmt,
    name: fullName,
    gradeSection: gradeSectionStr,
    validity,
    address,
    guardian: guardName,
    contact: contactNum,
    status: "VALID ID",
  });

  const frontData = {
    lrn,
    studentIdFmt,
    gradeSectionStr,
    fullName,
    photoUrl,
    principalName: principalName.toUpperCase(),
    principalPos,
  };
  const backData = { address, guardName, guardRel, contactNum, qrPayload };

  const cardStyle = (bgPos) => ({
    width: "350px",
    height: "530px",
    backgroundImage: `url(${idTemplate})`,
    backgroundPosition: bgPos,
    backgroundSize: "700px 530px",
    backgroundRepeat: "no-repeat",
    position: "relative",
    borderRadius: "16px",
    boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
    overflow: "hidden",
    flexShrink: 0,
  });

  if (loading) {
    return (
      <div
        className="dash-card"
        style={{ textAlign: "center", padding: "40px" }}
      >
        <p>Loading learner details for ID generation...</p>
      </div>
    );
  }

  return (
    <div className="dash-stacked-cards">
      {/* ── Controls ── */}
      <div className="dash-card">
        <div className="dash-card-header">
          <h2>Auto ID Generator</h2>
          <p>
            Validity is embedded in the QR code. Print on Folio (8.5 × 13 in)
            paper.
          </p>
        </div>
        <div className="dash-form">
          {/* Learner select */}
          <div>
            <label className="adv-label">Select Learner</label>
            <select
              className="table-select"
              style={{ width: "100%", padding: "8px" }}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {learners.length === 0 && (
                <option value="">No learners found</option>
              )}
              {learners.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.family_name}, {st.first_name} — {st.lrn || "No LRN"}
                </option>
              ))}
            </select>
          </div>

          {/* Auto-derived fields */}
          <div className="form-row three-col">
            <div>
              <label className="adv-label">Enrolled SY (auto)</label>
              <input
                readOnly
                className="table-select readonly-input"
                style={{ width: "100%", padding: "8px" }}
                value={enrolledSY || "(not recorded)"}
              />
            </div>
            <div>
              <label className="adv-label">Validity (auto)</label>
              <input
                readOnly
                className="table-select readonly-input"
                style={{ width: "100%", padding: "8px" }}
                value={validity}
              />
            </div>
            <div>
              <label className="adv-label">Student ID (auto)</label>
              <input
                readOnly
                className="table-select readonly-input"
                style={{
                  width: "100%",
                  padding: "8px",
                  fontFamily: "monospace",
                }}
                value={studentIdFmt}
              />
            </div>
          </div>

          {/* Principal + Save */}
          <div
            className="form-row"
            style={{ gridTemplateColumns: "1fr 1fr auto" }}
          >
            <div>
              <label className="adv-label">Principal Name</label>
              <input
                type="text"
                className="table-select"
                style={{
                  width: "100%",
                  padding: "8px",
                  textTransform: "uppercase",
                }}
                value={principalName}
                onChange={(e) => setPrincipalName(e.target.value)}
                placeholder="e.g. Jocelyn R. Buenaventura"
              />
            </div>
            <div>
              <label className="adv-label">Principal Position</label>
              <select
                className="table-select"
                style={{ width: "100%", padding: "8px" }}
                value={principalPos}
                onChange={(e) => setPrincipalPos(e.target.value)}
              >
                {PRINCIPAL_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            {/* Save button aligned to bottom of row */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={savePrincipal}
                style={{
                  padding: "8px 18px",
                  background: savedMsg ? "#16a34a" : "#7b1a1a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "700",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "background 0.2s",
                  height: "36px",
                }}
              >
                {savedMsg || "💾 Save Principal"}
              </button>
            </div>
          </div>

          {/* Print button */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "4px",
            }}
          >
            <button
              onClick={handlePrint}
              style={{
                padding: "10px 28px",
                background: "linear-gradient(135deg,#7b1a1a,#5a1010)",
                color: "#f5c518",
                border: "none",
                borderRadius: "10px",
                fontWeight: "800",
                fontSize: "0.88rem",
                cursor: "pointer",
                letterSpacing: "0.04em",
                boxShadow: "0 4px 12px rgba(123,26,26,0.3)",
              }}
            >
              🖨️ Print ID — Folio (8.5 × 13 in)
            </button>
          </div>
        </div>
      </div>

      {/* ── ID Preview ── */}
      {/* Hidden ref to grab QR SVG for print */}
      <div ref={printRef} style={{ display: "none" }} aria-hidden>
        <QRCodeSVG value={qrPayload} size={68} level="M" />
      </div>

      <div
        style={{
          display: "flex",
          gap: "32px",
          justifyContent: "center",
          flexWrap: "wrap",
          padding: "20px 0",
        }}
      >
        <IdCards front={frontData} back={backData} card={cardStyle} />
      </div>
    </div>
  );
}
