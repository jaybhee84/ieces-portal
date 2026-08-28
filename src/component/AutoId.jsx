import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { QRCodeSVG } from "qrcode.react";
import idTemplate from "../image/id-template.png";
import {
  adviserGradeKey,
  isOrgAdviser,
  learnerBelongsToOrgAdviser,
  legacyProfileIdsForOrgAdviser,
  orgAdviserName,
} from "../lib/orgAdvisers";
import { loadAdvisoryRoster } from "../lib/advisoryRosterData";

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
    const startYear = +single[1];
    return `S.Y. ${startYear} – ${startYear + 1}`;
  }
  return null;
}
function currentSchoolYearValidity() {
  const today = new Date();
  const year = today.getFullYear();
  const startYear = today.getMonth() >= 5 ? year : year - 1;
  return `S.Y. ${startYear} – ${startYear + 1}`;
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
  const gradeKey = adviserGradeKey(rawGrade);
  const gradeNum = /^[1-6]$/.test(gradeKey) ? Number(gradeKey) : null;
  const isKinder = gradeKey === "0";
  let secStr = String(rawSection || "UNASSIGNED").trim();
  secStr =
    secStr.replace(/^(GRADE\s*(?:[1-6]|VI|IV|V|III|II|I)|KINDER)\s*[-–—]\s*/i, "").trim() || secStr;
  if (isKinder) {
    const sessionMatch = secStr.match(/\s*[-–—]\s*(MORNING|AFTERNOON)(?:\s+SESSION)?$/i);
    const session = sessionMatch
      ? `${sessionMatch[1].charAt(0).toUpperCase()}${sessionMatch[1].slice(1).toLowerCase()} Session`
      : "";
    const adviser = sessionMatch
      ? secStr.slice(0, sessionMatch.index).trim()
      : secStr;
    return [`Kinder - ${adviser}`, session].filter(Boolean).join("\n");
  }
  if (gradeNum) return `Grade ${gradeNum} - ${secStr}`;
  const gradeLabel = String(rawGrade || "Grade").trim();
  return `${gradeLabel} - ${secStr}`;
}
function gradeTag(rawGrade) {
  const gradeKey = adviserGradeKey(rawGrade);
  if (gradeKey === "0") return "GK";
  return /^[1-6]$/.test(gradeKey) ? `G${gradeKey}` : "G";
}
function learnerNameFontSize(name) {
  const length = String(name || "").length;
  if (length > 36) return 11.5;
  if (length > 26) return 13.5;
  return 16;
}
function gradeSectionFontSize(rawGrade, rawSection) {
  // Keep Kinder's two-line adviser/session label compact. Other grade labels
  // can be more prominent, while long section names step down to avoid clipping.
  if (adviserGradeKey(rawGrade) === "0") return 9.5;
  const sectionLength = String(rawSection || "UNASSIGNED").trim().length;
  if (sectionLength > 24) return 9.5;
  if (sectionLength > 17) return 10.5;
  return 11.5;
}
const CARD_WIDTH = 350;
// Each half of id-template.png is 768 × 1024 (3:4). Preserve that ratio.
const CARD_HEIGHT = CARD_WIDTH * (1024 / 768);
const VERTICAL_SCALE = CARD_HEIGHT / 530;

const ov = (top, left, width, height, extra = {}) => ({
  position: "absolute",
  top: `${top * VERTICAL_SCALE}px`,
  left: `${left}px`,
  ...(width !== undefined ? { width: `${width}px` } : {}),
  ...(height !== undefined ? { height: `${height * VERTICAL_SCALE}px` } : {}),
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
          style={ov(145, 23, 121, 176, {
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "#fff",
            border: "5px solid #D4AF37",
            boxSizing: "border-box",
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
                objectPosition: "center top",
                display: "block",
                backgroundColor: "#fff",
              }}
            />
          )}
        </div>
        {/* LRN */}
        <div
          style={ov(183, 190, 140, undefined, {
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
          style={ov(212, 229, 110, undefined, {
            fontSize: `${front.gradeSectionFontSize}px`,
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
            whiteSpace: "pre-line",
            overflow: "hidden",
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
            fontSize: `${learnerNameFontSize(front.fullName)}px`,
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
        <div style={ov(434, 22, 306, undefined, { textAlign: "center" })}>
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
// Preserve the PNG's 3:4 ratio at 3.375in high: 2.53125 × 3.375in.
// Three cards still fit across the 7.9in printable width of folio paper.
const PRINT_SCALE = 324 / CARD_HEIGHT;
// Folio @page: 8.5×13in, margin 0.3in → printable 7.9×12.4in
// 3 cols × 3 rows = 9 IDs per page side
const IDS_PER_PAGE = 9;
const MAX_PRINT_IDS = 3;

const rosterMembershipKey = (rows) =>
  rows
    .map((adviser) =>
      `${String(adviser.id)}:${(adviser.learners || [])
        .map((learner) => String(learner.id))
        .sort()
        .join(",")}`,
    )
    .sort()
    .join("|");

// ─── Component ────────────────────────────────────────────────────────────────
export function AutoId({ profile }) {
  const [learners, setLearners] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedThreeIds, setSelectedThreeIds] = useState([]);
  const [printMode, setPrintMode] = useState("single"); // "single" | "double" | "triple" | "class"
  const [printMethod, setPrintMethod] = useState("ordinary");
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
  const refreshTimerRef = useRef(null);
  const rosterMembershipRef = useRef("");

  useEffect(() => {
    fetchLearners();
  }, [profile?.id, profile?.first_name, profile?.family_name, profile?.role]);

  useEffect(() => {
    const channel = supabase
      .channel(`auto_id_learners:${profile?.id || "anonymous"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students" },
        () => {
          window.clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = window.setTimeout(fetchLearners, 300);
        },
      )
      .subscribe();

    return () => {
      window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.first_name, profile?.family_name, profile?.role]);

  const fetchLearners = async () => {
    setLoading(true);
    try {
      const [studentResult, orgResult, profileResult, portalResult] = await Promise.all([
        supabase
          .from("students")
          .select("*")
          .eq("school_id", "126001")
          .order("family_name", { ascending: true }),
        supabase.from("org_chart").select("*"),
        supabase.from("profiles").select("*"),
        supabase.from("portal_profile").select("*"),
      ]);

      if (studentResult.error) throw studentResult.error;
      if (orgResult.error) throw orgResult.error;

      const schoolLearners = studentResult.data || [];
      const legacyProfiles = [
        ...(profileResult.data || []),
        ...(portalResult.data || []),
      ];
      const gradeOrder = (value) => {
        const key = adviserGradeKey(value);
        return key === "0" ? 0 : key === "SNED" ? 7 : Number(key) || 8;
      };
      const orgAdvisers = (orgResult.data || []).filter(isOrgAdviser);
      const allAdviserRows = orgAdvisers
        .map((adviser) => {
          const legacyIds = legacyProfileIdsForOrgAdviser(adviser, legacyProfiles);
          return {
            ...adviser,
            learners: schoolLearners.filter((learner) =>
              learnerBelongsToOrgAdviser(
                learner,
                adviser,
                legacyIds,
                orgAdvisers.map((item) => item.id),
              ),
            ),
          };
        })
        .sort(
          (left, right) =>
            gradeOrder(left.grade_level) - gradeOrder(right.grade_level) ||
            orgAdviserName(left).localeCompare(orgAdviserName(right)),
        );

      const role = String(profile?.role || "").toLowerCase();
      let adviserRows = allAdviserRows;

      if (role !== "admin") {
        const rosterResult = await loadAdvisoryRoster(
          profile,
          // Auto ID is class-scoped for every non-admin user. Grade chairmen
          // may see the whole grade elsewhere, but their ID list must contain
          // only learners assigned to their own advisory class.
          false,
        );
        if (rosterResult.error) throw rosterResult.error;

        if (!rosterResult.orgAdviser) {
          adviserRows = [];
        } else {
          adviserRows = [
            {
              ...(allAdviserRows.find(
                (adviser) =>
                  String(adviser.id) === String(rosterResult.orgAdviser.id),
              ) || rosterResult.orgAdviser),
              learners: rosterResult.students,
            },
          ];
        }
      }

      setLearners(schoolLearners);
      setAdvisers(adviserRows);

      const nextMembership = rosterMembershipKey(adviserRows);
      if (rosterMembershipRef.current !== nextMembership) {
        rosterMembershipRef.current = nextMembership;
        if (adviserRows.length > 0) {
          setFilterAdviser(String(adviserRows[0].id));
          setSelectedId(adviserRows[0].learners[0]?.id || "");
          setSelectedThreeIds(
            adviserRows[0].learners
              .slice(0, MAX_PRINT_IDS)
              .map((learner) => String(learner.id)),
          );
        } else {
          setFilterAdviser("");
          setSelectedId("");
          setSelectedThreeIds([]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const selectedAdviser = advisers.find(
    (adviser) => String(adviser.id) === String(filterAdviser),
  );
  const adviserLearners = selectedAdviser?.learners || [];

  useEffect(() => {
    if (!adviserLearners.some((learner) => String(learner.id) === String(selectedId))) {
      setSelectedId(adviserLearners[0]?.id || "");
    }
    setSelectedThreeIds((current) => {
      const validIds = current.filter((id) =>
        adviserLearners.some((learner) => String(learner.id) === String(id)),
      );
      const nextIds = [...new Set(validIds)];
      for (const learner of adviserLearners) {
        if (nextIds.length >= MAX_PRINT_IDS) break;
        const learnerId = String(learner.id);
        if (!nextIds.includes(learnerId)) nextIds.push(learnerId);
      }
      return nextIds.slice(0, MAX_PRINT_IDS);
    });
  }, [filterAdviser, advisers, selectedId]);

  const savePrincipal = () => {
    localStorage.setItem(LS_KEY_NAME, principalName);
    localStorage.setItem(LS_KEY_POS, principalPos);
    setSavedMsg("✓ Saved!");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  // ── Derived single-learner values ─────────────────────────────────────────
  const idx = learners.findIndex((l) => String(l.id) === String(selectedId));
  const raw = learners[idx] || {};

  const buildPreviewCardData = (learnerRaw, learnerIdx) => {
    const effectiveGrade =
      selectedAdviser?.grade_level ||
      learnerRaw.grade_level ||
      learnerRaw.grade ||
      learnerRaw.gradeLevel;
    const enrolledSY = learnerRaw.school_year || learnerRaw.sy || null;
    const validity =
      deriveValidity(enrolledSY) ||
      currentSchoolYearValidity();
    const yearToken = deriveYearToken(enrolledSY);
    const gt = gradeTag(effectiveGrade);
    const seqNum = String(learnerIdx >= 0 ? learnerIdx + 1 : 1).padStart(
      4,
      "0",
    );
    const studentIdFmt = `${yearToken}-${gt}-${seqNum}`;
    const fullName = formatName(
      learnerRaw.first_name,
      learnerRaw.middle_name,
      learnerRaw.family_name,
      learnerRaw.suffix || learnerRaw.name_suffix,
    );
    const gradeSectionStr = formatGradeSection(
      effectiveGrade,
      learnerRaw.section,
    );
    const address = learnerRaw.address || "Isabela City, Basilan";
    const guardName = (
      learnerRaw.guardian_name ||
      learnerRaw.father_name ||
      learnerRaw.mother_name ||
      "N/A"
    ).toUpperCase();
    const guardRel = (
      learnerRaw.guardian_relationship || "PARENT/GUARDIAN"
    ).toUpperCase();
    const contactNum = learnerRaw.contact_number || "N/A";
    const lrn = learnerRaw.lrn || "";
    const photoUrl = learnerRaw.photo_url || null;
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

    return {
      enrolledSY,
      validity,
      studentIdFmt,
      front: {
        lrn,
        studentIdFmt,
        gradeSectionStr,
        gradeSectionFontSize: gradeSectionFontSize(
          effectiveGrade,
          learnerRaw.section,
        ),
        fullName,
        photoUrl,
        principalName: principalName.toUpperCase(),
        principalPos,
      },
      back: { address, guardName, guardRel, contactNum, qrPayload },
    };
  };

  const selectedPreview = buildPreviewCardData(raw, idx);
  const { enrolledSY, validity, studentIdFmt } = selectedPreview;
  const frontData = selectedPreview.front;
  const backData = selectedPreview.back;
  const qrPayload = backData.qrPayload;

  const cardStyle = (bgPos) => ({
    width: `${CARD_WIDTH}px`, height: `${CARD_HEIGHT}px`,
    backgroundImage: `url(${idTemplate})`,
    backgroundPosition: bgPos, backgroundSize: `${CARD_WIDTH * 2}px ${CARD_HEIGHT}px`,
    backgroundRepeat: "no-repeat", position: "relative",
    borderRadius: "16px", boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
    overflow: "hidden", flexShrink: 0,
  });

  // ── Build HTML for one card (front or back) at print scale ───────────────
  const buildCardHtml = (templateDataUrl, learnerRaw, learnerIdx, side) => {
    const sy = learnerRaw.school_year || learnerRaw.sy || null;
    const yt = deriveYearToken(sy);
    const effectiveLearnerGrade =
      selectedAdviser?.grade_level ||
      learnerRaw.grade_level ||
      learnerRaw.grade ||
      learnerRaw.gradeLevel;
    const g = gradeTag(effectiveLearnerGrade);
    const seq = String(learnerIdx + 1).padStart(4, "0");
    const idFmt = `${yt}-${g}-${seq}`;
    const fn = formatName(learnerRaw.first_name, learnerRaw.middle_name, learnerRaw.family_name, learnerRaw.suffix || learnerRaw.name_suffix);
    const gsSec = formatGradeSection(effectiveLearnerGrade, learnerRaw.section);
    const gradeSectionFs = `${Math.round(gradeSectionFontSize(effectiveLearnerGrade, learnerRaw.section) * PRINT_SCALE * 100) / 100}px`;
    const addr = learnerRaw.address || "Isabela City, Basilan";
    const gname = (learnerRaw.guardian_name || learnerRaw.father_name || learnerRaw.mother_name || "N/A").toUpperCase();
    const grel = (learnerRaw.guardian_relationship || "PARENT/GUARDIAN").toUpperCase();
    const cnum = learnerRaw.contact_number || "N/A";
    const lrnNum = learnerRaw.lrn || "";
    const photo = learnerRaw.photo_url || null;
    const nameFs = `${Math.round(learnerNameFontSize(fn) * PRINT_SCALE * 100) / 100}px`;

    const S = PRINT_SCALE;
    const W = Math.round(CARD_WIDTH * S);
    const H = Math.round(CARD_HEIGHT * S);
    const bgPos = side === "front" ? "0px 0px" : `-${W}px 0px`;
    const bgW = Math.round(CARD_WIDTH * 2 * S);
    const bgH = Math.round(CARD_HEIGHT * S);

    const o = (t, l, w, h, s) =>
      `position:absolute;top:${Math.round(t*VERTICAL_SCALE*S)}px;left:${Math.round(l*S)}px;` +
      (w !== undefined ? `width:${Math.round(w*S)}px;` : "") +
      (h !== undefined ? `height:${Math.round(h*VERTICAL_SCALE*S)}px;` : "") + s;

    const cardBase = `width:${W}px;height:${H}px;background-image:url('${templateDataUrl}');` +
      `background-position:${bgPos};background-size:${bgW}px ${bgH}px;` +
      `background-repeat:no-repeat;position:relative;border-radius:${Math.round(16*S)}px;overflow:hidden;flex-shrink:0;`;

    if (side === "front") {
      const photoHtml = photo
        ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;background:#fff;" />`
        : "";
      return `<div style="${cardBase}">
        <div style="${o(145,23,121,176,"border:"+Math.max(1,Math.round(5*S))+"px solid #D4AF37;box-sizing:border-box;border-radius:"+Math.round(8*S)+"px;overflow:hidden;background:#fff;")}">
          ${photoHtml}
        </div>
        <div style="${o(183,190,140,undefined,"font-size:"+Math.round(10*S)+"px;font-weight:800;color:#111;font-family:monospace;letter-spacing:0.3px;line-height:1;")}">
          ${lrnNum}
        </div>
        <div style="${o(212,229,110,undefined,"font-size:"+Math.round(9.5*S)+"px;font-weight:800;color:#111;font-family:monospace;white-space:nowrap;line-height:1;")}">
          ${idFmt}
        </div>
        <div style="${o(264,137,182,40,"display:flex;align-items:center;justify-content:center;font-size:"+gradeSectionFs+";font-weight:900;color:#7b0000;text-align:center;line-height:1.2;padding:0 "+Math.round(4*S)+"px;white-space:pre-line;overflow:hidden;")}">
          ${gsSec.replace(/\n/g, "<br>")}
        </div>
        <div style="${o(358,22,306,37,"display:flex;align-items:center;justify-content:center;font-size:"+nameFs+";font-weight:900;color:#000;text-align:center;letter-spacing:0.3px;line-height:1.1;padding:0 "+Math.round(8*S)+"px;overflow:hidden;")}">
          ${fn}
        </div>
        <div style="${o(434,22,306,undefined,"text-align:center;")}">
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
      const qrPay = JSON.stringify({ lrn: lrnNum, studentId: idFmt, name: fn, gradeSection: gsSec, validity: deriveValidity(sy) || currentSchoolYearValidity(), address: addr, guardian: gname, contact: cnum, status: "VALID ID" });
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
    if (["double", "triple"].includes(printMode) && filterAdviser) {
      const requestedCount = printMode === "double" ? 2 : 3;
      return selectedThreeIds
        .slice(0, requestedCount)
        .map((id) =>
          adviserLearners.find(
            (learner) => String(learner.id) === String(id),
          ),
        )
        .filter(Boolean)
        .map((learner) => ({
          raw: learner,
          idx: learners.findIndex(
            (item) => String(item.id) === String(learner.id),
          ),
        }));
    }
    if (printMode === "class" && filterAdviser) {
      return adviserLearners.map((learner) => ({
        raw: learner,
        idx: learners.findIndex(
          (item) => String(item.id) === String(learner.id),
        ),
      }));
    }
    return [];
  };

  const printQueue = getPrintQueue();
  const pagesNeeded = Math.ceil(printQueue.length / IDS_PER_PAGE);
  const focusedPrintCount =
    printMode === "double" ? 2 : printMode === "triple" ? 3 : 1;
  const sheetsNeeded =
    printQueue.length === 0
      ? 0
      : ["single", "double", "triple"].includes(printMode) &&
          printMethod === "ordinary"
        ? 1
        : printMethod === "ordinary"
          ? pagesNeeded * 2
          : pagesNeeded;
  const hasValidPrintSelection =
    ["double", "triple"].includes(printMode)
      ? printQueue.length === focusedPrintCount
      : printQueue.length > 0;

  // ── Print handler ─────────────────────────────────────────────────────────
  const handlePrint = async () => {
    const queue = getPrintQueue();
    if (
      queue.length === 0 ||
      (["double", "triple"].includes(printMode) &&
        queue.length !== focusedPrintCount)
    ) {
      alert(
        ["double", "triple"].includes(printMode)
          ? `Please select ${focusedPrintCount} different learners for this print layout.`
          : "No learners selected for printing.",
      );
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
      const W = Math.round(CARD_WIDTH * PRINT_SCALE);
      const H = Math.round(CARD_HEIGHT * PRINT_SCALE);
      const gap = 6; // px between cards

      // Build pages: each page holds up to 9 fronts (3×3), then 9 backs (3×3).
      let frontPagesHtml = "";
      let backPagesHtml = "";
      let interleavedPagesHtml = "";

      for (let p = 0; p < pagesNeeded; p++) {
        const chunk = queue.slice(p * IDS_PER_PAGE, (p + 1) * IDS_PER_PAGE);

        // Fronts page
        let frontsGrid = "";
        chunk.forEach(({ raw: r, idx: i }) => {
          frontsGrid += `<div style="display:inline-block;">${buildCardHtml(templateDataUrl, r, i, "front")}</div>`;
        });

        // Cut-and-stick uses the same position order on separate sheets.
        // Long-edge duplex mirrors every row so each back lands behind its front.
        let backsGrid = "";
        const backChunk =
          printMethod === "duplex"
            ? Array.from({ length: Math.ceil(chunk.length / 3) }, (_, row) =>
                chunk.slice(row * 3, row * 3 + 3).reverse(),
              ).flat()
            : chunk;
        backChunk.forEach(({ raw: r, idx: i }) => {
          backsGrid += `<div style="display:inline-block;">${buildCardHtml(templateDataUrl, r, i, "back")}</div>`;
        });

        const pageStyle = `width:7.9in;min-height:12.4in;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:0.15in;page-break-after:always;`;
        const gridStyle = `display:grid;grid-template-columns:repeat(3,${W}px);gap:${gap}px;justify-content:center;`;
        const titleStyle = `font-size:9pt;font-weight:700;color:#7b0000;text-align:center;margin-bottom:6px;letter-spacing:0.03em;font-family:sans-serif;`;
        const subStyle = `font-size:7pt;color:#888;text-align:center;margin-bottom:8px;font-family:sans-serif;`;

        const frontPage = `<div style="${pageStyle}">
            <div style="${titleStyle}">ISABELA EAST CENTRAL ELEMENTARY SCHOOL — Student ID (FRONTS)</div>
            <div style="${subStyle}">Batch ${p+1} of ${pagesNeeded} • ${chunk.length} IDs • Print on Folio (8.5×13in)</div>
            <div style="${gridStyle}">${frontsGrid}</div>
          </div>`;
        const backPage = `<div style="${pageStyle}">
            <div style="${titleStyle}">ISABELA EAST CENTRAL ELEMENTARY SCHOOL — Student ID (BACKS)</div>
            <div style="${subStyle}">Batch ${p+1} of ${pagesNeeded} • ${
              printMethod === "ordinary"
                ? "Cut and attach to the matching front in the same numbered position"
                : "Long-edge duplex layout — back columns are mirrored for alignment"
            }</div>
            <div style="${gridStyle}">${backsGrid}</div>
          </div>`;

        frontPagesHtml += frontPage;
        backPagesHtml += backPage;
        interleavedPagesHtml += frontPage + backPage;
      }

      let pagesHtml =
        printMethod === "ordinary"
          ? frontPagesHtml + backPagesHtml
          : interleavedPagesHtml;

      // The focused single, double, and triple workflows use a compact layout. Ordinary
      // glossy paper places each front/back pair together; duplex paper uses
      // two aligned sides. Whole-class printing keeps the existing page flow.
      if (["single", "double", "triple"].includes(printMode)) {
        const focusedPageStyle = `width:7.9in;min-height:12.4in;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:0.15in;page-break-after:always;`;
        const focusedTitleStyle = `font-size:9pt;font-weight:700;color:#7b0000;text-align:center;margin-bottom:6px;letter-spacing:0.03em;font-family:sans-serif;`;
        const focusedSubStyle = `font-size:7pt;color:#888;text-align:center;margin-bottom:8px;font-family:sans-serif;`;

        if (printMethod === "ordinary") {
          const pairedCards = queue
            .map(
              ({ raw: learner, idx: learnerIdx }) =>
                `<div>${buildCardHtml(templateDataUrl, learner, learnerIdx, "front")}</div>` +
                `<div>${buildCardHtml(templateDataUrl, learner, learnerIdx, "back")}</div>`,
            )
            .join("");
          const pairedGridStyle = `display:grid;grid-template-columns:repeat(2,${W}px);gap:${gap}px;justify-content:center;`;
          pagesHtml = `<div style="${focusedPageStyle}">
            <div style="${focusedTitleStyle}">ISABELA EAST CENTRAL ELEMENTARY SCHOOL — Student IDs</div>
            <div style="${focusedSubStyle}">Ordinary glossy photo paper • Front and back are side by side • Cut and attach each pair</div>
            <div style="${pairedGridStyle}">${pairedCards}</div>
          </div>`;
        } else {
          const focusedFronts = queue
            .map(({ raw: learner, idx: learnerIdx }) => `<div>${buildCardHtml(templateDataUrl, learner, learnerIdx, "front")}</div>`)
            .join("");
          const focusedBacks = [...queue]
            .reverse()
            .map(({ raw: learner, idx: learnerIdx }) => `<div>${buildCardHtml(templateDataUrl, learner, learnerIdx, "back")}</div>`)
            .join("");
          const focusedGridStyle = `display:grid;grid-template-columns:repeat(${queue.length},${W}px);gap:${gap}px;justify-content:center;`;
          pagesHtml = `<div style="${focusedPageStyle}">
            <div style="${focusedTitleStyle}">ISABELA EAST CENTRAL ELEMENTARY SCHOOL — Student IDs (FRONTS)</div>
            <div style="${focusedSubStyle}">Duplex photo paper • Print this side first</div>
            <div style="${focusedGridStyle}">${focusedFronts}</div>
          </div>
          <div style="${focusedPageStyle}">
            <div style="${focusedTitleStyle}">ISABELA EAST CENTRAL ELEMENTARY SCHOOL — Student IDs (BACKS)</div>
            <div style="${focusedSubStyle}">Long-edge duplex alignment • Back order is mirrored</div>
            <div style="${focusedGridStyle}">${focusedBacks}</div>
          </div>`;
        }
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
            PNG-proportional IDs (2.53 × 3.375 in) — 9 per folio sheet.
            For 40 learners: <strong>5 folio sheets</strong> (front + back pages per batch).
          </p>
        </div>
        <div className="dash-form">

          {/* ── Print Mode ── */}
          <div>
            <label className="adv-label">Print Mode</label>
            <select
              className="table-select"
              style={{ width: "min(100%, 420px)", padding: "8px", marginTop: "4px" }}
              value={printMode}
              onChange={(e) => setPrintMode(e.target.value)}
            >
              <option value="single">Single — 1 ID</option>
              <option value="double">Double — 2 IDs</option>
              <option value="triple">Triple — 3 IDs</option>
              <option value="class">Whole Class</option>
            </select>
          </div>

          {/* ── Paper / assembly method ── */}
          <div>
            <label className="adv-label">Paper / Assembly Method</label>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "4px" }}>
              {[
                {
                  v: "ordinary",
                  label: "✂️ Ordinary Glossy Photo Paper",
                },
                {
                  v: "duplex",
                  label: "🔄 Double-Sided / Duplex Photo Paper",
                },
              ].map(({ v, label }) => (
                <label
                  key={v}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    fontSize: "0.86rem",
                    fontWeight: "600",
                    color: printMethod === v ? "#7b1a1a" : "#444",
                  }}
                >
                  <input
                    type="radio"
                    name="printMethod"
                    value={v}
                    checked={printMethod === v}
                    onChange={() => setPrintMethod(v)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* ── Learner select (single mode) ── */}
          {printMethod === "duplex" && (
            <div
              role="note"
              style={{
                width: "min(100%, 720px)",
                padding: "12px 14px",
                border: "1px solid #60a5fa",
                borderLeft: "4px solid #2563eb",
                borderRadius: "9px",
                background: "#eff6ff",
                color: "#1e3a8a",
                fontSize: "0.82rem",
                lineHeight: "1.5",
              }}
            >
              <div style={{ fontWeight: "800", marginBottom: "5px" }}>
                ℹ️ Manual duplex paper-loading guide
              </div>
              <div>
                1. Print the <strong>front page only</strong>. The top of the
                printed ID may come out at the far/bottom end of the output
                tray. 2. Pick up the sheet without rotating it, then flip it
                <strong> left to right</strong> like turning a book cover. 3.
                Reinsert the <strong>same physical edge that contains the top
                of the printed ID</strong> into the printer first. 4. Print the
                <strong> back page only</strong>.
              </div>
              <div style={{ marginTop: "5px", color: "#475569" }}>
                Printer trays differ; test one sheet first to confirm whether
                the printed side should face up or down.
              </div>
            </div>
          )}

          {printMode === "single" && (
            <div>
              <label className="adv-label">Class List</label>
              <select
                className="table-select"
                style={{ width: "min(100%, 520px)", padding: "8px" }}
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {adviserLearners.length === 0 && <option value="">No learners assigned to this adviser</option>}
                {adviserLearners.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.family_name}, {st.first_name} — {st.lrn || "No LRN"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Double / triple learner selectors */}
          {["double", "triple"].includes(printMode) && (
            <div>
              <label className="adv-label">
                Choose {focusedPrintCount} learners
              </label>
              <div className="form-row three-col">
                {Array.from({ length: focusedPrintCount }, (_, slot) => (
                  <select
                    key={slot}
                    className="table-select"
                    style={{ width: "100%", padding: "8px" }}
                    value={selectedThreeIds[slot] || ""}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedThreeIds((current) => {
                        const next = [...current];
                        next[slot] = nextId;
                        return next.filter(Boolean);
                      });
                    }}
                  >
                    <option value="">Select learner {slot + 1}</option>
                    {adviserLearners.map((st) => {
                      const isChosenElsewhere = selectedThreeIds.some(
                        (id, chosenSlot) =>
                          chosenSlot !== slot && String(id) === String(st.id),
                      );
                      return (
                        <option key={st.id} value={st.id} disabled={isChosenElsewhere}>
                          {st.family_name}, {st.first_name} — {st.lrn || "No LRN"}
                        </option>
                      );
                    })}
                  </select>
                ))}
              </div>
            </div>
          )}

          {/* ── Queue summary ── */}
          {printQueue.length > 0 && (
            <div style={{ padding: "10px 14px", background: "#fef9ee", border: "1px solid #e8c84a", borderRadius: "8px", fontSize: "0.84rem", color: "#7a5a00" }}>
              📄 <strong>{printQueue.length}</strong> learner ID{printQueue.length !== 1 ? "s" : ""} selected →{" "}
              {["single", "double", "triple"].includes(printMode) && printMethod === "ordinary" ? (
                <><strong>1</strong> print page with front/back pairs side by side → <strong>1</strong> sheet needed</>
              ) : (
                <>
                  <strong>{pagesNeeded * 2}</strong> print pages ({pagesNeeded} fronts + {pagesNeeded} backs) →{" "}
                  <strong>{printMethod === "ordinary" ? pagesNeeded * 2 : pagesNeeded}</strong> sheet
                  {(printMethod === "ordinary" ? pagesNeeded * 2 : pagesNeeded) !== 1 ? "s" : ""} needed ({printMethod === "ordinary" ? "ordinary glossy, cut & attach" : "manual duplex"})
                </>
              )}
            </div>
          )}
          {["double", "triple"].includes(printMode) &&
            printQueue.length < focusedPrintCount && (
            <div style={{ padding: "10px 14px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "8px", fontSize: "0.84rem", color: "#9a3412" }}>
              Select {focusedPrintCount} different learners before printing this layout.
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
          {printQueue.length > 0 && <div
            style={{
              width: "fit-content",
              maxWidth: "100%",
              padding: "9px 13px",
              border: "1px solid #e2b93b",
              borderLeft: "4px solid #b7791f",
              borderRadius: "8px",
              background: "#fff8dc",
              color: "#744210",
              fontSize: "0.82rem",
              fontWeight: "700",
            }}
          >
            📌 Sheets needed: <strong>{sheetsNeeded}</strong>
          </div>}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            {printing && <span style={{ fontSize: "0.82rem", color: "#7b1a1a", fontWeight: "600" }}>Preparing print…</span>}
            <button
              onClick={handlePrint}
              disabled={printing || !hasValidPrintSelection}
              style={{
                padding: "10px 28px",
                background: printing || !hasValidPrintSelection ? "#ccc" : "linear-gradient(135deg,#7b1a1a,#5a1010)",
                color: "#f5c518", border: "none", borderRadius: "10px",
                fontWeight: "800", fontSize: "0.88rem", cursor: printing || !hasValidPrintSelection ? "not-allowed" : "pointer",
                letterSpacing: "0.04em", boxShadow: "0 4px 12px rgba(123,26,26,0.3)",
              }}
            >
              Print ID
            </button>
          </div>
        </div>
      </div>

      {/* ── ID Preview ── */}
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
          <div className="dash-card-header">
            <h2>
              {printMode === "double"
                ? "Double ID Preview"
                : printMode === "triple"
                  ? "Triple ID Preview"
                  : "Whole Class ID Preview"}
            </h2>
            <p>
              Review the front and back of {printMode === "class"
                ? `all ${printQueue.length}`
                : `the ${focusedPrintCount}`} learner IDs before printing.
            </p>
          </div>
          <div style={{ display: "grid", gap: "24px" }}>
            {printQueue.map(({ raw: learner, idx: learnerIdx }, queueIdx) => {
              const preview = buildPreviewCardData(learner, learnerIdx);
              return (
                <div
                  key={learner.id || queueIdx}
                  style={{
                    padding: "18px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    background: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      marginBottom: "14px",
                      fontSize: "0.86rem",
                      fontWeight: "800",
                      color: "#334155",
                      textAlign: "center",
                    }}
                  >
                    {queueIdx + 1}. {preview.front.fullName}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "32px",
                      justifyContent: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <IdCards
                      front={preview.front}
                      back={preview.back}
                      card={cardStyle}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
