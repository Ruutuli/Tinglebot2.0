/* ============================================================================ */
/* ------------------- String Utilities ------------------- */
/* ============================================================================ */

/* [string-utils.ts]✨ Capitalize first letter of a string - */
export function capitalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const ALL_VILLAGES = ["Rudania", "Inariko", "Vhintl"];

/* [string-utils.ts]✨ Format locations for display: "All" when all 3 villages, else comma‑separated, each capitalized - */
export function formatLocationsDisplay(locations: string[] | null | undefined): string {
  if (!locations?.length) return "";
  const flattened = locations.flatMap((s) =>
    s.trim().toLowerCase() === "multiple"
      ? [...ALL_VILLAGES]
      : s.split(",").map((x) => x.trim()).filter(Boolean)
  );
  const normalized = [...new Set(flattened.map((v) => capitalize(v)))];
  const hasAllThree = ALL_VILLAGES.every((v) => normalized.includes(v)) && normalized.length === 3;
  if (hasAllThree) return "All";
  return normalized.join(", ");
}

/* [string-utils.ts]✨ Create URL-friendly slug from name - */
export function createSlug(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}
