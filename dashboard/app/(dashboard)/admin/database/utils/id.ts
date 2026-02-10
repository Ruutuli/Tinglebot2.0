/** Get a stable string ID from _id. Handles string, ObjectId-like ({ $oid }), or object with toString. */
export function getItemId(id: unknown): string {
  if (typeof id === "string" && id) return id;
  if (id && typeof id === "object") {
    const o = id as Record<string, unknown>;
    const oid = o.$oid ?? o.oid;
    if (typeof oid === "string" && oid) return oid;
    if (typeof (id as { toString?: () => string }).toString === "function") {
      const s = (id as { toString: () => string }).toString();
      if (s && s !== "[object Object]") return s;
    }
  }
  return "";
}
