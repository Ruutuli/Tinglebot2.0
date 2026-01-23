// ============================================================================
// ------------------- Field Editability Rules -------------------
// Defines which character fields can be edited based on application status
// ============================================================================

const { STATUS, isPending, isAccepted, isNeedsChanges, isDraft } = require('./statusConstants');

/**
 * Fields that are NEVER user-editable (only mods/admins can change these)
 */
const LOCKED_FIELDS = [
  'name',
  'attack',
  'defense',
  'currentHearts',
  'currentStamina',
  'maxHearts',
  'maxStamina'
];

/**
 * Fields that are locked during PENDING status
 * (All fields except status are locked during pending review)
 */
const PENDING_LOCKED_FIELDS = [
  // Essentially all fields except status
  // This is handled in the edit endpoint by checking status === 'pending'
];

/**
 * Fields that CAN be edited after approval (status: 'accepted')
 * All other fields remain locked even after approval
 */
const APPROVED_EDITABLE_FIELDS = [
  'height',
  'pronouns',
  'icon',
  'personality',
  'history',
  'extras',
  'gender',
  'virtue',
  'appLink',
  'appArt',
  'birthday'
];

/**
 * Check if a field can be edited based on character status
 * @param {string} fieldName - Name of the field to check
 * @param {string|null} status - Character status ('pending', 'accepted', 'needs_changes', or null/undefined for DRAFT)
 * @returns {boolean} - True if field can be edited
 */
function isFieldEditable(fieldName, status) {
  // Never editable fields
  if (LOCKED_FIELDS.includes(fieldName)) {
    return false;
  }
  
  // During PENDING, nothing is editable
  if (isPending(status)) {
    return false;
  }
  
  // During APPROVED (accepted), only approved-editable fields can be changed
  if (isAccepted(status)) {
    return APPROVED_EDITABLE_FIELDS.includes(fieldName);
  }
  
  // DRAFT state (status: null/undefined) or NEEDS_CHANGES - all non-locked fields are editable
  // This allows users to fix issues after receiving feedback
  if (isDraft(status) || isNeedsChanges(status)) {
    return !LOCKED_FIELDS.includes(fieldName);
  }
  
  // Default: not editable
  return false;
}

/**
 * Get list of editable fields for a given status
 * @param {string|null} status - Character status
 * @returns {string[]} - Array of field names that can be edited
 */
function getEditableFields(status) {
  if (isPending(status)) {
    return [];
  }
  
  if (isAccepted(status)) {
    return APPROVED_EDITABLE_FIELDS;
  }
  
  // DRAFT state or NEEDS_CHANGES - all non-locked fields are editable
  return Object.keys(require('../models/CharacterModel').schema.paths)
    .filter(field => !LOCKED_FIELDS.includes(field));
}

/**
 * Get list of locked fields for a given status
 * @param {string|null} status - Character status
 * @returns {string[]} - Array of field names that cannot be edited
 */
function getLockedFields(status) {
  if (isPending(status)) {
    // Everything is locked during pending
    return Object.keys(require('../models/CharacterModel').schema.paths);
  }
  
  if (isAccepted(status)) {
    // Locked fields + fields not in approved-editable list
    const allFields = Object.keys(require('../models/CharacterModel').schema.paths);
    return allFields.filter(field => !APPROVED_EDITABLE_FIELDS.includes(field));
  }
  
  // DRAFT state or NEEDS_CHANGES - only locked fields
  return LOCKED_FIELDS;
}

module.exports = {
  LOCKED_FIELDS,
  PENDING_LOCKED_FIELDS,
  APPROVED_EDITABLE_FIELDS,
  isFieldEditable,
  getEditableFields,
  getLockedFields
};
