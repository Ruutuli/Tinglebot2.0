// ============================================================================
// ------------------- Jobs Reference Data -------------------
// Purpose: Full job metadata for the Reference → Jobs page
// - Descriptions, slugs, villages, exclusive flag
// - Derived from jobData.ts, which mirrors bot/data/jobData.js (keep in sync)
// ============================================================================

import { jobPerks } from "@/data/jobData";

const VILLAGES_ALL: readonly string[] = ["Rudania", "Inariko", "Vhintl"];

// Descriptions from game design (player-facing reference)
const JOB_DESCRIPTIONS: Record<string, string> = {
  Adventurer:
    "Those who regularly brave the world outside of the villages for any number of reasons; track monsters, clear paths, search for odd resources, whatever dangerous odd jobs there might be.",
  Artist:
    "Someone who uses their crafting skills to not just make something functional, but something pleasing to the eye, no matter what that item may be!",
  Bandit:
    "A person who looks not to benefit others, but survives by stealing from those around them. It is a dangerous position to be in, but some prefer that type of life.",
  Beekeeper:
    "A rare talent who maintains the health of beehives as they skillfully collect honey without destroying the entire hive or being stung to death by the bees.",
  Blacksmith:
    "Those who work at Rudania's great forge to produce quality armor and weaponry which are the envy of the rest of Hyrule.",
  Cook: "A person not only versed in making edible food, but someone who can take what meager ingredients this world gives them and make something delicious.",
  Courier:
    "Someone needs to run messages and deliver packages between everyone in the village, and a courier is that person. Able to deliver to couriers of other villages as well, to ensure parcels reach their intended hands.",
  Craftsman:
    "This individual is the one who creates the objects that a village might need to survive from pots, to buildings, from clothing, to weapons, and all things in between and beyond what a person might need in this world.",
  Entertainer:
    "Many jobs are focused on survival, but an entertainer makes the music, dances, and plays that make life enjoyable, whether it is setting the tempo for a difficult group project, telling tales, or bringing extra color to festivities.",
  Farmer:
    "Those who labor daily to grow the fruits, grains, and vegetables that are distinctive to their village's local cuisine, and necessary for rounding out everyone's diet.",
  Fisherman:
    "A person who catches fish from the various bodies of water in and around Inariko. Whether by hand, spear, or hook and line, they provide the village with its main food supply.",
  Forager:
    "Someone who goes outside of the village to gather whatever foodstuffs they can without disturbing the local predators or monsters. While their collections are considered 'supplementary' they are still critical for keeping everyone fed.",
  "Fortune Teller":
    "An odd profession found only in Vhintl, these people provide glimpses into the future through a variety of tools - crystal orb, cards, runes - in an attempt to discover the best harvest times, potential monster hoards, or anything that might affect their fellow villagers.",
  Graveskeeper:
    "What might seem a simple task quickly becomes difficult in these trying times, as these people not only bury the dead, but stand over their graves to ensure no unsettled spirits or stal disturb them.",
  Guard:
    "A guard is simply someone who stands watch over something, whether it is an important site, a holy relic, or the entire village itself. And then should danger appear, they are ready to fight to protect that thing.",
  Healer:
    "In a world as grim and dangerous as this, a healer is a critical profession that tends to the wounded and cures the sick, so that they may get back to their respective duties.",
  Herbalist:
    "Someone who works with plants, not necessarily by growing them or preparing them to be eaten, but in tinctures and potions, as cures or poisons, for whatever odd need there might be for these creations.",
  Hunter:
    "A person who stalks through the wilds in pursuit of the native wildlife for food, or possibly monsters for their materials, or simply to control animal populations that infringe on the village.",
  "Mask Maker":
    "Someone who earns their living by creating the masks that are so ubiquitous in Vhintl. Whether the mask was for decoration, stealth, intimidation, or ceremony, there was a craftsman responsible for its creation.",
  Mercenary:
    "A sword-for-hire that cannot be defined by their role in protecting person, place, or thing, and instead fills whatever need for violence there may be so long as there is payment.",
  Merchant:
    "A sometimes needed third party who goes between those producing a good, whether it is a raw material or finished product, and those who need it.",
  Miner:
    "Someone who works underground, finding, procuring, and delivering any number of minerals and ores to Rudania to be used by craftsmen or at the village's forge.",
  Priest:
    "An individual who organizes the worship of the Golden Goddesses, and associated festivals and rituals. They also may act as a source of wisdom and a balm for the troubled soul.",
  Rancher:
    "Someone who breeds and cares for the animals that make up the backbone of Rudania's foodstuffs. It is a job that requires dedication and patience.",
  Researcher:
    "Making use of the village library and research lab, these members of Inariko go about researching a wide variety of things, new ways to harness magic, potential applications of science, or any odd flight of fantasy that might take someone!",
  Scholar:
    "With improved facilities for Inariko's libraries, people are able to dedicate their lives to learning from the wealth of knowledge stored within, and to hopefully add their own volume into history's ledgers.",
  Scout:
    "Scouts are well-rounded individuals who act independently while moving outside the villages to gather information about such things as the locations of monsters, wildlife, or other potentially useful information.",
  Shopkeeper:
    "Someone who has managed to procure a fixed location to sell wares from, whether those wares are vegetables they grew themselves, or they are items they are selling as a middleman.",
  Stablehand:
    "An individual who is fluent in the care of a variety of animals that can be used as mounts, from majestic horses, to sturdy rams, or other beasts from different regions.",
  Teacher:
    "Someone who has dedicated their life to passing on knowledge to others, whether it be self-defense lessons, mystical lore, or a practical guide to plant life, or yes, reading and writing.",
  Villager:
    "Someone who has yet to discover how to contribute to society, or who fills so many odd jobs that no one could use any one to describe who they are or what they do.",
  Weaver:
    "Someone who uses the various fibers from the forest around Vhintl, including the Skulltula's spider silk, to create a number of useful items, clothing, ropes to suspend the village's buildings and bridges, and possibly even armor.",
  Witch:
    "Someone, no matter the gender, who works with a number of ingredients to create potions that produce a wide variety of effects.",
  // Mod-only (included for completeness; can be filtered out on the list page)
  Oracle: "Mod character.",
  Sage: "Mod character.",
  Dragon: "Mod character.",
};

/** Job display name → URL slug (stable for routing) */
const JOB_NAME_TO_SLUG: Record<string, string> = {
  Adventurer: "adventurer",
  Artist: "artist",
  Bandit: "bandit",
  Beekeeper: "beekeeper",
  Blacksmith: "blacksmith",
  Cook: "cook",
  Courier: "courier",
  Craftsman: "craftsman",
  Dragon: "dragon",
  Entertainer: "entertainer",
  Farmer: "farmer",
  Fisherman: "fisherman",
  Forager: "forager",
  "Fortune Teller": "fortune-teller",
  Graveskeeper: "graveskeeper",
  Guard: "guard",
  Healer: "healer",
  Herbalist: "herbalist",
  Hunter: "hunter",
  "Mask Maker": "mask-maker",
  Mercenary: "mercenary",
  Merchant: "merchant",
  Miner: "miner",
  Oracle: "oracle",
  Priest: "priest",
  Rancher: "rancher",
  Researcher: "researcher",
  Sage: "sage",
  Scholar: "scholar",
  Scout: "scout",
  Shopkeeper: "shopkeeper",
  Stablehand: "stablehand",
  Teacher: "teacher",
  Villager: "villager",
  Weaver: "weaver",
  Witch: "witch",
};

export type JobReference = {
  name: string;
  slug: string;
  perk: string;
  description: string;
  villages: string[];
  exclusive: boolean;
};

/** All jobs for the reference list (excluding mod-only by default) */
function buildJobsReference(includeModCharacters = false): JobReference[] {
  const refs: JobReference[] = jobPerks.map((p) => {
    const villages = p.village ? [p.village] : [...VILLAGES_ALL];
    const exclusive = p.village != null;
    const description = JOB_DESCRIPTIONS[p.job] ?? "";
    const slug = JOB_NAME_TO_SLUG[p.job] ?? p.job.toLowerCase().replace(/\s+/g, "-");
    return {
      name: p.job,
      slug,
      perk: p.perk,
      description,
      villages,
      exclusive,
    };
  });
  if (!includeModCharacters) {
    return refs.filter((r) => r.name !== "Oracle" && r.name !== "Sage" && r.name !== "Dragon");
  }
  return refs;
}

export const jobsReference: JobReference[] = buildJobsReference(false);

const slugToName = new Map<string, string>(
  Object.entries(JOB_NAME_TO_SLUG).map(([name, slug]) => [slug.toLowerCase(), name])
);

/**
 * Resolve URL slug to job display name (for detail page and API).
 */
export function slugToJobName(slug: string): string | null {
  return slugToName.get(slug.toLowerCase()) ?? null;
}

/** Build a single JobReference from job name (used for detail API, supports all jobPerks). */
export function getJobReferenceByName(name: string): JobReference | null {
  const p = jobPerks.find((j) => j.job.toLowerCase() === name.toLowerCase());
  if (!p) return null;
  const villages = p.village ? [p.village] : [...VILLAGES_ALL];
  const exclusive = p.village != null;
  const description = JOB_DESCRIPTIONS[p.job] ?? "";
  const slug = JOB_NAME_TO_SLUG[p.job] ?? p.job.toLowerCase().replace(/\s+/g, "-");
  return { name: p.job, slug, perk: p.perk, description, villages, exclusive };
}

/** Get job reference by URL slug (for detail page). */
export function getJobBySlug(slug: string): JobReference | null {
  const name = slugToJobName(slug);
  return name ? getJobReferenceByName(name) : null;
}

/**
 * Job display name to URL slug.
 */
export function jobNameToSlug(name: string): string {
  return JOB_NAME_TO_SLUG[name] ?? name.toLowerCase().replace(/\s+/g, "-");
}

/** Perk categories for filters (display order) */
export const PERK_CATEGORIES = [
  "Gathering",
  "Crafting",
  "Looting",
  "Boost",
  "Delivering",
  "Healing",
  "Vending",
  "Stealing",
  "None",
] as const;
