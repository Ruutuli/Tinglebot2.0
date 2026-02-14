// ============================================================================
// Grotto Maze — Song of Scrying / wall roll outcomes (Roll 1–6)
// Used by /explore grotto maze when action is "wall". No /tableroll; use commands.
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
  // Roll 2 — Nothing
  {
    roll: 2,
    flavor:
      "You sing the sequence on the wall and... nothing changes, it's just as still as it was to begin with. Maybe there's another way?",
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
  // Roll 1 — Passage collapses
  {
    roll: 1,
    flavor:
      "You sing the sequence on the wall and... the entire passageway rumbles. Your group is forced to flee as it collapses in on itself — your group is back in an earlier part of the maze.",
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
      "You sing the sequence on the wall and... the entire passageway rumbles. Your group is forced to flee as it collapses in on itself — your group is back in an earlier part of the maze.",
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
// No battles, no tableroll. Used when party moves onto a trap cell.
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
  // Roll 4 — Pit trap
  {
    roll: 4,
    flavor:
      "You step on something loose, the ground crumbles around you and you've fallen into a pit trap!\n\nYou lose 3❤️ hearts in the fall!\nYou spend 3🟩 stamina to climb out!",
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
  // Roll 3 — Crumbling floor avoid
  {
    roll: 3,
    flavor:
      "You feel the floor beneath you crumble, but you run fast enough to avoid falling in!\n\nYou spend 1🟩 stamina in the process but avoid injury! Good job!",
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

module.exports = {
  GROTTO_MAZE_OUTCOMES,
  GROTTO_MAZE_TRAP_OUTCOMES,
  getGrottoMazeOutcome,
  getGrottoMazeTrapOutcome,
};
