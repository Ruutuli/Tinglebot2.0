// ============================================================================
// Grotto Blessing — Flavor text variants (simple blessing, no trial)
// Used when grotto trial type = "blessing". One chosen at random.
// Source: GROTTOS_README.md
// ============================================================================

const BLESSING_FLAVORS = [
  "As you enter the grotto, you encounter a really interesting looking chest. Your group opens it and voila... a Spirit Orb! It's almost a bit boring without having to work for it...",
  "The grotto opens into a small chamber lit by soft blue light. At its center, an ancient tree stump holds a shallow basin. Spirit orbs materialize within—one for each of you. The old roots seem to sigh with approval.",
  "You step into a pocket of warmth beneath the earth. Golden dust drifts from cracks in the ceiling. As it settles, orbs of light coalesce before each party member. A gentle blessing, freely given.",
  "A pedestal of weathered stone stands at the far end. Resting upon it: spirit orbs, gleaming and ready. No guardian, no trial—just a gift from the grotto itself.",
  "The air shimmers. Something in this place has been waiting. One by one, spirit orbs emerge from the walls and float into your hands. Perhaps the forest remembers those who cleanse its blight.",
  "Beneath a tangle of roots, you find a hollow filled with glowing orbs. They pulse softly, as if breathing. Your party takes one each. The grotto hums contentedly.",
];

/**
 * Returns a random blessing flavor. Used for blessing-type grotto trials.
 * @returns {string}
 */
function getRandomBlessingFlavor() {
  return BLESSING_FLAVORS[Math.floor(Math.random() * BLESSING_FLAVORS.length)];
}

module.exports = {
  BLESSING_FLAVORS,
  getRandomBlessingFlavor,
};
