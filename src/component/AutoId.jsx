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

// ─── Constants ─────────────────────────────────────────────────────────────
// Wallet-size ID: 2.125 × 3.375 in
// At 96px/in: 204 × 324px
// Scale factor from design canvas (350×530): 204/350 ≈ 0.5829
const PRINT_SCALE = 204 / 350;
// Folio @page: 8.5×13in, margin 0.3in → printable 7.9×12.4in
// 3 cols × 3 rows = 9 IDs per page side
const IDS_PER_PAGE = 9;

// ─── Component ────────────────────────────────────────────────────────────────
export function AutoId({ profile }) {
  const [learners, setLearners] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [printMode, setPrintMode] = useState("single"); // "single" | "class" | "all"
  const [filterAdviser, setFilterAdviser] = useState("");
  const [advisers, setAdvisers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const [principalName, setPrincipalName] = useState(
    () => localStorage.getItem(LS_KEY_NAME) || "JOCELYN R. BUENAVENTURA",
  );
  const [principalPos, setPrincipalPos] = useState(
    () => localStorage.getItem(LS_KEY_POS) || "Principal I",
  );

  const printRef = useRef(null);

  useEffect(() => { fetchLearners(); }, [profile?.id ?? profile]);

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
        // Build unique adviser list
        const advSet = new Map();
        data.forEach((s) => {
          if (s.adviser_id) advSet.set(s.adviser_id, s.adviser_id);
        });
        setAdvisers([...advSet.keys()]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const savePrincipal = () => {
    localStorage.setItem(LS_KEY_NAME, principalName);
    localStorage.setItem(LS_KEY_POS, principalPos);
    setSavedMsg("✓ Saved!");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  // ── Derived single-learner values ─────────────────────────────────────────
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
  const fullName = formatName(raw.first_name, raw.middle_name, raw.family_name, raw.suffix || raw.name_suffix);
  const gradeSectionStr = formatGradeSection(raw.grade_level, raw.section);
  const address = raw.address || "Isabela City, Basilan";
  const guardName = (raw.guardian_name || raw.father_name || raw.mother_name || "N/A").toUpperCase();
  const guardRel = (raw.guardian_relationship || "PARENT/GUARDIAN").toUpperCase();
  const contactNum = raw.contact_number || "N/A";
  const lrn = raw.lrn || "";
  const photoUrl = raw.photo_url || null;

  const qrPayload = JSON.stringify({
    lrn, studentId: studentIdFmt, name: fullName,
    gradeSection: gradeSectionStr, validity, address,
    guardian: guardName, contact: contactNum, status: "VALID ID",
  });

  const frontData = { lrn, studentIdFmt, gradeSectionStr, fullName, photoUrl, principalName: principalName.toUpperCase(), principalPos };
  const backData = { address, guardName, guardRel, contactNum, qrPayload };

  const cardStyle = (bgPos) => ({
    width: "350px", height: "530px",
    backgroundImage: `url(${idTemplate})`,
    backgroundPosition: bgPos, backgroundSize: "700px 530px",
    backgroundRepeat: "no-repeat", position: "relative",
    borderRadius: "16px", boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
    overflow: "hidden", flexShrink: 0,
  });

  // ── Build HTML for one card (front or back) at print scale ───────────────
  const buildCardHtml = (templateDataUrl, learnerRaw, learnerIdx, side) => {
    const sy = learnerRaw.school_year || learnerRaw.sy || null;
    const yt = deriveYearToken(sy);
    const g = gradeTag(learnerRaw.grade_level);
    const seq = String(learnerIdx + 1).padStart(4, "0");
    const idFmt = `${yt}-${g}-${seq}`;
    const fn = formatName(learnerRaw.first_name, learnerRaw.middle_name, learnerRaw.family_name, learnerRaw.suffix || learnerRaw.name_suffix);
    const gsSec = formatGradeSection(learnerRaw.grade_level, learnerRaw.section);
    const addr = learnerRaw.address || "Isabela City, Basilan";
    const gname = (learnerRaw.guardian_name || learnerRaw.father_name || learnerRaw.mother_name || "N/A").toUpperCase();
    const grel = (learnerRaw.guardian_relationship || "PARENT/GUARDIAN").toUpperCase();
    const cnum = learnerRaw.contact_number || "N/A";
    const lrnNum = learnerRaw.lrn || "";
    const photo = learnerRaw.photo_url || null;
    const nameFs = fn.length > 22 ? `${Math.round(11 * PRINT_SCALE * 100) / 100}px` : `${Math.round(13.5 * PRINT_SCALE * 100) / 100}px`;

    const S = PRINT_SCALE;
    const W = Math.round(350 * S);
    const H = Math.round(530 * S);
    const bgPos = side === "front" ? "0px 0px" : `-${W}px 0px`;
    const bgW = Math.round(700 * S);
    const bgH = Math.round(530 * S);

    const o = (t, l, w, h, s) =>
      `position:absolute;top:${Math.round(t*S)}px;left:${Math.round(l*S)}px;` +
      (w !== undefined ? `width:${Math.round(w*S)}px;` : "") +
      (h !== undefined ? `height:${Math.round(h*S)}px;` : "") + s;

    const cardBase = `width:${W}px;height:${H}px;background-image:url('${templateDataUrl}');` +
      `background-position:${bgPos};background-size:${bgW}px ${bgH}px;` +
      `background-repeat:no-repeat;position:relative;border-radius:${Math.round(16*S)}px;overflow:hidden;flex-shrink:0;`;

    if (side === "front") {
      const photoHtml = photo
        ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
        : "";
      return `<div style="${cardBase}">
        <div style="${o(145,23,121,166,"border-radius:"+Math.round(8*S)+"px;overflow:hidden;background:#bbb;")}">
          ${photoHtml}
        </div>
        <div style="${o(178,201,140,undefined,"font-size:"+Math.round(10*S)+"px;font-weight:800;color:#111;font-family:monospace;letter-spacing:0.3px;line-height:1;")}">
          ${lrnNum}
        </div>
        <div style="${o(210,229,110,undefined,"font-size:"+Math.round(9.5*S)+"px;font-weight:800;color:#111;font-family:monospace;white-space:nowrap;line-height:1;")}">
          ${idFmt}
        </div>
        <div style="${o(264,137,182,40,"display:flex;align-items:center;justify-content:center;font-size:"+Math.round(9.5*S)+"px;font-weight:900;color:#7b0000;text-align:center;line-height:1.2;padding:0 "+Math.round(4*S)+"px;")}">
          ${gsSec}
        </div>
        <div style="${o(358,22,306,37,"display:flex;align-items:center;justify-content:center;font-size:"+nameFs+";font-weight:900;color:#000;text-align:center;letter-spacing:0.3px;line-height:1.1;padding:0 "+Math.round(8*S)+"px;overflow:hidden;")}">
          ${fn}
        </div>
        <div style="${o(418,22,306,undefined,"text-align:center;")}">
          <div style="font-size:${Math.round(11*S)}px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:0.5px;text-shadow:0 1px 2px rgba(0,0,0,0.6);line-height:1.3;">
            ${principalName.toUpperCase()}
          </div>
          <div style="font-size:${Math.round(7.5*S)}px;font-weight:700;color:#fff;text-transform:uppercase;margin-top:${Math.round(2*S)}px;letter-spacing:0.5px;line-height:1.3;">
            ${principalPos}
          </div>
        </div>
      </div>`;
    } else {
      // back — QR as placeholder (cannot render QR in print window without lib)
      const qrPay = JSON.stringify({ lrn: lrnNum, studentId: idFmt, name: fn, gradeSection: gsSec, validity: deriveValidity(sy) || `S.Y. ${new Date().getFullYear()-1}–${new Date().getFullYear()}`, address: addr, guardian: gname, contact: cnum, status: "VALID ID" });
      const qrSize = Math.round(68 * S);
      // Encode QR as a URL for a QR API (Google Charts QR endpoint - works offline once cached, or use blank)
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(qrPay)}`;
      return `<div style="${cardBase}">
        <div style="${o(170,23,301,undefined,"font-size:"+Math.round(9.5*S)+"px;font-weight:700;color:#111;line-height:1.4;")}">
          ${addr}
        </div>
        <div style="${o(289,122,210,undefined,"font-size:"+Math.round(9*S)+"px;font-weight:800;color:#111;line-height:1;")}">
          ${gname}
        </div>
        <div style="${o(315,145,187,undefined,"font-size:"+Math.round(9*S)+"px;font-weight:800;color:#111;line-height:1;")}">
          ${grel}
        </div>
        <div style="${o(341,122,210,undefined,"font-size:"+Math.round(9*S)+"px;font-weight:800;color:#111;font-family:monospace;line-height:1;")}">
          ${cnum}
        </div>
        <div style="${o(392,235,75,76,"display:flex;align-items:center;justify-content:center;background:#fff;border-radius:"+Math.round(4*S)+"px;")}">
          <img src="${qrUrl}" style="width:${qrSize}px;height:${qrSize}px;display:block;" />
        </div>
      </div>`;
    }
  };

  // ── Determine which learners to print ─────────────────────────────────────
  const getPrintQueue = () => {
    if (printMode === "single") {
      return idx >= 0 ? [{ raw, idx }] : [];
    }
    if (printMode === "class" && filterAdviser) {
      return learners
        .filter((l) => String(l.adviser_id) === String(filterAdviser))
        .map((l, i) => ({ raw: l, idx: learners.indexOf(l) }));
    }
    if (printMode === "all") {
      return learners.map((l, i) => ({ raw: l, idx: i }));
    }
    return [];
  };

  const printQueue = getPrintQueue();
  const pagesNeeded = Math.ceil(printQueue.length / IDS_PER_PAGE);

  // ── Print handler ─────────────────────────────────────────────────────────
  const handlePrint = async () => {
    const queue = getPrintQueue();
    if (queue.length === 0) {
      alert("No learners selected for printing.");
      return;
    }
    setPrinting(true);

    try {
      // Convert template to data-URL
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
      const W = Math.round(350 * PRINT_SCALE);
      const H = Math.round(530 * PRINT_SCALE);
      const gap = 8; // px between cards

      // Build pages: each page holds up to 9 fronts (3×3), then 9 backs (3×3)
      // We interleave: page 1 = fronts of learners 0-8, page 2 = backs of learners 0-8,
      // page 3 = fronts of learners 9-17, etc. (so you can cut and have matching sets)
      let pagesHtml = "";

      for (let p = 0; p < pagesNeeded; p++) {
        const chunk = queue.slice(p * IDS_PER_PAGE, (p + 1) * IDS_PER_PAGE);

        // Fronts page
        let frontsGrid = "";
        chunk.forEach(({ raw: r, idx: i }) => {
          frontsGrid += `<div style="display:inline-block;margin:${gap/2}px;">${buildCardHtml(templateDataUrl, r, i, "front")}</div>`;
        });

        // Backs page
        let backsGrid = "";
        chunk.forEach(({ raw: r, idx: i }) => {
          backsGrid += `<div style="display:inline-block;margin:${gap/2}px;">${buildCardHtml(templateDataUrl, r, i, "back")}</div>`;
        });

        const pageStyle = `width:7.9in;min-height:12.4in;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:0.15in;page-break-after:always;`;
        const gridStyle = `display:grid;grid-template-columns:repeat(3,${W}px);gap:${gap}px;justify-content:center;`;
        const titleStyle = `font-size:9pt;font-weight:700;color:#7b0000;text-align:center;margin-bottom:6px;letter-spacing:0.03em;font-family:sans-serif;`;
        const subStyle = `font-size:7pt;color:#888;text-align:center;margin-bottom:8px;font-family:sans-serif;`;

        pagesHtml += `
          <div style="${pageStyle}">
            <div style="${titleStyle}">ISABELA EAST CENTRAL ELEMENTARY SCHOOL — Student ID (FRONTS)</div>
            <div style="${subStyle}">Batch ${p+1} of ${pagesNeeded} • ${chunk.length} IDs • Print on Folio (8.5×13in)</div>
            <div style="${gridStyle}">${frontsGrid}</div>
          </div>
          <div style="${pageStyle}">
            <div style="${titleStyle}">ISABELA EAST CENTRAL ELEMENTARY SCHOOL — Student ID (BACKS)</div>
            <div style="${subStyle}">Batch ${p+1} of ${pagesNeeded} • Align with corresponding FRONTS page before cutting</div>
            <div style="${gridStyle}">${backsGrid}</div>
          </div>`;
      }

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>IECES Student IDs (${queue.length} learners)</title>
<style>
  @page { size: 8.5in 13in; margin: 0.3in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; font-family: system-ui, sans-serif; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>${pagesHtml}</body>
</html>`;

      const win = window.open("", "_blank", "width=900,height=1200,menubar=no,toolbar=no,location=no");
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 1200);
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="dash-card" style={{ textAlign: "center", padding: "40px" }}>
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
            Wallet-size IDs (2.125 × 3.375 in) — 9 per folio sheet.
            For 40 learners: <strong>5 folio sheets</strong> (front + back pages per batch).
          </p>
        </div>
        <div className="dash-form">

          {/* ── Print Mode ── */}
          <div>
            <label className="adv-label">Print Mode</label>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "4px" }}>
              {[
                { v: "single", label: "🔖 Single Learner" },
                { v: "class",  label: "📋 By Class / Adviser" },
                { v: "all",    label: "🏫 All Learners" },
              ].map(({ v, label }) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.86rem", fontWeight: "600", color: printMode === v ? "#7b1a1a" : "#444" }}>
                  <input type="radio" name="printMode" value={v} checked={printMode === v} onChange={() => setPrintMode(v)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* ── Learner select (single mode) ── */}
          {printMode === "single" && (
            <div>
              <label className="adv-label">Select Learner</label>
              <select
                className="table-select"
                style={{ width: "100%", padding: "8px" }}
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {learners.length === 0 && <option value="">No learners found</option>}
                {learners.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.family_name}, {st.first_name} — {st.lrn || "No LRN"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Adviser filter (class mode) ── */}
          {printMode === "class" && (
            <div>
              <label className="adv-label">Filter by Adviser / Class</label>
              <select
                className="table-select"
                style={{ width: "100%", padding: "8px" }}
                value={filterAdviser}
                onChange={(e) => setFilterAdviser(e.target.value)}
              >
                <option value="">-- Select Adviser --</option>
                {advisers.map((aid) => {
                  const count = learners.filter((l) => String(l.adviser_id) === String(aid)).length;
                  return (
                    <option key={aid} value={aid}>
                      Adviser ID: {aid} — {count} learner{count !== 1 ? "s" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* ── Queue summary ── */}
          {printQueue.length > 0 && (
            <div style={{ padding: "10px 14px", background: "#fef9ee", border: "1px solid #e8c84a", borderRadius: "8px", fontSize: "0.84rem", color: "#7a5a00" }}>
              📄 <strong>{printQueue.length}</strong> learner ID{printQueue.length !== 1 ? "s" : ""} selected →{" "}
              <strong>{pagesNeeded * 2}</strong> print pages ({pagesNeeded} fronts + {pagesNeeded} backs) →{" "}
              <strong>{pagesNeeded}</strong> folio sheet{pagesNeeded !== 1 ? "s" : ""} needed (duplex)
            </div>
          )}

          {/* Auto-derived fields (single mode) */}
          {printMode === "single" && (
            <div className="form-row three-col">
              <div>
                <label className="adv-label">Enrolled SY (auto)</label>
                <input readOnly className="table-select readonly-input" style={{ width: "100%", padding: "8px" }} value={enrolledSY || "(not recorded)"} />
              </div>
              <div>
                <label className="adv-label">Validity (auto)</label>
                <input readOnly className="table-select readonly-input" style={{ width: "100%", padding: "8px" }} value={validity} />
              </div>
              <div>
                <label className="adv-label">Student ID (auto)</label>
                <input readOnly className="table-select readonly-input" style={{ width: "100%", padding: "8px", fontFamily: "monospace" }} value={studentIdFmt} />
              </div>
            </div>
          )}

          {/* Principal + Save */}
          <div className="form-row" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
            <div>
              <label className="adv-label">Principal Name</label>
              <input
                type="text" className="table-select"
                style={{ width: "100%", padding: "8px", textTransform: "uppercase" }}
                value={principalName}
                onChange={(e) => setPrincipalName(e.target.value)}
                placeholder="e.g. Jocelyn R. Buenaventura"
              />
            </div>
            <div>
              <label className="adv-label">Principal Position</label>
              <select className="table-select" style={{ width: "100%", padding: "8px" }} value={principalPos} onChange={(e) => setPrincipalPos(e.target.value)}>
                {PRINCIPAL_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <button
                onClick={savePrincipal}
                style={{ padding: "8px 18px", background: savedMsg ? "#16a34a" : "#7b1a1a", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap", transition: "background 0.2s", height: "36px" }}
              >
                {savedMsg || "💾 Save Principal"}
              </button>
            </div>
          </div>

          {/* Print button */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            {printing && <span style={{ fontSize: "0.82rem", color: "#7b1a1a", fontWeight: "600" }}>Preparing print…</span>}
            <button
              onClick={handlePrint}
              disabled={printing || printQueue.length === 0}
              style={{
                padding: "10px 28px",
                background: printing || printQueue.length === 0 ? "#ccc" : "linear-gradient(135deg,#7b1a1a,#5a1010)",
                color: "#f5c518", border: "none", borderRadius: "10px",
                fontWeight: "800", fontSize: "0.88rem", cursor: printing || printQueue.length === 0 ? "not-allowed" : "pointer",
                letterSpacing: "0.04em", boxShadow: "0 4px 12px rgba(123,26,26,0.3)",
              }}
            >
              🖨️ Print {printQueue.length > 1 ? `${printQueue.length} IDs` : "ID"} — Folio (8.5 × 13 in)
            </button>
          </div>
        </div>
      </div>

      {/* ── ID Preview (single mode) ── */}
      <div ref={printRef} style={{ display: "none" }} aria-hidden>
        <QRCodeSVG value={qrPayload} size={68} level="M" />
      </div>

      {printMode === "single" && (
        <div style={{ display: "flex", gap: "32px", justifyContent: "center", flexWrap: "wrap", padding: "20px 0" }}>
          <IdCards front={frontData} back={backData} card={cardStyle} />
        </div>
      )}

      {printMode !== "single" && printQueue.length > 0 && (
        <div className="dash-card">
          <p style={{ fontSize: "0.85rem", color: "#555", textAlign: "center", padding: "12px 0" }}>
            Preview shows single-learner mode only. Click Print to render all {printQueue.length} IDs.
          </p>
        </div>
      )}
    </div>
  );
}
