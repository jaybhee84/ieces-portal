import { calcBMI, getBMIStatus, getHAZStatus } from "./growth/bmi";

const abbreviatedLegacyName = (value) => {
  const name = String(value || "").trim();
  if (!name) return "Unnamed learner";

  if (name.includes(",")) {
    const [family, ...givenParts] = name.split(",");
    const givenTokens = givenParts.join(",").trim().split(/\s+/).filter(Boolean);
    if (givenTokens.length <= 1) return name;
    return `${family.trim()}, ${givenTokens[0]} ${givenTokens
      .slice(1)
      .map((token) => `${token.charAt(0).toUpperCase()}.`)
      .join(" ")}`;
  }

  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return name;
  return [
    tokens[0],
    ...tokens.slice(1, -1).map((token) => `${token.charAt(0).toUpperCase()}.`),
    tokens.at(-1),
  ].join(" ");
};

export const learnerDisplayName = (learner) => {
  if (learner?.family_name || learner?.first_name) {
    const middle = String(learner.middle_name || "").trim();
    const givenNames = [
      learner.first_name,
      middle ? `${middle.charAt(0).toUpperCase()}.` : "",
      learner.suffix,
    ]
      .filter(Boolean)
      .join(" ");
    return [learner.family_name, givenNames].filter(Boolean).join(", ");
  }
  return abbreviatedLegacyName(learner?.name);
};

export const learnerLrn = (learner) =>
  learner?.lrn && learner.lrn !== "—"
    ? learner.lrn
    : "—";

export const learnerGradeLabel = (learner) => {
  const raw = learner?.grade_level || learner?.grade || learner?.gradeLevel;
  if (raw !== null && raw !== undefined && raw !== "") {
    const value = String(raw).trim();
    if (value === "0" || value.toUpperCase().startsWith("KINDER")) {
      return "Kinder";
    }
    if (/^[1-6]$/.test(value)) return `Grade ${value}`;
    return value;
  }

  const section = String(learner?.section || "").trim();
  const match = section.match(/^(KINDER(?:GARTEN)?|GRADE\s*[1-6]|SNED|SPED)/i);
  return match?.[1] || "—";
};

export const learnerGenderLabel = (learner) => {
  const value = String(learner?.gender || learner?.sex || "")
    .trim()
    .toUpperCase();
  if (["M", "MALE", "BOY"].includes(value)) return "Male";
  if (["F", "FEMALE", "GIRL"].includes(value)) return "Female";
  return value || "—";
};

export const displayBirthdate = (value) => {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

export const learnerAge = (learner) => {
  const birthdateValue =
    learner?.birthdate ||
    learner?.birth_date ||
    learner?.date_of_birth ||
    learner?.bdate;
  if (birthdateValue) {
    const parts = String(birthdateValue).slice(0, 10).split("-").map(Number);
    const birthdate = parts.length === 3
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date(birthdateValue);
    if (!Number.isNaN(birthdate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birthdate.getFullYear();
      if (
        today.getMonth() < birthdate.getMonth() ||
        (today.getMonth() === birthdate.getMonth() &&
          today.getDate() < birthdate.getDate())
      ) {
        age -= 1;
      }
      if (age >= 0) return age;
    }
  }

  if (
    learner?.age !== null &&
    learner?.age !== undefined &&
    learner?.age !== ""
  ) {
    return learner.age;
  }
  return "—";
};

export const learnerBarangay = (learner) => {
  if (learner?.barangay) return learner.barangay;
  const match = String(learner?.address || "").match(/Brgy\.\s*([^,]+)/i);
  return match?.[1]?.trim() || learner?.address || "—";
};

const normalizedRecords = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "object") return [value];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? [parsed]
        : [];
  } catch {
    return [];
  }
};

const latestMeasurement = (learner) => {
  const records = normalizedRecords(learner?.records).filter(
    (record) => record?.weight || record?.height,
  );
  if (!records.length && (learner?.weight || learner?.height)) return learner;
  return records
    .sort((left, right) =>
      String(left.date || "").localeCompare(String(right.date || "")),
    )
    .at(-1);
};

export const learnerNutrition = (learner) => {
  const record = latestMeasurement(learner) || {};
  const sex = String(learner?.gender || learner?.sex || "")
    .trim()
    .toUpperCase()
    .startsWith("F")
    ? "F"
    : "M";
  const fallbackMonths =
    Number(learner?.age) > 0 ? Number(learner.age) * 12 : undefined;
  const bmiValue = calcBMI(record.weight, record.height);
  const computedBmi = getBMIStatus(
    bmiValue,
    sex,
    learner?.birthdate,
    record.date,
    fallbackMonths,
  )?.label;
  const computedHfa = getHAZStatus(
    record.height,
    sex,
    learner?.birthdate,
    record.date,
    fallbackMonths,
  )?.label;
  return {
    bmi:
      learner?.bmi_status ||
      record.bmi_status ||
      record.status?.label ||
      record.baz?.label ||
      computedBmi ||
      "—",
    hfa:
      learner?.hfa_status ||
      learner?.haz_status ||
      record.hfa_status ||
      record.haz_status ||
      record.haz?.label ||
      computedHfa ||
      "—",
  };
};

export const nutritionBadgeClass = (status) => {
  const value = String(status || "").toLowerCase();
  if (value.includes("severely") || value === "obese") {
    return "bg-red-100 text-red-800 border-red-200";
  }
  if (
    value === "wasted" ||
    value === "stunted" ||
    value === "overweight"
  ) {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (value === "—") return "bg-slate-100 text-slate-500 border-slate-200";
  return "bg-green-100 text-green-800 border-green-200";
};
