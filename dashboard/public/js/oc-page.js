/* ============================================================================
   oc-page.js
   Purpose: Handles OC page functionality - loading character, displaying info, editing, and resubmission
============================================================================ */

// ============================================================================
// ------------------- Global Variables -------------------
// ============================================================================
let character = null;
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
let isEditMode = false;

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthentication();
  await initializePage();
});

// ============================================================================
// ------------------- Page Initialization -------------------
// ============================================================================
async function initializePage() {
  try {
    // Get character name from URL
    const pathParts = window.location.pathname.split('/');
    const nameSlug = pathParts[pathParts.length - 1];
    
    if (!nameSlug || nameSlug === 'ocs') {
      showError('Invalid character URL');
      return;
    }
    
    // Load character data
    await loadCharacter(nameSlug);
    
    // Load form data (races, jobs, gear) if needed for editing
    await loadFormData();
    
    // Setup event listeners
    setupEventListeners();
    
  } catch (error) {
    console.error('Error initializing page:', error);
    showError(error.message || 'Failed to load character');
  }
}

// ============================================================================
// ------------------- Character Loading -------------------
// ============================================================================
async function loadCharacter(nameSlug) {
  try {
    showLoading();
    
    const response = await fetch(`/api/characters/by-name/${encodeURIComponent(nameSlug)}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Character not found or you do not have permission to view it');
      }
      if (response.status === 401) {
        throw new Error('Please log in to view this character');
      }
      const data = await response.json();
      throw new Error(data.error || 'Failed to load character');
    }
    
    character = await response.json();
    
    // Display character
    displayCharacter();
    
  } catch (error) {
    console.error('Error loading character:', error);
    showError(error.message || 'Failed to load character');
  }
}

// ============================================================================
// ------------------- Character Display -------------------
// ============================================================================
function displayCharacter() {
  hideLoading();
  
  // Update breadcrumb
  document.getElementById('breadcrumb').textContent = character.name;
  
  // Display character icon
  const iconImg = document.getElementById('character-icon');
  iconImg.src = character.icon || '/images/ankleicon.png';
  iconImg.alt = `${character.name}'s icon`;
  
  // Display character name
  document.getElementById('character-name').textContent = character.name;
  
  // Display character meta
  document.getElementById('character-pronouns').textContent = character.pronouns || 'N/A';
  document.getElementById('character-age').textContent = character.age ? `${character.age} years old` : 'N/A';
  document.getElementById('character-height').textContent = character.height ? `${character.height} cm` : 'N/A';
  
  // Display character details
  document.getElementById('character-race').textContent = character.race ? character.race.charAt(0).toUpperCase() + character.race.slice(1) : 'N/A';
  document.getElementById('character-village').textContent = character.homeVillage ? character.homeVillage.charAt(0).toUpperCase() + character.homeVillage.slice(1) : 'N/A';
  document.getElementById('character-job').textContent = character.job ? character.job : 'N/A';
  
  // Display stats
  document.getElementById('stat-hearts').textContent = `${character.currentHearts || 0}/${character.maxHearts || 0}`;
  document.getElementById('stat-stamina').textContent = `${character.currentStamina || 0}/${character.maxStamina || 0}`;
  document.getElementById('stat-attack').textContent = character.attack || 0;
  document.getElementById('stat-defense').textContent = character.defense || 0;
  
  // Display status badge
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  statusBadge.className = 'status-badge';
  
  switch (character.status) {
    case 'pending':
      statusBadge.classList.add('status-pending');
      statusText.textContent = 'Pending Review';
      break;
    case 'accepted':
      statusBadge.classList.add('status-accepted');
      statusText.textContent = 'Accepted';
      break;
    case 'denied':
      statusBadge.classList.add('status-denied');
      statusText.textContent = 'Denied';
      break;
    default:
      statusBadge.classList.add('status-pending');
      statusText.textContent = 'Unknown';
  }
  
  // Display denial reason if denied
  if (character.status === 'denied' && character.denialReason) {
    const denialContainer = document.getElementById('denial-reason-container');
    const denialText = document.getElementById('denial-reason-text');
    denialText.textContent = character.denialReason;
    denialContainer.style.display = 'block';
  } else {
    document.getElementById('denial-reason-container').style.display = 'none';
  }
  
  // Show/hide edit button based on status
  const actionButtons = document.getElementById('action-buttons');
  if (character.status === 'denied' || character.status === 'accepted') {
    actionButtons.style.display = 'block';
  } else {
    actionButtons.style.display = 'none';
  }
  
  // Show character display
  document.getElementById('character-display').style.display = 'block';
}

// ============================================================================
// ------------------- Form Data Loading -------------------
// ============================================================================
async function loadFormData() {
  try {
    // Load races
    const racesResponse = await fetch('/api/characters/races');
    if (racesResponse.ok) {
      const racesData = await racesResponse.json();
      races = racesData.data || [];
    }
    
    // Load jobs
    const jobsResponse = await fetch('/api/characters/jobs');
    if (jobsResponse.ok) {
      const jobsData = await jobsResponse.json();
      allJobs = jobsData.data || [];
    }
    
    // Load village-specific jobs
    const villages = ['inariko', 'rudania', 'vhintl'];
    for (const village of villages) {
      const villageResponse = await fetch(`/api/characters/jobs?village=${village}`);
      if (villageResponse.ok) {
        const villageData = await villageResponse.json();
        villageJobsMap[village] = villageData.data || [];
      }
    }
    
    // Load starter gear
    const gearResponse = await fetch('/api/characters/starter-gear');
    if (gearResponse.ok) {
      const gearData = await gearResponse.json();
      starterGear = gearData.categorized || {
        weapons: [],
        shields: [],
        armor: { head: [], chest: [], legs: [] }
      };
    }
  } catch (error) {
    console.error('Error loading form data:', error);
  }
}

// ============================================================================
// ------------------- Event Listeners -------------------
// ============================================================================
function setupEventListeners() {
  // Edit toggle button
  const editToggleBtn = document.getElementById('edit-toggle-btn');
  if (editToggleBtn) {
    editToggleBtn.addEventListener('click', toggleEditMode);
  }
  
  // Cancel edit button
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', cancelEdit);
  }
  
  // Resubmit button
  const resubmitBtn = document.getElementById('resubmit-btn');
  if (resubmitBtn) {
    resubmitBtn.addEventListener('click', () => {
      document.getElementById('resubmit-btn').setAttribute('data-resubmit', 'true');
      document.getElementById('character-edit-form').dispatchEvent(new Event('submit'));
    });
  }
  
  // Form submission
  const editForm = document.getElementById('character-edit-form');
  if (editForm) {
    editForm.addEventListener('submit', handleFormSubmit);
  }
  
  // Village change handler
  const villageSelect = document.getElementById('edit-character-village');
  if (villageSelect) {
    villageSelect.addEventListener('change', handleVillageChange);
  }
  
  // Icon preview
  setupIconPreview();
}

// ============================================================================
// ------------------- Edit Mode -------------------
// ============================================================================
function toggleEditMode() {
  isEditMode = !isEditMode;
  
  if (isEditMode) {
    showEditForm();
  } else {
    hideEditForm();
  }
}

function showEditForm() {
  const editContainer = document.getElementById('edit-form-container');
  editContainer.style.display = 'block';
  
  // Populate form with character data
  populateEditForm();
  
  // Show/hide fields based on status
  if (character.status === 'denied') {
    // Show all fields for denied characters
    document.getElementById('name-field-group').style.display = 'block';
    document.getElementById('stats-section').style.display = 'block';
    document.getElementById('details-section').style.display = 'block';
    document.getElementById('gear-section').style.display = 'block';
    document.getElementById('resubmit-btn').style.display = 'inline-block';
    document.getElementById('save-btn-text').textContent = 'Save Changes';
    document.getElementById('icon-required').style.display = 'none';
  } else if (character.status === 'accepted') {
    // Show limited fields for accepted characters
    document.getElementById('name-field-group').style.display = 'none';
    document.getElementById('stats-section').style.display = 'none';
    document.getElementById('details-section').style.display = 'none';
    document.getElementById('gear-section').style.display = 'none';
    document.getElementById('resubmit-btn').style.display = 'none';
    document.getElementById('save-btn-text').textContent = 'Save Profile Changes';
    document.getElementById('icon-required').style.display = 'none';
  }
  
  // Scroll to form
  editContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideEditForm() {
  const editContainer = document.getElementById('edit-form-container');
  editContainer.style.display = 'none';
  isEditMode = false;
}

function cancelEdit() {
  hideEditForm();
  hideMessage();
}

function populateEditForm() {
  if (!character) return;
  
  // Basic info
  document.getElementById('edit-character-name').value = character.name || '';
  document.getElementById('edit-character-age').value = character.age || '';
  document.getElementById('edit-character-height').value = character.height || '';
  document.getElementById('edit-character-pronouns').value = character.pronouns || '';
  
  // Stats (only for denied)
  if (character.status === 'denied') {
    document.getElementById('edit-character-hearts').value = character.maxHearts || 3;
    document.getElementById('edit-character-stamina').value = character.maxStamina || 3;
  }
  
  // Details (only for denied)
  if (character.status === 'denied') {
    // Populate race dropdown
    const raceSelect = document.getElementById('edit-character-race');
    raceSelect.innerHTML = '<option value="">Select a race...</option>';
    races.forEach(race => {
      const option = document.createElement('option');
      option.value = race.toLowerCase();
      option.textContent = race;
      if (character.race && character.race.toLowerCase() === race.toLowerCase()) {
        option.selected = true;
      }
      raceSelect.appendChild(option);
    });
    
    // Set village
    const villageSelect = document.getElementById('edit-character-village');
    villageSelect.value = character.homeVillage || '';
    populateJobDropdown(character.homeVillage);
    
    // Set job
    const jobSelect = document.getElementById('edit-character-job');
    if (character.job) {
      jobSelect.value = character.job;
    }
    
    // Set app link
    document.getElementById('edit-character-app-link').value = character.appLink || '';
    
    // Populate starter gear
    populateStarterGearDropdowns();
    
    // Set current gear if any
    if (character.gearWeapon?.name) {
      document.getElementById('edit-starter-weapon').value = character.gearWeapon.name;
    }
    if (character.gearShield?.name) {
      document.getElementById('edit-starter-shield').value = character.gearShield.name;
    }
    if (character.gearArmor?.chest?.name) {
      document.getElementById('edit-starter-armor-chest').value = character.gearArmor.chest.name;
    }
    if (character.gearArmor?.legs?.name) {
      document.getElementById('edit-starter-armor-legs').value = character.gearArmor.legs.name;
    }
  }
}

// ============================================================================
// ------------------- Dropdown Population -------------------
// ============================================================================
function populateJobDropdown(village) {
  const jobSelect = document.getElementById('edit-character-job');
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
  const weaponSelect = document.getElementById('edit-starter-weapon');
  if (weaponSelect && starterGear.weapons) {
    starterGear.weapons.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      weaponSelect.appendChild(option);
    });
  }
  
  // Populate shield dropdown
  const shieldSelect = document.getElementById('edit-starter-shield');
  if (shieldSelect && starterGear.shields) {
    starterGear.shields.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      shieldSelect.appendChild(option);
    });
  }
  
  // Populate chest armor dropdown
  const chestSelect = document.getElementById('edit-starter-armor-chest');
  if (chestSelect && starterGear.armor && starterGear.armor.chest) {
    starterGear.armor.chest.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      chestSelect.appendChild(option);
    });
  }
  
  // Populate leg armor dropdown
  const legsSelect = document.getElementById('edit-starter-armor-legs');
  if (legsSelect && starterGear.armor && starterGear.armor.legs) {
    starterGear.armor.legs.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || '')).forEach(item => {
      const option = document.createElement('option');
      option.value = item.itemName;
      option.textContent = item.itemName;
      legsSelect.appendChild(option);
    });
  }
}

function handleVillageChange(event) {
  const village = event.target.value;
  populateJobDropdown(village);
  
  // Clear job selection when village changes
  const jobSelect = document.getElementById('edit-character-job');
  jobSelect.value = '';
}

// ============================================================================
// ------------------- Icon Preview -------------------
// ============================================================================
function setupIconPreview() {
  const iconInput = document.getElementById('edit-character-icon');
  const previewContainer = document.getElementById('edit-icon-preview-container');
  const previewImg = document.getElementById('edit-icon-preview');
  const removeBtn = document.getElementById('remove-edit-icon-preview');
  
  if (!iconInput || !previewContainer || !previewImg) return;
  
  iconInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showMessage('Invalid file type. Please select a JPEG, PNG, GIF, or WebP image.', 'error');
        iconInput.value = '';
        return;
      }
      
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        showMessage('Image file is too large. Maximum size is 5MB.', 'error');
        iconInput.value = '';
        return;
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
    }
  });
  
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      iconInput.value = '';
      previewContainer.style.display = 'none';
      previewImg.src = '';
    });
  }
}

// ============================================================================
// ------------------- Form Submission -------------------
// ============================================================================
async function handleFormSubmit(event) {
  event.preventDefault();
  
  const form = event.target;
  const submitBtn = document.getElementById('save-btn');
  const originalText = submitBtn.innerHTML;
  const resubmit = document.getElementById('resubmit-btn')?.getAttribute('data-resubmit') === 'true';
  
  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
  
  // Clear previous messages
  hideMessage();
  
  try {
    // Create FormData
    const formData = new FormData(form);
    
    // Add resubmit flag if resubmitting
    if (resubmit) {
      formData.append('resubmit', 'true');
    }
    
    // Submit to API
    const response = await fetch(`/api/characters/edit/${character._id}`, {
      method: 'PUT',
      body: formData,
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update character');
    }
    
    // Success
    const message = resubmit 
      ? 'Character updated and resubmitted successfully! It is now pending review.'
      : 'Character updated successfully!';
    showMessage(message, 'success');
    
    // Reload character data
    const pathParts = window.location.pathname.split('/');
    const nameSlug = pathParts[pathParts.length - 1];
    await loadCharacter(nameSlug);
    
    // Hide edit form
    hideEditForm();
    
    // Reset resubmit flag
    if (document.getElementById('resubmit-btn')) {
      document.getElementById('resubmit-btn').removeAttribute('data-resubmit');
    }
    
  } catch (error) {
    console.error('Error updating character:', error);
    showMessage(error.message || 'An error occurred while updating your character. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// ============================================================================
// ------------------- UI Helpers -------------------
// ============================================================================
function showLoading() {
  document.getElementById('loading-state').style.display = 'block';
  document.getElementById('error-state').style.display = 'none';
  document.getElementById('character-display').style.display = 'none';
}

function hideLoading() {
  document.getElementById('loading-state').style.display = 'none';
}

function showError(message) {
  hideLoading();
  document.getElementById('error-state').style.display = 'block';
  document.getElementById('error-message').textContent = message;
  document.getElementById('character-display').style.display = 'none';
}

function showMessage(message, type = 'info') {
  const messageContainer = document.getElementById('message-container');
  const messageContent = document.getElementById('message-content');
  
  messageContent.textContent = message;
  messageContent.className = `message-content message-${type}`;
  messageContainer.style.display = 'block';
  
  // Scroll to message
  messageContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  
  // Auto-hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      hideMessage();
    }, 5000);
  }
}

function hideMessage() {
  document.getElementById('message-container').style.display = 'none';
}

// ============================================================================
// ------------------- Authentication -------------------
// ============================================================================
async function checkAuthentication() {
  try {
    const response = await fetch('/api/auth/check', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.user) {
        const usernameEl = document.getElementById('username');
        const avatarEl = document.getElementById('user-avatar');
        if (usernameEl) usernameEl.textContent = data.user.username || 'User';
        if (avatarEl && data.user.avatar) {
          avatarEl.src = `https://cdn.discordapp.com/avatars/${data.user.discordId}/${data.user.avatar}.png?size=256`;
        }
      }
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
  }
}
