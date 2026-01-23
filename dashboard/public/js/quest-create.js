/* ============================================================================
   quest-create.js
   Purpose: Handles quest creation form submission, validation, conditional fields, and API communication
============================================================================ */

import { checkUserAuthStatus } from '/js/auth.js';
import { setupSidebarNavigation } from '/js/modules/navigation.js';

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication and mod/admin access
  const authStatus = await checkUserAuthStatus();
  if (!authStatus.isAuthenticated) {
    window.location.href = '/';
    return;
  }

  // Check if user is admin/mod
  if (!authStatus.isAdmin) {
    // Redirect if not admin/mod
    window.location.href = '/';
    return;
  }

  // Initialize sidebar navigation
  setupSidebarNavigation();
  initializeDropdownToggles();

  // Initialize form
  await initializeForm();
  setupEventListeners();
});

// ============================================================================
// ------------------- Sidebar Navigation -------------------
// ============================================================================
function initializeDropdownToggles() {
  const dropdownToggles = document.querySelectorAll('.nav-dropdown-toggle');
  
  if (dropdownToggles.length === 0) {
    setTimeout(initializeDropdownToggles, 100);
    return;
  }
  
  dropdownToggles.forEach(toggle => {
    if (toggle.dataset.listenerAttached) {
      return;
    }
    toggle.dataset.listenerAttached = 'true';
    
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const dropdown = toggle.closest('.nav-dropdown');
      if (!dropdown) return;
      
      const isActive = dropdown.classList.contains('active');
      
      // Close all other dropdowns
      document.querySelectorAll('.nav-dropdown').forEach(item => {
        if (item !== dropdown) {
          item.classList.remove('active');
          const otherToggle = item.querySelector('.nav-dropdown-toggle');
          if (otherToggle) {
            otherToggle.setAttribute('aria-expanded', 'false');
          }
        }
      });
      
      // Toggle current dropdown
      if (isActive) {
        dropdown.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        dropdown.classList.add('active');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });
  
  // Close dropdowns when clicking outside
  if (!document.dropdownOutsideClickHandler) {
    document.dropdownOutsideClickHandler = (e) => {
      if (!e.target.closest('.nav-dropdown')) {
        document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
          dropdown.classList.remove('active');
          const toggle = dropdown.querySelector('.nav-dropdown-toggle');
          if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
          }
        });
      }
    };
    document.addEventListener('click', document.dropdownOutsideClickHandler);
  }
}

// ============================================================================
// ------------------- Form Initialization -------------------
// ============================================================================
async function initializeForm() {
  try {
    // Setup conditional field visibility
    setupConditionalFields();
    
    // Setup form validation
    setupFormValidation();
    
    // Setup embed preview
    setupEmbedPreview();
    
    // Update user menu
    updateUserMenu();
  } catch (error) {
    console.error('Error initializing form:', error);
    // Show error modal if available, otherwise use inline message
    const errorModal = document.getElementById('errorQuestModal');
    if (errorModal) {
      showErrorModal('Failed to initialize form', 'Please refresh the page and try again.');
    } else {
      showMessage('Failed to initialize form. Please refresh the page.', 'error');
    }
  }
}

// ============================================================================
// ------------------- Conditional Field Visibility -------------------
// ============================================================================
function setupConditionalFields() {
  const questTypeSelect = document.getElementById('quest-type');
  const rpSection = document.getElementById('rp-quest-section');
  const interactiveSection = document.getElementById('interactive-quest-section');
  
  if (!questTypeSelect) return;
  
  // Initial state
  updateConditionalFields(questTypeSelect.value);
  
  // Listen for changes
  questTypeSelect.addEventListener('change', (e) => {
    updateConditionalFields(e.target.value);
  });
}

function updateConditionalFields(questType) {
  const rpSection = document.getElementById('rp-quest-section');
  const interactiveSection = document.getElementById('interactive-quest-section');
  
  // Hide all conditional sections first
  if (rpSection) rpSection.style.display = 'none';
  if (interactiveSection) interactiveSection.style.display = 'none';
  
  // Show relevant sections based on quest type
  if (questType === 'RP' && rpSection) {
    rpSection.style.display = 'block';
  } else if (questType === 'Interactive' && interactiveSection) {
    interactiveSection.style.display = 'block';
  }
}

// ============================================================================
// ------------------- Form Validation -------------------
// ============================================================================
function setupFormValidation() {
  const form = document.getElementById('quest-create-form');
  if (!form) return;
  
  // Token reward validation
  const tokenRewardInput = document.getElementById('quest-token-reward');
  if (tokenRewardInput) {
    tokenRewardInput.addEventListener('blur', validateTokenReward);
  }
  
  // Quest ID uniqueness check
  const questIdInput = document.getElementById('quest-id');
  if (questIdInput) {
    questIdInput.addEventListener('blur', checkQuestIdUniqueness);
  }
  
  // Item rewards format validation
  const itemRewardsInput = document.getElementById('quest-item-rewards');
  if (itemRewardsInput) {
    itemRewardsInput.addEventListener('blur', validateItemRewards);
  }
}

function validateTokenReward(e) {
  const value = e.target.value.trim();
  const fieldGroup = e.target.closest('.quest-create-form-field-group');
  
  if (!value) {
    clearFieldError(fieldGroup);
    return true;
  }
  
  // Check if it's a valid number
  if (!isNaN(value) && value !== '') {
    const num = parseFloat(value);
    if (num >= 0) {
      clearFieldError(fieldGroup);
      return true;
    }
  }
  
  // Check for special formats
  const specialFormats = ['N/A', 'No reward', 'No reward specified', 'None'];
  if (specialFormats.includes(value)) {
    clearFieldError(fieldGroup);
    return true;
  }
  
  // Check for complex formats
  if (value.includes('per_unit:') || value.includes('flat:') || value.includes('collab_bonus:')) {
    clearFieldError(fieldGroup);
    return true;
  }
  
  // Try to parse as number
  const parsed = parseFloat(value);
  if (!isNaN(parsed) && parsed >= 0) {
    clearFieldError(fieldGroup);
    return true;
  }
  
  // Invalid format
  showFieldError(fieldGroup, 'Token reward must be a number >= 0 or a valid format (flat:X, per_unit:X, N/A)');
  return false;
}

async function checkQuestIdUniqueness(e) {
  const value = e.target.value.trim();
  const fieldGroup = e.target.closest('.quest-create-form-field-group');
  
  if (!value) {
    clearFieldError(fieldGroup);
    return true;
  }
  
  try {
    // Check if questID exists by searching for it
    const response = await fetch(`/api/admin/db/Quest?search=${encodeURIComponent(value)}&limit=10`, {
      credentials: 'include'
    });
    
    if (response.status === 403) {
      // Access denied - don't show error, just let server handle it
      clearFieldError(fieldGroup);
      return true;
    }
    
    if (response.ok) {
      const data = await response.json();
      // Check if any quest has this exact questID
      const quests = data.records || data.data || [];
      if (Array.isArray(quests)) {
        const existingQuest = quests.find(quest => quest.questID === value);
        if (existingQuest) {
          showFieldError(fieldGroup, 'Quest ID already exists. Please choose a different ID.');
          return false;
        }
      }
    }
    
    clearFieldError(fieldGroup);
    return true;
  } catch (error) {
    console.error('Error checking quest ID uniqueness:', error);
    // Don't block submission on check error - server will validate
    clearFieldError(fieldGroup);
    return true;
  }
}

function validateItemRewards(e) {
  const value = e.target.value.trim();
  const fieldGroup = e.target.closest('.quest-create-form-field-group');
  
  if (!value) {
    clearFieldError(fieldGroup);
    return true;
  }
  
  // Format: "Item1:5;Item2:10"
  const items = value.split(';');
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    
    if (trimmed.includes(':')) {
      const [name, qty] = trimmed.split(':').map(s => s.trim());
      if (!name || isNaN(parseInt(qty, 10))) {
        showFieldError(fieldGroup, 'Invalid format. Use "Item1:5;Item2:10"');
        return false;
      }
    } else if (trimmed) {
      // Single item without quantity is OK (defaults to 1)
    }
  }
  
  clearFieldError(fieldGroup);
  return true;
}

function showFieldError(fieldGroup, message) {
  if (!fieldGroup) return;
  
  fieldGroup.classList.add('error');
  let errorMsg = fieldGroup.querySelector('.error-message');
  if (!errorMsg) {
    errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    fieldGroup.appendChild(errorMsg);
  }
  errorMsg.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
}

function clearFieldError(fieldGroup) {
  if (!fieldGroup) return;
  
  fieldGroup.classList.remove('error');
  const errorMsg = fieldGroup.querySelector('.error-message');
  if (errorMsg) {
    errorMsg.remove();
  }
}

// ============================================================================
// ------------------- Event Listeners -------------------
// ============================================================================
function setupEventListeners() {
  const form = document.getElementById('quest-create-form');
  const resetBtn = document.getElementById('quest-create-reset-btn');
  
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
    
    // Add input listeners for embed preview
    const previewFields = form.querySelectorAll('input, select, textarea');
    previewFields.forEach(field => {
      field.addEventListener('input', updateEmbedPreview);
      field.addEventListener('change', updateEmbedPreview);
    });
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', handleFormReset);
  }
}

// ============================================================================
// ------------------- Form Submission -------------------
// ============================================================================
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const form = document.getElementById('quest-create-form');
  if (!form) return;
  
  // Check if already submitting
  if (form.dataset.submitting === 'true') {
    return;
  }
  
  // Validate form
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  // Validate token reward
  const tokenRewardInput = document.getElementById('quest-token-reward');
  if (tokenRewardInput && !validateTokenReward({ target: tokenRewardInput })) {
    return;
  }
  
  // Validate item rewards
  const itemRewardsInput = document.getElementById('quest-item-rewards');
  if (itemRewardsInput && !validateItemRewards({ target: itemRewardsInput })) {
    return;
  }
  
  // Show confirmation modal with quest summary
  showConfirmationModal(form);
}

async function submitQuestForm(form) {
  // Set submitting state
  form.dataset.submitting = 'true';
  const submitBtn = document.getElementById('confirm-quest-submit-btn');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  
  try {
    // Collect form data
    const formData = new FormData(form);
    const questData = {};
    
    // Process all form fields
    for (const [key, value] of formData.entries()) {
      if (key === 'collabAllowed') {
        questData[key] = true; // Checkbox is checked
        continue;
      }
      
      const trimmedValue = value.trim();
      if (trimmedValue === '') {
        // Skip empty optional fields
        continue;
      }
      
      // Handle number fields
      if (['postRequirement', 'participantCap', 'itemRewardQty', 'requiredRolls'].includes(key)) {
        questData[key] = parseInt(trimmedValue, 10);
        continue;
      }
      
      // Handle minRequirements (can be number or string)
      if (key === 'minRequirements') {
        const numValue = parseFloat(trimmedValue);
        questData[key] = isNaN(numValue) ? trimmedValue : numValue;
        continue;
      }
      
      // Handle itemRewards array
      if (key === 'itemRewards' && trimmedValue) {
        questData[key] = parseItemRewards(trimmedValue);
        continue;
      }
      
      // Handle tableRollConfig (JSON)
      if (key === 'tableRollConfig' && trimmedValue) {
        try {
          questData[key] = JSON.parse(trimmedValue);
        } catch (error) {
          document.getElementById('confirmQuestModal').close();
          showErrorModal('Invalid JSON in Table Roll Config', 'Please check the JSON format in the Table Roll Config field.');
          throw new Error('Invalid JSON in Table Roll Config');
        }
        continue;
      }
      
      // Default: string value
      questData[key] = trimmedValue;
    }
    
    // Handle collabAllowed checkbox (if not checked, it won't be in FormData)
    if (!formData.has('collabAllowed')) {
      questData.collabAllowed = false;
    }
    
    // Set default values
    questData.status = 'active';
    questData.posted = false;
    // participants and leftParticipants will be set by the model defaults
    
    // Submit to API
    const response = await fetch('/api/admin/db/Quest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(questData)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      // Close confirmation modal
      document.getElementById('confirmQuestModal').close();
      
      // Handle validation errors
      let errorMessage = result.error || 'Failed to create quest';
      let errorDetails = '';
      
      if (result.fieldErrors) {
        const fieldErrors = [];
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          fieldErrors.push(`${field}: ${message}`);
          const fieldInput = form.querySelector(`[name="${field}"]`);
          if (fieldInput) {
            const fieldGroup = fieldInput.closest('.quest-create-form-field-group');
            showFieldError(fieldGroup, message);
          }
        }
        errorDetails = fieldErrors.join('<br>');
      } else if (result.details) {
        errorDetails = result.details;
      }
      
      showErrorModal(errorMessage, errorDetails);
      return;
    }
    
    // Close confirmation modal
    document.getElementById('confirmQuestModal').close();
    
    // Success - show success modal
    const questTitle = document.getElementById('quest-title').value;
    showSuccessModal(questTitle, result.record);
    
    // Reset form
    form.reset();
    updateConditionalFields('');
    
  } catch (error) {
    console.error('Error submitting form:', error);
    
    // Close confirmation modal
    document.getElementById('confirmQuestModal').close();
    
    showErrorModal('An error occurred while creating the quest', error.message || 'Unknown error');
  } finally {
    form.dataset.submitting = 'false';
    const submitBtn = document.getElementById('confirm-quest-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Confirm Creation';
    }
  }
}

function showConfirmationModal(form) {
  const modal = document.getElementById('confirmQuestModal');
  const summaryDiv = document.getElementById('quest-create-summary');
  
  if (!modal || !summaryDiv) return;
  
  // Build summary
  const formData = new FormData(form);
  const summary = [];
  
  const title = formData.get('title');
  const questType = formData.get('questType');
  const location = formData.get('location');
  const timeLimit = formData.get('timeLimit');
  const tokenReward = formData.get('tokenReward');
  const questID = formData.get('questID');
  
  if (title) summary.push({ label: 'Title', value: title });
  if (questType) summary.push({ label: 'Quest Type', value: questType });
  if (location) summary.push({ label: 'Location', value: location });
  if (timeLimit) summary.push({ label: 'Time Limit', value: timeLimit });
  if (tokenReward) summary.push({ label: 'Token Reward', value: tokenReward });
  if (questID) summary.push({ label: 'Quest ID', value: questID });
  
  // Build summary HTML
  summaryDiv.innerHTML = summary.map(item => `
    <div class="quest-create-summary-item">
      <span class="quest-create-summary-label">${item.label}:</span>
      <span class="quest-create-summary-value">${escapeHtml(item.value)}</span>
    </div>
  `).join('');
  
  // Setup confirm button - remove old listeners and add new one
  const confirmBtn = document.getElementById('confirm-quest-submit-btn');
  if (confirmBtn) {
    // Clone and replace to remove old event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', (e) => {
      e.preventDefault();
      modal.close();
      submitQuestForm(form);
    });
  }
  
  // Show modal
  modal.showModal();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showSuccessModal(questTitle, questRecord) {
  const modal = document.getElementById('successQuestModal');
  const messageEl = document.getElementById('success-quest-message');
  
  if (!modal || !messageEl) return;
  
  messageEl.textContent = `Quest "${questTitle}" has been created successfully!`;
  
  // Setup "Create Another" button to reset form
  const createAnotherBtn = modal.querySelector('.btn-secondary');
  if (createAnotherBtn) {
    createAnotherBtn.onclick = () => {
      modal.close();
      const form = document.getElementById('quest-create-form');
      if (form) {
        form.reset();
        updateConditionalFields('');
      }
    };
  }
  
  modal.showModal();
}

function showErrorModal(errorMessage, errorDetails = '') {
  const modal = document.getElementById('errorQuestModal');
  const messageEl = document.getElementById('error-quest-message');
  const detailsEl = document.getElementById('error-quest-details');
  
  if (!modal || !messageEl) return;
  
  messageEl.textContent = errorMessage;
  
  if (detailsEl) {
    if (errorDetails) {
      detailsEl.innerHTML = errorDetails;
      detailsEl.style.display = 'block';
    } else {
      detailsEl.style.display = 'none';
    }
  }
  
  modal.showModal();
}

function parseItemRewards(itemRewardsString) {
  if (!itemRewardsString || itemRewardsString === '') {
    return [];
  }
  
  const items = [];
  const itemStrings = itemRewardsString.split(';');
  
  for (const itemString of itemStrings) {
    const trimmed = itemString.trim();
    if (!trimmed) continue;
    
    if (trimmed.includes(':')) {
      const [name, qty] = trimmed.split(':').map(s => s.trim());
      items.push({
        name: name,
        quantity: parseInt(qty, 10) || 1
      });
    } else {
      items.push({
        name: trimmed,
        quantity: 1
      });
    }
  }
  
  return items;
}

function handleFormReset() {
  const form = document.getElementById('quest-create-form');
  if (!form) return;
  
  // Use native confirm for reset
  if (confirm('Are you sure you want to reset the form? All entered data will be lost.')) {
    form.reset();
    updateConditionalFields('');
    
    // Clear all field errors
    document.querySelectorAll('.quest-create-form-field-group.error').forEach(fieldGroup => {
      clearFieldError(fieldGroup);
    });
    
    // Update embed preview
    updateEmbedPreview();
    
    // Show success message
    const container = document.getElementById('quest-create-message-container');
    const content = document.getElementById('quest-create-message-content');
    if (container && content) {
      content.textContent = 'Form reset';
      content.className = 'quest-create-message-content success';
      content.innerHTML = '<i class="fas fa-check-circle"></i> Form reset';
      container.style.display = 'block';
      setTimeout(() => {
        container.style.display = 'none';
      }, 3000);
    }
  }
}

// ============================================================================
// ------------------- Message Display -------------------
// ============================================================================
function showMessage(message, type = 'success') {
  const container = document.getElementById('quest-create-message-container');
  const content = document.getElementById('quest-create-message-content');
  
  if (!container || !content) return;
  
  content.textContent = message;
  content.className = `quest-create-message-content ${type}`;
  container.style.display = 'block';
  
  // Add icon
  const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
  content.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    container.style.display = 'none';
  }, 5000);
}

// ============================================================================
// ------------------- Embed Preview -------------------
// ============================================================================
function setupEmbedPreview() {
  // Initial preview update
  updateEmbedPreview();
}

function updateEmbedPreview() {
  const previewContainer = document.getElementById('quest-embed-preview');
  if (!previewContainer) return;
  
  const form = document.getElementById('quest-create-form');
  if (!form) return;
  
  const formData = new FormData(form);
  
  // Get form values
  const questData = {
    title: formData.get('title') || '',
    description: formData.get('description') || '',
    questType: formData.get('questType') || '',
    questID: formData.get('questID') || '',
    location: formData.get('location') || '',
    timeLimit: formData.get('timeLimit') || '',
    date: formData.get('date') || '',
    tokenReward: formData.get('tokenReward') || '',
    itemReward: formData.get('itemReward') || '',
    itemRewardQty: formData.get('itemRewardQty') || '',
    itemRewards: formData.get('itemRewards') || '',
    participantCap: formData.get('participantCap') || '',
    postRequirement: formData.get('postRequirement') || '',
    minRequirements: formData.get('minRequirements') || '',
    signupDeadline: formData.get('signupDeadline') || '',
    rules: formData.get('rules') || '',
    collabAllowed: formData.has('collabAllowed'),
    tableroll: formData.get('tableroll') || '',
    tableRollName: formData.get('tableRollName') || '',
    rpThreadParentChannel: formData.get('rpThreadParentChannel') || '',
    guildId: formData.get('guildId') || ''
  };
  
  // Check if we have minimum data to show preview
  if (!questData.title && !questData.description) {
    previewContainer.innerHTML = `
      <div class="quest-embed-preview-placeholder">
        <i class="fas fa-info-circle"></i>
        <p>Start filling out the form to see a preview of the Discord embed</p>
      </div>
    `;
    return;
  }
  
  // Build embed HTML
  const embedHTML = buildEmbedPreview(questData);
  previewContainer.innerHTML = embedHTML;
}

function buildEmbedPreview(quest) {
  const BORDER_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
  
  // Title
  const title = quest.title ? `📜 ${renderMarkdown(quest.title)}` : '📜 Untitled Quest';
  
  // Description (quoted)
  const descriptionText = quest.description || 'No description provided.';
  const descriptionLines = descriptionText.split('\n');
  const quotedDescription = descriptionLines.map(line => `> *${renderMarkdown(line.trim())}*`).join('\n');
  
  let html = `
    <div class="quest-embed">
      <div class="quest-embed-title">${title}</div>
      <div class="quest-embed-description">${quotedDescription}</div>
  `;
  
  // Details field
  const essentialInfo = [];
  if (quest.questType) essentialInfo.push(`**Type:** ${renderMarkdown(quest.questType)}`);
  if (quest.questID) essentialInfo.push(`**ID:** \`${escapeHtml(quest.questID)}\``);
  if (quest.location) essentialInfo.push(`**Location:** ${formatLocationText(quest.location)}`);
  if (quest.timeLimit) essentialInfo.push(`**Duration:** ${renderMarkdown(quest.timeLimit)}`);
  if (quest.date) essentialInfo.push(`**Date:** ${renderMarkdown(quest.date)}`);
  
  if (essentialInfo.length > 0) {
    html += `
      <div class="quest-embed-field">
        <div class="quest-embed-field-name">__📋 Details__</div>
        <div class="quest-embed-field-value">${essentialInfo.join('\n')}</div>
      </div>
    `;
  }
  
  // Rewards field
  const rewards = [];
  const tokenDetails = parseTokenRewardDetails(quest.tokenReward);
  if (tokenDetails) {
    if (tokenDetails.type === 'per_unit') {
      if (tokenDetails.collabBonus > 0) {
        rewards.push(`💰 **${tokenDetails.perUnit} tokens per ${tokenDetails.unit}** + **${tokenDetails.collabBonus} collab bonus** (max ${tokenDetails.maxUnits} ${tokenDetails.unit}s = **${tokenDetails.total} tokens** or **${tokenDetails.maxWithCollab} tokens with collab**)`);
      } else {
        rewards.push(`💰 **${tokenDetails.perUnit} tokens per ${tokenDetails.unit}** (max ${tokenDetails.maxUnits} ${tokenDetails.unit}s = **${tokenDetails.total} tokens total**)`);
      }
    } else {
      if (tokenDetails.collabBonus > 0) {
        rewards.push(`💰 **${tokenDetails.amount} tokens** + **${tokenDetails.collabBonus} collab bonus** (max **${tokenDetails.maxWithCollab} tokens with collab**)`);
      } else {
        rewards.push(`💰 **${tokenDetails.amount} tokens**`);
      }
    }
  }
  
  // Item rewards
  if (quest.itemRewards && quest.itemRewards.trim()) {
    const items = parseItemRewardsForPreview(quest.itemRewards);
    items.forEach(item => {
      rewards.push(`🎁 **${renderMarkdown(item.name)}**${item.quantity > 1 ? ` ×${item.quantity}` : ''}`);
    });
  } else if (quest.itemReward) {
    const qty = quest.itemRewardQty ? parseInt(quest.itemRewardQty, 10) : 1;
    rewards.push(`🎁 **${renderMarkdown(quest.itemReward)}**${qty > 1 ? ` ×${qty}` : ''}`);
  }
  
  if (rewards.length > 0) {
    html += `
      <div class="quest-embed-field">
        <div class="quest-embed-field-name">__🏆 Rewards__</div>
        <div class="quest-embed-field-value">${renderMarkdown(rewards.join(' • '))}</div>
      </div>
    `;
  }
  
  // Participation field
  const participation = [];
  if (quest.participantCap) participation.push(`👥 **${renderMarkdown(quest.participantCap)} slots**`);
  if (quest.postRequirement) participation.push(`💬 **${renderMarkdown(quest.postRequirement)} posts**`);
  if (quest.minRequirements && quest.minRequirements !== '0' && quest.minRequirements !== '') {
    participation.push(`📝 **Min requirement: ${renderMarkdown(quest.minRequirements)}**`);
  }
  
  const formattedDeadline = formatSignupDeadlineForPreview(quest.signupDeadline, quest.date);
  if (formattedDeadline) participation.push(`📅 **Signup by ${renderMarkdown(formattedDeadline)}**`);
  
  if (participation.length > 0) {
    html += `
      <div class="quest-embed-field">
        <div class="quest-embed-field-name">__🗓️ Participation__</div>
        <div class="quest-embed-field-value">${renderMarkdown(participation.join(' • '))}</div>
      </div>
    `;
  }
  
  // Rules field
  const rulesText = formatQuestRulesForPreview(quest);
  if (rulesText) {
    html += `
      <div class="quest-embed-field">
        <div class="quest-embed-field-name">__📋 Rules__</div>
        <div class="quest-embed-field-value">${renderMarkdown(rulesText)}</div>
      </div>
    `;
  }
  
  // RP Thread field
  if (quest.questType && quest.questType.toLowerCase() === 'rp' && quest.rpThreadParentChannel && quest.guildId) {
    const rpThreadLink = `[Join the RP discussion here!](https://discord.com/channels/${quest.guildId}/${quest.rpThreadParentChannel})`;
    html += `
      <div class="quest-embed-field">
        <div class="quest-embed-field-name">__🎭 RP Thread__</div>
        <div class="quest-embed-field-value">${renderMarkdown(rpThreadLink)}</div>
      </div>
    `;
  }
  
  // Join This Quest field
  if (quest.questID) {
    let joinText = `</quest join:1389946995468271729> questid:${escapeHtml(quest.questID)}`;
    
    // Add RINGER information for alien minigames
    if (quest.title && quest.title.toLowerCase().includes('alien') && quest.title.toLowerCase().includes('defense')) {
      joinText += `\n\n🆘 **Want to help but not signed up?** Use \`RINGER\` in quest id to help!`;
    }
    
    html += `
      <div class="quest-embed-field">
        <div class="quest-embed-field-name">__🎯 Join This Quest__</div>
        <div class="quest-embed-field-value">${renderMarkdown(joinText)}</div>
      </div>
    `;
  }
  
  // Border image
  html += `<img src="${BORDER_IMAGE}" alt="Quest border" class="quest-embed-image" />`;
  
  // Footer
  if (quest.questID) {
    const now = new Date();
    const timestamp = now.toISOString();
    html += `
      <div class="quest-embed-footer">
        <div class="quest-embed-footer-text">Quest ID: ${renderMarkdown(quest.questID)}</div>
        <div class="quest-embed-timestamp">${formatTimestamp(timestamp)}</div>
      </div>
    `;
  }
  
  html += `</div>`;
  return html;
}

// Helper functions for embed preview
function parseTokenRewardDetails(tokenReward) {
  if (!tokenReward || tokenReward === 'N/A' || tokenReward.trim() === '') return null;
  
  if (typeof tokenReward === 'number') return { type: 'flat', amount: tokenReward };
  
  const parsed = parseFloat(tokenReward);
  if (!isNaN(parsed)) return { type: 'flat', amount: parsed };
  
  if (tokenReward.toLowerCase().includes('no reward') || 
      tokenReward.toLowerCase().includes('none')) {
    return null;
  }
  
  // Handle per_unit format: per_unit:222 unit:submission max:3
  if (tokenReward.includes('per_unit:')) {
    const perUnitMatch = tokenReward.match(/per_unit:(\d+)/);
    const maxMatch = tokenReward.match(/max:(\d+)/);
    const unitMatch = tokenReward.match(/unit:(\w+)/);
    const collabBonusMatch = tokenReward.match(/collab_bonus:(\d+)/);
    
    if (perUnitMatch) {
      const perUnit = parseInt(perUnitMatch[1]);
      const maxUnits = maxMatch ? parseInt(maxMatch[1]) : 1;
      const unit = unitMatch ? unitMatch[1] : 'submission';
      const collabBonus = collabBonusMatch ? parseInt(collabBonusMatch[1]) : 0;
      
      return {
        type: 'per_unit',
        perUnit: perUnit,
        maxUnits: maxUnits,
        unit: unit,
        total: perUnit * maxUnits,
        collabBonus: collabBonus,
        maxWithCollab: (perUnit + collabBonus) * maxUnits
      };
    }
  }
  
  // Handle flat format with collab bonus: flat:300 collab_bonus:200
  if (tokenReward.includes('flat:')) {
    const flatMatch = tokenReward.match(/flat:(\d+)/);
    const collabBonusMatch = tokenReward.match(/collab_bonus:(\d+)/);
    
    if (flatMatch) {
      const flatAmount = parseInt(flatMatch[1]);
      const collabBonus = collabBonusMatch ? parseInt(collabBonusMatch[1]) : 0;
      
      return {
        type: 'flat',
        amount: flatAmount,
        collabBonus: collabBonus,
        maxWithCollab: flatAmount + collabBonus
      };
    }
  }
  
  return null;
}

function parseItemRewardsForPreview(itemRewardsString) {
  if (!itemRewardsString || itemRewardsString.trim() === '') {
    return [];
  }
  
  const items = [];
  const itemStrings = itemRewardsString.split(';');
  
  for (const itemString of itemStrings) {
    const trimmed = itemString.trim();
    if (!trimmed) continue;
    
    if (trimmed.includes(':')) {
      const [name, qty] = trimmed.split(':').map(s => s.trim());
      items.push({
        name: name,
        quantity: parseInt(qty, 10) || 1
      });
    } else {
      items.push({
        name: trimmed,
        quantity: 1
      });
    }
  }
  
  return items;
}

function formatLocationText(location) {
  if (!location) return 'Unknown';
  
  // Replace village names with emoji format (simplified for preview)
  let formatted = location;
  formatted = formatted.replace(/Rudania/gi, 'Rudania');
  formatted = formatted.replace(/Inariko/gi, 'Inariko');
  formatted = formatted.replace(/Vhintl/gi, 'Vhintl');
  
  return escapeHtml(formatted);
}

function formatSignupDeadlineForPreview(signupDeadline, questDate) {
  if (!signupDeadline || signupDeadline === 'No Deadline' || signupDeadline.trim() === '') return null;
  return escapeHtml(signupDeadline);
}

function formatQuestRulesForPreview(quest) {
  let rulesText = '';
  
  if (quest.questType && quest.questType.toLowerCase() === 'rp') {
    rulesText = '• **RP Quest**: 1-week signup window\n';
    rulesText += '• **Village Rule**: Stay in quest village for entire duration\n';
    rulesText += '• **Posts**: 20+ characters, meaningful content only\n';
    if (quest.participantCap) {
      rulesText += `• **Member-capped**: Max ${renderMarkdown(quest.participantCap)} participants\n`;
    }
    if (quest.tableroll) {
      rulesText += `• **Optional Table Roll**: ${renderMarkdown(quest.tableroll)} table available\n`;
    }
  } else if (quest.questType && quest.questType.toLowerCase() === 'interactive') {
    if (quest.tableRollName) {
      rulesText = '• **Interactive Quest**: Use table roll mechanics\n';
      rulesText += `• **Table**: ${escapeHtml(quest.tableRollName)}\n`;
      const requiredRollsEl = document.getElementById('quest-required-rolls');
      const requiredRolls = requiredRollsEl ? requiredRollsEl.value : '1';
      if (parseInt(requiredRolls, 10) > 1) {
        rulesText += `• **Requirement**: ${requiredRolls} successful rolls\n`;
      }
    } else {
      rulesText = '• **Interactive Quest**: Use table roll mechanics\n';
    }
    if (quest.participantCap) {
      rulesText += `• **Member-capped**: Max ${escapeHtml(quest.participantCap)} participants\n`;
    }
  } else if (quest.questType && quest.questType === 'Art / Writing') {
    rulesText = '• **Art & Writing**: Submit either art OR writing\n';
    rulesText += '• **Writing**: Minimum 500 words\n';
    rulesText += '• **Art**: Any style accepted\n';
  }
  
  if (quest.participantCap && quest.participantCap !== '') {
    rulesText += '• **Rule**: Only ONE member-capped quest per person\n';
  }
  
  // Add additional rules if present
  if (quest.rules && quest.rules.trim()) {
    const additionalRules = quest.rules.split('\n').filter(rule => rule.trim()).map(rule => `• ${renderMarkdown(rule.trim())}`).join('\n');
    if (rulesText) {
      rulesText += additionalRules;
    } else {
      rulesText = additionalRules;
    }
  }
  
  return rulesText || null;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  return `${month} ${day}, ${year} at ${displayHours}:${minutes} ${ampm}`;
}

// Render basic markdown (bold, code, links)
function renderMarkdown(text) {
  if (!text) return '';
  
  // Escape HTML first
  let rendered = escapeHtml(text);
  
  // Render bold **text**
  rendered = rendered.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Render code `text`
  rendered = rendered.replace(/`(.+?)`/g, '<code>$1</code>');
  
  // Render links [text](url)
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  return rendered;
}

// ============================================================================
// ------------------- User Menu Update -------------------
// ============================================================================
async function updateUserMenu() {
  try {
    const authStatus = await checkUserAuthStatus();
    const usernameEl = document.getElementById('username');
    const userAvatar = document.getElementById('user-avatar');
    
    if (authStatus.currentUser && usernameEl) {
      usernameEl.textContent = authStatus.currentUser.username || authStatus.currentUser.discordId || 'User';
      
      if (authStatus.currentUser.avatar && userAvatar) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${authStatus.currentUser.discordId}/${authStatus.currentUser.avatar}.png`;
        userAvatar.src = avatarUrl;
        userAvatar.onerror = () => { userAvatar.src = '/images/ankleicon.png'; };
      }
    }
  } catch (error) {
    console.error('Error updating user menu:', error);
  }
}
