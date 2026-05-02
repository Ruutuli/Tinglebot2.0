// ============================================================================
// Expand a user-entered ingredient to recipe material slot names (DB lines).
// Maps specific items to general slots (e.g. Hearty Bass -> Any Bass, Any Fish).
// ============================================================================

import { generalCategories } from "@/lib/general-item-categories";

export function expandIngredientToMaterialSlotNames(raw: string): string[] {
  const name = raw.trim();
  if (!name) return [];

  const lower = name.toLowerCase();
  const slots = new Set<string>();

  slots.add(name);

  for (const key of Object.keys(generalCategories)) {
    if (key.toLowerCase() === lower) {
      slots.add(key);
    }
  }

  for (const [categoryKey, members] of Object.entries(generalCategories)) {
    if (members.some((m) => m.toLowerCase() === lower)) {
      slots.add(categoryKey);
    }
  }

  return [...slots];
}
