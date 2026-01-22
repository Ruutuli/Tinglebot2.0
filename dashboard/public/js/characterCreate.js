/* ============================================================================
   characterCreate.js
   Purpose: Handles character creation form submission, validation, and API communication
============================================================================ */

// ============================================================================
// ------------------- Global Variables -------------------
// ============================================================================
let races = [];
let allJobs = [];
let villageJobsMap = {};
let starterGear = {
  weapons: [],
  shields: [],
  armor: {
    head: [],
    chest: [],
    legs: []
  }
};

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await initializeForm();
  setupEventListeners();
});

// ============================================================================
// ------------------- Form Initialization -------------------
// ============================================================================
async function initializeForm() {
  try {
    // Load races, jobs, and starter gear
    await loadRaces();
    await loadJobs();
    await loadStarterGear();
    
    // Populate race dropdown
    populateRaceDropdown();
    
    // Populate starter gear dropdowns
    populateStarterGearDropdowns();
    
    // Setup village change handler to filter jobs
    const villageSelect = document.getElementById('character-village');
    villageSelect.addEventListener('change', handleVillageChange);
    
    // Setup icon preview
    setupIconPreview();
    
    // Setup appArt preview
    setupAppArtPreview();
    
    // Setup sentence counting
    setupSentenceCounting();
    
    // Check authentication
    await checkAuthentication();
  } catch (error) {
    console.error('Error initializing form:', error);
    showMessage('Failed to initialize form. Please refresh the page.', 'error');
  }
}

// ============================================================================
// ------------------- Data Loading -------------------
// ============================================================================
async function loadRaces() {
  try {
    const response = await fetch('/api/characters/races');
    if (!response.ok) {
      throw new Error('Failed to load races');
    }
    const data = await response.json();
    races = data.data || [];
  } catch (error) {
    console.error('Error loading races:', error);
    // Fallback to hardcoded races
    races = ['Gerudo', 'Goron', 'Hylian', 'Keaton', 'Korok/Kokiri', 'Mixed', 'Mogma', 'Rito', 'Sheikah', 'Twili', 'Zora'];
  }
}

async function loadJobs() {
  try {
    // Load all jobs first
    const response = await fetch('/api/characters/jobs');
    if (!response.ok) {
      throw new Error('Failed to load jobs');
    }
    const data = await response.json();
    allJobs = data.data || [];
    
    // Load village-specific jobs
    const villages = ['inariko', 'rudania', 'vhintl'];
    for (const village of villages) {
      const villageResponse = await fetch(`/api/characters/jobs?village=${village}`);
      if (villageResponse.ok) {
        const villageData = await villageResponse.json();
        villageJobsMap[village] = villageData.data || [];
      }
    }
  } catch (error) {
    console.error('Error loading jobs:', error);
    // Fallback to hardcoded jobs
    allJobs = [
      'Adventurer', 'Artist', 'Bandit', 'Beekeeper', 'Blacksmith', 'Cook', 'Courier', 
      'Craftsman', 'Farmer', 'Fisherman', 'Forager', 'Fortune Teller', 'Graveskeeper', 
      'Guard', 'Healer', 'Herbalist', 'Hunter', 'Mask Maker', 'Merchant', 'Mercenary', 
      'Miner', 'Priest', 'Rancher', 'Researcher', 'Scout', 'Scholar', 'Shopkeeper', 
      'Stablehand', 'Teacher', 'Villager', 'Weaver', 'Witch', 'Entertainer'
    ];
  }
}

async function loadStarterGear() {
  try {
    const response = await fetch('/api/characters/starter-gear');
    if (!response.ok) {
      throw new Error('Failed to load starter gear');
    }
    const data = await response.json();
    starterGear = data.categorized || {
      weapons: [],
      shields: [],
      armor: { head: [], chest: [], legs: [] }
    };
  } catch (error) {
    console.error('Error loading starter gear:', error);
    starterGear = {
      weapons: [],
      shields: [],
      armor: { head: [], chest: [], legs: [] }
    };
  }
}

// ============================================================================
// ------------------- Dropdown Population -------------------
// ============================================================================
function populateRaceDropdown() {
  const raceSelect = document.getElementById('character-race');
  raceSelect.innerHTML = '<option value="">Select a race...</option>';
  
  races.forEach(race => {
    const option = document.createElement('option');
    option.value = race.toLowerCase();
    option.textContent = race;
    raceSelect.appendChild(option);
  });
}

function populateJobDropdown(village) {
  const jobSelect = document.getElementById('character-job');
  jobSelect.innerHTML = '<option value="">Select a job...</option>';
  
  if (!village) {
    jobSelect.disabled = true;
    return;
  }
  
  const jobs = villageJobsMap[village.toLowerCase()] || allJobs;
  jobs.sort().forEach(job => {
    const option = document.createElement('option');
    option.value = job;
    option.textContent = job;
    jobSelect.appendChild(option);
  });
  
  jobSelect.disabled = false;
}

function populateStarterGearDropdowns() {
  // Populate weapon dropdown
  const weaponSelect = document.getElementById('starter-weapon');
  if (weaponSelect && starterGear.weapons) {
    starterGear.weapons.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      weaponSelect.appendChild(option);
    });
  }
  
  // Populate shield dropdown
  const shieldSelect = document.getElementById('starter-shield');
  if (shieldSelect && starterGear.shields) {
    starterGear.shields.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      shieldSelect.appendChild(option);
    });
  }
  
  // Populate chest armor dropdown
  const chestSelect = document.getElementById('starter-armor-chest');
  if (chestSelect && starterGear.armor && starterGear.armor.chest) {
    starterGear.armor.chest.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      chestSelect.appendChild(option);
    });
  }
  
  // Populate leg armor dropdown
  const legsSelect = document.getElementById('starter-armor-legs');
  if (legsSelect && starterGear.armor && starterGear.armor.legs) {
    starterGear.armor.legs.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      legsSelect.appendChild(option);
    });
  }
}

// ============================================================================
// ------------------- Event Handlers -------------------
// ============================================================================
function handleVillageChange(event) {
  const village = event.target.value;
  populateJobDropdown(village);
  
  // Clear job selection when village changes
  const jobSelect = document.getElementById('character-job');
  jobSelect.value = '';
}

function setupIconPreview() {
  const iconInput = document.getElementById('character-icon');
  const previewContainer = document.getElementById('icon-preview-container');
  const previewImg = document.getElementById('icon-preview');
  const removeBtn = document.getElementById('remove-icon-preview');
  const filenameDisplay = document.getElementById('icon-filename');
  
  iconInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showMessage('Invalid file type. Please select a JPEG, PNG, GIF, or WebP image.', 'error');
        iconInput.value = '';
        if (filenameDisplay) filenameDisplay.style.display = 'none';
        return;
      }
      
      // Validate file size (7MB)
      if (file.size > 7 * 1024 * 1024) {
        showMessage('Image file is too large. Maximum size is 7MB.', 'error');
        iconInput.value = '';
        if (filenameDisplay) filenameDisplay.style.display = 'none';
        return;
      }
      
      // Show filename
      if (filenameDisplay) {
        filenameDisplay.textContent = `Selected: ${file.name}`;
        filenameDisplay.style.display = 'block';
      }
      
      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewContainer.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      previewContainer.style.display = 'none';
      if (filenameDisplay) filenameDisplay.style.display = 'none';
    }
  });
  
  removeBtn.addEventListener('click', () => {
    iconInput.value = '';
    previewContainer.style.display = 'none';
    previewImg.src = '';
    if (filenameDisplay) {
      filenameDisplay.style.display = 'none';
      filenameDisplay.textContent = '';
    }
  });
}

function setupAppArtPreview() {
  const appArtInput = document.getElementById('character-app-art');
  const previewContainer = document.getElementById('appart-preview-container');
  const previewImg = document.getElementById('appart-preview');
  const removeBtn = document.getElementById('remove-appart-preview');
  const filenameDisplay = document.getElementById('appart-filename');
  
  if (!appArtInput) return;
  
  appArtInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showMessage('Invalid file type for application art. Please select a JPEG, PNG, GIF, or WebP image.', 'error');
        appArtInput.value = '';
        if (filenameDisplay) filenameDisplay.style.display = 'none';
        return;
      }
      
      // Validate file size (7MB)
      if (file.size > 7 * 1024 * 1024) {
        showMessage('Application art file is too large. Maximum size is 7MB.', 'error');
        appArtInput.value = '';
        if (filenameDisplay) filenameDisplay.style.display = 'none';
        return;
      }
      
      // Show filename
      if (filenameDisplay) {
        filenameDisplay.textContent = `Selected: ${file.name}`;
        filenameDisplay.style.display = 'block';
      }
      
      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewContainer.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      previewContainer.style.display = 'none';
      if (filenameDisplay) filenameDisplay.style.display = 'none';
    }
  });
  
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      appArtInput.value = '';
      previewContainer.style.display = 'none';
      previewImg.src = '';
      if (filenameDisplay) {
        filenameDisplay.style.display = 'none';
        filenameDisplay.textContent = '';
      }
    });
  }
}

function countSentences(text) {
  if (!text || text.trim().length === 0) return 0;
  // Count sentence endings: . ! ? followed by space or end of string
  const sentenceEndings = text.match(/[.!?]+(\s|$)/g);
  return sentenceEndings ? sentenceEndings.length : 1; // At least 1 sentence if there's text
}

function setupSentenceCounting() {
  const personalityTextarea = document.getElementById('character-personality');
  const historyTextarea = document.getElementById('character-history');
  const personalityCount = document.getElementById('personality-sentence-count');
  const historyCount = document.getElementById('history-sentence-count');
  
  if (personalityTextarea && personalityCount) {
    personalityTextarea.addEventListener('input', () => {
      const count = countSentences(personalityTextarea.value);
      personalityCount.textContent = `${count} sentence${count !== 1 ? 's' : ''}`;
      if (count < 5) {
        personalityCount.style.color = 'var(--text-secondary, rgba(255, 255, 255, 0.6))';
      } else {
        personalityCount.style.color = 'var(--success-color, #4caf50)';
      }
    });
  }
  
  if (historyTextarea && historyCount) {
    historyTextarea.addEventListener('input', () => {
      const count = countSentences(historyTextarea.value);
      historyCount.textContent = `${count} sentence${count !== 1 ? 's' : ''}`;
      if (count < 5) {
        historyCount.style.color = 'var(--text-secondary, rgba(255, 255, 255, 0.6))';
      } else {
        historyCount.style.color = 'var(--success-color, #4caf50)';
      }
    });
  }
}

function setupEventListeners() {
  const form = document.getElementById('character-create-form');
  form.addEventListener('submit', handleFormSubmit);
  
  setupErrorModalListeners();
  
  const resetBtn = document.getElementById('reset-btn');
  resetBtn.addEventListener('click', () => {
    hideMessage();
    const iconPreviewContainer = document.getElementById('icon-preview-container');
    if (iconPreviewContainer) iconPreviewContainer.style.display = 'none';
    const appartPreviewContainer = document.getElementById('appart-preview-container');
    if (appartPreviewContainer) appartPreviewContainer.style.display = 'none';
    const iconFilename = document.getElementById('icon-filename');
    if (iconFilename) {
      iconFilename.style.display = 'none';
      iconFilename.textContent = '';
    }
    const appartFilename = document.getElementById('appart-filename');
    if (appartFilename) {
      appartFilename.style.display = 'none';
      appartFilename.textContent = '';
    }
    const jobSelect = document.getElementById('character-job');
    jobSelect.disabled = true;
    jobSelect.innerHTML = '<option value="">Select a village first...</option>';
    // Reset sentence counts
    const personalityCount = document.getElementById('personality-sentence-count');
    const historyCount = document.getElementById('history-sentence-count');
    if (personalityCount) personalityCount.textContent = '0 sentences';
    if (historyCount) historyCount.textContent = '0 sentences';
  });
}

// ============================================================================
// ------------------- Form Submission -------------------
// ============================================================================
async function handleFormSubmit(event) {
  event.preventDefault();
  
  const form = event.target;
  const submitBtn = document.getElementById('submit-btn');
  const originalText = submitBtn.innerHTML;
  
  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Creating...</span>';
  
  // Clear previous messages
  hideMessage();
  
  try {
    // Validate form
    if (!validateForm()) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      return;
    }
    
    // Create FormData
    const formData = new FormData(form);
    
    // Submit to API
    const response = await fetch('/api/characters/create', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create character');
    }
    
    // Success - character created as DRAFT
    showMessage('Character saved as draft! Redirecting to your OC page where you can review and submit for approval...', 'success');
    
    // Redirect to OC page if URL is provided, otherwise go to dashboard
    const ocPageUrl = data.ocPageUrl || data.character?.publicSlug ? `/ocs/${data.character.publicSlug}` : '/';
    setTimeout(() => {
      window.location.href = ocPageUrl;
    }, 3000);
    
  } catch (error) {
    console.error('Error creating character:', error);
    showMessage(error.message || 'An error occurred while creating your character. Please try again.', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// ============================================================================
// ------------------- Validation -------------------
// ============================================================================
function validateForm() {
  const name = document.getElementById('character-name').value.trim();
  const age = parseInt(document.getElementById('character-age').value);
  const height = parseFloat(document.getElementById('character-height').value);
  // Hearts and stamina are locked at 3, no need to validate
  const hearts = 3;
  const stamina = 5;
  const pronouns = document.getElementById('character-pronouns').value.trim();
  const race = document.getElementById('character-race').value;
  const village = document.getElementById('character-village').value;
  const job = document.getElementById('character-job').value;
  const appLink = document.getElementById('character-app-link').value.trim();
  const icon = document.getElementById('character-icon').files[0];
  const appArt = document.getElementById('character-app-art')?.files[0];
  const gender = document.getElementById('character-gender')?.value.trim();
  const virtue = document.getElementById('character-virtue')?.value;
  const personality = document.getElementById('character-personality')?.value.trim();
  const history = document.getElementById('character-history')?.value.trim();
  
  // Validate name
  if (!name || name.length === 0) {
    showMessage('Character name is required', 'error');
    return false;
  }
  
  // Validate age
  if (isNaN(age) || age < 1) {
    showMessage('Age must be a positive number (minimum 1)', 'error');
    return false;
  }
  
  // Validate height
  if (isNaN(height) || height <= 0) {
    showMessage('Height must be a positive number', 'error');
    return false;
  }
  
  // Validate pronouns
  if (!pronouns || pronouns.length === 0) {
    showMessage('Pronouns are required', 'error');
    return false;
  }
  
  // Validate race
  if (!race) {
    showMessage('Please select a race', 'error');
    return false;
  }
  
  // Validate village
  if (!village) {
    showMessage('Please select a village', 'error');
    return false;
  }
  
  // Validate job
  if (!job) {
    showMessage('Please select a job', 'error');
    return false;
  }
  
  // Validate app link (only if provided - it's optional now)
  if (appLink && appLink.length > 0) {
    try {
      new URL(appLink);
    } catch (e) {
      showMessage('Please enter a valid URL for the application link', 'error');
      return false;
    }
  }
  
  // Validate icon
  if (!icon) {
    showMessage('Character icon is required', 'error');
    return false;
  }
  
  // Validate appArt
  if (!appArt) {
    showMessage('Application art is required', 'error');
    return false;
  }
  
  // Validate gender
  if (!gender || gender.length === 0) {
    showMessage('Gender (with pronouns) is required', 'error');
    return false;
  }
  
  // Validate virtue
  if (!virtue || virtue.length === 0) {
    showMessage('Please select a virtue (Power, Wisdom, or Courage)', 'error');
    return false;
  }
  
  // Validate personality
  if (!personality || personality.length === 0) {
    showMessage('Personality description is required', 'error');
    return false;
  }
  
  // Validate history
  if (!history || history.length === 0) {
    showMessage('History description is required', 'error');
    return false;
  }
  
  return true;
}

// ============================================================================
// ------------------- Message Display -------------------
// ============================================================================
function setupErrorModalListeners() {
  const overlay = document.getElementById('error-modal-overlay');
  const dismissBtn = document.getElementById('error-modal-dismiss');
  if (!overlay || !dismissBtn) return;
  
  dismissBtn.addEventListener('click', hideMessage);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideMessage();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) hideMessage();
  });
}

function showMessage(message, type = 'info') {
  if (type === 'error') {
    showErrorModal(message);
    return;
  }
  
  const container = document.getElementById('message-container');
  const content = document.getElementById('message-content');
  
  container.className = `message-container message-${type}`;
  content.textContent = message;
  container.style.display = 'block';
  
  // Scroll to top so user sees the banner
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  // Auto-hide success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      hideMessage();
    }, 5000);
  }
}

function showErrorModal(message) {
  const overlay = document.getElementById('error-modal-overlay');
  const messageEl = document.getElementById('error-modal-message');
  const dismissBtn = document.getElementById('error-modal-dismiss');
  if (!overlay || !messageEl) return;
  
  messageEl.textContent = message;
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  dismissBtn?.focus();
}

function hideErrorModal() {
  const overlay = document.getElementById('error-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
}

function hideMessage() {
  const container = document.getElementById('message-container');
  if (container) container.style.display = 'none';
  hideErrorModal();
}

// ============================================================================
// ------------------- Authentication Check -------------------
// ============================================================================
async function checkAuthentication() {
  try {
    const response = await fetch('/api/user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok || response.status === 401) {
      // Not authenticated, redirect to login
      window.location.href = '/auth/discord';
      return;
    }
    
    const data = await response.json();
    if (data.user) {
      // Update username display
      const usernameEl = document.getElementById('username');
      if (usernameEl && data.user.username) {
        usernameEl.textContent = data.user.username;
      }
      
      // Update avatar - handle both full URLs and Discord CDN hashes
      const avatarEl = document.getElementById('user-avatar');
      if (avatarEl) {
        if (data.user.avatar) {
          // If it's already a full URL, use it; otherwise construct Discord CDN URL
          if (data.user.avatar.startsWith('http')) {
            avatarEl.src = data.user.avatar;
          } else if (data.user.avatar && data.user.discordId) {
            // Construct Discord CDN URL
            const extension = data.user.avatar.startsWith('a_') ? 'gif' : 'png';
            avatarEl.src = `https://cdn.discordapp.com/avatars/${data.user.discordId}/${data.user.avatar}.${extension}`;
          }
        } else {
          // Fallback to default avatar
          avatarEl.src = '/images/ankleicon.png';
        }
      }
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    // If auth check fails, still allow form submission (server will handle auth)
  }
}
