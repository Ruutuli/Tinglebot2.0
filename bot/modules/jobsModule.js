// ------------------- Import necessary modules and functions -------------------
const { fetchCharacterById, fetchModCharacterById, updateCharacterById, updateModCharacterById } = require('../database/db-bot');
const { handleError } = require('../utils/globalErrorHandler');
const { jobPages, villageJobs, generalJobs, modCharacterJobs, allJobs, jobPerks } = require('../data/jobData');

// Helper function for capitalization
const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

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
  if (!perkInfo) {
    console.error(`[jobsModule.js]: No perk info found for job: "${job}" (normalized: "${normalizedJob}")`);
    return null;
  }
  // Split perks by ' / ' and normalize to uppercase for consistency
  const perks = perkInfo.perk.split(' / ').map(perk => perk.trim().toUpperCase());
  return { perks: perks, village: perkInfo.village };
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
    // Try to fetch regular character first, then mod character if not found
    let character = await fetchCharacterById(characterId);
    let isModCharacter = false;
    
    if (!character) {
      // Try to fetch as mod character
      character = await fetchModCharacterById(characterId);
      isModCharacter = true;
    }
    
    if (!character) {
      throw new Error('[jobsModule.js]: Character not found in either regular or mod character collections');
    }
    
    character.job = capitalize(newJob);
    
    // Update the appropriate character type
    if (isModCharacter) {
      await updateModCharacterById(characterId, { job: character.job });
    } else {
      await updateCharacterById(characterId, { job: character.job });
    }
  } catch (error) {
    handleError(error, 'jobsModule.js');

    console.error('[jobsModule.js]: Error updating job', error.message);
    throw error;
  }
};

// Check if character has a specific perk
const hasPerk = (character, perk) => {
  // Safety check: ensure character and character.job exist
  if (!character || !character.job || typeof character.job !== 'string') {
    console.warn(`[jobsModule.js]: ⚠️ hasPerk called with invalid character data:`, {
      character: character ? 'exists' : 'null/undefined',
      characterType: typeof character,
      characterJob: character?.job,
      characterJobType: typeof character?.job,
      perk: perk
    });
    return false;
  }

  // Additional safety check for jobPerks array
  if (!Array.isArray(jobPerks) || jobPerks.length === 0) {
    console.error('[jobsModule.js]: ❌ jobPerks array is invalid or empty');
    return false;
  }
  
  try {
    const jobPerk = jobPerks.find(j => {
      // Safety check for each job perk object
      if (!j || !j.job || typeof j.job !== 'string') {
        console.warn(`[jobsModule.js]: ⚠️ Invalid job perk object found:`, j);
        return false;
      }
      return j.job.toLowerCase() === character.job.toLowerCase();
    });
    
    if (!jobPerk || !jobPerk.perk || typeof jobPerk.perk !== 'string') {
      return false;
    }
    
    return jobPerk.perk.toUpperCase().includes(perk.toUpperCase());
  } catch (error) {
    console.error('[jobsModule.js]: ❌ Error in hasPerk function:', error);
    return false;
  }
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