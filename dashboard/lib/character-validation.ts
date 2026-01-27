// ============================================================================
// ------------------- Character creation validation -------------------
// Shared helpers for client and create handler. Server remains source of truth.
// ============================================================================

export const DEFAULT_HEARTS = 3;
export const DEFAULT_STAMINA = 5;
export const MAX_FILE_BYTES = 7 * 1024 * 1024; // 7MB
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export const VIRTUES = ["Power", "Wisdom", "Courage"] as const;
export const VILLAGES = ["Inariko", "Rudania", "Vhintl"] as const;

export type ValidationResult = { ok: true } | { ok: false; error: string };

// ------------------- Required fields -------------------
export function validateRequired(
  obj: Record<string, unknown>,
  keys: string[]
): ValidationResult {
  for (const k of keys) {
    const v = obj[k];
    if (v == null || (typeof v === "string" && v.trim() === "")) {
      return { ok: false, error: `Missing required field: ${k}` };
    }
  }
  return { ok: true };
}

// ------------------- Age ≥ 1 -------------------
export function validateAge(value: unknown): ValidationResult {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 1) {
    return { ok: false, error: "Age must be an integer ≥ 1" };
  }
  return { ok: true };
}

// ------------------- Height > 0 -------------------
export function validateHeight(value: unknown): ValidationResult {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (Number.isNaN(n) || n <= 0) {
    return { ok: false, error: "Height must be a number > 0" };
  }
  return { ok: true };
}

// ------------------- Hearts ≥ 1 (default 3) -------------------
export function validateHearts(value: unknown): ValidationResult {
  const n =
    value == null || value === ""
      ? DEFAULT_HEARTS
      : typeof value === "number"
        ? value
        : parseInt(String(value), 10);
  const v = Number.isNaN(n) ? DEFAULT_HEARTS : n;
  if (!Number.isInteger(v) || v < 1) {
    return { ok: false, error: `Hearts must be an integer ≥ 1 (default ${DEFAULT_HEARTS})` };
  }
  return { ok: true };
}

// ------------------- Stamina ≥ 1 (default 5) -------------------
export function validateStamina(value: unknown): ValidationResult {
  const n =
    value == null || value === ""
      ? DEFAULT_STAMINA
      : typeof value === "number"
        ? value
        : parseInt(String(value), 10);
  const v = Number.isNaN(n) ? DEFAULT_STAMINA : n;
  if (!Number.isInteger(v) || v < 1) {
    return { ok: false, error: `Stamina must be an integer ≥ 1 (default ${DEFAULT_STAMINA})` };
  }
  return { ok: true };
}

// ------------------- Optional URL (app link) -------------------
export function validateAppLink(value: unknown): ValidationResult {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return { ok: true };
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol)) {
      return { ok: false, error: "App link must be http or https" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Invalid URL for app link" };
  }
}

// ------------------- File types (JPEG, PNG, GIF, WebP) -------------------
export function validateFileTypes(
  files: { type?: string }[],
  allowed: readonly string[] = ALLOWED_IMAGE_TYPES
): ValidationResult {
  const set = new Set(allowed);
  for (const f of files) {
    const t = (f.type || "").toLowerCase();
    if (!t || !set.has(t)) {
      return { ok: false, error: `Invalid file type. Allowed: ${allowed.join(", ")}` };
    }
  }
  return { ok: true };
}

// ------------------- File size ≤ maxBytes per file -------------------
export function validateFileSizes(
  files: { size?: number }[],
  maxBytes: number = MAX_FILE_BYTES
): ValidationResult {
  for (const f of files) {
    const s = typeof f.size === "number" ? f.size : 0;
    if (s > maxBytes) {
      return { ok: false, error: `File size must be ≤ ${maxBytes / 1024 / 1024}MB per file` };
    }
  }
  return { ok: true };
}

// ------------------- Value in allowed list -------------------
export function validateOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string
): ValidationResult {
  const s = (typeof value === "string" ? value : String(value ?? "")).trim();
  if (!s) return { ok: false, error: `Missing or invalid ${fieldName}` };

  const allowedStrings = allowed as readonly string[];
  if (allowedStrings.includes(s)) return { ok: true };

  // Be tolerant of legacy casing/whitespace (e.g. "inariko" vs "Inariko").
  const lower = s.toLowerCase();
  const ok = allowedStrings.some((a) => a.toLowerCase() === lower);
  return ok ? { ok: true } : { ok: false, error: `Invalid ${fieldName}` };
}

// ------------------- Virtue -------------------
export function validateVirtue(value: unknown): ValidationResult {
  return validateOneOf(value, VIRTUES, "virtue");
}

// ------------------- Race, village, job (allowed from bootstrap) -------------------
export function validateRace(value: unknown, allowed: string[]): ValidationResult {
  return allowed.length ? validateOneOf(value, allowed, "race") : validateRequired({ race: value }, ["race"]);
}

export function validateVillage(value: unknown, allowed: string[]): ValidationResult {
  return allowed.length ? validateOneOf(value, allowed, "village") : validateRequired({ village: value }, ["village"]);
}

export function validateJob(value: unknown, allowed: string[]): ValidationResult {
  return allowed.length ? validateOneOf(value, allowed, "job") : validateRequired({ job: value }, ["job"]);
}
