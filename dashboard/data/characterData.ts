// ============================================================================
// ------------------- Character Creation Static Data -------------------
// Static data for races, jobs, virtues, and job perks
// ============================================================================

export const RACES = [
  { name: 'Gerudo', value: 'gerudo' },
  { name: 'Goron', value: 'goron' },
  { name: 'Hylian', value: 'hylian' },
  { name: 'Keaton', value: 'keaton' },
  { name: 'Korok/Kokiri', value: 'korok/kokiri' },
  { name: 'Mixed', value: 'mixed' },
  { name: 'Mogma', value: 'mogma' },
  { name: 'Rito', value: 'rito' },
  { name: 'Sheikah', value: 'sheikah' },
  { name: 'Twili', value: 'twili' },
  { name: 'Zora', value: 'zora' }
] as const;

export const JOB_PAGES = [
  { title: 'General Jobs (Page 1)', jobs: ['Adventurer', 'Artist', 'Bandit', 'Cook', 'Courier', 'Craftsman', 'Farmer', 'Forager', 'Graveskeeper', 'Guard', 'Healer', 'Entertainer'] },
  { title: 'General Jobs (Page 2)', jobs: ['Herbalist', 'Hunter', 'Merchant', 'Mercenary', 'Priest', 'Scout', 'Shopkeeper', 'Stablehand', 'Villager', 'Witch'] },
  { title: 'Inariko Exclusive Jobs', jobs: ['Fisherman', 'Researcher', 'Scholar', 'Teacher'] },
  { title: 'Rudania Exclusive Jobs', jobs: ['Rancher', 'Blacksmith', 'Miner'] },
  { title: 'Vhintl Exclusive Jobs', jobs: ['Beekeeper', 'Fortune Teller', 'Mask Maker', 'Weaver'] },
] as const;

// Flatten all jobs into a single array
export const ALL_JOBS = JOB_PAGES.flatMap(page => page.jobs);

// Mod/admin-only jobs
export const MOD_JOBS = ['Oracle', 'Sage', 'Dragon'] as const;

export const VIRTUES = ['Power', 'Wisdom', 'Courage'] as const;

export const STARTER_GEAR_NAMES = [
  'Soup Ladle',
  'Pot Lid',
  'Wooden Shield',
  'Wooden Bow',
  'Boomerang',
  'Emblazoned Shield',
  "Fisherman's Shield",
  "Hunter's Shield",
  "Traveler's Shield",
  'Rusty Broadsword',
  "Traveler's Sword",
  "Woodcutter's Axe",
  "Traveler's Bow",
  'Wooden Mop',
  'Rusty Claymore',
  "Traveler's Claymore",
  'Tree Branch',
  'Rusty Shield',
  'Korok Leaf',
  'Farming Hoe',
  "Farmer's Pitchfork",
  'Rusty Halberd',
  "Traveler's Spear",
  'Old Shirt',
  'Well-Worn Trousers'
] as const;

export type JobPerk = {
  job: string;
  perk: string;
  village: string | null;
};

export const JOB_PERKS: JobPerk[] = [
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
