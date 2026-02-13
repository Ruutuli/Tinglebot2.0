/**
 * Canonical exploration discovery icon URLs (custom PNGs only, no FA icons).
 * Used for grotto, monster camp, ruins/camp; relic uses ruins icon as fallback.
 */
export const EXPLORATION_ICON_URLS: Record<string, string> = {
  grotto: "https://storage.googleapis.com/tinglebot/maps/grottoiconroots2024.png",
  monster_camp: "https://storage.googleapis.com/tinglebot/maps/monstercamproots2024.png",
  ruins: "https://storage.googleapis.com/tinglebot/maps/ruinrestcamproots2024.png",
  relic: "https://storage.googleapis.com/tinglebot/maps/ruinrestcamproots2024.png",
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
  if (!isExplorationIcon(icon)) return null;
  const type = icon.slice(PREFIX.length);
  return EXPLORATION_ICON_URLS[type] ?? EXPLORATION_ICON_URLS.ruins ?? null;
}
