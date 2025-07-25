// ------------------- Import necessary modules and functions -------------------
const { fetchCharacterById, updateCharacterById } = require('../database/db');
const { handleError } = require('../utils/globalErrorHandler');

// Helper function for capitalization
const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// ------------------- Define job data and configurations -------------------
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

// ------------------- Job perks and metadata -------------------
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

// ------------------- Utility functions -------------------
// Map job names to their proper titles
const jobNameMap = {
  'Rancher': 'Rancher',
  // Add additional mappings as needed
};

const getProperJobName = (job) => jobNameMap[job] || job;

// Normalize job names for comparison
const normalizeJobName = (job) => {
  if (!job) return ''; // Return an empty string if job is null or undefined
  return job.replace(/[\s()]/g, '').toLowerCase();
};

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
  if (!job || typeof job !== 'string' || !job.trim()) {
      console.error(`[jobsModule.js]: Invalid job provided: ${job}`);
      return null;
  }
  const normalizedJob = job.toLowerCase().trim();
  const perkInfo = jobPerks.find(perk => perk.job.toLowerCase().trim() === normalizedJob);
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
    handleError(error, 'jobsModule.js');

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
  modCharacterJobs,
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