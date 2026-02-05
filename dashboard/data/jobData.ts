// ============================================================================
// ------------------- Job Data Configuration -------------------
// Purpose: Static job-related data and metadata for dashboard
// - Defines job perks and their associations for field syncing
// - Used by item editor to automatically sync job flags with arrays
// ============================================================================

export type JobPerk = {
  job: string;
  perk: string;
  village: string | null;
};

// Job perks and metadata - matches bot/data/jobData.js
export const jobPerks: JobPerk[] = [
  { job: 'Fisherman', perk: 'GATHERING', village: 'Inariko' },
  { job: 'Researcher', perk: 'CRAFTING', village: 'Inariko' },
  { job: 'Scholar', perk: 'BOOST', village: 'Inariko' },
  { job: 'Teacher', perk: 'BOOST', village: 'Inariko' },
  { job: 'Rancher', perk: 'GATHERING', village: 'Rudania' },
  { job: 'Blacksmith', perk: 'CRAFTING', village: 'Rudania' },
  { job: 'Miner', perk: 'GATHERING', village: 'Rudania' },
  { job: 'Entertainer', perk: 'BOOST', village: null },
  { job: 'Beekeeper', perk: 'GATHERING', village: 'Vhintl' },
  { job: 'Fortune Teller', perk: 'BOOST', village: 'Vhintl' },
  { job: 'Mask Maker', perk: 'CRAFTING', village: 'Vhintl' },
  { job: 'Weaver', perk: 'CRAFTING', village: 'Vhintl' },
  { job: 'Adventurer', perk: 'LOOTING', village: null },
  { job: 'Artist', perk: 'CRAFTING', village: null },
  { job: 'Bandit', perk: 'STEALING', village: null },
  { job: 'Cook', perk: 'CRAFTING', village: null },
  { job: 'Courier', perk: 'DELIVERING', village: null },
  { job: 'Craftsman', perk: 'CRAFTING', village: null },
  { job: 'Farmer', perk: 'GATHERING', village: null },
  { job: 'Forager', perk: 'GATHERING', village: null },
  { job: 'Graveskeeper', perk: 'LOOTING', village: null },
  { job: 'Guard', perk: 'LOOTING', village: null },
  { job: 'Healer', perk: 'HEALING', village: null },
  { job: 'Herbalist', perk: 'GATHERING', village: null },
  { job: 'Hunter', perk: 'GATHERING / LOOTING', village: null },
  { job: 'Merchant', perk: 'VENDING', village: null },
  { job: 'Mercenary', perk: 'LOOTING', village: null },
  { job: 'Priest', perk: 'BOOST', village: null },
  { job: 'Scout', perk: 'LOOTING', village: null },
  { job: 'Shopkeeper', perk: 'VENDING', village: null },
  { job: 'Stablehand', perk: 'N/A', village: null },
  { job: 'Villager', perk: 'NONE', village: null },
  { job: 'Witch', perk: 'CRAFTING', village: null },
  { job: 'Oracle', perk: 'ALL', village: null },
  { job: 'Sage', perk: 'ALL', village: null },
  { job: 'Dragon', perk: 'ALL', village: null }
];

// ------------------- Helper Functions -------------------

/**
 * Get job perk by job name (case-insensitive)
 */
export function getJobPerk(jobName: string): JobPerk | null {
  return jobPerks.find(j => j.job.toLowerCase() === jobName.toLowerCase()) || null;
}

/**
 * Check if a job has a specific perk type
 */
export function jobHasPerk(jobName: string, perkType: string): boolean {
  const job = getJobPerk(jobName);
  if (!job) return false;
  return job.perk.toUpperCase().includes(perkType.toUpperCase());
}

/**
 * Get all jobs that have a specific perk type
 */
export function getJobsByPerk(perkType: string): string[] {
  return jobPerks
    .filter(job => job.perk.toUpperCase().includes(perkType.toUpperCase()))
    .map(job => job.job);
}

/**
 * Map job field name (camelCase) to job display name
 */
export function getJobDisplayName(fieldName: string): string {
  const jobMap: Record<string, string> = {
    adventurer: 'Adventurer',
    artist: 'Artist',
    beekeeper: 'Beekeeper',
    blacksmith: 'Blacksmith',
    cook: 'Cook',
    craftsman: 'Craftsman',
    farmer: 'Farmer',
    fisherman: 'Fisherman',
    forager: 'Forager',
    gravekeeper: 'Graveskeeper',
    guard: 'Guard',
    maskMaker: 'Mask Maker',
    rancher: 'Rancher',
    herbalist: 'Herbalist',
    hunter: 'Hunter',
    hunterLooting: 'Hunter (Looting)',
    mercenary: 'Mercenary',
    miner: 'Miner',
    researcher: 'Researcher',
    scout: 'Scout',
    weaver: 'Weaver',
    witch: 'Witch',
  };
  return jobMap[fieldName] || fieldName;
}

// CommonJS export for compatibility with .js files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { jobPerks, getJobPerk, getJobDisplayName, jobHasPerk, getJobsByPerk };
}
