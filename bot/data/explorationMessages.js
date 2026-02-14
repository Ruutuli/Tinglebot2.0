/**
 * Exploration camp flavor messages.
 * Camp: peaceful rest flavor text; actual recovery is applied by /explore logic.
 */

/** Peaceful rest flavor messages. Actual stamina/hearts recovery is applied by explore logic. */
const CAMP_FLAVOR_MESSAGES = [
  "A refreshing breeze soothes the party as they rest under the stars.",
  "The night passes peacefully with a chorus of crickets serenading the camp.",
  "Despite the eerie sounds from the nearby woods, everyone manages to get some rest.",
  "The campfire crackles pleasantly, casting a warm glow that comforts everyone.",
  "An unexpected downpour forces the party to huddle together, sharing stories until dawn.",
  "The party finds a perfect sleeping spot, nestled between protective boulders.",
  "A dreamless sleep invigorates the party, preparing them for the day ahead.",
  "Waking up to the sight of a beautiful sunrise lifts everyone's spirits.",
  "A nocturnal animal visits the camp, curiously sniffing around before disappearing into the darkness.",
  "The party takes turns telling tales of their past adventures, strengthening their bonds.",
];

/**
 * Pick a random camp flavor message.
 * @returns {string}
 */
function getRandomCampFlavor() {
  return CAMP_FLAVOR_MESSAGES[Math.floor(Math.random() * CAMP_FLAVOR_MESSAGES.length)];
}

module.exports = {
  CAMP_FLAVOR_MESSAGES,
  getRandomCampFlavor,
};
