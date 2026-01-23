// ============================================================================
// ------------------- Status Constants -------------------
// Centralized status values and utilities for OC application system
// ============================================================================

/**
 * Status values for character applications
 * - null/undefined = Draft (saved, not submitted)
 * - 'pending' = PENDING (submitted, needs votes)
 * - 'needs_changes' = NEEDS_CHANGES (mod says something needs to be changed)
 * - 'accepted' = ACCEPTED (approved)
 */
const STATUS = {
  DRAFT: null,
  PENDING: 'pending',
  NEEDS_CHANGES: 'needs_changes',
  ACCEPTED: 'accepted'
};

/**
 * Status display names for UI
 */
const STATUS_DISPLAY = {
  [STATUS.DRAFT]: 'Draft',
  [STATUS.PENDING]: 'Pending Review',
  [STATUS.NEEDS_CHANGES]: 'Needs Changes',
  [STATUS.ACCEPTED]: 'Approved'
};

/**
 * Status badge CSS classes
 */
const STATUS_CLASSES = {
  [STATUS.DRAFT]: 'status-draft',
  [STATUS.PENDING]: 'status-pending',
  [STATUS.NEEDS_CHANGES]: 'status-needs-changes',
  [STATUS.ACCEPTED]: 'status-accepted'
};

/**
 * Status badge colors (hex)
 */
const STATUS_COLORS = {
  [STATUS.DRAFT]: '#9CA3AF',
  [STATUS.PENDING]: '#FFA500',
  [STATUS.NEEDS_CHANGES]: '#FF6B6B',
  [STATUS.ACCEPTED]: '#4CAF50'
};

/**
 * Valid status values array
 */
const VALID_STATUSES = [STATUS.PENDING, STATUS.NEEDS_CHANGES, STATUS.ACCEPTED];

/**
 * Check if a status value is valid
 * @param {string|null|undefined} status - Status value to check
 * @returns {boolean} - True if valid
 */
function isValidStatus(status) {
  if (status === null || status === undefined) {
    return true; // Draft is valid
  }
  return VALID_STATUSES.includes(status);
}

/**
 * Check if status is Draft (null or undefined)
 * @param {string|null|undefined} status - Status value to check
 * @returns {boolean} - True if Draft
 */
function isDraft(status) {
  return status === null || status === undefined;
}

/**
 * Check if status is Pending
 * @param {string|null|undefined} status - Status value to check
 * @returns {boolean} - True if Pending
 */
function isPending(status) {
  return status === STATUS.PENDING;
}

/**
 * Check if status is Needs Changes
 * @param {string|null|undefined} status - Status value to check
 * @returns {boolean} - True if Needs Changes
 */
function isNeedsChanges(status) {
  return status === STATUS.NEEDS_CHANGES;
}

/**
 * Check if status is Accepted
 * @param {string|null|undefined} status - Status value to check
 * @returns {boolean} - True if Accepted
 */
function isAccepted(status) {
  return status === STATUS.ACCEPTED;
}

/**
 * Check if status allows editing (Draft or Needs Changes)
 * @param {string|null|undefined} status - Status value to check
 * @returns {boolean} - True if editable
 */
function isEditable(status) {
  return isDraft(status) || isNeedsChanges(status);
}

/**
 * Check if status allows submission (Draft or Needs Changes)
 * @param {string|null|undefined} status - Status value to check
 * @returns {boolean} - True if can be submitted
 */
function canSubmit(status) {
  return isDraft(status) || isNeedsChanges(status);
}

/**
 * Get display name for status
 * @param {string|null|undefined} status - Status value
 * @returns {string} - Display name
 */
function getStatusDisplay(status) {
  if (isDraft(status)) {
    return STATUS_DISPLAY[STATUS.DRAFT];
  }
  return STATUS_DISPLAY[status] || STATUS_DISPLAY[STATUS.DRAFT];
}

/**
 * Get CSS class for status badge
 * @param {string|null|undefined} status - Status value
 * @returns {string} - CSS class
 */
function getStatusClass(status) {
  if (isDraft(status)) {
    return STATUS_CLASSES[STATUS.DRAFT];
  }
  return STATUS_CLASSES[status] || STATUS_CLASSES[STATUS.DRAFT];
}

/**
 * Get color for status badge
 * @param {string|null|undefined} status - Status value
 * @returns {string} - Hex color
 */
function getStatusColor(status) {
  if (isDraft(status)) {
    return STATUS_COLORS[STATUS.DRAFT];
  }
  return STATUS_COLORS[status] || STATUS_COLORS[STATUS.DRAFT];
}

/**
 * Normalize status value (ensure lowercase if string)
 * @param {string|null|undefined} status - Status value to normalize
 * @returns {string|null|undefined} - Normalized status
 */
function normalizeStatus(status) {
  if (status === null || status === undefined) {
    return null;
  }
  if (typeof status === 'string') {
    return status.toLowerCase();
  }
  return status;
}

module.exports = {
  STATUS,
  STATUS_DISPLAY,
  STATUS_CLASSES,
  STATUS_COLORS,
  VALID_STATUSES,
  isValidStatus,
  isDraft,
  isPending,
  isNeedsChanges,
  isAccepted,
  isEditable,
  canSubmit,
  getStatusDisplay,
  getStatusClass,
  getStatusColor,
  normalizeStatus
};
