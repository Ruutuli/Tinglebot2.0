// Function: checkInventorySync
// Validates if a character's inventory is synced before allowing actions
async function checkInventorySync(character) {
  if (!character.inventorySynced) {
    throw new Error('❌ **This character\'s inventory is not synced.** Please use `/testinventorysetup` to sync your inventory before using this command.');
  }
  return true;
}

module.exports = {
  checkInventorySync
}; 