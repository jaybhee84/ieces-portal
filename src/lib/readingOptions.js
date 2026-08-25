export const PHILIRI_READING_CATEGORIES = [
  { value: "NGS", label: "Non-Grade Level / Non-Standard (NGS)" },
  { value: "FF", label: "Frustration — Filipino (FF)" },
  { value: "FE", label: "Frustration — English (FE)" },
  { value: "IF", label: "Instructional — Filipino (IF)" },
  { value: "IE", label: "Instructional — English (IE)" },
  { value: "INDF", label: "Independent — Filipino (INDF)" },
  { value: "INDE", label: "Independent — English (INDE)" },
  { value: "NA", label: "Not Yet Assessed (NA)" },
];

export const philIriLabel = (value) =>
  PHILIRI_READING_CATEGORIES.find((category) => category.value === value)?.label ||
  value ||
  "Not recorded";
