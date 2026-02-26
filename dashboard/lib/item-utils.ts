// ============================================================================
// ------------------- Item Display Utilities -------------------
// Helper functions to format item data for display
// ============================================================================

import { imageUrlForGcsPath, imageUrlForGcsUrl } from "@/lib/image-url";

export type ItemData = {
  gathering?: boolean;
  looting?: boolean;
  traveling?: boolean;
  exploring?: boolean;
  vending?: boolean;
  crafting?: boolean;
  petPerk?: boolean;
  centralHyrule?: boolean;
  eldin?: boolean;
  faron?: boolean;
  gerudo?: boolean;
  hebra?: boolean;
  lanayru?: boolean;
  pathOfScarletLeaves?: boolean;
  leafDewWay?: boolean;
  farmer?: boolean;
  forager?: boolean;
  rancher?: boolean;
  herbalist?: boolean;
  adventurer?: boolean;
  artist?: boolean;
  beekeeper?: boolean;
  blacksmith?: boolean;
  cook?: boolean;
  craftsman?: boolean;
  fisherman?: boolean;
  gravekeeper?: boolean;
  guard?: boolean;
  maskMaker?: boolean;
  hunter?: boolean;
  hunterLooting?: boolean;
  mercenary?: boolean;
  miner?: boolean;
  researcher?: boolean;
  scout?: boolean;
  weaver?: boolean;
  witch?: boolean;
  allJobs?: string[];
  locations?: string[];
  craftingMaterial?: Array<{ itemName: string; quantity: number }>;
  specialWeather?: {
    muggy?: boolean;
    flowerbloom?: boolean;
    fairycircle?: boolean;
    jubilee?: boolean;
    meteorShower?: boolean;
    rockslide?: boolean;
    avalanche?: boolean;
  };
  image?: string;
  imageType?: string;
};

/**
 * Format sources array from boolean flags and job flags
 * Determines obtain methods based on:
 * - Gathering: if any gathering job is true
 * - Looting: if any looting job is true (monster flags checked in backfill script)
 * - Crafting: if any crafting job is true (or has crafting materials + crafting job)
 * - Vending, Traveling, Exploring: from boolean flags
 * - Special Weather: from specialWeather flags
 * - Pet Perk: from petPerk flag
 */
export function formatSources(item: ItemData): string[] {
  const sources: string[] = [];
  
  // Gathering: check if any gathering job is true
  // Gathering jobs: Farmer, Forager, Herbalist, Rancher, Miner, Beekeeper, Fisherman, Hunter
  const hasGatheringJob = item.farmer || item.forager || item.herbalist || item.rancher || 
                          item.miner || item.beekeeper || item.fisherman || item.hunter;
  if (hasGatheringJob) {
    sources.push("Gathering");
  }
  
  // Looting: check if any looting job is true
  // Looting jobs: Adventurer, Graveskeeper, Guard, Mercenary, Scout, Hunter, Hunter (Looting)
  const hasLootingJob = item.adventurer || item.gravekeeper || item.guard || item.mercenary || 
                        item.scout || item.hunter || item.hunterLooting;
  if (hasLootingJob) {
    sources.push("Looting");
  }
  
  // Crafting: check if any crafting job is true (or has crafting materials + crafting job)
  // Crafting jobs: Cook, Blacksmith, Craftsman, Mask Maker, Researcher, Weaver, Artist, Witch
  const hasCraftingMaterials = item.craftingMaterial && item.craftingMaterial.length > 0;
  const hasCraftingJob = item.cook || item.blacksmith || item.craftsman || item.maskMaker || 
                         item.researcher || item.weaver || item.artist || item.witch;
  if (hasCraftingJob || (hasCraftingMaterials && hasCraftingJob)) {
    sources.push("Crafting");
  }
  
  // Vending, Traveling, Exploring: from boolean flags
  if (item.vending) sources.push("Vending");
  if (item.traveling) sources.push("Traveling");
  if (item.exploring) sources.push("Exploring");
  
  // Check if any special weather is active
  if (item.specialWeather) {
    const hasSpecialWeather = Object.values(item.specialWeather).some(Boolean);
    if (hasSpecialWeather) {
      sources.push("Special Weather");
    }
  }
  
  if (item.petPerk) sources.push("Pet Perk");
  
  return sources.length > 0 ? sources : ["None"];
}

/**
 * Format locations array from location flags and arrays
 */
export function formatLocations(item: ItemData): string[] {
  const locations: string[] = [];
  
  // Use locations array if available
  if (item.locations && item.locations.length > 0) {
    return item.locations.filter(Boolean);
  }
  
  // Fall back to boolean flags
  if (item.centralHyrule) locations.push("Central Hyrule");
  if (item.eldin) locations.push("Eldin");
  if (item.faron) locations.push("Faron");
  if (item.gerudo) locations.push("Gerudo");
  if (item.hebra) locations.push("Hebra");
  if (item.lanayru) locations.push("Lanayru");
  if (item.pathOfScarletLeaves) locations.push("Path of Scarlet Leaves");
  if (item.leafDewWay) locations.push("Leaf Dew Way");
  
  return locations.length > 0 ? locations : ["None"];
}

/**
 * Format jobs array from job flags and arrays
 */
export function formatJobs(item: ItemData): string[] {
  const jobs: string[] = [];
  
  // Use allJobs array if available
  if (item.allJobs && item.allJobs.length > 0 && !item.allJobs.includes("None")) {
    return item.allJobs.filter(Boolean);
  }
  
  // Fall back to boolean flags
  if (item.farmer) jobs.push("Farmer");
  if (item.forager) jobs.push("Forager");
  if (item.rancher) jobs.push("Rancher");
  if (item.herbalist) jobs.push("Herbalist");
  if (item.adventurer) jobs.push("Adventurer");
  if (item.artist) jobs.push("Artist");
  if (item.beekeeper) jobs.push("Beekeeper");
  if (item.blacksmith) jobs.push("Blacksmith");
  if (item.cook) jobs.push("Cook");
  if (item.craftsman) jobs.push("Craftsman");
  if (item.fisherman) jobs.push("Fisherman");
  if (item.gravekeeper) jobs.push("Gravekeeper");
  if (item.guard) jobs.push("Guard");
  if (item.maskMaker) jobs.push("Mask Maker");
  if (item.hunter) jobs.push("Hunter");
  if (item.hunterLooting) jobs.push("Hunter (Looting)");
  if (item.mercenary) jobs.push("Mercenary");
  if (item.miner) jobs.push("Miner");
  if (item.researcher) jobs.push("Researcher");
  if (item.scout) jobs.push("Scout");
  if (item.weaver) jobs.push("Weaver");
  if (item.witch) jobs.push("Witch");
  
  return jobs.length > 0 ? jobs : ["None"];
}

/**
 * Format special weather array from specialWeather object
 */
export function formatSpecialWeather(item: ItemData): string[] {
  if (!item.specialWeather) return ["None"];
  
  const weather: string[] = [];
  if (item.specialWeather.muggy) weather.push("Muggy");
  if (item.specialWeather.flowerbloom) weather.push("Flowerbloom");
  if (item.specialWeather.fairycircle) weather.push("Fairy Circle");
  if (item.specialWeather.jubilee) weather.push("Jubilee");
  if (item.specialWeather.meteorShower) weather.push("Meteor Shower");
  if (item.specialWeather.rockslide) weather.push("Rockslide");
  if (item.specialWeather.avalanche) weather.push("Avalanche");
  
  return weather.length > 0 ? weather : ["None"];
}

/**
 * Format crafting materials display
 */
export function formatCraftingMaterials(item: ItemData): Array<{ itemName: string; quantity: number }> | null {
  if (!item.craftingMaterial || item.craftingMaterial.length === 0) {
    return null;
  }
  return item.craftingMaterial;
}

/**
 * Format image URL (handle GCS URLs, fallback images)
 */
export function formatItemImageUrl(image?: string): string {
  if (!image || image === "No Image") {
    return "/ankle_icon.png";
  }
  
  if (image.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return imageUrlForGcsUrl(image);
  }

  if (image.startsWith("http")) {
    return image;
  }

  return imageUrlForGcsPath(image);
}

/**
 * Get main category for display
 */
export function getMainCategory(item: { category?: string[] | string }): string {
  if (!item.category) return "Misc";
  if (Array.isArray(item.category) && item.category.length > 0) {
    return item.category[0];
  }
  if (typeof item.category === "string") {
    return item.category;
  }
  return "Misc";
}

/**
 * Get main type for display
 */
export function getMainType(item: { type?: string[] | string }): string {
  if (!item.type) return "Unknown";
  if (Array.isArray(item.type) && item.type.length > 0) {
    return item.type[0];
  }
  if (typeof item.type === "string") {
    return item.type;
  }
  return "Unknown";
}
