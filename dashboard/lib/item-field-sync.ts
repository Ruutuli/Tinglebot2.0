// ============================================================================
// ------------------- Item Field Sync Utilities -------------------
// Purpose: Automatically sync related fields when job/location/monster flags change
// Used by: Admin database editor form
// ============================================================================

import { getJobDisplayName } from "@/data/jobData";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

export type ItemFormData = {
  // Job flags
  adventurer?: boolean;
  artist?: boolean;
  beekeeper?: boolean;
  blacksmith?: boolean;
  cook?: boolean;
  craftsman?: boolean;
  farmer?: boolean;
  fisherman?: boolean;
  forager?: boolean;
  gravekeeper?: boolean;
  guard?: boolean;
  maskMaker?: boolean;
  rancher?: boolean;
  herbalist?: boolean;
  hunter?: boolean;
  hunterLooting?: boolean;
  mercenary?: boolean;
  miner?: boolean;
  researcher?: boolean;
  scout?: boolean;
  weaver?: boolean;
  witch?: boolean;
  // Arrays
  gatheringJobs?: string[];
  lootingJobs?: string[];
  craftingJobs?: string[];
  obtain?: string[];
  locations?: string[];
  petperkobtain?: string[];
  allJobs?: string[];
  // Booleans
  gathering?: boolean;
  looting?: boolean;
  crafting?: boolean;
  vending?: boolean;
  traveling?: boolean;
  exploring?: boolean;
  petPerk?: boolean;
  petprey?: boolean;
  petforage?: boolean;
  lgpetprey?: boolean;
  petmon?: boolean;
  petchu?: boolean;
  petfirechu?: boolean;
  peticechu?: boolean;
  petelectricchu?: boolean;
  entertainerItems?: boolean;
  divineItems?: boolean;
  // Locations
  centralHyrule?: boolean;
  eldin?: boolean;
  faron?: boolean;
  gerudo?: boolean;
  hebra?: boolean;
  lanayru?: boolean;
  pathOfScarletLeaves?: boolean;
  leafDewWay?: boolean;
  // Monsters
  monsterList?: string[];
  // Special weather (nested object)
  specialWeather?: {
    muggy?: boolean;
    flowerbloom?: boolean;
    fairycircle?: boolean;
    jubilee?: boolean;
    meteorShower?: boolean;
    rockslide?: boolean;
    avalanche?: boolean;
  };
  [key: string]: unknown;
};

export type SyncResult = {
  updated: boolean;
  changes: Record<string, { from: unknown; to: unknown }>;
};

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

/**
 * Add value to array if not present
 */
function addToArray<T>(arr: T[], value: T): T[] {
  if (!arr) return [value];
  if (arr.includes(value)) return arr;
  return [...arr, value];
}

/**
 * Remove value from array
 */
function removeFromArray<T>(arr: T[], value: T): T[] {
  if (!arr) return [];
  return arr.filter(item => item !== value);
}

/**
 * Normalize job field name to job display name
 */
function normalizeJobName(fieldName: string): string {
  // Use jobData for canonical display names (Hunter vs Hunter (Looting))
  const fromJobData = getJobDisplayName(fieldName);
  if (fromJobData !== fieldName) return fromJobData;
  // Handle special cases not in jobData
  if (fieldName === "maskMaker") return "Mask Maker";
  if (fieldName === "gravekeeper") return "Graveskeeper";
  // Convert camelCase to Title Case
  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Normalize location field name to location display name
 */
function normalizeLocationName(fieldName: string): string {
  const locationMap: Record<string, string> = {
    centralHyrule: "Central Hyrule",
    pathOfScarletLeaves: "Path of Scarlet Leaves",
    leafDewWay: "Leaf Dew Way",
  };
  return locationMap[fieldName] || fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
}

/**
 * Normalize monster field name to monster display name
 */
function normalizeMonsterName(fieldName: string): string {
  // Convert camelCase to Title Case with proper spacing
  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// ============================================================================
// ------------------- Sync Functions -------------------
// ============================================================================

/**
 * Sync job flags with related arrays
 * When a job flag is set to true, automatically update gatheringJobs, lootingJobs, craftingJobs, etc.
 */
export function syncJobFlags(
  item: ItemFormData,
  changedField?: string,
  newValue?: boolean
): SyncResult {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  let updated = false;

  // Job field names that exist in ItemModel
  const jobFields = [
    "adventurer", "artist", "beekeeper", "blacksmith", "cook", "craftsman",
    "farmer", "fisherman", "forager", "gravekeeper", "guard", "maskMaker",
    "rancher", "herbalist", "hunter", "hunterLooting", "mercenary", "miner",
    "researcher", "scout", "weaver", "witch"
  ];

  // Which array each field belongs to (Hunter = gathering only, Hunter (Looting) = looting only)
  const gatheringJobFields = new Set(["farmer", "forager", "herbalist", "hunter", "fisherman", "rancher", "miner", "beekeeper"]);
  const lootingJobFields = new Set(["adventurer", "gravekeeper", "guard", "mercenary", "scout", "hunterLooting"]);
  const craftingJobFields = new Set(["artist", "cook", "craftsman", "witch", "researcher", "blacksmith", "maskMaker", "weaver"]);

  // Initialize arrays if they don't exist
  const gatheringJobs = item.gatheringJobs || [];
  const lootingJobs = item.lootingJobs || [];
  const craftingJobs = item.craftingJobs || [];
  const obtain = item.obtain || [];
  
  // Use current arrays, updating them as we go
  let allJobs = [...(item.allJobs || [])];

  // Track which activities should be enabled
  const hasGatheringJobs: string[] = [];
  const hasLootingJobs: string[] = [];
  const hasCraftingJobs: string[] = [];

  // Process each job field
  for (const fieldName of jobFields) {
    const jobValue = item[fieldName] as boolean | undefined;
    if (jobValue === undefined) continue;

    const jobDisplayName = normalizeJobName(fieldName);
    const isGathering = gatheringJobFields.has(fieldName);
    const isLooting = lootingJobFields.has(fieldName);
    const isCrafting = craftingJobFields.has(fieldName);

    if (jobValue === true) {
      // Job is enabled - add to allJobs
      if (!allJobs.includes(jobDisplayName)) {
        allJobs = addToArray(allJobs, jobDisplayName);
        updated = true;
      }
      
      // Job is enabled - add to appropriate arrays (by field, so Hunter = gathering only, Hunter (Looting) = looting only)
      if (isGathering) {
        if (!gatheringJobs.includes(jobDisplayName)) {
          hasGatheringJobs.push(jobDisplayName);
          changes[`gatheringJobs`] = {
            from: gatheringJobs,
            to: addToArray(gatheringJobs, jobDisplayName)
          };
          updated = true;
        }
        if (!obtain.includes("Gathering")) {
          changes[`obtain`] = {
            from: obtain,
            to: addToArray(obtain, "Gathering")
          };
          updated = true;
        }
      }

      if (isLooting) {
        if (!lootingJobs.includes(jobDisplayName)) {
          hasLootingJobs.push(jobDisplayName);
          changes[`lootingJobs`] = {
            from: lootingJobs,
            to: addToArray(lootingJobs, jobDisplayName)
          };
          updated = true;
        }
        if (!obtain.includes("Looting")) {
          changes[`obtain`] = {
            from: obtain,
            to: addToArray(obtain, "Looting")
          };
          updated = true;
        }
      }

      if (isCrafting) {
        if (!craftingJobs.includes(jobDisplayName)) {
          hasCraftingJobs.push(jobDisplayName);
          changes[`craftingJobs`] = {
            from: craftingJobs,
            to: addToArray(craftingJobs, jobDisplayName)
          };
          updated = true;
        }
        if (!obtain.includes("Crafting")) {
          changes[`obtain`] = {
            from: obtain,
            to: addToArray(obtain, "Crafting")
          };
          updated = true;
        }
      }
    } else if (jobValue === false) {
      // Job is disabled - remove from arrays
      if (isGathering && gatheringJobs.includes(jobDisplayName)) {
        changes[`gatheringJobs`] = {
          from: gatheringJobs,
          to: removeFromArray(gatheringJobs, jobDisplayName)
        };
        updated = true;
      }

      if (isLooting && lootingJobs.includes(jobDisplayName)) {
        changes[`lootingJobs`] = {
          from: lootingJobs,
          to: removeFromArray(lootingJobs, jobDisplayName)
        };
        updated = true;
      }

      if (isCrafting && craftingJobs.includes(jobDisplayName)) {
        changes[`craftingJobs`] = {
          from: craftingJobs,
          to: removeFromArray(craftingJobs, jobDisplayName)
        };
        updated = true;
      }
    }
  }

  // Update gathering/looting/crafting boolean flags based on whether any jobs are enabled
  const finalGatheringJobs = changes["gatheringJobs"] 
    ? (changes["gatheringJobs"].to as string[])
    : gatheringJobs;
  const finalLootingJobs = changes["lootingJobs"]
    ? (changes["lootingJobs"].to as string[])
    : lootingJobs;
  const finalCraftingJobs = changes["craftingJobs"]
    ? (changes["craftingJobs"].to as string[])
    : craftingJobs;

  if (finalGatheringJobs.length > 0 && item.gathering !== true) {
    changes["gathering"] = { from: item.gathering, to: true };
    updated = true;
  } else if (finalGatheringJobs.length === 0 && item.gathering === true) {
    changes["gathering"] = { from: item.gathering, to: false };
    updated = true;
  }

  if (finalLootingJobs.length > 0 && item.looting !== true) {
    changes["looting"] = { from: item.looting, to: true };
    updated = true;
  } else if (finalLootingJobs.length === 0 && item.looting === true) {
    changes["looting"] = { from: item.looting, to: false };
    updated = true;
  }

  if (finalCraftingJobs.length > 0 && item.crafting !== true) {
    changes["crafting"] = { from: item.crafting, to: true };
    updated = true;
  } else if (finalCraftingJobs.length === 0 && item.crafting === true) {
    changes["crafting"] = { from: item.crafting, to: false };
    updated = true;
  }

  // Update allJobs if changed
  if (allJobs.length !== (item.allJobs || []).length || 
      JSON.stringify([...allJobs].sort()) !== JSON.stringify([...(item.allJobs || [])].sort())) {
    changes["allJobs"] = {
      from: item.allJobs || [],
      to: allJobs
    };
    updated = true;
  }

  return { updated, changes };
}

/**
 * Sync location flags with locations array
 */
export function syncLocationFlags(
  item: ItemFormData,
  changedField?: string,
  newValue?: boolean
): SyncResult {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  let updated = false;

  const locationFields = [
    "centralHyrule",
    "eldin",
    "faron",
    "gerudo",
    "hebra",
    "lanayru",
    "pathOfScarletLeaves",
    "leafDewWay"
  ];

  // Use current array, updating it as we go - create a copy to avoid mutation issues
  let locations = [...(item.locations || [])];

  for (const fieldName of locationFields) {
    const locationValue = item[fieldName] as boolean | undefined;
    if (locationValue === undefined) continue;

    const locationDisplayName = normalizeLocationName(fieldName);

    if (locationValue === true) {
      if (!locations.includes(locationDisplayName)) {
        locations = addToArray(locations, locationDisplayName);
        updated = true;
      }
    } else if (locationValue === false) {
      if (locations.includes(locationDisplayName)) {
        locations = removeFromArray(locations, locationDisplayName);
        updated = true;
      }
    }
  }

  // Only add change if we actually updated something
  if (updated) {
    changes["locations"] = {
      from: item.locations || [],
      to: locations
    };
  }

  return { updated, changes };
}

/**
 * Sync monster flags with monsterList array
 */
export function syncMonsterFlags(
  item: ItemFormData,
  changedField?: string,
  newValue?: boolean
): SyncResult {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  let updated = false;

  // All monster field names from ItemModel
  const monsterFields = [
    "blackBokoblin", "blueBokoblin", "cursedBokoblin", "goldenBokoblin",
    "silverBokoblin", "bokoblin", "electricChuchuLarge", "fireChuchuLarge",
    "iceChuchuLarge", "chuchuLarge", "electricChuchuMedium", "fireChuchuMedium",
    "iceChuchuMedium", "chuchuMedium", "electricChuchuSmall", "fireChuchuSmall",
    "iceChuchuSmall", "chuchuSmall", "blackHinox", "blueHinox", "hinox",
    "electricKeese", "fireKeese", "iceKeese", "keese", "blackLizalfos",
    "blueLizalfos", "cursedLizalfos", "electricLizalfos", "fireBreathLizalfos",
    "goldenLizalfos", "iceBreathLizalfos", "silverLizalfos", "lizalfos",
    "blueManedLynel", "goldenLynel", "silverLynel", "whiteManedLynel", "lynel",
    "blackMoblin", "blueMoblin", "cursedMoblin", "goldenMoblin", "silverMoblin",
    "moblin", "molduga", "molduking", "forestOctorok", "rockOctorok",
    "skyOctorok", "snowOctorok", "treasureOctorok", "waterOctorok",
    "frostPebblit", "igneoPebblit", "stonePebblit", "stalizalfos", "stalkoblin",
    "stalmoblin", "stalnox", "frostTalus", "igneoTalus", "luminousTalus",
    "rareTalus", "stoneTalus", "blizzardWizzrobe", "electricWizzrobe",
    "fireWizzrobe", "iceWizzrobe", "meteoWizzrobe", "thunderWizzrobe",
    "likeLike", "evermean", "gibdo", "horriblin", "gloomHands", "bossBokoblin",
    "mothGibdo", "littleFrox", "yigaBlademaster", "yigaFootsoldier",
    "normalBokoblin", "normalGibdo", "normalHinox", "normalHorriblin",
    "normalKeese", "normalLizalfos", "normalLynel", "normalMoblin"
  ];

  const monsterList = item.monsterList || [];

  for (const fieldName of monsterFields) {
    const monsterValue = item[fieldName] as boolean | undefined;
    if (monsterValue === undefined) continue;

    const monsterDisplayName = normalizeMonsterName(fieldName);

    if (monsterValue === true) {
      if (!monsterList.includes(monsterDisplayName)) {
        changes["monsterList"] = {
          from: monsterList,
          to: addToArray(monsterList, monsterDisplayName)
        };
        updated = true;
      }
    } else if (monsterValue === false) {
      if (monsterList.includes(monsterDisplayName)) {
        changes["monsterList"] = {
          from: monsterList,
          to: removeFromArray(monsterList, monsterDisplayName)
        };
        updated = true;
      }
    }
  }

  return { updated, changes };
}

/**
 * Sync activity flags (gathering, looting, crafting, vending, traveling, exploring) with obtain arrays
 */
export function syncActivityFlags(
  item: ItemFormData,
  changedField?: string,
  newValue?: boolean
): SyncResult {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  let updated = false;

  // Use current arrays, updating them as we go
  let obtain = item.obtain || [];

  // Map activity flags to their obtain method names
  const activityMap: Record<string, string> = {
    gathering: "Gathering",
    looting: "Looting",
    crafting: "Crafting",
    vending: "Vending",
    traveling: "Travel",
    exploring: "Exploring",
  };

  // Process each activity flag
  for (const [fieldName, obtainName] of Object.entries(activityMap)) {
    const activityValue = item[fieldName] as boolean | undefined;
    if (activityValue === undefined) continue;

    if (activityValue === true) {
      // Add to obtain if not present
      if (!obtain.includes(obtainName)) {
        obtain = addToArray(obtain, obtainName);
        changes["obtain"] = {
          from: item.obtain || [],
          to: obtain
        };
        updated = true;
      }
    } else if (activityValue === false) {
      // Remove from obtain if present
      if (obtain.includes(obtainName)) {
        obtain = removeFromArray(obtain, obtainName);
        changes["obtain"] = {
          from: item.obtain || [],
          to: obtain
        };
        updated = true;
      }
    }
  }

  return { updated, changes };
}

/**
 * Sync special weather flags with obtain arrays
 */
export function syncSpecialWeather(
  item: ItemFormData,
  changedField?: string,
  newValue?: boolean
): SyncResult {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  let updated = false;

  const specialWeather = item.specialWeather || {};
  // Use current arrays, updating them as we go
  let obtain = item.obtain || [];

  // Map weather fields to their display names
  const weatherMap: Record<string, string> = {
    muggy: "Muggy Weather",
    flowerbloom: "Flower Bloom",
    fairycircle: "Fairy Circle",
    jubilee: "Jubilee",
    meteorShower: "Meteor Shower",
    rockslide: "Rockslide",
    avalanche: "Avalanche",
  };

  // Process each weather field
  for (const [fieldName, obtainName] of Object.entries(weatherMap)) {
    const weatherValue = specialWeather[fieldName as keyof typeof specialWeather] as boolean | undefined;
    if (weatherValue === undefined) continue;

    if (weatherValue === true) {
      // Add to obtain if not present
      if (!obtain.includes(obtainName)) {
        obtain = addToArray(obtain, obtainName);
        changes["obtain"] = {
          from: item.obtain || [],
          to: obtain
        };
        updated = true;
      }
    } else if (weatherValue === false) {
      // Remove from obtain if present
      if (obtain.includes(obtainName)) {
        obtain = removeFromArray(obtain, obtainName);
        changes["obtain"] = {
          from: item.obtain || [],
          to: obtain
        };
        updated = true;
      }
    }
  }

  return { updated, changes };
}

/**
 * Sync pet perk flags with petperkobtain array
 */
export function syncPetPerks(
  item: ItemFormData,
  changedField?: string,
  newValue?: boolean
): SyncResult {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  let updated = false;

  // Use current array, updating it as we go
  let petperkobtain = item.petperkobtain || [];

  // Map pet fields to their display names
  const petMap: Record<string, string> = {
    petPerk: "Pet Perk",
    petprey: "Pet Prey",
    petforage: "Pet Forage",
    lgpetprey: "Large Pet Prey",
    petmon: "Pet Monster",
    petchu: "Pet Chuchu",
    petfirechu: "Pet Fire Chuchu",
    peticechu: "Pet Ice Chuchu",
    petelectricchu: "Pet Electric Chuchu",
  };

  // Process each pet field
  for (const [fieldName, displayName] of Object.entries(petMap)) {
    const petValue = item[fieldName as keyof ItemFormData] as boolean | undefined;
    if (petValue === undefined) continue;

    if (petValue === true) {
      // Add to petperkobtain if not present
      if (!petperkobtain.includes(displayName)) {
        petperkobtain = addToArray(petperkobtain, displayName);
        changes["petperkobtain"] = {
          from: item.petperkobtain || [],
          to: petperkobtain
        };
        updated = true;
      }
    } else if (petValue === false) {
      // Remove from petperkobtain if present
      if (petperkobtain.includes(displayName)) {
        petperkobtain = removeFromArray(petperkobtain, displayName);
        changes["petperkobtain"] = {
          from: item.petperkobtain || [],
          to: petperkobtain
        };
        updated = true;
      }
    }
  }

  // Handle petPerk flag separately - if true, ensure "Pet Perk" is in array
  if (item.petPerk === true && !petperkobtain.includes("Pet Perk")) {
    petperkobtain = addToArray(petperkobtain, "Pet Perk");
    changes["petperkobtain"] = {
      from: item.petperkobtain || [],
      to: petperkobtain
    };
    updated = true;
  } else if (item.petPerk === false && petperkobtain.includes("Pet Perk")) {
    petperkobtain = removeFromArray(petperkobtain, "Pet Perk");
    changes["petperkobtain"] = {
      from: item.petperkobtain || [],
      to: petperkobtain
    };
    updated = true;
  }

  return { updated, changes };
}

/**
 * Sync all related fields based on changed field
 */
export function syncAllFields(
  item: ItemFormData,
  changedField?: string,
  newValue?: unknown
): SyncResult {
  const allChanges: Record<string, { from: unknown; to: unknown }> = {};
  let anyUpdated = false;

  // Check if changed field is a job field
  const jobFields = [
    "adventurer", "artist", "beekeeper", "blacksmith", "cook", "craftsman",
    "farmer", "fisherman", "forager", "gravekeeper", "guard", "maskMaker",
    "rancher", "herbalist", "hunter", "hunterLooting", "mercenary", "miner",
    "researcher", "scout", "weaver", "witch"
  ];

  // Check if changed field is a location field
  const locationFields = [
    "centralHyrule", "eldin", "faron", "gerudo", "hebra", "lanayru",
    "pathOfScarletLeaves", "leafDewWay"
  ];

  // Check if changed field is a monster field
  const monsterFields = [
    "blackBokoblin", "blueBokoblin", "cursedBokoblin", "goldenBokoblin",
    "silverBokoblin", "bokoblin", "electricChuchuLarge", "fireChuchuLarge",
    "iceChuchuLarge", "chuchuLarge", "electricChuchuMedium", "fireChuchuMedium",
    "iceChuchuMedium", "chuchuMedium", "electricChuchuSmall", "fireChuchuSmall",
    "iceChuchuSmall", "chuchuSmall", "blackHinox", "blueHinox", "hinox",
    "electricKeese", "fireKeese", "iceKeese", "keese", "blackLizalfos",
    "blueLizalfos", "cursedLizalfos", "electricLizalfos", "fireBreathLizalfos",
    "goldenLizalfos", "iceBreathLizalfos", "silverLizalfos", "lizalfos",
    "blueManedLynel", "goldenLynel", "silverLynel", "whiteManedLynel", "lynel",
    "blackMoblin", "blueMoblin", "cursedMoblin", "goldenMoblin", "silverMoblin",
    "moblin", "molduga", "molduking", "forestOctorok", "rockOctorok",
    "skyOctorok", "snowOctorok", "treasureOctorok", "waterOctorok",
    "frostPebblit", "igneoPebblit", "stonePebblit", "stalizalfos", "stalkoblin",
    "stalmoblin", "stalnox", "frostTalus", "igneoTalus", "luminousTalus",
    "rareTalus", "stoneTalus", "blizzardWizzrobe", "electricWizzrobe",
    "fireWizzrobe", "iceWizzrobe", "meteoWizzrobe", "thunderWizzrobe",
    "likeLike", "evermean", "gibdo", "horriblin", "gloomHands", "bossBokoblin",
    "mothGibdo", "littleFrox", "yigaBlademaster", "yigaFootsoldier",
    "normalBokoblin", "normalGibdo", "normalHinox", "normalHorriblin",
    "normalKeese", "normalLizalfos", "normalLynel", "normalMoblin"
  ];

  // Check if changed field is an activity flag
  const activityFields = ["gathering", "looting", "crafting", "vending", "traveling", "exploring"];

  // Check if changed field is a pet perk field
  const petFields = ["petPerk", "petprey", "petforage", "lgpetprey", "petmon", "petchu", "petfirechu", "peticechu", "petelectricchu"];

  if (changedField && jobFields.includes(changedField)) {
    const result = syncJobFlags(item, changedField, newValue as boolean);
    if (result.updated) {
      Object.assign(allChanges, result.changes);
      anyUpdated = true;
    }
  }

  if (changedField && locationFields.includes(changedField)) {
    const locationResult = syncLocationFlags(item, changedField, newValue as boolean);
    
    if (locationResult.updated) {
      Object.assign(allChanges, locationResult.changes);
      anyUpdated = true;
    }
  }

  if (changedField && monsterFields.includes(changedField)) {
    const result = syncMonsterFlags(item, changedField, newValue as boolean);
    if (result.updated) {
      Object.assign(allChanges, result.changes);
      anyUpdated = true;
    }
  }

  if (changedField && activityFields.includes(changedField)) {
    const result = syncActivityFlags(item, changedField, newValue as boolean);
    if (result.updated) {
      Object.assign(allChanges, result.changes);
      anyUpdated = true;
    }
  }

  if (changedField && petFields.includes(changedField)) {
    const result = syncPetPerks(item, changedField, newValue as boolean);
    if (result.updated) {
      Object.assign(allChanges, result.changes);
      anyUpdated = true;
    }
  }

  // Handle specialWeather - when the entire object changes, sync all weather fields
  // The newValue will be the updated specialWeather object
  if (changedField === "specialWeather" && typeof newValue === "object" && newValue !== null) {
    // Create updated item with new specialWeather
    const updatedItem = { ...item, specialWeather: newValue as ItemFormData["specialWeather"] };
    const result = syncSpecialWeather(updatedItem);
    if (result.updated) {
      Object.assign(allChanges, result.changes);
      anyUpdated = true;
    }
  }

  // Also run full sync if no specific field changed (initial load)
  if (!changedField) {
    const jobResult = syncJobFlags(item);
    const locationResult = syncLocationFlags(item);
    const monsterResult = syncMonsterFlags(item);
    const activityResult = syncActivityFlags(item);
    const weatherResult = syncSpecialWeather(item);
    const petResult = syncPetPerks(item);

    if (jobResult.updated) {
      Object.assign(allChanges, jobResult.changes);
      anyUpdated = true;
    }
    if (locationResult.updated) {
      Object.assign(allChanges, locationResult.changes);
      anyUpdated = true;
    }
    if (monsterResult.updated) {
      Object.assign(allChanges, monsterResult.changes);
      anyUpdated = true;
    }
    if (activityResult.updated) {
      Object.assign(allChanges, activityResult.changes);
      anyUpdated = true;
    }
    if (weatherResult.updated) {
      Object.assign(allChanges, weatherResult.changes);
      anyUpdated = true;
    }
    if (petResult.updated) {
      Object.assign(allChanges, petResult.changes);
      anyUpdated = true;
    }
  }

  return { updated: anyUpdated, changes: allChanges };
}
