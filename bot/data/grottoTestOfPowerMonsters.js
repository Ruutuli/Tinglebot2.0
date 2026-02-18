// ============================================================================
// Grotto Test of Power — monster pool (constructs + Gloom Hands)
// Weights are relative. Monster is resolved by name from DB; hearts/tier used if not in DB.
// ============================================================================

const TEST_OF_POWER_MONSTERS = [
  { name: 'Gloom Hands', hearts: 10, tier: 5, weight: 2 },
  { name: 'Golden Lynel Construct', hearts: 20, tier: 10, weight: 1 },
  { name: 'Lynel Construct', hearts: 18, tier: 9, weight: 2 },
  { name: 'Talus Construct', hearts: 16, tier: 8, weight: 2 },
  { name: 'Blight Copies', hearts: 18, tier: 9, weight: 1 },
  { name: 'Hinox Construct', hearts: 14, tier: 7, weight: 2 },
  { name: 'Rare Talus Construct', hearts: 14, tier: 7, weight: 1 },
  { name: 'Stone Talus Construct', hearts: 10, tier: 5, weight: 2 },
  { name: 'Mini-Boss Bokoblin Construct', hearts: 14, tier: 7, weight: 1 },
];

function rollTestOfPowerMonster() {
  const total = TEST_OF_POWER_MONSTERS.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of TEST_OF_POWER_MONSTERS) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return TEST_OF_POWER_MONSTERS[0];
}

module.exports = {
  TEST_OF_POWER_MONSTERS,
  rollTestOfPowerMonster,
};
