/**
 * Hard-coded list of pre-established path/village quadrants (pass-through only, no camping).
 * Format: { squareId: 'F10', quadrantId: 'Q2' } — squareId uppercase, quadrantId Q1–Q4.
 */
const PREESTABLISHED_NO_CAMP = [
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

function isPreestablishedNoCamp(squareId, quadrantId) {
  const s = String(squareId || '').trim().toUpperCase();
  const q = String(quadrantId || '').trim().toUpperCase();
  return PREESTABLISHED_NO_CAMP.some(
    (loc) => loc.squareId === s && loc.quadrantId === q
  );
}

module.exports = { PREESTABLISHED_NO_CAMP, isPreestablishedNoCamp };
