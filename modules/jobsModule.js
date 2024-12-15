// ------------------- Import necessary modules and functions -------------------
const { fetchCharacterById, updateCharacterById } = require('../database/characterService');
const { capitalize } = require('../modules/formattingModule');

// ------------------- Define job data and configurations -------------------
// Job categories with associated jobs
const jobPages = [
  { title: 'General Jobs (Page 1)', jobs: ['Adventurer', 'Artist', 'Cook', 'Courier', 'Craftsman', 'Farmer', 'Forager', 'Graveskeeper', 'Guard', 'Healer', 'Herbalist'] },
  { title: 'General Jobs (Page 2)', jobs: ['Hunter', 'Merchant', 'Mercenary', 'Minstrel', 'Priest', 'Scout', 'Shopkeeper', 'Stablehand', 'Villager', 'Witch'] },
  { title: 'Inariko Exclusive Jobs', jobs: ['Fisherman', 'Researcher', 'Scholar', 'Teacher'] },
  { title: 'Rudania Exclusive Jobs', jobs: ['AB (Meat)', 'AB (Live)', 'Blacksmith', 'Miner', 'Performer'] },
  { title: 'Vhintl Exclusive Jobs', jobs: ['Beekeeper', 'Fortune Teller', 'Mask Maker', 'Weaver'] },
  { title: 'All Jobs', jobs: [] } // This will be populated dynamically
];

// Village-specific job assignments
const villageJobs = {
  inariko: ['Fisherman', 'Researcher', 'Scholar', 'Teacher'],
  rudania: ['AB (Meat)', 'AB (Live)', 'Blacksmith', 'Miner', 'Performer'],
  vhintl: ['Beekeeper', 'Fortune Teller', 'Mask Maker', 'Weaver']
};

// General jobs available to all
const generalJobs = [
  'Adventurer', 'Artist', 'Bandit', 'Cook', 'Courier', 'Craftsman', 'Farmer', 'Forager',
  'Guard', 'Graveskeeper', 'Healer', 'Herbalist', 'Hunter', 'Merchant', 'Mercenary',
  'Minstrel', 'Priest', 'Scout', 'Shopkeeper', 'Stablehand', 'Villager', 'Witch'
];

// Combine all job categories into a single sorted array
const allJobs = [...new Set([...Object.values(villageJobs).flat(), ...generalJobs])].sort();
jobPages.find(page => page.title === 'All Jobs').jobs = allJobs;

// ------------------- Job perks and metadata -------------------
const jobPerks = [
  { job: 'Fisherman', perk: 'GATHERING', village: 'INARIKO' },
  { job: 'Researcher', perk: 'CRAFTING', village: 'INARIKO' },
  { job: 'Scholar', perk: 'BOOST', village: 'INARIKO' },
  { job: 'Teacher', perk: 'BOOST', village: 'INARIKO' },
  { job: 'AB (Meat)', perk: 'GATHERING', village: 'RUDANIA' },
  { job: 'AB (Live)', perk: 'GATHERING', village: 'RUDANIA' },
  { job: 'Blacksmith', perk: 'CRAFTING', village: 'RUDANIA' },
  { job: 'Miner', perk: 'GATHERING', village: 'RUDANIA' },
  { job: 'Performer', perk: 'ENTERTAINING', village: 'RUDANIA' },
  { job: 'Beekeeper', perk: 'GATHERING', village: 'VHINTL' },
  { job: 'Fortune Teller', perk: 'BOOST', village: 'VHINTL' },
  { job: 'Mask Maker', perk: 'CRAFTING', village: 'VHINTL' },
  { job: 'Weaver', perk: 'CRAFTING', village: 'VHINTL' },
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
  { job: 'Healer', perk: 'CRAFTING / HEALING', village: null },
  { job: 'Herbalist', perk: 'GATHERING / CRAFTING', village: null },
  { job: 'Hunter', perk: 'GATHERING / LOOTING', village: null },
  { job: 'Merchant', perk: 'VENDING', village: null },
  { job: 'Mercenary', perk: 'LOOTING', village: null },
  { job: 'Minstrel', perk: 'ENTERTAINING', village: null },
  { job: 'Priest', perk: 'BOOST', village: null },
  { job: 'Scout', perk: 'LOOTING', village: null },
  { job: 'Shopkeeper', perk: 'VENDING', village: null },
  { job: 'Stablehand', perk: 'N/A', village: null },
  { job: 'Villager', perk: 'NONE', village: null },
  { job: 'Witch', perk: 'CRAFTING', village: null }
];

// ------------------- Utility functions -------------------
// Map job names to their proper titles
const jobNameMap = {
  'AB (Meat)': 'Animal Breeder (Meat)',
  'AB (Live)': 'Animal Breeder (Live)',
  // Add additional mappings as needed
};

const getProperJobName = (job) => jobNameMap[job] || job;

// Normalize job names for comparison
const normalizeJobName = (job) => job.replace(/[\s()]/g, '').toLowerCase();

// Validate if a job is valid
const validJobs = jobPerks.map(job => normalizeJobName(job.job));
const isValidJob = (job) => validJobs.includes(normalizeJobName(job));

// Get village-exclusive jobs
const getVillageExclusiveJobs = (village) => village ? villageJobs[village.toLowerCase()] || [] : [];

// ------------------- Pagination and data retrieval -------------------
// Fetch specific job page
const getJobPage = (pageIndex) => {
  if (pageIndex < 0 || pageIndex >= jobPages.length) throw new Error('[jobsModule.js]: Invalid page index');
  return jobPages[pageIndex];
};

// Get general job pages
const getGeneralJobsPage = (page) => {
  if (page < 1 || page > 2) throw new Error('[jobsModule.js]: Invalid page number for General Jobs');
  return jobPages[page - 1].jobs;
};

// Fetch all jobs
const getAllJobs = () => allJobs;

// Fetch job categories for autocomplete
const getAllJobCategories = () => jobPages.filter(page => page.title !== 'All Jobs').map(page => page.title);

// Fetch jobs by category
const getJobsByCategory = (category, page = 1) => {
  if (category === 'General Jobs') return getGeneralJobsPage(page);
  const pageData = jobPages.find(pageData => pageData.title === category);
  if (!pageData) throw new Error('[jobsModule.js]: Invalid job category');
  return pageData.jobs;
};

// Fetch job perks by job name
const getJobPerk = (job) => {
  const perkInfo = jobPerks.find(perk => perk.job.toLowerCase().trim() === job.toLowerCase().trim());
  return perkInfo ? { perks: perkInfo.perk.split(' / ').map(perk => perk.trim()), village: perkInfo.village } : null;
};

// Check if a job is exclusive to a village
const isVillageExclusiveJob = (job) => {
  const lowerCaseJob = job.toLowerCase();
  for (const [village, jobs] of Object.entries(villageJobs)) {
    if (jobs.map(job => job.toLowerCase()).includes(lowerCaseJob)) return village;
  }
  return null;
};

// ------------------- Character job update functionality -------------------
// Update the job of a character
const updateJob = async (characterId, newJob) => {
  try {
    const character = await fetchCharacterById(characterId);
    if (!character) throw new Error('[jobsModule.js]: Character not found');
    character.job = capitalize(newJob);
    await updateCharacterById(characterId, { job: character.job });
  } catch (error) {
    console.error('[jobsModule.js]: Error updating job', error.message);
    throw error;
  }
};

// Check if character has a specific perk
const hasPerk = (character, perk) => {
  const jobPerk = jobPerks.find(j => j.job.toLowerCase() === character.job.toLowerCase());
  return jobPerk && jobPerk.perk.toUpperCase().includes(perk.toUpperCase());
};


// ------------------- Exports -------------------
module.exports = {
  jobPages,
  villageJobs,
  generalJobs,
  jobPerks,
  getVillageExclusiveJobs,
  getJobPage,
  getAllJobs,
  getAllJobCategories,
  getJobsByCategory,
  getJobPerk,
  createJobOptions: (jobs) => jobs.map(job => ({ name: job, value: job.toLowerCase() })),
  updateJob,
  getGeneralJobsPage,
  isVillageExclusiveJob,
  normalizeJobName,
  isValidJob,
  getProperJobName,
  hasPerk
};


// THIS VERSION