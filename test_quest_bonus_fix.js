const { getQuestBonus } = require('./utils/tokenUtils');

async function testQuestBonusFix() {
    try {
        console.log('Testing quest bonus fix for Q863653...');
        
        const questBonus = await getQuestBonus('Q863653');
        console.log(`Quest bonus for Q863653: ${questBonus}`);
        
        if (questBonus === 222) {
            console.log('✅ SUCCESS: Quest bonus is now correctly calculated as 222!');
        } else {
            console.log(`❌ FAILED: Expected 222, got ${questBonus}`);
        }
    } catch (error) {
        console.error('Error testing quest bonus fix:', error);
    }
    process.exit(0);
}

testQuestBonusFix();
