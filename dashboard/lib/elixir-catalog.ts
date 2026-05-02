/**
 * Mixer output elixirs (catalog names) — aligned with `bot/modules/elixirBrewModule.js` EFFECT_FAMILY_TO_ELIXIR.
 */
export const MIXER_ELIXIR_NAMES = [
  "Bright Elixir",
  "Chilly Elixir",
  "Electro Elixir",
  "Enduring Elixir",
  "Energizing Elixir",
  "Fairy Tonic",
  "Hasty Elixir",
  "Hearty Elixir",
  "Mighty Elixir",
  "Sneaky Elixir",
  "Spicy Elixir",
  "Sticky Elixir",
  "Tough Elixir",
] as const;

const MIXER_ELIXIR_SET = new Set<string>(
  MIXER_ELIXIR_NAMES.map((n) => n.trim().toLowerCase())
);

/** output item name → effectFamily key (e.g. Energizing Elixir → energizing) */
export const ELIXIR_NAME_TO_FAMILY: Record<string, string> = {
  "Bright Elixir": "bright",
  "Chilly Elixir": "chilly",
  "Electro Elixir": "electro",
  "Enduring Elixir": "enduring",
  "Energizing Elixir": "energizing",
  "Fairy Tonic": "fairy",
  "Hasty Elixir": "hasty",
  "Hearty Elixir": "hearty",
  "Mighty Elixir": "mighty",
  "Sneaky Elixir": "sneaky",
  "Spicy Elixir": "spicy",
  "Sticky Elixir": "sticky",
  "Tough Elixir": "tough",
};

export function normalizeElixirItemNameKey(name: string): string {
  return String(name ?? "")
    .trim()
    .replace(/\s*\[[^\]]+\]\s*$/i, "")
    .trim()
    .toLowerCase();
}

export function isMixerOutputElixirName(name: string): boolean {
  const key = normalizeElixirItemNameKey(name);
  if (!key) return false;
  return [...MIXER_ELIXIR_SET].some((n) => n === key);
}

export function effectFamilyFromElixirItemName(name: string): string | null {
  const raw = String(name ?? "").trim().replace(/\s*\[[^\]]+\]\s*$/i, "").trim();
  const direct = ELIXIR_NAME_TO_FAMILY[raw];
  if (direct) return direct;
  const key = raw.toLowerCase();
  const entry = Object.entries(ELIXIR_NAME_TO_FAMILY).find(([k]) => k.toLowerCase() === key);
  return entry ? entry[1] : null;
}

/** Thread element for families that require a matching monster part (bot: getRequiredPartElementForFamily). */
export function getRequiredPartElementForFamily(effectFamily: string): string {
  const f = String(effectFamily || "")
    .trim()
    .toLowerCase();
  const map: Record<string, string> = {
    chilly: "fire",
    spicy: "ice",
    electro: "electric",
    bright: "undead",
  };
  return map[f] ?? "none";
}

export function getAllowedPartElementsForFamily(effectFamily: string): string[] {
  const req = getRequiredPartElementForFamily(effectFamily);
  if (req === "none") return ["none"];
  return ["none", req];
}

export function describeMixerPartRequirement(effectFamily: string): string {
  const allowed = getAllowedPartElementsForFamily(effectFamily);
  if (allowed.length === 1 && allowed[0] === "none") {
    return "a neutral monster part (element: none)";
  }
  if (allowed.length === 1) {
    return `a ${allowed[0]}-element monster part`;
  }
  const bits = allowed.map((e) => (e === "none" ? "neutral (none)" : `${e}-element`));
  return `${bits.join(" or ")} monster part`;
}

const TIER_LABELS: Record<number, string> = { 1: "Basic", 2: "Mid", 3: "High" };

export function elixirTierLabel(level: number): string {
  return TIER_LABELS[level] ?? "Basic";
}

/** Bot mixer: combined rarity score 1–3 → Basic, 4–6 → Mid, 7–10 → High. */
export function mixerRarityGuidanceForTier(targetLevel: number): string {
  if (targetLevel === 3) {
    return "Aim for high-rarity ingredients (often 7–10 on the catalog scale), or mid-rarity pieces plus several on-theme extras for synergy.";
  }
  if (targetLevel === 2) {
    return "Aim for mid-rarity ingredients (often 4–6), or lower rarities with extra critters/parts that match this brew for synergy.";
  }
  return "Basic bottles usually come from low-rarity ingredients (often 1–3). Exact mix depends on what you put in the pot.";
}
