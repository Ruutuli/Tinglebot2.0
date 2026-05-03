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
    hint: 'Two carved columns must ring **true in one go**. The **taller** column counts **50** splintery lengths shaved from trees—the skeleton of a build. The **shorter** column counts **20** bite-sized twists meant to thread through old plates. Same offering, two families; neither column can borrow from the other\'s bin.',
    wrongGuessHints: [
      'If you only hear one column clatter, the structure stays hollow—you always owe **both** the big beam tally **and** the small twist tally.',
      'Spark-dust, long hollow poles, and plain ingots belong to other stories; here it\'s only tree-cut beams plus tiny spiral fasteners.',
      'Picture two piles side by side: **50** on the splinter stack, **20** on the twist ring—both exact before the runes glow.',
    ],
    // Exact match required
    required: [
      { itemName: 'Wood', minQuantity: 50 },
      { itemName: 'Ancient Screw', minQuantity: 20 },
    ],
  },
  {
    flavor: 'As you enter the space beneath the stump, you encounter an odd structure, with runes of an age far gone. It doesn\'t seem fully built, however, but maybe help building it will open up something cool?',
    hint: 'The carving asks for shattering bright chips struck from stone (**40**) paired with straight metal splinters long as a forearm (**20**). Both sounds hit together—spark song plus rod-rattle—in one combined gift.',
    wrongGuessHints: [
      'Tree beams won\'t answer this script; neither will coils or gear-teeth. Only strike-flash shards **and** elongated ruin rods.',
      'The **larger** count is for brittle glittering fragments; the **smaller** count is for slender sticks—not the same pile counted twice.',
      'Offer the full **40** glitter-pile **and** full **20** rod-bundle together; stopping halfway on either side leaves the work undone.',
    ],
    required: [
      { itemName: 'Flint', minQuantity: 40 },
      { itemName: 'Ancient Shaft', minQuantity: 20 },
    ],
  },
  {
    flavor: 'A half-finished frame of wood and metal sits in the grotto. Ancient script winds around its beams. It looks like something was meant to be completed here—and perhaps still can be.',
    hint: 'Think of it as a **spine** and a **filler**. The spine is fixed: **30** rough-hewn pieces cut from living trees—the bones of the frame. The filler is **one** batch from the old ruins: strike-chips, brassy twists, long pins, toothed discs, or orange heart-lights. Each *kind* of filler names its own toll on the beam: **20** for the commonest heavy scrap, **10** for two different midweight families, **5** for a handful of interlocking bits, **3** for a tiny clutch of burning cores. Offer **spine + one filler** in the **same** submission—the count on your second pile must be the **exact** toll for whichever filler family you actually chose (not “close enough”).',
    wrongGuessHints: [
      'Half the inscription is about timber; half is about machine-scrap. Bringing **only** one category—or stopping at **29** on the tree half—leaves the frame hollow.',
      'The five numbers are **not** five separate offerings. They are **five possible prices** for **one** second pile. Match the **size** of what you carry to the **price line** it belongs to: the big scrap-line wants **20**, two different lines want **10**, the small gear-handful wants **5**, the rare core-cluster wants **3**.',
      'Picture two stacks in one command: left hand **30** splinter-beams; right hand **one** ancient junk-line at full price (**20**, **10**, **10**, **5**, or **3**). Wrong answers are usually “second pile only,” “beams only,” “almost **30** beams,” or “two different fillers at once.”',
    ],
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
    hint: 'This scaffold wants **three voices at once**: (**1**) **40** rough-hewn tree beams, (**2**) **20** bright chips struck from stone, (**3**) **one** extra branch—priced at **15**, **15**, **10**, or **3** depending whether you bring tiny spirals, long pins, molten glassy ore, or compact refined bars. The third price tags a *different* scrap family than the first two columns.',
    wrongGuessHints: [
      'Two pillars are fixed (**40** beams, **20** strike-chips); the third is a *pick-one* side-path—spirals, pins, hot ore chunks, or little bars—each with its own headcount.',
      'Duplicating the first two piles doesn\'t finish the ritual; the third slot waits for a **different** junk lineage entirely.',
      'Submit **all three** correct counts in a single line—short any pillar and the scaffold refuses to lock.',
    ],
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
    hint: 'Lay **40** foundation beams first—that spine never moves. After that, the echo must come from **two different scrap choirs**—tiny spirals, long pins, toothed rings, pulsing cores, or strike-chips—each choir sings at its own volume (**15**, **15**, **10**, **5**, or **20**). Same choir twice won\'t wake it; you need **two separate harmonies** above their thresholds in one offering.',
    wrongGuessHints: [
      '**40** beams alone only props the ribs—you still owe **two** different secondary junk families, each loud enough for its line.',
      'Piling more of the *same* family doesn\'t create a second voice; split your attention across two kinds of ancient spare.',
      'Checklist mental model: beam bed ✦ first scrap choir ✦ **different** second scrap choir—all minimums in one command.',
    ],
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
// Offering Statue (Cryptic Clues) — Clues 1–30 (rarity 5+, grotto/shrine themed)
// Each clue has hintTiers: [tier1, tier2, tier3]. Wrong guess reveals next tier (0→1→2).
// ---------------------------------------------------------------------------
const OFFERING_STATUE_ENTRY = 'As you enter the space beneath the stump, you find a statue with an offering pit. Before it lies a sheet of paper—a mess of writing, several colors of notes scrawled on top of each other and nearly incoherent. One clue stands out:';

const OFFERING_STATUE_CLUES = [
  {
    hintTiers: [
      '...what crowns the one who believes himself divine, who floats where the earth cannot hold him.',
      '...the head-covering of the chart-seller—green and gold, worn by one who calls himself a god.',
      '...the hood worn by the man of the balloon; the self-styled Golden God whose maps lead heroes astray.',
    ],
    expectedItems: ['Tingle\'s Hood'],
  },
  {
    hintTiers: [
      '...one of many that see in the dark, plucked from a keeper of corners and old ceilings.',
      '...they have eight, but the pit asks for one—the lens of a hunter that waits in shadow and silk.',
      '...a single eye from the many-eyed weaver; the creature of the dungeon, the spinner in the gloom.',
    ],
    expectedItems: ["Spider's Eye"],
  },
  {
    hintTiers: [
      '...what the sun leaves behind, or what the restless dead carry into the light.',
      '...is it even real? Something that gleams—from the earth refined, or from a skull that walks.',
      '...the dust of ore, or the crown of a skeleton that rose from the grave; the statue accepts either.',
    ],
    expectedItems: ['Golden Skull', 'Gold Dust'],
  },
  {
    hintTiers: [
      '...a bloom that wakes what has no breath—what the old ones planted where their eyes still watch.',
      '...a flower that gives life to the unmoving; it grows where the ancient ones buried their secrets.',
      '...the blossom the Sheikah seek for their metal servants—the bloom that quickens the machine.',
    ],
    expectedItems: ['Ancient Flower'],
  },
  {
    hintTiers: [
      '...what falls from the bandaged ones when they fall—tatter or innard, from the sand-buried dead.',
      '...if I must take again from those things that rise in the ruins, so help me Hylia...',
      '...wing or gut of the mummy that sleeps in the desert—the undead that walk in wrappings.',
    ],
    expectedItems: ['Gibdo Wing', 'Gibdo Guts'],
  },
  {
    hintTiers: [
      '...what remains when the walking dead are stilled—the frame that once moved in the dark.',
      '...these petrified bones... what held a horror together before the light found it.',
      '...the skull of one that rose from the grave, or the bone of one that slept in the sand.',
    ],
    expectedItems: ['Stal Skull', 'Gibdo Bone'],
  },
  {
    hintTiers: [
      '...what time and patience—or many legs—draw out into a thread the world prizes.',
      '...it took me ten years to spin this, but at last! The weaver\'s gift, fine as breath.',
      '...the thread of the loom or the thread of the den—cloth fit for the pit, soft and strong.',
    ],
    expectedItems: ['Silk', 'Spider Silk'],
  },
  {
    hintTiers: [
      '...cold that was born in fire—a stone that keeps winter in the belly of the mountain.',
      '...in the heart of Death Mountain the earth gives up something blue and cold as ice.',
      '...the blue gem that holds the volcano\'s chill—crystallized cold from the mountain of flame.',
    ],
    expectedItems: ['Sapphire'],
  },
  {
    hintTiers: [
      '...what never bore its owner aloft—a fold of skin or cloth from one long buried in sand.',
      '...wings that never flew; the bandaged dead have them, though they did not rise on the wind.',
      '...the wing of the one that sleeps in the desert ruins—tattered, dry, never meant for sky.',
    ],
    expectedItems: ['Gibdo Wing'],
  },
  {
    hintTiers: [
      '...what the water-people shed and keep—a piece of themselves, smooth as the deep.',
      '...the Domain\'s gift; a single plate that gleams like the lake, worn by those who swim the cold.',
      '...a scale from the Zora—shed in the waters of the Domain, treasure of the people of the lake.',
    ],
    expectedItems: ['Zora Scale'],
  },
  {
    hintTiers: [
      '...what the dunes keep—a whisper, a husk, a strip of wind and memory.',
      '...sand that remembers the desert; the shell of a singer in the heat, or a ribbon the waste left behind.',
      '...the cicada that slept in the sand, or the ribbon that tastes of the Gerudo wind—the desert\'s keepsake.',
    ],
    expectedItems: ['Sand Cicada', 'Sandy Ribbon'],
  },
  {
    hintTiers: [
      '...what cut the gloom when the world went dark—the edge the old watchers carried.',
      '...a blade of the sentinels that stood against the Calamity; Sheikah steel that bit the shadow.',
      '...the sword of the Guardian—forged in the age of the ancients, still sharp against the dark.',
    ],
    expectedItems: ['Guardian Sword', 'Guardian Sword+', 'Guardian Sword++'],
  },
  {
    hintTiers: [
      '...what the laughing ones hide and hold dear—larger than a breath, lighter than a secret.',
      '...the forest children would weep to lose it—a leaf that moves more than wind, that carries and hides.',
      '...the great leaf the little ones guard; lose it and they cry out in dismay—Yahaha!',
    ],
    expectedItems: ['Korok Leaf'],
  },
  {
    hintTiers: [
      '...what fell from above and has not yet gone cold—a piece of the night, still burning.',
      '...it dropped from the stars and keeps their warmth; a shard of the sky, hot to the touch.',
      '...the fragment that falls when a star does—still warm, still bright, blessing of the heavens.',
    ],
    expectedItems: ['Star Fragment'],
  },
  // 15–30: additional grotto/shrine themed (rarity 5+)
  {
    hintTiers: [
      '...the hardest tear the earth will ever shed—clear as truth, worth a king\'s ransom.',
      '...the gem the mountain keeps longest; clarity without color, strength without flaw.',
      '...the king of gems—cut from the deepest stone, the one that outshines all others.',
    ],
    expectedItems: ['Diamond'],
  },
  {
    hintTiers: [
      '...a stone that holds the heart of a forge—warm in the hand, red as ember.',
      '...what the volcano breathes into crystal; the fire of Death Mountain made solid.',
      '...the red gem that keeps a spark of flame—treasure of the mountain of fire.',
    ],
    expectedItems: ['Ruby'],
  },
  {
    hintTiers: [
      '...a stone that hums with the storm—golden, electric, restless.',
      '...the gem the thunder leaves behind; wear it and the storm remembers you.',
      '...the yellow stone of the tempest—crystallized lightning, gift of the storm.',
    ],
    expectedItems: ['Topaz'],
  },
  {
    hintTiers: [
      '...a stone the color of the wind and the forest—green as the wild.',
      '...the gem the sky and the leaves share; the color of courage and open roads.',
      '...the green jewel—worn by travelers and the free; the stone of the wind.',
    ],
    expectedItems: ['Emerald'],
  },
  {
    hintTiers: [
      '...the heart of the old watcher—what made the eye see and the limb move.',
      '...what the Sheikah machines held at their core; the greatest of the ancient sparks.',
      '...the giant core of the Guardian—the power that moved the sentinels of old.',
    ],
    expectedItems: ['Giant Ancient Core'],
  },
  {
    hintTiers: [
      '...what the ice dragon leaves when it brushes the mountain—a piece of the eternal cold.',
      '...the claw of the spirit of the spring; the one that coils around the frozen peak.',
      '...a claw from Naydra—the dragon of ice that guards the mountain of the goddess.',
    ],
    expectedItems: ["Naydra's Claw"],
  },
  {
    hintTiers: [
      '...what the storm dragon sheds—a scale that still crackles with sky-fire.',
      '...the serpent of the tempest leaves it behind; a scale that tastes of lightning.',
      '...a scale from Farosh—the dragon of thunder that rides the Faron storms.',
    ],
    expectedItems: ["Farosh's Scale"],
  },
  {
    hintTiers: [
      '...a light that never saw the sun—born in the deep, carried into the dark.',
      '...what glows where the roots go deepest; a tiny flame that does not burn.',
      '...the firefly of the depths—the light the lost carry into the underground.',
    ],
    expectedItems: ['Deep Firefly'],
  },
  {
    hintTiers: [
      '...what the one-eyed giant leaves when it falls—too large for any human jaw.',
      '...the sleepers in the woods and the hills give these up when they are stilled.',
      '...a tooth from the Hinox—the cyclops that dozes in the wild until disturbed.',
    ],
    expectedItems: ['Hinox Tooth'],
  },
  {
    hintTiers: [
      '...what the leviathan of the sand yields—a fin that crossed the endless dunes.',
      '...the whale that swims beneath the desert leaves a piece of itself when it falls.',
      '...the fin of the Molduga—the beast that hunts beneath the Gerudo sands.',
    ],
    expectedItems: ['Molduga Fin'],
  },
  {
    hintTiers: [
      '...what the blight leaves behind—a stone that remembers the malice.',
      '...the dark watchers of the castle dropped these; crystallized shadow, heavy in the hand.',
      '...the geode that forms where the blight touched the earth—the Calamity\'s leavings.',
    ],
    expectedItems: ['Blight Geodes'],
  },
  {
    hintTiers: [
      '...a piece of the age before the kingdom—something the ruins keep.',
      '...what the old tribes left in the stone; the desert and the dusk remember.',
      '...the relic of the dusk—treasure of the people who lived when the sun set on the sands.',
    ],
    expectedItems: ['Dusk Relic'],
  },
  {
    hintTiers: [
      '...a seed that carries its own sun—plant it in the dark and it answers.',
      '...what the depths grow; bury it and light blooms where no sky has been.',
      '...the seed that glows in the underground—the bright bloom of the deep.',
    ],
    expectedItems: ['Brightbloom Seed'],
  },
  {
    hintTiers: [
      '...a feather that remembers the goddess—too light for the wind to take.',
      '...what the sacred bird left at the spring; the sky\'s blessing in a single plume.',
      '...the plume of the goddess—worn by the chosen, fallen from the divine.',
    ],
    expectedItems: ['Goddess Plume'],
  },
  {
    hintTiers: [
      '...a skull that does not belong to the dead—clear as ice, precious as memory.',
      '...what the ancients prized; a head of crystal, not bone, that the living keep.',
      '...a head of crystal, not bone—the treasure the old ones hid in their sanctums.',
    ],
    expectedItems: ['Crystal Skull'],
  },
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

/**
 * Returns the current-tier clue text for Offering Statue only (for wrong-offering reply).
 * @param {Object} grotto
 * @returns {string|null} Current hint tier text, or null
 */
function getOfferingStatueClueText(grotto) {
  const state = grotto?.puzzleState || {};
  if (state.puzzleSubType !== OFFERING_STATUE) return null;
  const idx = state.puzzleClueIndex ?? 0;
  const c = OFFERING_STATUE_CLUES[idx];
  if (!c?.hintTiers?.length) return null;
  const attempts = state.offeringAttempts ?? 0;
  const tierIndex = Math.min(attempts, c.hintTiers.length - 1);
  return c.hintTiers[tierIndex];
}

/**
 * After a wrong offering, returns the next name-free script hint for Odd Structure (indexed by offeringAttempts).
 * @param {Object} grotto
 * @returns {string|null}
 */
function getOddStructureWrongGuessHint(grotto) {
  const state = grotto?.puzzleState || {};
  if (state.puzzleSubType !== ODDS_STRUCTURE) return null;
  const v = ODD_STRUCTURE_VARIANTS[state.puzzleVariant ?? 0];
  const tiers = v?.wrongGuessHints;
  if (!tiers?.length) return null;
  const attempts = state.offeringAttempts ?? 0;
  const idx = Math.min(attempts - 1, tiers.length - 1);
  if (idx < 0) return null;
  return tiers[idx];
}

function getPuzzleFlavor(grotto, cmdId) {
  const state = grotto?.puzzleState || {};
  const subType = state.puzzleSubType;
  if (!subType) return null;

  if (subType === ODDS_STRUCTURE) {
    const v = ODD_STRUCTURE_VARIANTS[state.puzzleVariant ?? 0];
    if (!v) return null;
    let text = `${v.flavor}\n\n↳ ${v.hint} You can **offer in multiple commands**—valid materials are set aside until the full recipe is met. Only accepted amounts are removed from inventories (any character — not loadout; no transfers during expedition).`;
    text += formatOddStructurePoolFlavor(grotto);
    const attempts = state.offeringAttempts ?? 0;
    const extra = v.wrongGuessHints || [];
    if (attempts > 0 && extra.length) {
      const shown = extra.slice(0, Math.min(attempts, extra.length));
      text += `\n\n*Further lines visible after wrong offerings:*\n${shown.map((h) => `• ${h}`).join("\n")}`;
    }
    return text;
  }
  if (subType === OFFERING_STATUE) {
    const idx = state.puzzleClueIndex ?? 0;
    const c = OFFERING_STATUE_CLUES[idx];
    if (!c?.hintTiers?.length) return null;
    const attempts = state.offeringAttempts ?? 0;
    const tierIndex = Math.min(attempts, c.hintTiers.length - 1);
    const clueText = c.hintTiers[tierIndex];
    const hintBlock = 'Offer one item that fits the clue. Only that amount will be taken from party inventories (any character — not loadout; no transfers during expedition).';
    const cmd = cmdId ? `</explore grotto puzzle:${cmdId}>` : '`/explore grotto puzzle` (items)';
    return `${OFFERING_STATUE_ENTRY}\n\n*${clueText}*\n\n\`\`\`${hintBlock}\`\`\`\n\n➾ ${cmd}`;
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
// Odd Structure — quantity near-miss (wrong amount but “close”; never prints DB item names)
// ---------------------------------------------------------------------------

function buildParsedQtyMap(parsedItems) {
  const itemMap = new Map();
  for (const p of parsedItems || []) {
    const lower = (p.itemName || '').trim().toLowerCase();
    if (!lower) continue;
    itemMap.set(lower, (itemMap.get(lower) || 0) + (p.quantity || 1));
  }
  return itemMap;
}

function mapQty(map, canonicalName) {
  return map.get((canonicalName || '').toLowerCase()) || 0;
}

function qtyAlmostGap(qty, need) {
  if (need <= 0 || qty <= 0 || qty >= need) return false;
  const gap = need - qty;
  return gap <= Math.max(3, Math.ceil(need * 0.12));
}

function qtyWarmGap(qty, need) {
  if (need <= 0 || qty <= 0 || qty >= need) return false;
  return qty >= Math.floor(need * 0.72);
}

function lineAlmost(qty, need, labelNoun) {
  if (qty >= need || qty <= 0) return null;
  const gap = need - qty;
  if (qtyAlmostGap(qty, need)) {
    return `**Close—but not enough on the ${labelNoun}!** You're **${gap}** piece${gap === 1 ? '' : 's'} shy of that carved line.`;
  }
  if (qtyWarmGap(qty, need)) {
    return `**Getting warm:** the ${labelNoun} is almost tall enough—the runes want **${need}**, and you're **${gap}** short.`;
  }
  return null;
}

function fillerLabelByBranch(a) {
  const key = (a.itemName || '').toLowerCase();
  const need = a.minQuantity || 0;
  if (need >= 20) return 'heaviest scrap filler (big strike-shard pile)';
  if (need === 10) {
    if (key.includes('screw')) return 'mid pile—tiny spiral-family scrap';
    if (key.includes('shaft')) return 'mid pile—long pin-family scrap';
    return 'midweight ruin scrap line';
  }
  if (need === 5) return 'small interlocking ring handful';
  if (need === 3) return 'tiny glowing-core cluster';
  return 'second pile';
}

function thirdBranchLabelFromOpt(opt) {
  const key = (opt.itemName || '').toLowerCase();
  const n = opt.minQuantity || 0;
  if (n === 15 && key.includes('screw')) return 'tiny spiral side-branch';
  if (n === 15 && key.includes('shaft')) return 'long pin side-branch';
  if (n === 10 && key.includes('eldin')) return 'molten ore chunk branch';
  if (n === 3 && (key.includes('iron') || key.includes('bar'))) return 'compact refined bar branch';
  return 'third branch';
}

function atLeastTwoLabelFromOpt(opt) {
  const key = (opt.itemName || '').toLowerCase();
  if (key.includes('screw')) return 'tiny spiral choir';
  if (key.includes('shaft')) return 'long pin choir';
  if (key.includes('gear')) return 'toothed ring choir';
  if (key.includes('core')) return 'glowing core choir';
  if (key.includes('flint')) return 'strike-chip choir';
  return 'secondary scrap choir';
}

/**
 * When an Odd Structure offering fails but quantities are near the target, returns a nudge (still no inventory names in text).
 * @param {Object} grotto
 * @param {Array} parsedItems
 * @returns {string|null}
 */
function getOddStructureNearMissHint(grotto, parsedItems) {
  const state = grotto?.puzzleState || {};
  if (state.puzzleSubType !== ODDS_STRUCTURE || !parsedItems?.length) return null;
  const variantIdx = state.puzzleVariant ?? 0;
  const v = ODD_STRUCTURE_VARIANTS[variantIdx];
  if (!v) return null;
  const map = buildParsedQtyMap(parsedItems);

  if (v.required && !v.flexible) {
    if (variantIdx === 0) {
      const w = mapQty(map, 'Wood');
      const s = mapQty(map, 'Ancient Screw');
      return lineAlmost(w, 50, 'big beam column') || lineAlmost(s, 20, 'tiny twist-fastener ring');
    }
    if (variantIdx === 1) {
      const f = mapQty(map, 'Flint');
      const sh = mapQty(map, 'Ancient Shaft');
      return lineAlmost(f, 40, 'strike-flash glitter pile') || lineAlmost(sh, 20, 'long splinter bundle');
    }
  }

  if (!v.flexible) return null;

  if (variantIdx === 2) {
    const w = mapQty(map, 'Wood');
    const spineHint = lineAlmost(w, 30, 'tree-beam spine');
    if (spineHint) return spineHint;
    if (w < 30) return null;
    let best = null;
    for (const a of v.flexible.anyOf || []) {
      const q = mapQty(map, a.itemName);
      if (q <= 0 || q >= a.minQuantity) continue;
      const msg = lineAlmost(q, a.minQuantity, fillerLabelByBranch(a));
      if (!msg) continue;
      const gap = a.minQuantity - q;
      if (!best || gap < best.gap) best = { msg, gap };
    }
    return best ? best.msg : null;
  }

  if (variantIdx === 3) {
    const w = mapQty(map, 'Wood');
    const f = mapQty(map, 'Flint');
    const hW = lineAlmost(w, 40, 'first beam pillar');
    if (hW) return hW;
    const hF = lineAlmost(f, 20, 'strike-chip pillar');
    if (hF) return hF;
    if (w < 40 || f < 20) return null;
    let best = null;
    for (const opt of v.flexible.anyOf || []) {
      const q = mapQty(map, opt.itemName);
      if (q <= 0 || q >= opt.minQuantity) continue;
      const msg = lineAlmost(q, opt.minQuantity, thirdBranchLabelFromOpt(opt));
      if (!msg) continue;
      const gap = opt.minQuantity - q;
      if (!best || gap < best.gap) best = { msg, gap };
    }
    return best ? best.msg : null;
  }

  if (variantIdx === 4) {
    const w = mapQty(map, 'Wood');
    const hW = lineAlmost(w, 40, 'foundation beam stack');
    if (hW) return hW;
    let best = null;
    for (const opt of v.flexible.atLeastTwoOf || []) {
      const q = mapQty(map, opt.itemName);
      if (q <= 0 || q >= opt.minQuantity) continue;
      const msg = lineAlmost(q, opt.minQuantity, atLeastTwoLabelFromOpt(opt));
      if (!msg) continue;
      const gap = opt.minQuantity - q;
      if (!best || gap < best.gap) best = { msg, gap };
    }
    return best ? best.msg : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Odd Structure — progressive offerings (partial deposits, one command at a time)
// ---------------------------------------------------------------------------

function getAllowedItemKeysForVariant(v) {
  const keys = new Set();
  if (v.required && !v.flexible) {
    for (const r of v.required) keys.add(r.itemName.toLowerCase());
    return keys;
  }
  if (v.flexible) {
    for (const r of v.flexible.required || []) keys.add(r.itemName.toLowerCase());
    for (const a of v.flexible.anyOf || []) keys.add(a.itemName.toLowerCase());
    for (const a of v.flexible.atLeastTwoOf || []) keys.add(a.itemName.toLowerCase());
  }
  return keys;
}

function applyRequiredAnyOfProgress(v, acc0, fillerBranch0, proposed) {
  const acc = { ...acc0 };
  let fillerBranch = fillerBranch0 || null;
  const consumeList = [];
  const req = v.flexible.required || [];
  const anyOpts = v.flexible.anyOf || [];
  const anyKeys = new Set(anyOpts.map((a) => a.itemName.toLowerCase()));

  const proposedAnyKeys = [...proposed.keys()].filter((k) => anyKeys.has(k) && (proposed.get(k) || 0) > 0);
  if (proposedAnyKeys.length > 1) {
    return { outcome: 'invalid', reason: 'multi_filler' };
  }
  if (proposedAnyKeys.length === 1) {
    const pk = proposedAnyKeys[0];
    if (fillerBranch && fillerBranch !== pk) {
      return { outcome: 'invalid', reason: 'filler_branch_locked' };
    }
  }

  for (const k of proposed.keys()) {
    const inReq = req.some((r) => r.itemName.toLowerCase() === k);
    const inAny = anyKeys.has(k);
    if (!inReq && !inAny) return { outcome: 'invalid', reason: 'extra_item' };
    if (inAny && fillerBranch && k !== fillerBranch && (proposed.get(k) || 0) > 0) {
      return { outcome: 'invalid', reason: 'wrong_filler' };
    }
  }

  if (proposedAnyKeys.length === 1) {
    fillerBranch = proposedAnyKeys[0];
  }

  for (const r of req) {
    const key = r.itemName.toLowerCase();
    const need = r.minQuantity || 0;
    const room = Math.max(0, need - (acc[key] || 0));
    const offer = proposed.get(key) || 0;
    const take = Math.min(room, offer);
    if (take > 0) {
      acc[key] = (acc[key] || 0) + take;
      consumeList.push({ itemName: r.itemName, quantity: take });
    }
  }

  if (proposedAnyKeys.length === 1) {
    const key = proposedAnyKeys[0];
    const opt = anyOpts.find((a) => a.itemName.toLowerCase() === key);
    const need = opt.minQuantity || 0;
    const room = Math.max(0, need - (acc[key] || 0));
    const offer = proposed.get(key) || 0;
    const take = Math.min(room, offer);
    if (take > 0) {
      acc[key] = (acc[key] || 0) + take;
      consumeList.push({ itemName: opt.itemName, quantity: take });
    }
  }

  const reqOk = req.every((r) => (acc[r.itemName.toLowerCase()] || 0) >= (r.minQuantity || 0));
  const anyOk = anyOpts.some((a) => (acc[a.itemName.toLowerCase()] || 0) >= (a.minQuantity || 0));
  const complete = reqOk && anyOk;

  if (!complete && consumeList.length === 0) {
    return { outcome: 'redundant', newAcc: acc, fillerBranch, consumeList: [], complete: false };
  }
  if (!complete) return { outcome: 'partial', newAcc: acc, fillerBranch, consumeList, complete: false };
  return { outcome: 'complete', newAcc: acc, fillerBranch, consumeList, complete: true };
}

function applyAtLeastTwoOfProgress(v, acc0, proposed) {
  const acc = { ...acc0 };
  const consumeList = [];
  const req = v.flexible.required || [];
  const lines = v.flexible.atLeastTwoOf || [];

  for (const r of req) {
    const key = r.itemName.toLowerCase();
    const need = r.minQuantity || 0;
    const room = Math.max(0, need - (acc[key] || 0));
    const offer = proposed.get(key) || 0;
    const take = Math.min(room, offer);
    if (take > 0) {
      acc[key] = (acc[key] || 0) + take;
      consumeList.push({ itemName: r.itemName, quantity: take });
    }
  }

  for (const opt of lines) {
    const key = opt.itemName.toLowerCase();
    const need = opt.minQuantity || 0;
    const room = Math.max(0, need - (acc[key] || 0));
    const offer = proposed.get(key) || 0;
    const take = Math.min(room, offer);
    if (take > 0) {
      acc[key] = (acc[key] || 0) + take;
      consumeList.push({ itemName: opt.itemName, quantity: take });
    }
  }

  const reqOk = req.every((r) => (acc[r.itemName.toLowerCase()] || 0) >= (r.minQuantity || 0));
  const metLines = lines.filter((opt) => (acc[opt.itemName.toLowerCase()] || 0) >= (opt.minQuantity || 0)).length;
  const complete = reqOk && metLines >= 2;

  if (!complete && consumeList.length === 0) {
    return { outcome: 'redundant', newAcc: acc, fillerBranch: null, consumeList: [], complete: false };
  }
  if (!complete) return { outcome: 'partial', newAcc: acc, fillerBranch: null, consumeList, complete: false };
  return { outcome: 'complete', newAcc: acc, fillerBranch: null, consumeList, complete: true };
}

/**
 * Multi-step Odd Structure offerings: merge this submission with offeringPool.
 * @returns {{ outcome: 'complete'|'partial'|'invalid'|'redundant', newAcc?: object, fillerBranch?: string|null, consumeList?: array, complete?: boolean, reason?: string }}
 */
function tryApplyOddStructureProgress(grotto, parsedItems) {
  const state = grotto?.puzzleState || {};
  const v = ODD_STRUCTURE_VARIANTS[state.puzzleVariant ?? 0];
  if (!v || !parsedItems?.length) return { outcome: 'invalid', reason: 'bad_input' };

  const proposed = buildParsedQtyMap(parsedItems);
  const acc0 =
    state.offeringPool && typeof state.offeringPool === 'object' && !Array.isArray(state.offeringPool)
      ? { ...state.offeringPool }
      : {};
  const fillerBranch0 = state.offeringFillerBranch || null;
  const allowed = getAllowedItemKeysForVariant(v);

  for (const k of proposed.keys()) {
    if (!allowed.has(k)) return { outcome: 'invalid', reason: 'bad_item' };
  }

  if (v.required && !v.flexible) {
    const acc = { ...acc0 };
    const consumeList = [];
    for (const r of v.required) {
      const key = r.itemName.toLowerCase();
      const need = r.minQuantity || 0;
      const room = Math.max(0, need - (acc[key] || 0));
      const offer = proposed.get(key) || 0;
      const take = Math.min(room, offer);
      if (take > 0) {
        acc[key] = (acc[key] || 0) + take;
        consumeList.push({ itemName: r.itemName, quantity: take });
      }
    }
    for (const k of proposed.keys()) {
      if (!v.required.some((r) => r.itemName.toLowerCase() === k)) {
        return { outcome: 'invalid', reason: 'extra_item', newAcc: acc0, fillerBranch: null, consumeList: [] };
      }
    }
    const complete = v.required.every((r) => (acc[r.itemName.toLowerCase()] || 0) >= (r.minQuantity || 0));
    if (!complete && consumeList.length === 0) {
      return { outcome: 'redundant', newAcc: acc, fillerBranch: null, consumeList: [], complete: false };
    }
    if (!complete) return { outcome: 'partial', newAcc: acc, fillerBranch: null, consumeList, complete: false };
    return { outcome: 'complete', newAcc: acc, fillerBranch: null, consumeList, complete: true };
  }

  if (v.flexible?.atLeastTwoOf) {
    return applyAtLeastTwoOfProgress(v, acc0, proposed);
  }

  if (v.flexible?.required && v.flexible?.anyOf) {
    return applyRequiredAnyOfProgress(v, acc0, fillerBranch0, proposed);
  }

  return { outcome: 'invalid', reason: 'unknown_layout' };
}

function formatOddStructurePoolFlavor(grotto) {
  const state = grotto?.puzzleState || {};
  if (state.puzzleSubType !== ODDS_STRUCTURE) return '';
  const pool = state.offeringPool;
  if (!pool || typeof pool !== 'object') return '';
  const entries = Object.entries(pool).filter(([, q]) => Number(q) > 0);
  if (!entries.length) return '';
  const bits = entries.map(([k, q]) => {
    const pretty = String(k)
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return `**${q}×** ${pretty}`;
  });
  return `\n\n📦 **Already set aside toward this puzzle:** ${bits.join(' · ')}`;
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
  getOfferingStatueClueText,
  getOddStructureWrongGuessHint,
  getOddStructureNearMissHint,
  tryApplyOddStructureProgress,
  formatOddStructurePoolFlavor,
  ensurePuzzleConfig,
  checkPuzzleOffer,
  getPuzzleConsumeItems,
  getRandomPuzzleSuccessFlavor,
};
