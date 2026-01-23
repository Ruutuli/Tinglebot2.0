// ============================================================================
// ------------------- Character Validation Utility -------------------
// Shared validation functions for character creation and editing
// ============================================================================

const { isValidRace } = require('../modules/raceModule');
const { isValidVillage } = require('../modules/locationsModule');
const { isUniqueCharacterName } = require('./validation');
const { connectToTinglebot } = require('../database/db');

// Import job data and create validation functions
const { jobPerks, villageJobs, allJobs } = require('../data/jobData');

/**
 * Check if a job is valid
 * @param {string} job - Job name to validate
 * @returns {boolean} - True if valid
 */
function isValidJob(job) {
  if (!job || typeof job !== 'string') return false;
  const normalizedJob = job.toLowerCase().trim();
  return allJobs.some(j => j.toLowerCase() === normalizedJob);
}

/**
 * Check if a job is exclusive to a specific village
 * @param {string} job - Job name to check
 * @returns {string|null} - Village name if exclusive, null otherwise
 */
function isVillageExclusiveJob(job) {
  if (!job || typeof job !== 'string') return null;
  const normalizedJob = job.toLowerCase();
  for (const [village, jobs] of Object.entries(villageJobs)) {
    if (jobs.map(j => j.toLowerCase()).includes(normalizedJob)) {
      return village;
    }
  }
  return null;
}

/**
 * Validate age
 * @param {any} age - Age value to validate
 * @returns {{valid: boolean, value?: number, error?: string}} - Validation result
 */
function validateAge(age) {
  if (age === undefined || age === null || age === '') {
    return { valid: false, error: 'Age is required' };
  }
  
  const ageNum = parseInt(age, 10);
  if (isNaN(ageNum) || ageNum < 1) {
    return { valid: false, error: 'Age must be a positive number (minimum 1)' };
  }
  
  return { valid: true, value: ageNum };
}

/**
 * Validate height
 * @param {any} height - Height value to validate
 * @returns {{valid: boolean, value?: number, error?: string}} - Validation result
 */
function validateHeight(height) {
  if (height === undefined || height === null || height === '') {
    return { valid: false, error: 'Height is required' };
  }
  
  const heightNum = parseFloat(height);
  if (isNaN(heightNum) || heightNum <= 0) {
    return { valid: false, error: 'Height must be a positive number' };
  }
  
  return { valid: true, value: heightNum };
}

/**
 * Validate hearts (maxHearts)
 * @param {any} hearts - Hearts value to validate
 * @returns {{valid: boolean, value?: number, error?: string}} - Validation result
 */
function validateHearts(hearts) {
  if (hearts === undefined || hearts === null || hearts === '') {
    return { valid: false, error: 'Hearts is required' };
  }
  
  const heartsNum = parseInt(hearts, 10);
  if (isNaN(heartsNum) || heartsNum < 1) {
    return { valid: false, error: 'Hearts must be a positive number (minimum 1)' };
  }
  
  return { valid: true, value: heartsNum };
}

/**
 * Validate stamina (maxStamina)
 * @param {any} stamina - Stamina value to validate
 * @returns {{valid: boolean, value?: number, error?: string}} - Validation result
 */
function validateStamina(stamina) {
  if (stamina === undefined || stamina === null || stamina === '') {
    return { valid: false, error: 'Stamina is required' };
  }
  
  const staminaNum = parseInt(stamina, 10);
  if (isNaN(staminaNum) || staminaNum < 1) {
    return { valid: false, error: 'Stamina must be a positive number (minimum 1)' };
  }
  
  return { valid: true, value: staminaNum };
}

/**
 * Validate race
 * @param {string} race - Race to validate
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateRace(race) {
  if (!race || typeof race !== 'string' || race.trim().length === 0) {
    return { valid: false, error: 'Race is required' };
  }
  
  if (!isValidRace(race)) {
    return { valid: false, error: `"${race}" is not a valid race` };
  }
  
  return { valid: true };
}

/**
 * Validate village
 * @param {string} village - Village to validate
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateVillage(village) {
  if (!village || typeof village !== 'string' || village.trim().length === 0) {
    return { valid: false, error: 'Village is required' };
  }
  
  if (!isValidVillage(village)) {
    return { valid: false, error: `"${village}" is not a valid village` };
  }
  
  return { valid: true };
}

/**
 * Validate job
 * @param {string} job - Job to validate
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateJob(job) {
  if (!job || typeof job !== 'string' || job.trim().length === 0) {
    return { valid: false, error: 'Job is required' };
  }
  
  if (!isValidJob(job)) {
    return { valid: false, error: `"${job}" is not a valid job` };
  }
  
  return { valid: true };
}

/**
 * Validate job/village compatibility
 * @param {string} job - Job name
 * @param {string} village - Village name
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateJobVillageCompatibility(job, village) {
  const jobVillage = isVillageExclusiveJob(job);
  if (jobVillage && jobVillage.toLowerCase() !== village.toLowerCase()) {
    return {
      valid: false,
      error: `Job "${job}" is exclusive to ${jobVillage} village, but character is in ${village} village`
    };
  }
  
  return { valid: true };
}

/**
 * Validate character name uniqueness
 * @param {string} userId - User Discord ID
 * @param {string} name - Character name
 * @returns {Promise<{valid: boolean, error?: string}>} - Validation result
 */
async function validateNameUniqueness(userId, name) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: 'Character name is required' };
  }
  
  await connectToTinglebot();
  const isUnique = await isUniqueCharacterName(userId, name);
  if (!isUnique) {
    return { valid: false, error: `A character with the name "${name}" already exists` };
  }
  
  return { valid: true };
}

/**
 * Validate biography fields
 * @param {Object} biography - Biography object with gender, virtue, personality, history
 * @param {boolean} required - Whether fields are required (true for create, false for edit)
 * @returns {{valid: boolean, errors?: string[]}} - Validation result
 */
function validateBiography(biography, required = true) {
  const errors = [];
  
  if (!biography) {
    if (required) {
      return { valid: false, errors: ['Biography information is required'] };
    }
    return { valid: true };
  }
  
  if (required) {
    if (!biography.gender || typeof biography.gender !== 'string' || biography.gender.trim().length === 0) {
      errors.push('Gender (with pronouns) is required');
    }
    
    if (!biography.virtue || !['power', 'wisdom', 'courage', 'tba'].includes(biography.virtue.toLowerCase())) {
      errors.push('Virtue must be one of: power, wisdom, courage, or TBA');
    }
    
    if (!biography.personality || typeof biography.personality !== 'string' || biography.personality.trim().length === 0) {
      errors.push('Personality description is required');
    }
    
    if (!biography.history || typeof biography.history !== 'string' || biography.history.trim().length === 0) {
      errors.push('History description is required');
    }
  } else {
    // For edit, validate format if provided but don't require
    if (biography.virtue !== undefined && biography.virtue !== null && biography.virtue !== '') {
      if (!['power', 'wisdom', 'courage', 'tba'].includes(biography.virtue.toLowerCase())) {
        errors.push('Virtue must be one of: power, wisdom, courage, or TBA');
      }
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return { valid: true };
}

/**
 * Validate required fields for character creation
 * @param {Object} data - Character data object
 * @returns {{valid: boolean, missingFields?: string[], errors?: string[]}} - Validation result
 */
function validateRequiredFields(data) {
  const missingFields = [];
  const requiredFields = ['name', 'age', 'height', 'hearts', 'stamina', 'pronouns', 'race', 'village', 'job'];
  
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim().length === 0)) {
      missingFields.push(field);
    }
  }
  
  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields,
      errors: [`Missing required fields: ${missingFields.join(', ')}`]
    };
  }
  
  return { valid: true };
}

/**
 * Validate all character data for creation
 * @param {Object} data - Character data object
 * @param {string} userId - User Discord ID
 * @returns {Promise<{valid: boolean, errors?: string[], values?: Object}>} - Validation result with parsed values
 */
async function validateCharacterData(data, userId) {
  const errors = [];
  const values = {};
  
  // Validate required fields
  const requiredCheck = validateRequiredFields(data);
  if (!requiredCheck.valid) {
    return requiredCheck;
  }
  
  // Validate and parse numeric fields
  const ageResult = validateAge(data.age);
  if (!ageResult.valid) {
    errors.push(ageResult.error);
  } else {
    values.age = ageResult.value;
  }
  
  const heightResult = validateHeight(data.height);
  if (!heightResult.valid) {
    errors.push(heightResult.error);
  } else {
    values.height = heightResult.value;
  }
  
  const heartsResult = validateHearts(data.hearts);
  if (!heartsResult.valid) {
    errors.push(heartsResult.error);
  } else {
    values.hearts = heartsResult.value;
  }
  
  const staminaResult = validateStamina(data.stamina);
  if (!staminaResult.valid) {
    errors.push(staminaResult.error);
  } else {
    values.stamina = staminaResult.value;
  }
  
  // Validate string fields
  const raceResult = validateRace(data.race);
  if (!raceResult.valid) {
    errors.push(raceResult.error);
  }
  
  const villageResult = validateVillage(data.village);
  if (!villageResult.valid) {
    errors.push(villageResult.error);
  }
  
  const jobResult = validateJob(data.job);
  if (!jobResult.valid) {
    errors.push(jobResult.error);
  }
  
  // Validate job/village compatibility
  if (data.job && data.village) {
    const compatibilityResult = validateJobVillageCompatibility(data.job, data.village);
    if (!compatibilityResult.valid) {
      errors.push(compatibilityResult.error);
    }
  }
  
  // Validate name uniqueness
  if (data.name && userId) {
    const nameResult = await validateNameUniqueness(userId, data.name);
    if (!nameResult.valid) {
      errors.push(nameResult.error);
    }
  }
  
  // Validate biography (required for creation)
  const biographyResult = validateBiography({
    gender: data.gender,
    virtue: data.virtue,
    personality: data.personality,
    history: data.history
  }, true);
  if (!biographyResult.valid) {
    errors.push(...biographyResult.errors);
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return { valid: true, values };
}

module.exports = {
  isValidJob,
  isVillageExclusiveJob,
  validateAge,
  validateHeight,
  validateHearts,
  validateStamina,
  validateRace,
  validateVillage,
  validateJob,
  validateJobVillageCompatibility,
  validateNameUniqueness,
  validateBiography,
  validateRequiredFields,
  validateCharacterData
};
