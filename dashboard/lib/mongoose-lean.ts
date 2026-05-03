/**
 * Mongoose `.lean()` result types are often inferred as `Doc | Doc[]`, which breaks property access.
 * Normalizes to a single document or null (uses first element if an array).
 */
export function leanOne<T>(raw: unknown): T | null {
  if (raw == null) return null;
  const one = Array.isArray(raw) ? raw[0] : raw;
  if (one == null || typeof one !== "object") return null;
  return one as T;
}
