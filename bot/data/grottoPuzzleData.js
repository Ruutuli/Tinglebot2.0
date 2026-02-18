// grottoPuzzleData.js — Puzzle trial definitions: Odd Structure variants and Offering Statue clues
// Used for grotto trial type "puzzle" — flavor text, required items, and validation

const ODDS_STRUCTURE = 'odd_structure';
const OFFERING_STATUE = 'offering_statue';

// ---------------------------------------------------------------------------
// Odd Structure (Build It) — Variants 1–5
// ---------------------------------------------------------------------------
const ODD_STRUCTURE_VARIANTS = [
  {
    flavor: 'As you enter the space beneath the stump, you encounter an odd structure, with runes of an age far gone. It doesn\'t seem fully built, however, but maybe help building it will open up something cool?',
    hint: 'Offer 50 Wood & 20 Ancient Screw.',
    // Exact match required
    required: [
      { itemName: 'Wood', minQuantity: 50 },
      { itemName: 'Ancient Screw', minQuantity: 20 },
    ],
  },
  {
    flavor: 'As you enter the space beneath the stump, you encounter an odd structure, with runes of an age far gone. It doesn\'t seem fully built, however, but maybe help building it will open up something cool?',
    hint: 'Offer 40 Flint & 20 Ancient Shaft.',
    required: [
      { itemName: 'Flint', minQuantity: 40 },
      { itemName: 'Ancient Shaft', minQuantity: 20 },
    ],
  },
  {
    flavor: 'A half-finished frame of wood and metal sits in the grotto. Ancient script winds around its beams. It looks like something was meant to be completed here—and perhaps still can be.',
    hint: 'Offer materials to complete it (wood, flint, ancient parts, etc.).',
    // Flexible: Wood >= 30 AND at least one other material type
    flexible: {
      required: [{ itemName: 'Wood', minQuantity: 30 }],
      anyOf: [
        { itemName: 'Flint', minQuantity: 20 },
        { itemName: 'Ancient Screw', minQuantity: 10 },
        { itemName: 'Ancient Shaft', minQuantity: 10 },
        { itemName: 'Ancient Gear', minQuantity: 5 },
        { itemName: 'Ancient Core', minQuantity: 3 },
      ],
    },
  },
  {
    flavor: 'You find a scaffold of roots and stone. Parts are missing—gaps where metal or wood should slot in. The runes suggest a ritual of assembly. Contribute what you carry.',
    hint: 'Offer materials as required. Wood (×40–50), Flint (×20–40), Ancient Screw or Ancient Shaft (×15–20), Eldin Ore or Iron bar.',
    flexible: {
      required: [
        { itemName: 'Wood', minQuantity: 40 },
        { itemName: 'Flint', minQuantity: 20 },
      ],
      anyOf: [
        { itemName: 'Ancient Screw', minQuantity: 15 },
        { itemName: 'Ancient Shaft', minQuantity: 15 },
        { itemName: 'Eldin Ore', minQuantity: 10 },
        { itemName: 'Iron bar', minQuantity: 3 },
      ],
    },
  },
  {
    flavor: 'A skeletal structure dominates the chamber. It hums with dormant energy. Scattered components lie nearby. Perhaps if you supply the rest, it will awaken—and reward you.',
    hint: 'Offer materials as required. Wood (×40–50), Ancient Screw (×15–20), Ancient Shaft (×15–20), Ancient Gear or Ancient Core, Flint (×20–40).',
    flexible: {
      required: [{ itemName: 'Wood', minQuantity: 40 }],
      atLeastTwoOf: [
        { itemName: 'Ancient Screw', minQuantity: 15 },
        { itemName: 'Ancient Shaft', minQuantity: 15 },
        { itemName: 'Ancient Gear', minQuantity: 10 },
        { itemName: 'Ancient Core', minQuantity: 5 },
        { itemName: 'Flint', minQuantity: 20 },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Offering Statue (Cryptic Clues) — Clues 1–14
// ---------------------------------------------------------------------------
const OFFERING_STATUE_ENTRY = 'As you enter the space beneath the stump, you find a statue with an offering pit. Before it lies a sheet of paper—a mess of writing, several colors of notes scrawled on top of each other and nearly incoherent. One clue stands out:';

const OFFERING_STATUE_CLUES = [
  { clue: '...the hood of a Golden God.', expectedItems: ['Tingle\'s Hood'] },
  { clue: '...they have eight, but **I** only need one...', expectedItems: ["Spider's Eye"] },
  { clue: 'Is this thing even real gold?', expectedItems: ['Golden Skull', 'Gold Dust'] },
  { clue: '...a flower that makes robots gain life.', expectedItems: ['Ancient Flower'] },
  { clue: 'If I keep having to steal tatters from those creepy undead creatures, so help me Hylia..', expectedItems: ['Gibdo Wing', 'Gibdo Guts'] },
  { clue: '...these petrified bones...', expectedItems: ['Stal Skull', 'Gibdo Bone'] },
  { clue: 'It took me 10 years to spin this but at last!', expectedItems: ['Silk', 'Spider Silk'] },
  { clue: '...something that holds the cold of Death Mountain\'s heart.', expectedItems: ['Sapphire'] },
  { clue: '...wings that never flew, from a creature long asleep.', expectedItems: ['Gibdo Wing'] },
  { clue: '...the tears of a Zora prince.', expectedItems: ['Zora Scale'] },
  { clue: '...sand that remembers the desert.', expectedItems: ['Sand Cicada', 'Sandy Ribbon'] },
  { clue: '...a blade that cut the darkness.', expectedItems: ['Guardian Sword', 'Guardian Sword+', 'Guardian Sword++'] },
  { clue: '...something the Koroks would weep to lose.', expectedItems: ['Korok Leaf'] },
  { clue: '...a gift from the sky, fallen and still warm.', expectedItems: ['Star Fragment'] },
];

// ---------------------------------------------------------------------------
// Roll & Helpers
// ---------------------------------------------------------------------------

function rollPuzzleConfig() {
  const isOfferingStatue = Math.random() < 0.5;
  if (isOfferingStatue) {
    const clueIndex = Math.floor(Math.random() * OFFERING_STATUE_CLUES.length);
    return {
      subType: OFFERING_STATUE,
      clueIndex,
    };
  }
  const variant = Math.floor(Math.random() * ODD_STRUCTURE_VARIANTS.length);
  return {
    subType: ODDS_STRUCTURE,
    variant,
  };
}

function getPuzzleFlavor(grotto) {
  const state = grotto?.puzzleState || {};
  const subType = state.puzzleSubType;
  if (!subType) return null;

  if (subType === ODDS_STRUCTURE) {
    const v = ODD_STRUCTURE_VARIANTS[state.puzzleVariant ?? 0];
    return v ? `${v.flavor}\n\n↳ ${v.hint} Only the required amount will be taken from party inventories (any character's inventory — not loadout; no transfers during expedition).` : null;
  }
  if (subType === OFFERING_STATUE) {
    const idx = state.puzzleClueIndex ?? 0;
    const c = OFFERING_STATUE_CLUES[idx];
    if (!c) return null;
    const itemList = c.expectedItems.length > 1
      ? `one of: ${c.expectedItems.join(', ')}`
      : c.expectedItems[0];
    return `${OFFERING_STATUE_ENTRY}\n\n*${c.clue}*\n\n↳ Offer **1** × ${itemList}. Only that amount will be taken from party inventories (any character — not loadout; no transfers during expedition). ➾ \`</explore grotto puzzle items:...>\``;
  }
  return null;
}

/**
 * Returns items to consume for a puzzle. Caps at required amount so we only take what's needed.
 * @param {Object} grotto
 * @param {Array} parsedItems - [{ itemName, quantity }] from the user's offering
 * @returns {Array} [{ itemName, quantity }] to actually remove from inventory
 */
function getPuzzleConsumeItems(grotto, parsedItems) {
  if (!grotto || !parsedItems?.length) return [];

  const state = grotto?.puzzleState || {};
  const subType = state.puzzleSubType;

  if (subType === OFFERING_STATUE) {
    const idx = state.puzzleClueIndex ?? 0;
    const c = OFFERING_STATUE_CLUES[idx];
    if (!c?.expectedItems) return [];
    const expectedLower = c.expectedItems.map((s) => s.toLowerCase());
    const match = parsedItems.find((p) => {
      const k = (p.itemName || '').trim().toLowerCase();
      return expectedLower.includes(k);
    });
    if (!match) return [];
    return [{ itemName: match.itemName.trim(), quantity: 1 }];
  }

  if (subType === ODDS_STRUCTURE) {
    const v = ODD_STRUCTURE_VARIANTS[state.puzzleVariant ?? 0];
    if (!v) return [];

    const requiredList = [];
    if (v.required && !v.flexible) {
      requiredList.push(...v.required.map((r) => ({ itemName: r.itemName, minQuantity: r.minQuantity || 0 })));
    } else if (v.flexible) {
      for (const r of v.flexible.required || []) {
        requiredList.push({ itemName: r.itemName, minQuantity: r.minQuantity || 0 });
      }
      if (v.flexible.anyOf) {
        const firstMatch = v.flexible.anyOf.find((a) => {
          const offered = parsedItems.find((p) => (p.itemName || '').trim().toLowerCase() === (a.itemName || '').toLowerCase());
          return offered && (offered.quantity || 1) >= (a.minQuantity || 0);
        });
        if (firstMatch) requiredList.push({ itemName: firstMatch.itemName, minQuantity: firstMatch.minQuantity || 0 });
      }
      if (v.flexible.atLeastTwoOf) {
        const matches = v.flexible.atLeastTwoOf.filter((a) => {
          const offered = parsedItems.find((p) => (p.itemName || '').trim().toLowerCase() === (a.itemName || '').toLowerCase());
          return offered && (offered.quantity || 1) >= (a.minQuantity || 0);
        });
        for (let i = 0; i < Math.min(2, matches.length); i++) {
          requiredList.push({ itemName: matches[i].itemName, minQuantity: matches[i].minQuantity || 0 });
        }
      }
    }

    const toConsume = [];
    const offeredMap = new Map();
    for (const p of parsedItems) {
      const k = (p.itemName || '').trim().toLowerCase();
      if (!k) continue;
      const prev = offeredMap.get(k) || 0;
      offeredMap.set(k, prev + (p.quantity || 1));
    }
    const nameByLower = new Map();
    for (const p of parsedItems) {
      const k = (p.itemName || '').trim().toLowerCase();
      if (!nameByLower.has(k)) nameByLower.set(k, (p.itemName || '').trim());
    }
    for (const r of requiredList) {
      const k = (r.itemName || '').toLowerCase();
      const need = r.minQuantity || 0;
      const have = offeredMap.get(k) || 0;
      const take = Math.min(need, have);
      if (take > 0) {
        toConsume.push({ itemName: nameByLower.get(k) || r.itemName, quantity: take });
      }
    }
    return toConsume;
  }

  return [];
}

function ensurePuzzleConfig(grotto) {
  if (!grotto || grotto.trialType !== 'puzzle') return grotto;
  const state = grotto.puzzleState || {};
  if (state.puzzleSubType) return grotto;
  const config = rollPuzzleConfig();
  grotto.puzzleState = grotto.puzzleState || {};
  grotto.puzzleState.puzzleSubType = config.subType;
  if (config.subType === ODDS_STRUCTURE) {
    grotto.puzzleState.puzzleVariant = config.variant;
  } else {
    grotto.puzzleState.puzzleClueIndex = config.clueIndex;
  }
  return grotto;
}

function checkPuzzleOffer(grotto, parsedItems) {
  if (!grotto || !parsedItems?.length) return { approved: false };

  const state = grotto.puzzleState || {};
  const subType = state.puzzleSubType;
  const itemMap = new Map();
  for (const p of parsedItems) {
    const k = (p.itemName || '').trim();
    if (!k) continue;
    const lower = k.toLowerCase();
    const prev = itemMap.get(lower) || { itemName: p.itemName, quantity: 0 };
    prev.quantity += p.quantity || 1;
    itemMap.set(lower, prev);
  }

  function getQty(name) {
    const n = (name || '').trim();
    if (!n) return 0;
    const e = itemMap.get(n.toLowerCase());
    return e ? e.quantity : 0;
  }

  if (subType === ODDS_STRUCTURE) {
    const v = ODD_STRUCTURE_VARIANTS[state.puzzleVariant ?? 0];
    if (!v) return { approved: false };

    if (v.required && !v.flexible) {
      for (const r of v.required) {
        if (getQty(r.itemName) < (r.minQuantity || 0)) return { approved: false };
      }
      return { approved: true };
    }

    if (v.flexible) {
      for (const r of v.flexible.required || []) {
        if (getQty(r.itemName) < (r.minQuantity || 0)) return { approved: false };
      }
      if (v.flexible.anyOf) {
        const hasAny = v.flexible.anyOf.some((a) => getQty(a.itemName) >= (a.minQuantity || 0));
        if (!hasAny) return { approved: false };
      }
      if (v.flexible.atLeastTwoOf) {
        const count = v.flexible.atLeastTwoOf.filter((a) => getQty(a.itemName) >= (a.minQuantity || 0)).length;
        if (count < 2) return { approved: false };
      }
      return { approved: true };
    }
  }

  if (subType === OFFERING_STATUE) {
    const idx = state.puzzleClueIndex ?? 0;
    const c = OFFERING_STATUE_CLUES[idx];
    if (!c?.expectedItems) return { approved: false };
    const expectedLower = c.expectedItems.map((s) => s.toLowerCase());
    const hasMatch = parsedItems.some((p) => {
      const k = (p.itemName || '').trim().toLowerCase();
      return expectedLower.includes(k) && (p.quantity || 1) >= 1;
    });
    return { approved: hasMatch };
  }

  return { approved: false };
}

// ---------------------------------------------------------------------------
// Puzzle Success — Flavor text when offering is correct
// ---------------------------------------------------------------------------
const PUZZLE_SUCCESS_FLAVORS = [
  "The roots accept your offering. A warm light suffuses the grotto as spirit orbs materialize before each party member.",
  "The statue hums with approval. The offering pit glows, and one by one, spirit orbs emerge—one for each of you.",
  "Something in the grotto stirs. The ancient structure recognizes your gift. Spirit orbs coalesce in the air and drift into your hands.",
  "The runes flare briefly, then settle. Your offering has satisfied whatever watches over this place. Spirit orbs appear for everyone.",
  "A soft chime echoes through the chamber. The grotto rewards your wisdom. Each party member receives a Spirit Orb.",
];

function getRandomPuzzleSuccessFlavor() {
  return PUZZLE_SUCCESS_FLAVORS[Math.floor(Math.random() * PUZZLE_SUCCESS_FLAVORS.length)];
}

module.exports = {
  ODDS_STRUCTURE,
  OFFERING_STATUE,
  ODD_STRUCTURE_VARIANTS,
  OFFERING_STATUE_CLUES,
  OFFERING_STATUE_ENTRY,
  rollPuzzleConfig,
  getPuzzleFlavor,
  ensurePuzzleConfig,
  checkPuzzleOffer,
  getPuzzleConsumeItems,
  getRandomPuzzleSuccessFlavor,
};
