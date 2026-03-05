// ============================================================================
// Item drop sources (code-only, no DB changes)
// ============================================================================
// Derives "where can this item be obtained from monster drops" by connecting:
// - Item: monsterList (monster names) + monster boolean flags (nameMapping keys)
// - Monster: region flags (eldin, lanayru, ...) + looting job flags (guard, scout, ...)
// So we can answer: "Bokoblin Guts → dropped by Bokoblins → found in Eldin, Lanayru, ...
//                   → can be fought by Guard, Scout, ..."
// ============================================================================

/** Monster model region field → display label (matches job reference tabs). */
export const REGION_FIELDS: { field: string; label: string }[] = [
  { field: "centralHyrule", label: "Central Hyrule" },
  { field: "eldin", label: "Eldin" },
  { field: "faron", label: "Faron" },
  { field: "gerudo", label: "Gerudo" },
  { field: "hebra", label: "Hebra" },
  { field: "lanayru", label: "Lanayru" },
  { field: "pathOfScarletLeaves", label: "Path of Scarlet Leaves" },
  { field: "leafDewWay", label: "Leaf Dew Way" },
];

/** Monster model looting-job field → job display name. */
export const MONSTER_LOOTING_JOB_TO_LABEL: Record<string, string> = {
  adventurer: "Adventurer",
  guard: "Guard",
  graveskeeper: "Graveskeeper",
  hunter: "Hunter",
  mercenary: "Mercenary",
  scout: "Scout",
};

/** Item model monster boolean fields (same set as sync-obtain-from-flags). */
export const ITEM_MONSTER_FIELDS: readonly string[] = [
  "blackBokoblin",
  "blueBokoblin",
  "cursedBokoblin",
  "goldenBokoblin",
  "silverBokoblin",
  "bokoblin",
  "electricChuchuLarge",
  "fireChuchuLarge",
  "iceChuchuLarge",
  "chuchuLarge",
  "electricChuchuMedium",
  "fireChuchuMedium",
  "iceChuchuMedium",
  "chuchuMedium",
  "electricChuchuSmall",
  "fireChuchuSmall",
  "iceChuchuSmall",
  "chuchuSmall",
  "blackHinox",
  "blueHinox",
  "hinox",
  "electricKeese",
  "fireKeese",
  "iceKeese",
  "keese",
  "blackLizalfos",
  "blueLizalfos",
  "cursedLizalfos",
  "electricLizalfos",
  "fireBreathLizalfos",
  "goldenLizalfos",
  "iceBreathLizalfos",
  "silverLizalfos",
  "lizalfos",
  "blueManedLynel",
  "goldenLynel",
  "silverLynel",
  "whiteManedLynel",
  "lynel",
  "blackMoblin",
  "blueMoblin",
  "cursedMoblin",
  "goldenMoblin",
  "silverMoblin",
  "moblin",
  "molduga",
  "molduking",
  "forestOctorok",
  "rockOctorok",
  "skyOctorok",
  "snowOctorok",
  "treasureOctorok",
  "waterOctorok",
  "frostPebblit",
  "igneoPebblit",
  "stonePebblit",
  "stalizalfos",
  "stalkoblin",
  "stalmoblin",
  "stalnox",
  "frostTalus",
  "igneoTalus",
  "luminousTalus",
  "rareTalus",
  "stoneTalus",
  "blizzardWizzrobe",
  "electricWizzrobe",
  "fireWizzrobe",
  "iceWizzrobe",
  "meteoWizzrobe",
  "thunderWizzrobe",
  "likeLike",
  "evermean",
  "gibdo",
  "horriblin",
  "gloomHands",
  "bossBokoblin",
  "mothGibdo",
  "littleFrox",
  "yigaBlademaster",
  "yigaFootsoldier",
  "normalBokoblin",
  "normalGibdo",
  "normalHinox",
  "normalHorriblin",
  "normalKeese",
  "normalLizalfos",
  "normalLynel",
  "normalMoblin",
];

export type DropSourceInfo = {
  regions: string[];
  lootingJobs: string[];
};

/** Minimal monster doc shape (from DB lean()). */
export type MonsterDocForDrops = {
  name: string;
  nameMapping: string;
  eldin?: boolean;
  lanayru?: boolean;
  faron?: boolean;
  centralHyrule?: boolean;
  gerudo?: boolean;
  hebra?: boolean;
  pathOfScarletLeaves?: boolean;
  leafDewWay?: boolean;
  adventurer?: boolean;
  guard?: boolean;
  graveskeeper?: boolean;
  hunter?: boolean;
  mercenary?: boolean;
  scout?: boolean;
};

/** Item doc shape (at least monsterList + monster flags). */
export type ItemDocForDrops = {
  monsterList?: string[];
  [key: string]: unknown;
};

/**
 * Build a lookup map from monster name/nameMapping to { regions, lootingJobs }.
 * Use this once per request when you have loaded all monsters.
 */
export function buildMonsterDropMap(
  monsters: MonsterDocForDrops[]
): Map<string, DropSourceInfo> {
  const map = new Map<string, DropSourceInfo>();

  for (const m of monsters) {
    const regions: string[] = [];
    for (const { field, label } of REGION_FIELDS) {
      const v = m[field as keyof MonsterDocForDrops];
      if (v === true) regions.push(label);
    }
    const lootingJobs: string[] = [];
    for (const [field, label] of Object.entries(MONSTER_LOOTING_JOB_TO_LABEL)) {
      const v = m[field as keyof MonsterDocForDrops];
      if (v === true) lootingJobs.push(label);
    }
    const info: DropSourceInfo = { regions, lootingJobs };
    const name = (m.name ?? "").trim();
    const mapping = (m.nameMapping ?? "").trim();
    if (name) map.set(name, info);
    if (mapping && mapping !== name) map.set(mapping, info);
  }

  return map;
}

/**
 * Get all monster identifiers for an item: names from monsterList plus
 * nameMapping keys from item's monster boolean flags that are true.
 */
export function getMonsterKeysFromItem(item: ItemDocForDrops): string[] {
  const keys: string[] = [];

  const list = item.monsterList;
  if (Array.isArray(list)) {
    for (const name of list) {
      const s = typeof name === "string" ? name.trim() : "";
      if (s) keys.push(s);
    }
  }

  for (const field of ITEM_MONSTER_FIELDS) {
    if (item[field] === true) keys.push(field);
  }

  return [...new Set(keys)];
}

/**
 * Compute drop source info for an item: regions and looting jobs where
 * this item can be obtained via monster drops (from Monster collection data).
 * No DB or schema changes; uses the provided monster map built from Monster docs.
 */
export function getItemDropSources(
  item: ItemDocForDrops,
  monsterMap: Map<string, DropSourceInfo>
): DropSourceInfo {
  const regionsSet = new Set<string>();
  const jobsSet = new Set<string>();

  for (const key of getMonsterKeysFromItem(item)) {
    const info = monsterMap.get(key);
    if (!info) continue;
    for (const r of info.regions) regionsSet.add(r);
    for (const j of info.lootingJobs) jobsSet.add(j);
  }

  return {
    regions: [...regionsSet].sort(),
    lootingJobs: [...jobsSet].sort(),
  };
}
