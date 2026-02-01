/**
 * Stub for bot-only villageModule. The dashboard does not apply village damage
 * (no Discord client); this no-op allows RaidModel to load without build errors.
 */
async function applyVillageDamage(/* village, monster, thread */) {
  // No-op in dashboard: village damage is applied in the bot only.
}

module.exports = {
  applyVillageDamage,
};
