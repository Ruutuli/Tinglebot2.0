// ============================================================================
// ------------------- Character Field Editability -------------------
// Determines which fields can be edited based on character status
// ============================================================================

export type CharacterStatus = "pending" | "needs_changes" | "accepted" | null | undefined;

// Always locked fields (never user-editable, only moderators/admins can change)
export const ALWAYS_LOCKED_FIELDS = [
  "attack",
  "defense",
  "currentHearts",
  "currentStamina",
  "maxHearts",
  "maxStamina",
] as const;

// Fields editable in ACCEPTED status
export const ACCEPTED_EDITABLE_FIELDS = [
  "age",
  "height",
  "pronouns",
  "icon",
  "personality",
  "history",
  "extras",
  "gender",
  "virtue",
  "appLink",
  "appArt",
  "birthday",
] as const;

// Fields locked when status is "needs_changes" (after revision).
// Only "name" is locked. Job, personality, history, and other fields remain editable
// so users can address mod feedback and resubmit; changes must save and persist.
export const NEEDS_CHANGES_LOCKED_FIELDS = [
  "name",
] as const;

/**
 * Check if a field is editable based on character status
 * @param fieldName - The name of the field to check
 * @param status - The character's status (null/undefined = DRAFT, 'pending', 'needs_changes', 'accepted')
 * @returns true if the field can be edited by the user, false otherwise
 */
export function isFieldEditable(
  fieldName: string,
  status: CharacterStatus
): boolean {
  // Always locked fields are never editable by users
  if (ALWAYS_LOCKED_FIELDS.includes(fieldName as typeof ALWAYS_LOCKED_FIELDS[number])) {
    return false;
  }

  // Handle nested gear field names (e.g., "gearArmor.head" -> "gearArmor")
  const baseFieldName = fieldName.includes(".") 
    ? fieldName.split(".")[0] 
    : fieldName;

  // Normalize status: null/undefined = DRAFT
  const normalizedStatus = status === null || status === undefined ? "draft" : status;

  // PENDING: No fields editable
  if (normalizedStatus === "pending") {
    return false;
  }

  // NEEDS_CHANGES: Lock name field (after revision)
  if (normalizedStatus === "needs_changes") {
    if (NEEDS_CHANGES_LOCKED_FIELDS.includes(baseFieldName as typeof NEEDS_CHANGES_LOCKED_FIELDS[number])) {
      return false;
    }
    // Other fields are editable (except always-locked ones already checked above)
    return true;
  }

  // DRAFT: All fields editable except always-locked ones
  if (normalizedStatus === "draft") {
    return true; // Already checked for always-locked fields above
  }

  // ACCEPTED: Only specific fields editable
  if (normalizedStatus === "accepted") {
    // Check if the base field name is in the editable fields list
    return ACCEPTED_EDITABLE_FIELDS.includes(
      baseFieldName as typeof ACCEPTED_EDITABLE_FIELDS[number]
    );
  }

  // Unknown status - default to locked for safety
  return false;
}

/**
 * Get all editable fields for a given status
 * @param status - The character's status
 * @returns Array of field names that are editable
 */
export function getEditableFields(status: CharacterStatus): string[] {
  // Normalize status
  const normalizedStatus = status === null || status === undefined ? "draft" : status;

  // PENDING: No fields editable
  if (normalizedStatus === "pending") {
    return [];
  }

  // NEEDS_CHANGES: All fields except always-locked ones and name
  if (normalizedStatus === "needs_changes") {
    // Return common character fields (excluding always-locked ones and name)
    return [
      "age",
      "height",
      "pronouns",
      "gender",
      "race",
      "homeVillage",
      "currentVillage",
      "job",
      "virtue",
      "personality",
      "history",
      "extras",
      "icon",
      "appArt",
      "appLink",
      "birthday",
      "gearWeapon",
      "gearShield",
      "gearArmor",
    ];
  }

  // DRAFT: All fields except always-locked ones
  if (normalizedStatus === "draft") {
    // Return common character fields (excluding always-locked ones)
    return [
      "name",
      "age",
      "height",
      "pronouns",
      "gender",
      "race",
      "homeVillage",
      "currentVillage",
      "job",
      "virtue",
      "personality",
      "history",
      "extras",
      "icon",
      "appArt",
      "appLink",
      "birthday",
      "gearWeapon",
      "gearShield",
      "gearArmor",
    ];
  }

  // ACCEPTED: Only specific fields
  if (normalizedStatus === "accepted") {
    return [...ACCEPTED_EDITABLE_FIELDS];
  }

  // Unknown status
  return [];
}

/**
 * Get all locked fields for a given status
 * @param status - The character's status
 * @returns Array of field names that are locked
 */
export function getLockedFields(status: CharacterStatus): string[] {
  const editableFields = getEditableFields(status);
  const allFields = [
    "name",
    "age",
    "height",
    "pronouns",
    "gender",
    "race",
    "homeVillage",
    "currentVillage",
    "job",
    "virtue",
    "personality",
    "history",
    "extras",
    "icon",
    "appArt",
    "appLink",
    "birthday",
    "attack",
    "defense",
    "currentHearts",
    "currentStamina",
    "maxHearts",
    "maxStamina",
    "gearWeapon",
    "gearShield",
    "gearArmor",
  ];

  return allFields.filter((field) => !editableFields.includes(field));
}
