/**
 * Hard-coded list of pre-established path/village quadrants.
 * These are always treated as "secured" (0 stamina to roll/move, safe pass-through)
 * and no camping is allowed. Keep in sync with dashboard/scripts/preestablished-no-camp.js
 *
 * Format: { squareId: 'F10', quadrantId: 'Q2' } — squareId uppercase, quadrantId Q1–Q4.
 */
const PREESTABLISHED_SECURED_QUADRANTS = [
  { squareId: 'F10', quadrantId: 'Q2' }, { squareId: 'F10', quadrantId: 'Q4' },
  { squareId: 'G11', quadrantId: 'Q1' }, { squareId: 'G11', quadrantId: 'Q2' },
  { squareId: 'H10', quadrantId: 'Q1' }, { squareId: 'H10', quadrantId: 'Q3' },
  { squareId: 'H9', quadrantId: 'Q3' }, { squareId: 'H9', quadrantId: 'Q1' },
  { squareId: 'G9', quadrantId: 'Q2' },
  { squareId: 'G8', quadrantId: 'Q4' },
  { squareId: 'H8', quadrantId: 'Q3' }, { squareId: 'H8', quadrantId: 'Q4' }, { squareId: 'H8', quadrantId: 'Q2' }, { squareId: 'H8', quadrantId: 'Q1' },
  { squareId: 'I8', quadrantId: 'Q3' },
  { squareId: 'H7', quadrantId: 'Q1' }, { squareId: 'H7', quadrantId: 'Q3' }, { squareId: 'H7', quadrantId: 'Q4' },
  { squareId: 'H6', quadrantId: 'Q3' }, { squareId: 'H6', quadrantId: 'Q1' },
  { squareId: 'G6', quadrantId: 'Q4' }, { squareId: 'G6', quadrantId: 'Q2' },
  { squareId: 'H5', quadrantId: 'Q1' }, { squareId: 'H5', quadrantId: 'Q2' }, { squareId: 'H5', quadrantId: 'Q3' }, { squareId: 'H5', quadrantId: 'Q4' },
];

function isPreestablishedSecured(squareId, quadrantId) {
  const s = String(squareId || '').trim().toUpperCase();
  const q = String(quadrantId || '').trim().toUpperCase();
  return PREESTABLISHED_SECURED_QUADRANTS.some(
    (loc) => loc.squareId === s && loc.quadrantId === q
  );
}

function isPreestablishedNoCamp(squareId, quadrantId) {
  return isPreestablishedSecured(squareId, quadrantId);
}

/**
 * Returns the effective quadrant status for exploration logic.
 * Pre-established quadrants are always "secured" regardless of DB.
 */
function getEffectiveQuadrantStatus(squareId, quadrantId, dbStatus) {
  if (isPreestablishedSecured(squareId, quadrantId)) return 'secured';
  const s = (dbStatus || 'unexplored').toLowerCase();
  return s === 'explored' || s === 'secured' || s === 'inaccessible' ? s : 'unexplored';
}

module.exports = {
  PREESTABLISHED_SECURED_QUADRANTS,
  isPreestablishedSecured,
  isPreestablishedNoCamp,
  getEffectiveQuadrantStatus,
};
