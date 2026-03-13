/**
 * Options for quadrant fields, derived from ROTW_Map Coords_2025 - Map.csv
 * and ROTW_Map Coords_2025 - Items.csv. All pickers use these lists; no free text.
 */

export const TERRAIN_OPTIONS = [
  "⛰️ Mountain & Highland",
  "❄️ Snow & Ice Biomes",
  "🌊 Water & Wetlands",
  "🌋 Volcanic",
  "🌲 Forest & Woodland",
  "🌿 Grasslands & Plains",
  "🏖️ Coastal & Sea Edge",
  "🏜️ Desert & Arid",
] as const;

export const HAZARDS_OPTIONS = ["Cold", "Hot", "Thunder"] as const;

/** Gather labels (Items CSV TYPE / Map CSV Items column). */
export const ITEMS_OPTIONS = [
  "Ancient Parts",
  "Creature",
  "Fish",
  "Fruit",
  "Meat",
  "Mushroom",
  "Natural",
  "Ore",
  "Plant",
  "Vegetable",
] as const;

/** Monsters from Map CSV (match monster DB). */
export const MONSTERS_OPTIONS = [
  "Black Bokoblin",
  "Black Hinox",
  "Black Lizalfos",
  "Black Moblin",
  "Blizzard Wizzrobe",
  "Blue Bokoblin",
  "Blue Hinox",
  "Blue Lizalfos",
  "Blue Moblin",
  "Blue-Maned Lynel",
  "Bokoblin",
  "Boss Bokoblin",
  "Chuchu (Large)",
  "Chuchu (Medium)",
  "Chuchu (Small)",
  "Cursed Bokoblin",
  "Cursed Lizalfos",
  "Cursed Moblin",
  "Electric Chuchu (Large)",
  "Electric Chuchu (Medium)",
  "Electric Chuchu (Small)",
  "Electric Keese",
  "Electric Lizalfos",
  "Electric Wizzrobe",
  "Evermean",
  "Fire Chuchu (Large)",
  "Fire Chuchu (Medium)",
  "Fire Chuchu (Small)",
  "Fire Keese",
  "Fire Wizzrobe",
  "Fire-breath Lizalfos",
  "Forest Octorok",
  "Frost Pebblit",
  "Frost Talus",
  "Frox",
  "Gibdo",
  "Gloom Hands",
  "Golden Bokoblin",
  "Golden Lizalfos",
  "Golden Lynel",
  "Golden Moblin",
  "Hinox",
  "Horriblin",
  "Ice Chuchu (Large)",
  "Ice Chuchu (Medium)",
  "Ice Chuchu (Small)",
  "Ice Keese",
  "Ice Wizzrobe",
  "Ice-breath Lizalfos",
  "Igneo Pebblit",
  "Igneo Talus",
  "Keese",
  "Like Like",
  "Lizalfos",
  "Luminous Talus",
  "Lynel",
  "Meteo Wizzrobe",
  "Moblin",
  "Molduga",
  "Molduking",
  "Moth Gibdo",
  "Rare Talus",
  "Rock Octorok",
  "Silver Bokoblin",
  "Silver Lizalfos",
  "Silver Lynel",
  "Stalizalfos",
  "Stalkoblin",
  "Stalmoblin",
  "Stalnox",
  "Stone Pebblit",
  "Stone Talus",
  "Thunder Wizzrobe",
  "Water Octorok",
  "White-maned Lynel",
] as const;

/** Boss monsters (Map CSV Boss Monsters column, cleaned). */
export const BOSS_MONSTERS_OPTIONS = ["Molduga", "Molduking"] as const;

/** Special notes/flags from Map CSV. */
export const SPECIAL_OPTIONS = ["Hot Spring", "Lost Woods"] as const;
