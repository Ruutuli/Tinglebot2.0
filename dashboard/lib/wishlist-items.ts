// ============================================================================
// Character wishlist: normalize client input and resolve to catalog itemName
// ============================================================================

import mongoose, { type Model } from "mongoose";

export const WISHLIST_MAX_ITEMS = 5;

/**
 * Next.js dev/HMR can reuse mongoose.models.* compiled before wishlistItems existed.
 * Strict mode then drops wishlistItems on doc.set. Patch cached models so saves persist.
 */
export function ensureWishlistItemsSchemaOnModels(...models: mongoose.Model<unknown>[]): void {
  for (const M of models) {
    if (!M.schema.path("wishlistItems")) {
      M.schema.add({
        wishlistItems: { type: [String], default: [] },
      });
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Stable comparison key for edit-lock checks (order-insensitive).
 */
export function wishlistNormalizedKey(names: string[] | null | undefined): string {
  if (!names?.length) return "";
  return [...names]
    .map((n) => String(n).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("\0");
}

/**
 * Parse wishlist from FormData string or JSON body.
 * - `undefined` → null (omit from update)
 * - valid JSON array or string → normalized list (may be empty to clear)
 */
export function normalizeWishlistRaw(raw: unknown): string[] | null {
  if (raw === undefined) return null;
  if (raw === null) return [];
  let arr: unknown;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return null;
    try {
      arr = JSON.parse(t) as unknown;
    } catch {
      return [];
    }
  } else {
    arr = raw;
  }
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= WISHLIST_MAX_ITEMS) break;
  }
  return out;
}

type ItemNameLean = { itemName?: string };

/**
 * Map user-entered names to exact Item.itemName; dedupe after resolve.
 */
export async function resolveWishlistCanonicalNames(
  names: string[],
  Item: Model<unknown>
): Promise<{ ok: true; canonical: string[] } | { ok: false; invalid: string[] }> {
  if (names.length === 0) return { ok: true, canonical: [] };
  const invalid: string[] = [];
  const canonical: string[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const doc = await Item.findOne({
      itemName: new RegExp(`^${escapeRegex(name)}$`, "i"),
    })
      .select("itemName")
      .lean<ItemNameLean | null>();
    const itemName = doc?.itemName?.trim();
    if (!itemName) {
      invalid.push(name);
      continue;
    }
    const k = itemName.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    canonical.push(itemName);
  }

  if (invalid.length) return { ok: false, invalid };
  return { ok: true, canonical };
}
