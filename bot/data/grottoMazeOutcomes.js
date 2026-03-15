// ============================================================================
// Grotto Maze — Song of Scrying / wall roll outcomes (Roll 1–6)
// Used by /explore grotto maze when action is "wall".
// ============================================================================

const GROTTO_MAZE_OUTCOMES = [
  // Roll 5 — Hinox Construct (tier 7)
  {
    roll: 5,
    flavor:
      "You sing the sequence on the wall and... out pops a construct! Guess you're a REALLY bad musician? The construct pulls at the wall to form into a large construct with the strange appearance of a Hinox! It's goofy eye stares at you as it pulls out its mangled weapons and lets out a warped ear piercing roar!",
    type: 'battle',
    battle: { monsterLabel: 'Hinox Construct', tier: 7 },
    ctaHint: 'Use </raid> with the Raid ID above. When the monster is defeated, continue with </explore grotto maze>.',
  },
  // Roll 5 — Stone Talus Construct (tier 5)
  {
    roll: 5,
    flavor:
      "You sing the sequence on the wall and... out pops a construct! Guess you're a REALLY bad musician? The construct pulls at the wall to form into a large construct with the strange appearance of a Stone Talus. Its body jumps as you prepare for impact!",
    type: 'battle',
    battle: { monsterLabel: 'Stone Talus Construct', tier: 5 },
    ctaHint: 'Use </raid> with the Raid ID above. When the monster is defeated, continue with </explore grotto maze>.',
  },
  // Roll 4 — Pit trap
  {
    roll: 4,
    flavor:
      "You sing the sequence on the wall and... you sing something loose, the ground crumbles around you and you've fallen into a pit trap!\n\nYou lose 3❤️ hearts in the fall!\nYou spend 3🟩 stamina to climb out!",
    type: 'pit_trap',
    heartsLost: 3,
    staminaCost: 3,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 4 — Pit trap (alternate)
  {
    roll: 4,
    flavor:
      "You sing the sequence on the wall and... wrong note! The floor gives way beneath you.\n\nYou lose 3❤️ hearts in the fall!\nYou spend 3🟩 stamina to climb out!",
    type: 'pit_trap',
    heartsLost: 3,
    staminaCost: 3,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 2 — Nothing
  {
    roll: 2,
    flavor:
      "You sing the sequence on the wall and... nothing changes, it's just as still as it was to begin with. Maybe there's another way?",
    type: 'nothing',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 2 — Nothing (alternate)
  {
    roll: 2,
    flavor:
      "You sing the sequence on the wall and... the runes flicker once, then go dark. Perhaps you need a different approach?",
    type: 'nothing',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 2 — Stalagmites
  {
    roll: 2,
    flavor:
      "You sing the sequence on the wall and... There is a rumbling above you, you look up to find loose rocks shaking and come loose from the ceiling.\n\nYou dive out of the way as rows of stalagmites fall around you, you narrowly avoided death, but you're a little scraped up. But alive!\n\nYou spend 3🟩 stamina avoiding the rocks!",
    type: 'stalagmites',
    staminaCost: 3,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Faster path opens
  {
    roll: 1,
    flavor:
      "You sing the sequence on the wall and... dear Hylia, that was terrible! The wall still slides downward into the ground, opening up a FASTER path to the end of the maze, hurray!",
    type: 'faster_path_open',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Faster path (alternate—lucky!)
  {
    roll: 1,
    flavor:
      "You sing the sequence on the wall and... somehow it works anyway! The wall slides aside, revealing a faster route. Beginner's luck?",
    type: 'faster_path_open',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Passage collapses
  {
    roll: 1,
    flavor:
      "You sing the sequence on the wall and... the entire passageway rumbles. Your group flees through the crumbling passage—you tumble out on the other side of the wall!",
    type: 'collapse',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 6 — Success, faster path
  {
    roll: 6,
    flavor:
      "You sing the sequence on the wall and... you did amazing! The wall slides down into the ground, revealing a FASTER path to the end, hurray!",
    type: 'faster_path_open',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 6 — Success, faster path (alternate)
  {
    roll: 6,
    flavor:
      "You sing the sequence on the wall and... the ancient runes glow in approval. The wall grinds downward—a shortcut to the exit opens!",
    type: 'faster_path_open',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 5 — Nothing (duplicate roll 5)
  {
    roll: 5,
    flavor:
      "You sing the sequence on the wall and... nothing changes, it's just as still as it was to begin with. Maybe there's another way?",
    type: 'nothing',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 3 — Collapse
  {
    roll: 3,
    flavor:
      "You sing the sequence on the wall and... the entire passageway rumbles. Your group flees through the crumbling passage—you tumble out on the other side of the wall!",
    type: 'collapse',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 3 — Collapse (alternate)
  {
    roll: 3,
    flavor:
      "You sing the sequence on the wall and... the walls tremble. A cascade of roots and stone collapses the passage—you scramble through and emerge on the other side!",
    type: 'collapse',
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 3 — Stone Talus blocks faster path
  {
    roll: 3,
    flavor:
      "You sing the sequence on the wall and... the wall begins moving downward. As it does, you notice several weird shapes in it moving and rumbling that weren't doing that before... A stone talus construct has blocked your faster path! It's giant body jumps and goes airborne before crashing down and getting ready to launch an attack!",
    type: 'battle',
    battle: { monsterLabel: 'Stone Talus Construct', tier: 5 },
    ctaHint: 'Use </raid> with the Raid ID above. When the monster is defeated, continue on your FASTER path with </explore grotto maze>.',
  },
  // Roll 2 — Rare Talus
  {
    roll: 2,
    flavor:
      "You sing the sequence on the wall and... the wall begins moving downward. As it does, you notice several weird shapes in it moving and rumbling that weren't doing that before... A rare talus construct has blocked your faster path! It's giant body jumps and goes airborne before crashing down and getting ready to launch an attack!",
    type: 'battle',
    battle: { monsterLabel: 'Rare Talus Construct', tier: 7 },
    ctaHint: 'Use </raid> with the Raid ID above. When the monster is defeated, continue on your FASTER path with </explore grotto maze>.',
  },
  // Roll 1 — Boss Bokoblin
  {
    roll: 1,
    flavor:
      "You sing the sequence on the wall and... dear Hylia, that was terrible! You should really change your job... the Boss Bokoblin construct you awoke agrees!",
    type: 'battle',
    battle: { monsterLabel: 'Mini-Boss Bokoblin Construct', tier: 7 },
    ctaHint: 'Use </raid> with the Raid ID above. When the monster is defeated, continue with </explore grotto maze>.',
  },
];

// ============================================================================
// Grotto Maze — Trap cell outcomes (stepping on a yellow trap tile). Roll 1–5.
// Used when party moves onto a trap cell.
// ============================================================================

const GROTTO_MAZE_TRAP_OUTCOMES = [
  // Roll 5 — Dart trap (injured)
  {
    roll: 5,
    flavor:
      "You feel something snap against your foot, the sounds of some type of mechanism behind the stone walls activate as thin sharp objects shoot from the cracks.\n\nDiving down you avoid the deadly barrage but you are not without injury.\n\nYou lose 4❤️ hearts as the wooden darts pierce you.\nYou spend 4🟩 stamina getting out of the way.",
    heartsLost: 4,
    staminaCost: 4,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 5 — Dart trap (alternate)
  {
    roll: 5,
    flavor:
      "Something clicks. Sharpened stakes shoot from hidden slots—you dodge most, but one grazes your side.\n\nYou lose 4❤️ hearts.\nYou spend 4🟩 stamina scrambling to safety.",
    heartsLost: 4,
    staminaCost: 4,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 4 — Pit trap
  {
    roll: 4,
    flavor:
      "You step on something loose, the ground crumbles around you and you've fallen into a pit trap!\n\nYou lose 3❤️ hearts in the fall!\nYou spend 3🟩 stamina to climb out!",
    heartsLost: 3,
    staminaCost: 3,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 4 — Pit trap (alternate)
  {
    roll: 4,
    flavor:
      "The ground collapses! You tumble into a shallow pit.\n\nYou lose 3❤️ hearts in the fall!\nYou spend 3🟩 stamina to climb out!",
    heartsLost: 3,
    staminaCost: 3,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 4 — Stalagmites
  {
    roll: 4,
    flavor:
      "There is a rumbling above you, you look up to find loose rocks shaking and come loose from the ceiling.\n\nYou dive out of the way as rows of stalagmites fall around you, you narrowly avoided death, but you're a little scraped up. But alive!\n\nYou spend 3🟩 stamina avoiding the rocks!",
    staminaCost: 3,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 3 — Darts dodge
  {
    roll: 3,
    flavor:
      "You feel something snap against your foot, the sounds of some type of mechanism behind the stone walls activate as thin sharp objects shoot from the cracks.\n\nThinking fast, you dive down, and avoid the deadly barrage.\n\nYou spend 2🟩 stamina getting out of the way, good job!",
    staminaCost: 2,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 3 — Darts dodge (alternate)
  {
    roll: 3,
    flavor:
      "A tripwire snaps! Darts fly from the walls. You spin aside in time—winded but unharmed.\n\nYou spend 2🟩 stamina recovering your balance.",
    staminaCost: 2,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 3 — Crumbling floor avoid
  {
    roll: 3,
    flavor:
      "You feel the floor beneath you crumble, but you run fast enough to avoid falling in!\n\nYou spend 1🟩 stamina in the process but avoid injury! Good job!",
    staminaCost: 1,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 3 — Crumbling floor avoid (alternate)
  {
    roll: 3,
    flavor:
      "The tiles crack underfoot—you leap to solid ground just in time!\n\nYou spend 1🟩 stamina in the scramble but suffer no injuries.",
    staminaCost: 1,
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Nothing
  {
    roll: 1,
    flavor:
      "You hear something click... but nothing happens? Perhaps whatever was here doesn't work anymore... lucky!",
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Nothing (alternate)
  {
    roll: 1,
    flavor:
      "Your foot lands on a suspicious stone—it shifts, then... nothing. The mechanism must be rusted shut. Lucky break!",
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Nothing (alternate)
  {
    roll: 1,
    flavor:
      "A pressure plate depresses with a hollow clunk. You hold your breath... silence. The springs have long since given out.",
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Nothing (alternate)
  {
    roll: 1,
    flavor:
      "Something groans in the walls—dust puffs from a crack. You brace yourself, but no darts, no spikes. Whatever it was, it's long since emptied.",
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Nothing (alternate)
  {
    roll: 1,
    flavor:
      "Your hand brushes a cold metal lever. It clicks. A grinding sound echoes, then fades. The machinery has seized. You move on unscathed.",
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Nothing (alternate)
  {
    roll: 1,
    flavor:
      "The floor tile tilts—you hear gears turning somewhere below. They grind to a halt. Century-old clockwork, no longer wound.",
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
  // Roll 1 — Nothing (alternate)
  {
    roll: 1,
    flavor:
      "A tripwire catches your ankle. You freeze. A click. Then... nothing. The counterweight must have rotted away long ago.",
    ctaHint: 'Continue exploring. Use </explore grotto maze>.',
  },
];

/**
 * Get a random outcome for stepping on a trap cell. Roll 1–5 (roll 2 and 6 are mapped to 1 and 5).
 * @param {number} roll - Result of 1d6 (1–6); 2 -> 1, 6 -> 5
 * @returns {Object} Outcome with flavor, ctaHint, optional heartsLost, staminaCost
 */
function getGrottoMazeTrapOutcome(roll) {
  let n = Math.max(1, Math.min(6, parseInt(roll, 10) || 1));
  if (n === 2) n = 1;
  if (n === 6) n = 5;
  const candidates = GROTTO_MAZE_TRAP_OUTCOMES.filter((o) => o.roll === n);
  if (candidates.length === 0) {
    return {
      roll: n,
      flavor: "You tread carefully... nothing triggers.",
      ctaHint: 'Continue exploring. Use </explore grotto maze>.',
    };
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Get a random outcome for a given d6 roll (1–6). Multiple outcomes can share the same roll; one is picked at random.
 * @param {number} roll - Result of 1d6 (1 to 6)
 * @returns {Object} Outcome object with flavor, type, ctaHint, and optional battle/heartsLost/staminaCost
 */
function getGrottoMazeOutcome(roll) {
  const n = Math.max(1, Math.min(6, parseInt(roll, 10) || 1));
  const candidates = GROTTO_MAZE_OUTCOMES.filter((o) => o.roll === n);
  if (candidates.length === 0) {
    return {
      roll: n,
      flavor: "You sing the sequence on the wall and... nothing happens.",
      type: 'nothing',
      ctaHint: 'Continue exploring. Use </explore grotto maze>.',
    };
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ============================================================================
// Grotto Maze — Scrying Wall (cell types mazep/mazen) — Song of Scrying
// 2 outcomes only: pass or fail. Entertainer in party = 50% higher success chance.
// ============================================================================

const MAZEP_WALL_FLAVOR =
  "You encounter a **wall covered in ancient musical notes!** The runes pulse faintly, awaiting a melody. What secrets does this wall hold?";

const MAZEP_PASS_OUTCOMES = [
  "You sing the sequence on the wall and... the ancient runes glow in approval. The wall grinds downward—a **faster path to the exit** opens!",
  "You sing the sequence on the wall and... you did it! The wall slides down into the ground, revealing a **FASTER path** to the end, hurray!",
  "You sing the sequence on the wall and... the runes flare with recognition. The wall descends smoothly—a shortcut appears before you!",
  "You sing the sequence on the wall and... dear Hylia, that was terrible! The wall still slides downward into the ground, opening up a **FASTER path** to the end of the maze, hurray!",
  "You sing the sequence on the wall and... somehow it works anyway! The wall slides aside, revealing a faster route. Beginner's luck?",
];

const MAZEP_FAIL_OUTCOMES = [
  { flavor: "You sing the sequence on the wall and... wrong note! The floor gives way beneath you.\n\nYou lose 3❤️ hearts in the fall!\nYou spend 3🟩 stamina to climb out!", type: 'pit_trap', heartsLost: 3, staminaCost: 3 },
  { flavor: "You sing the sequence on the wall and... you sing something loose—the ground crumbles around you and you've fallen into a pit trap!\n\nYou lose 3❤️ hearts in the fall!\nYou spend 3🟩 stamina to climb out!", type: 'pit_trap', heartsLost: 3, staminaCost: 3 },
  { flavor: "You sing the sequence on the wall and... the entire passageway rumbles. Your group flees through the crumbling passage—you tumble out on the other side of the wall!", type: 'collapse' },
  { flavor: "You sing the sequence on the wall and... the walls tremble. A cascade of roots and stone collapses the passage—you scramble through and emerge on the other side!", type: 'collapse' },
  { flavor: "You sing the sequence on the wall and... nothing changes, it's just as still as it was to begin with. Maybe there's another way?", type: 'nothing' },
  { flavor: "You sing the sequence on the wall and... the runes flicker once, then go dark. A cloud of ancient dust puffs into your face.\n\nYou spend 1🟩 stamina coughing and clearing your throat.", type: 'nothing', staminaCost: 1 },
  { flavor: "You sing the sequence on the wall and... nothing. Discouraged, you take a step back to regroup.", type: 'step_back' },
  { flavor: "You sing the sequence on the wall and... there is a rumbling above you. You look up to find loose rocks shaking and coming loose from the ceiling.\n\nYou dive out of the way as rows of stalagmites fall around you—you narrowly avoided death, but you're a little scraped up. But alive!\n\nYou spend 3🟩 stamina avoiding the rocks!", type: 'stalagmites', staminaCost: 3 },
];

const CTA_HINT = 'Continue exploring. Use </explore grotto maze>.';

/**
 * Get pass or fail outcome for Scrying Wall Song of Scrying.
 * @param {boolean} success - Whether the party succeeded
 * @returns {{ flavor: string, type: string, heartsLost?: number, staminaCost?: number, ctaHint: string }}
 */
function getGazepScryingOutcome(success) {
  if (success) {
    const flavor = MAZEP_PASS_OUTCOMES[Math.floor(Math.random() * MAZEP_PASS_OUTCOMES.length)];
    return { flavor, type: 'faster_path_open', ctaHint: CTA_HINT };
  }
  const outcome = MAZEP_FAIL_OUTCOMES[Math.floor(Math.random() * MAZEP_FAIL_OUTCOMES.length)];
  return {
    flavor: outcome.flavor,
    type: outcome.type,
    heartsLost: outcome.heartsLost,
    staminaCost: outcome.staminaCost,
    ctaHint: CTA_HINT,
  };
}

// ============================================================================
// Grotto Maze — Treasure chest loot (4 preferred most likely; any DB item can drop)
// ============================================================================

const GROTTO_MAZE_PREFERRED_LOOT = [
  { itemName: "Fairy", weight: 40, emoji: "🧚" },
  { itemName: "Star Fragment", weight: 25, emoji: "⭐" },
  { itemName: "Goddess Plume", weight: 20, emoji: "🪶" },
  { itemName: "Spirit Orb", weight: 5, emoji: "💫" },
];

const PREFERRED_NAMES = new Set(GROTTO_MAZE_PREFERRED_LOOT.map((e) => e.itemName));
const OTHER_ITEM_WEIGHT = 2; // each non-preferred item from DB gets this weight

/**
 * Roll one item: preferred four (Spirit Orb, Fairy, Star Fragment, Goddess Plume) are most likely;
 * any item from the DB (allItems) can also drop.
 * @param {Array<{ itemName: string, emoji?: string }>} [allItems] - from fetchAllItems(); if missing/empty, only preferred loot is used
 * @returns {{ itemName: string, emoji: string }}
 */
function getGrottoMazeChestLoot(allItems) {
  const pool = [...GROTTO_MAZE_PREFERRED_LOOT];
  if (allItems && allItems.length > 0) {
    for (const item of allItems) {
      const name = (item.itemName || item.name || "").trim();
      if (!name || PREFERRED_NAMES.has(name)) continue;
      pool.push({
        itemName: name,
        weight: OTHER_ITEM_WEIGHT,
        emoji: item.emoji || "📦",
      });
    }
  }
  if (pool.length === 0) return { itemName: "Spirit Orb", emoji: "💫" };
  const total = pool.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  let chosen = null;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) {
      chosen = entry;
      break;
    }
  }
  if (!chosen) chosen = pool[0];
  // Use emoji from database when available (e.g. custom Fairy emoji)
  const fromDb = allItems && allItems.find((item) => (item.itemName || item.name || "").trim().toLowerCase() === (chosen.itemName || "").trim().toLowerCase());
  const emoji = (fromDb && fromDb.emoji && String(fromDb.emoji).trim()) ? String(fromDb.emoji).trim() : (chosen.emoji || "📦");
  return { itemName: chosen.itemName, emoji };
}

// ============================================================================
// Grotto Maze — Random move events (every step: flavor, small gather, or monster)
// Not tied to marked cells; fills the "empty" moves with life.
// ============================================================================

const GROTTO_MAZE_RANDOM_MOVE_FLAVOR = [
  "The passage echoes with the drip of water somewhere ahead.",
  "Faint luminescent moss lines the walls here.",
  "You hear distant stone grinding—another part of the maze shifting?",
  "The air grows cooler as you press deeper.",
  "Scratches on the wall suggest something was dragged through here long ago.",
  "A draft stirs the dust; you catch a whiff of something ancient.",
  "Your footsteps echo off the low ceiling.",
  "Roots from above have broken through the stone in places.",
  "You pass a narrow side passage—best not to wander.",
  "The corridor bends; torchlight casts long shadows.",
  "Something skitters in the dark ahead, then goes still.",
  "Runes carved into the floor have mostly worn away.",
  "A patch of mushrooms glows faintly in a corner.",
  "The walls here are smoother—worked by hands, not nature.",
  "You notice fresh scrapes in the stone. Something passed through recently.",
  "The maze seems to breathe—a subtle shift in pressure.",
  "Tiny crystals in the rock catch the light.",
  "A discarded torch lies burnt out on the ground.",
  "The path splits and rejoins; you stick to the main way.",
  "Somewhere far off, you hear what might be singing.",
];

// Weights: none 52%, flavor 32%, gather 11%, monster 5%
const RANDOM_MOVE_WEIGHTS = { none: 52, flavor: 32, gather: 11, monster: 5 };

/**
 * Roll a random move event for any maze step (path or already-used special cells).
 * Monster is not chosen here — caller (explore.js) picks a random monster from MonsterModel by party region and tier 3–5.
 * @returns {{ type: 'none'|'flavor'|'gather'|'monster', flavor?: string }}
 */
function getGrottoMazeRandomMoveEvent() {
  const r = Math.random() * 100;
  if (r < RANDOM_MOVE_WEIGHTS.none) return { type: 'none' };
  if (r < RANDOM_MOVE_WEIGHTS.none + RANDOM_MOVE_WEIGHTS.flavor) {
    const flavor = GROTTO_MAZE_RANDOM_MOVE_FLAVOR[Math.floor(Math.random() * GROTTO_MAZE_RANDOM_MOVE_FLAVOR.length)];
    return { type: 'flavor', flavor };
  }
  if (r < RANDOM_MOVE_WEIGHTS.none + RANDOM_MOVE_WEIGHTS.flavor + RANDOM_MOVE_WEIGHTS.gather) {
    return { type: 'gather' };
  }
  return { type: 'monster' };
}

module.exports = {
  GROTTO_MAZE_OUTCOMES,
  GROTTO_MAZE_TRAP_OUTCOMES,
  getGrottoMazeOutcome,
  getGrottoMazeTrapOutcome,
  MAZEP_WALL_FLAVOR,
  getGazepScryingOutcome,
  getGrottoMazeChestLoot,
  getGrottoMazeRandomMoveEvent,
};
