// ------------------- Job Data Configuration -------------------
// This file contains job-related data that can be imported without circular dependencies

// Job categories with associated jobs
const jobPages = [
  { title: 'General Jobs (Page 1)', jobs: ['Adventurer', 'Artist', "Bandit", 'Cook', 'Courier', 'Craftsman', 'Farmer', 'Forager', 'Graveskeeper', 'Guard', 'Healer', 'Entertainer'] },
  { title: 'General Jobs (Page 2)', jobs: ['Herbalist', 'Hunter', 'Merchant', 'Mercenary', 'Priest', 'Scout', 'Shopkeeper', 'Stablehand', 'Villager', 'Witch'] },
  { title: 'Inariko Exclusive Jobs', jobs: ['Fisherman', 'Researcher', 'Scholar', 'Teacher'] },
  { title: 'Rudania Exclusive Jobs', jobs: ['Rancher', 'Blacksmith', 'Miner'] },
  { title: 'Vhintl Exclusive Jobs', jobs: ['Beekeeper', 'Fortune Teller', 'Mask Maker', 'Weaver'] },
  { title: 'All Jobs', jobs: [] } // This will be populated dynamically
];

// Village-specific job assignments
const villageJobs = {
  inariko: ['Fisherman', 'Researcher', 'Scholar', 'Teacher'],
  rudania: ['Rancher', 'Blacksmith', 'Miner'],
  vhintl: ['Beekeeper', 'Fortune Teller', 'Mask Maker', 'Weaver']
};

// General jobs available to all
const generalJobs = [
  'Adventurer', 'Artist', 'Bandit', 'Cook', 'Courier', 'Craftsman', 'Farmer', 'Forager',
  'Guard', 'Graveskeeper', 'Healer', 'Herbalist', 'Hunter', 'Merchant', 'Mercenary',
  'Priest', 'Scout', 'Shopkeeper', 'Stablehand', 'Villager', 'Witch', 'Entertainer'
];

// Mod character jobs (Oracle, Sage, Dragon)
const modCharacterJobs = ['Oracle', 'Sage', 'Dragon'];

// Combine all job categories into a single sorted array
const allJobs = [...new Set([...Object.values(villageJobs).flat(), ...generalJobs, ...modCharacterJobs])].sort();
jobPages.find(page => page.title === 'All Jobs').jobs = allJobs;

// Job perks and metadata
const jobPerks = [
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

module.exports = {
  jobPages,
  villageJobs,
  generalJobs,
  modCharacterJobs,
  allJobs,
  jobPerks
};
