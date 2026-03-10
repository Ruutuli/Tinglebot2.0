/**
 * Canonical exploration discovery icon URLs (custom PNGs only, no FA icons).
 * Used for grotto, monster camp, ruins/camp; relic uses ruins icon as fallback.
 */
const GROTTO_ICON_URL = "https://storage.googleapis.com/tinglebot/maps/grottoiconroots2024.png";
const MONSTER_CAMP_ICON_URL = "https://storage.googleapis.com/tinglebot/maps/monstercamproots2024.png";
const RUINS_ICON_URL = "https://storage.googleapis.com/tinglebot/maps/ruinrestcamproots2024.png";

export const EXPLORATION_ICON_URLS: Record<string, string> = {
  grotto: GROTTO_ICON_URL,
  grotto_cleansed: GROTTO_ICON_URL,
  monster_camp: MONSTER_CAMP_ICON_URL,
  ruins: RUINS_ICON_URL,
  relic: RUINS_ICON_URL,
};

const PREFIX = "exploration:";

/** Icon value we store in pin.icon for discovery types (e.g. "exploration:grotto"). */
export function explorationIconValue(outcome: string): string {
  return `${PREFIX}${outcome}`;
}

/** True if pin.icon is an exploration type (use custom PNG). */
export function isExplorationIcon(icon: string | undefined): boolean {
  return typeof icon === "string" && icon.startsWith(PREFIX);
}

/** Get PNG URL for a pin icon; returns null if not an exploration icon. */
export function getExplorationIconUrl(icon: string | undefined): string | null {
  if (typeof icon !== "string" || !icon.startsWith(PREFIX)) return null;
  const type = icon.slice(PREFIX.length);
  if (type in EXPLORATION_ICON_URLS) return EXPLORATION_ICON_URLS[type];
  if (type.startsWith("monster_camp")) return MONSTER_CAMP_ICON_URL;
  if (type.startsWith("grotto")) return GROTTO_ICON_URL;
  return RUINS_ICON_URL;
}

/** Grotto pin overlay: gold glow for cleansed only; non-cleared grottos have no special styling. */
export function getGrottoPinClass(icon: string | undefined): "grotto-gold" | null {
  if (typeof icon !== "string" || !icon.startsWith(PREFIX)) return null;
  const type = icon.slice(PREFIX.length);
  if (type === "grotto_cleansed") return "grotto-gold";
  return null;
}
