// Trial types when a grotto is cleansed. Weights are relative (higher = more likely).
const GROTTO_TRIAL_WEIGHTS = [
  { id: 'blessing', label: 'Blessing', weight: 3 },
  { id: 'target_practice', label: 'Target Practice', weight: 2 },
  { id: 'puzzle', label: 'Puzzle', weight: 2 },
  { id: 'test_of_power', label: 'Test of Power', weight: 2 },
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
  GROTTO_TRIAL_WEIGHTS,
  rollGrottoTrialType,
  getTrialLabel,
};
