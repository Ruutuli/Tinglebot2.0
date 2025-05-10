// Function: checkInventorySync
// Validates if a character's inventory is synced before allowing actions
async function checkInventorySync(character) {
  if (!character.inventorySynced) {
    throw new Error(`❌ **${character.name}'s** inventory is not synced. Please first use </inventory test:1370788960267272302> to test your inventory, then use </inventory sync:1370788960267272302> to sync it.`);
  }
  return true;
}

module.exports = {
  checkInventorySync
}; 