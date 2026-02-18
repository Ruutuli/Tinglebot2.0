// Trial types when a grotto is cleansed. Weights are relative (higher = more likely). Weight 0 = never rolled.
const GROTTO_CLEARED_FLAVOR = "**Spirit orbs** materialize before each of you—the grotto's reward. A bright light blooms from the depths and sweeps you gently back to the entrance; the roots seal behind you with a soft, final glow. The trial complete, this sacred place will not open again.";

// TESTING: maze-only — revert to (blessing:0, target_practice:2, puzzle:2, test_of_power:2, maze:1) when done
const GROTTO_TRIAL_WEIGHTS = [
  { id: 'blessing', label: 'Blessing', weight: 1 },
  { id: 'target_practice', label: 'Target Practice', weight: 1 },
  { id: 'puzzle', label: 'Puzzle', weight: 1 },
  { id: 'test_of_power', label: 'Test of Power', weight: 1 },
  { id: 'maze', label: 'Maze', weight: 1 },
];

function rollGrottoTrialType() {
  const total = GROTTO_TRIAL_WEIGHTS.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of GROTTO_TRIAL_WEIGHTS) {
    r -= t.weight;
    if (r <= 0) return t.id;
  }
  return GROTTO_TRIAL_WEIGHTS[0].id;
}

function getTrialLabel(trialType) {
  const t = GROTTO_TRIAL_WEIGHTS.find((x) => x.id === trialType);
  return t ? t.label : trialType;
}

module.exports = {
  GROTTO_CLEARED_FLAVOR,
  GROTTO_TRIAL_WEIGHTS,
  rollGrottoTrialType,
  getTrialLabel,
};
