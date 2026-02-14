/**
 * Exploration camp flavor messages.
 * Camp: peaceful rest flavor text; actual recovery is applied by /explore logic.
 */

/** Peaceful rest flavor messages. Used when /explore camp is used (overnight camp). */
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

/** Brief rest flavor messages. Used when a safe space is found during exploration (roll outcome). */
const SAFE_SPACE_FLAVOR_MESSAGES = [
  "A sheltered alcove offers a brief respite from the elements.",
  "The party catches their breath in a quiet, defensible spot.",
  "A patch of soft grass under a tree provides a moment of calm.",
  "The group finds a cozy nook and takes a short rest.",
  "A small clearing, hidden from view, gives everyone a chance to recuperate.",
  "The party spots a shallow cave and rests safely inside.",
  "A ring of rocks creates a natural windbreak; the party rests within.",
  "Dappled sunlight filters through the canopy as the party catches their breath.",
  "A small stream nearby provides fresh water while the party rests.",
  "The ground here is dry and level—a welcome break from the trek.",
];

/**
 * Pick a random camp flavor message. For /explore camp (overnight camp).
 * @returns {string}
 */
function getRandomCampFlavor() {
  return CAMP_FLAVOR_MESSAGES[Math.floor(Math.random() * CAMP_FLAVOR_MESSAGES.length)];
}

/**
 * Pick a random safe space flavor message. For finding a safe space during exploration roll.
 * @returns {string}
 */
function getRandomSafeSpaceFlavor() {
  return SAFE_SPACE_FLAVOR_MESSAGES[Math.floor(Math.random() * SAFE_SPACE_FLAVOR_MESSAGES.length)];
}

module.exports = {
  CAMP_FLAVOR_MESSAGES,
  SAFE_SPACE_FLAVOR_MESSAGES,
  getRandomCampFlavor,
  getRandomSafeSpaceFlavor,
};
