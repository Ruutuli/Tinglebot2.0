// Test the regex pattern for per_unit format
const tokenReward = "per_unit:222 unit:submission max:3";

console.log('Testing regex pattern for per_unit format...');
console.log('Token reward:', tokenReward);

// Test the regex pattern
const perUnitMatch = tokenReward.match(/per_unit:(\d+)/);
if (perUnitMatch) {
    const questBonus = parseInt(perUnitMatch[1], 10);
    console.log(`✅ SUCCESS: Found per_unit amount: ${questBonus}`);
    console.log('This would be used as the quest bonus!');
} else {
    console.log('❌ FAILED: No per_unit match found');
}

// Test other patterns for comparison
console.log('\nTesting other patterns:');
const questBonusMatch = tokenReward.match(/quest_bonus:(\d+)/);
const collabBonusMatch = tokenReward.match(/collab_bonus:(\d+)/);

console.log('quest_bonus match:', questBonusMatch);
console.log('collab_bonus match:', collabBonusMatch);
console.log('per_unit match:', perUnitMatch);
