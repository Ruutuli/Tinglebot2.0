// Function: checkInventorySync
// Validates if a character's inventory is synced before allowing actions
// NOTE: Inventory sync is no longer required - inventory is managed entirely in the bot
async function checkInventorySync(character) {
  // Always return true - inventory sync check is disabled
  return true;
}

module.exports = {
  checkInventorySync
}; 