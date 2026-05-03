// ============================================================================
// Valid job × category pairs for dev boost testing (matches bot boostingEffects).
// Excludes passive boosts (e.g. Entertainer Tokens — Ballad of the Goddess).
// ============================================================================

export type DevBoostKind = {
  /** Stable id: "Job|Category" */
  id: string;
  job: string;
  category: string;
  /** Short effect name for the menu */
  effectName: string;
};

export const DEV_BOOST_KINDS: DevBoostKind[] = [
  // Fortune Teller
  { id: "Fortune Teller|Crafting", job: "Fortune Teller", category: "Crafting", effectName: "Foresight in Sales" },
  { id: "Fortune Teller|Gathering", job: "Fortune Teller", category: "Gathering", effectName: "Rarity Reversal" },
  { id: "Fortune Teller|Healers", job: "Fortune Teller", category: "Healers", effectName: "Predictive Healing" },
  { id: "Fortune Teller|Looting", job: "Fortune Teller", category: "Looting", effectName: "Fated Reroll" },
  { id: "Fortune Teller|Stealing", job: "Fortune Teller", category: "Stealing", effectName: "Predicted Opportunity" },
  { id: "Fortune Teller|Tokens", job: "Fortune Teller", category: "Tokens", effectName: "Fortunate Exchange" },
  { id: "Fortune Teller|Traveling", job: "Fortune Teller", category: "Traveling", effectName: "Foresight Detour" },
  { id: "Fortune Teller|Other", job: "Fortune Teller", category: "Other", effectName: "Weather Prediction" },
  // Teacher
  { id: "Teacher|Crafting", job: "Teacher", category: "Crafting", effectName: "Stamina Assistance" },
  { id: "Teacher|Gathering", job: "Teacher", category: "Gathering", effectName: "Practical Wisdom" },
  { id: "Teacher|Healers", job: "Teacher", category: "Healers", effectName: "Temporary Fortitude" },
  { id: "Teacher|Looting", job: "Teacher", category: "Looting", effectName: "Combat Insight" },
  { id: "Teacher|Stealing", job: "Teacher", category: "Stealing", effectName: "Tactical Risk" },
  { id: "Teacher|Tokens", job: "Teacher", category: "Tokens", effectName: "Critique & Composition" },
  { id: "Teacher|Traveling", job: "Teacher", category: "Traveling", effectName: "Field Lesson" },
  // Priest
  { id: "Priest|Crafting", job: "Priest", category: "Crafting", effectName: "Spiritual Efficiency" },
  { id: "Priest|Gathering", job: "Priest", category: "Gathering", effectName: "Divine Favor" },
  { id: "Priest|Healers", job: "Priest", category: "Healers", effectName: "Spiritual Cleanse" },
  { id: "Priest|Looting", job: "Priest", category: "Looting", effectName: "Divine Blessing" },
  { id: "Priest|Stealing", job: "Priest", category: "Stealing", effectName: "Merciful Sentence" },
  { id: "Priest|Tokens", job: "Priest", category: "Tokens", effectName: "Blessed Economy" },
  { id: "Priest|Traveling", job: "Priest", category: "Traveling", effectName: "Restful Blessing" },
  // Entertainer (skip Tokens — passive)
  { id: "Entertainer|Crafting", job: "Entertainer", category: "Crafting", effectName: "Song of Double Time" },
  { id: "Entertainer|Gathering", job: "Entertainer", category: "Gathering", effectName: "Minuet of Forest" },
  { id: "Entertainer|Healers", job: "Entertainer", category: "Healers", effectName: "Song of Healing" },
  { id: "Entertainer|Looting", job: "Entertainer", category: "Looting", effectName: "Requiem of Spirit" },
  { id: "Entertainer|Stealing", job: "Entertainer", category: "Stealing", effectName: "Elegy of Emptiness" },
  { id: "Entertainer|Traveling", job: "Entertainer", category: "Traveling", effectName: "Bolero of Fire" },
  { id: "Entertainer|Other", job: "Entertainer", category: "Other", effectName: "Song of Storms" },
  // Scholar
  { id: "Scholar|Crafting", job: "Scholar", category: "Crafting", effectName: "Resource Optimization" },
  { id: "Scholar|Gathering", job: "Scholar", category: "Gathering", effectName: "Cross-Region Insight" },
  { id: "Scholar|Healers", job: "Scholar", category: "Healers", effectName: "Efficient Recovery" },
  { id: "Scholar|Looting", job: "Scholar", category: "Looting", effectName: "Double Haul" },
  { id: "Scholar|Stealing", job: "Scholar", category: "Stealing", effectName: "Calculated Grab" },
  { id: "Scholar|Tokens", job: "Scholar", category: "Tokens", effectName: "Research Stipend" },
  { id: "Scholar|Traveling", job: "Scholar", category: "Traveling", effectName: "Travel Guide" },
];

/** Menu label: Job — Category (effect) */
export function formatDevBoostKindLabel(k: DevBoostKind): string {
  return `${k.job} — ${k.category} (${k.effectName})`;
}
