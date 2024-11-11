// jobsModule.js

// Import necessary modules and functions
const { fetchCharacterById, updateCharacterById } = require('../database/characterService');

// Define job pages and their respective jobs
const jobPages = [
  {
    title: 'General Jobs (Page 1)',
    jobs: ['Adventurer', 'Artist', 'Cook', 'Courier', 'Craftsman', 'Farmer', 'Forager', 'Graveskeeper', 'Guard', 'Healer','Herbalist']
  },
  {
    title: 'General Jobs (Page 2)',
    jobs: ['Hunter', 'Merchant', 'Mercenary', 'Minstrel', 'Priest', 'Scout', 'Shopkeeper', 'Stablehand', 'Villager', 'Witch']
  },
  {
    title: 'Inariko Exclusive Jobs',
    jobs: ['Fisherman', 'Researcher', 'Scholar', 'Teacher']
  },
  {
    title: 'Rudania Exclusive Jobs',
    jobs: ['AB (Meat)', 'AB (Live)', 'Blacksmith', 'Miner', 'Performer']
  },
  {
    title: 'Vhintl Exclusive Jobs',
    jobs: ['Beekeeper', 'Fortune Teller', 'Mask Maker', 'Weaver']
  },
  {
    title: 'All Jobs',
    jobs: [] // This will be populated later with all jobs
  }
];

// Define village jobs
const villageJobs = {
  inariko: ['Fisherman', 'Researcher', 'Scholar', 'Teacher'],
  rudania: ['AB (Meat)', 'AB (Live)', 'Blacksmith', 'Miner', 'Performer'],
  vhintl: ['Beekeeper', 'Fortune Teller', 'Mask Maker', 'Weaver']
};

// Define general jobs
const generalJobs = [
  'Adventurer', 'Artist', 'Bandit', 'Cook', 'Courier', 'Craftsman', 'Farmer', 'Forager',
  'Guard', 'Graveskeeper', 'Healer', 'Herbalist', 'Hunter', 'Merchant', 'Mercenary',
  'Minstrel', 'Priest', 'Scout', 'Shopkeeper', 'Stablehand', 'Villager', 'Witch'
];

// Consolidate all jobs
const allJobs = [...new Set([...Object.values(villageJobs).flat(), ...generalJobs])].sort();
jobPages.find(page => page.title === 'All Jobs').jobs = allJobs;

// Job, Perk, and Village Exclusivity Information
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

// Job name mapping
const jobNameMap = {
  'AB (Meat)': 'Animal Breeder (Meat)',
  'AB (Live)': 'Animal Breeder (Live)',
  // Add other mappings as needed
};

// Updated function to get the proper job name
const getProperJobName = (job) => {
  return jobNameMap[job] || job;
};

// Normalize job name to a standard format
const normalizeJobName = (job) => {
  return job.replace(/[\s()]/g, '').toLowerCase();
};

// Validate if the job is in the list of valid jobs
const validJobs = jobPerks.map(job => normalizeJobName(job.job));
const isValidJob = (job) => {
  return validJobs.includes(normalizeJobName(job));
};

// Get village-exclusive jobs for a given village
const getVillageExclusiveJobs = (village) => {
  if (!village) {
    return [];
  }
  return villageJobs[village.toLowerCase()] || [];
};

// Get job page by index with pagination support
const getJobPage = (pageIndex) => {
  if (pageIndex < 0 || pageIndex >= jobPages.length) {
    throw new Error('Invalid page index');
  }
  return jobPages[pageIndex];
};

// Get specific page of general jobs
const getGeneralJobsPage = (page) => {
  if (page < 1 || page > 2) {
    throw new Error('Invalid page number for General Jobs');
  }
  return jobPages[page - 1].jobs;
};

// Get all available jobs
const getAllJobs = () => {
  return allJobs;
};

// Get all job categories for autocomplete
const getAllJobCategories = () => {
  return jobPages.filter(page => page.title !== 'All Jobs').map(page => page.title);
};

// Get jobs by category
const getJobsByCategory = (category, page = 1) => {
  if (category === 'General Jobs') {
    return getGeneralJobsPage(page); // Fetch specific page of General Jobs
  }
  const pageData = jobPages.find(pageData => pageData.title === category);
  if (!pageData) {
    throw new Error('Invalid job category');
  }
  return pageData.jobs;
};

// Get job perks by job name
const getJobPerk = (job) => {
  const perkInfo = jobPerks.find(perk => perk.job.toLowerCase().trim() === job.toLowerCase().trim());
  if (!perkInfo) return null;
  const perks = perkInfo.perk.split(' / ').map(perk => perk.trim());
  return { perks, village: perkInfo.village };
};

// Check if a job is village-exclusive and return the associated village name
const isVillageExclusiveJob = (job) => {
  const lowerCaseJob = job.toLowerCase();
  if (lowerCaseJob.includes('inariko exclusive jobs')) return 'inariko';
  if (lowerCaseJob.includes('rudania exclusive jobs')) return 'rudania';
  if (lowerCaseJob.includes('vhintl exclusive jobs')) return 'vhintl';

  for (const [village, jobs] of Object.entries(villageJobs)) {
    if (jobs.map(job => job.toLowerCase()).includes(lowerCaseJob)) {
      return village;
    }
  }
  return null;
};

// Create job options for dropdowns
const createJobOptions = (jobs) => jobs.map(job => ({ name: job, value: job.toLowerCase() }));

// Update the job of a character
const updateJob = async (characterId, newJob, interaction) => {
  try {
    const character = await fetchCharacterById(characterId);

    if (!character) {
      throw new Error('Character not found');
    }

    character.job = newJob;
    await updateCharacterById(characterId, { job: newJob });

    // Return success message (handled in the calling function)
  } catch (error) {
    throw error; // Error handling is done in the calling function
  }
};

// Export functions
module.exports = {
  jobPages,
  villageJobs,
  generalJobs,
  getVillageExclusiveJobs,
  getJobPage,
  getAllJobs,
  getAllJobCategories,
  getJobsByCategory,
  getJobPerk,
  createJobOptions,
  updateJob,
  getGeneralJobsPage,
  isVillageExclusiveJob,
  jobPerks,
  normalizeJobName,
  isValidJob,
  getProperJobName // Ensure this is exported
};
