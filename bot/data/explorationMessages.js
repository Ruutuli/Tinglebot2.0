/**
 * Exploration camp flavor messages.
 * Camp: peaceful rest flavor text; actual recovery is applied by /explore logic.
 */

/**
 * Overnight camp flavor by terrain. Keys match Map CSV terrain categories (same as SAFE_SPACE_FLAVOR_BY_TERRAIN).
 */
const CAMP_FLAVOR_BY_TERRAIN = {
  "grasslands & plains": [
    "A wide sky of stars stretches from horizon to horizon; the prairie wind thins to a lullaby.",
    "Crickets in the tall grass trade verses until the party drifts off on dry, level ground.",
    "Dew beads on boot leather by dawn; the plain has given them nothing but open air and rest.",
    "They bank the fire low—out here, light carries—yet the ring of embers feels like a small kingdom.",
    "A distant roll of thunder never arrives; only cool air off the steppe and easy breathing.",
    "Wild things call across the dark, far-off and harmless; sleep comes anyway on beaten herd trails.",
    "Sunrise paints the grass gold; the party wakes to the smell of dust, sun, and yesterday's miles.",
    "Cloud shadow once swept the camp; by morning the land is bright and oddly gentle.",
    "Someone counts constellations until their voice trails off; the plains do not hurry anyone.",
    "The night is big enough to swallow worry; they let it, and wake ready to walk again.",
  ],
  "forest & woodland": [
    "The canopy holds back the rain; only a patient drip-drip finds them, and soon even that fades.",
    "Moss and root cradle their packs; the woods smell of wet bark and honest fatigue.",
    "Firelight catches in spider silk between branches—fragile lanterns for one night only.",
    "An owl asks its question once; no one answers. The forest accepts the silence.",
    "Fallen logs make a rough circle; sap steams faintly where the heat kisses the wood.",
    "By dawn, mist threads the trunks; birdsong stacks in layers until the party blinks awake.",
    "Something heavy moves through brush, then away; they tighten watch, then sleep in shifts, then sleep.",
    "Needles cushion the ground better than they expected; pine and earth ground their dreams.",
    "A brook mutters beyond the ferns, steady enough to measure the hours until light.",
    "The clearing felt hidden when they chose it; by morning it still feels like a secret kept for them.",
  ],
  "mountain & highland": [
    "Wind hammers the pass, but this alcove of stone turns it to a dull roar—lullaby of the heights.",
    "They sleep in shifts against the cold; shared cloaks and shared breath beat the thin air.",
    "Stars look close enough to snag; the mountain lets them borrow its ceiling for one night.",
    "Loose stone once skitters downslope; nothing follows. They breathe, and the ridge holds.",
    "Morning light cuts the mist like a blade; below the clouds, the world is only rumor.",
    "A cairn watches their camp—older than their route. They leave it untouched and wake humbled.",
    "Bedrock leaches cold through bedrolls; still, backs stop aching, if only for a few hours.",
    "The echo of their own settling fades; the peak seems to exhale with them.",
    "Ice in a crevice glitters by firelight; they do not touch it, only borrow its shine.",
    "Dawn comes sharp and honest; thin grass in the crack of the world steadies their first steps.",
  ],
  "snow & ice biomes": [
    "They melt snow for tea and huddle close; every breath steams and every hour is earned.",
    "The drift wall cuts the gale; inside their little hollow, sound becomes wool and darkness.",
    "Moonlight on ice throws a blue glow into the tent cloth—cold light, but strangely soft.",
    "Frost feathers their hoods by morning; stiffness is the tax, clarity is the gift.",
    "Something cracks on the frozen pond far off; here, the ice stays silent and holds.",
    "Snow eats their footfalls and their whispers; the night feels padded, almost kind.",
    "They stamp feeling back into their feet at sunrise; color returns to the world in slow strips.",
    "Stunted pines wear snow like cloaks; beneath them the drifts are shallow, the sleep deeper.",
    "Shared warmth is policy, not romance; no one jokes about it. Everyone wakes.",
    "The aurora—or only cloud—ripples overhead; either way, the party watches until eyelids win.",
  ],
  "desert & arid": [
    "Day's heat leaks from the sand; by midnight the ground is honest stone again, cool against backs.",
    "They sleep in the lee of a dune while sand hisses above—private, shifting roof.",
    "Stars burn without competition; no trees, no clouds, only the bowl of the sky and quiet talk.",
    "A lizard shares the overhang; neither side picks a fight. Truce until dawn.",
    "The wash runs dry at their feet; pebbles remember sun. Sleep is a shallow well, but enough.",
    "Dawn glare hits early; they pack before the desert remembers it is supposed to hurt.",
    "Wind has carved the hoodoos into seats; they fit the puzzle, another layer of stone.",
    "Waterskins circle once, twice; rest without water would be foolish—they found both.",
    "Coyote song stitches the dark; far enough to admire, close enough to remind them they're alive.",
    "Mirage memory fades with the stars; the sand under them is only sand, and solid enough.",
  ],
  "water & wetlands": [
    "A dry hummock above the reeds becomes an island; frogs argue the party to sleep.",
    "Mist blurs the marsh at dawn; shapes ten steps out could be anything—they're gone by breakfast.",
    "Mud cracks under a thin crust; they chose footing carefully, then stopped where it held.",
    "Dragonflies vanish with the light; in their place, ripples and the smell of wet life.",
    "Roots make a crooked bed; damp climbs the hems, but mosquitoes miss their timing.",
    "Something splashes away, uninterested; the party exhales and lets the bog be background.",
    "Fire struggles in the wet air; they feed it patiently until steam replaces smoke.",
    "Cattails rustle a secret; sleep comes in pieces, then all at once.",
    "Morning fog lifts in rags; the water remembers the sky, and so do they.",
    "Half-sunken logs serve as benches, then pillows; balance is a skill they didn't know they had.",
  ],
  volcanic: [
    "Warm stone radiates through bedrolls; the ground remembers fire longer than the sun does.",
    "Ash drifts like grey snow; the overhang keeps their faces clean enough to rest.",
    "Sulphur stings, then dulls; shallow breaths become habit, then sleep.",
    "Obsidian glints around the fire—beautiful, sharp. They pick their bed sites with care.",
    "The earth thrums once, distant; they wait. Silence returns, and with it, heavy eyelids.",
    "Steam threads a crack; they don't drink, but the heat on their palms feels like promise.",
    "Cinders crunch like gravel; every small sound is loud until tiredness normalizes the noise.",
    "Cooled basalt cups their camp; vents mutter elsewhere, a reminder and a lullaby.",
    "Glassy bubbles in the rock tell old stories; the party adds one quiet night to the pile.",
    "Dawn comes thin and warm; ash-light softens the world into something almost gentle.",
  ],
  "coastal & sea edge": [
    "The tide turns while they sleep; foam whispers up the sand, then retreats like a polite guest.",
    "Driftwood fences the fire from the breeze; salt and smoke braid in the air.",
    "Gulls argue at first light, indifferent; the party is just more debris on a generous shore.",
    "A cove cups them out of the wind; waves tap the rocks—a metronome for dreams.",
    "Sand still holds yesterday's sun at their backs; the sea cools their faces toward morning.",
    "Tide pools mirror broken clouds; no one disturbs the anemones—this is rest, not foraging.",
    "Seaweed dries to leathery ribbons; stacked right, it breaks the spray better than expected.",
    "The horizon is a clean cut between blues; for now they're only tired, not lost.",
    "Foam hisses, withdraws, returns; the rhythm steadies nerves better than any speech.",
    "Stars double in the wet sand; walking to the tent feels like stepping through sky.",
  ],
};

/** When quadrant has no terrain tags or none match known categories. */
const CAMP_FLAVOR_DEFAULT = [
  "A refreshing breeze soothes the party as they rest under the stars.",
  "The night passes peacefully with a chorus of crickets serenading the camp.",
  "The campfire crackles pleasantly, casting a warm glow that comforts everyone.",
  "An unexpected downpour forces the party to huddle together, sharing stories until dawn.",
  "The party finds a perfect sleeping spot, nestled between sheltering stone and luck.",
  "A dreamless sleep invigorates the party, preparing them for the day ahead.",
  "Waking up to the sight of a beautiful sunrise lifts everyone's spirits.",
  "A nocturnal visitor sniffs the packs, then melts into the dark—curiosity, not hunger.",
  "The party trades quiet stories until voices thin; bonds tighten in the easy dark.",
  "Whatever the land around them, this pause holds—until dawn asks them to move again.",
];

/**
 * Brief rest flavor when a safe space is found during exploration (roll outcome).
 * Keys match Map CSV terrain categories (same as EXPLORATION_TERRAIN_FLAVOR in embeds.js).
 */
const SAFE_SPACE_FLAVOR_BY_TERRAIN = {
  "grasslands & plains": [
    "A patch of soft grass gives the party a place to sit and breathe.",
    "The ground here is dry and level—a welcome break from the trek.",
    "A wide hollow in the tall grass hides them from the wind for a moment.",
    "A rare stand of low trees throws just enough shade to rest beneath.",
    "Wildflowers nod at knee height; the party sinks down among them, out of sight.",
    "An old stone wall, half swallowed by prairie, breaks the gale just enough.",
    "The horizon is endless, but this dip in the land feels tucked away and still.",
    "Crickets and grasshoppers go quiet as they settle—then resume, and so does everyone's breathing.",
    "A herd trail widens into a bare circle; beaten earth makes a fine place to regroup.",
    "Cloud shadow sweeps the plain; in that cool moment they rest before the sun returns.",
  ],
  "forest & woodland": [
    "Dappled sunlight filters through the canopy as the party catches their breath.",
    "Soft moss between roots makes a surprisingly comfortable pause.",
    "The group finds a cozy nook among the trunks and takes a short rest.",
    "A small clearing, hidden from view, gives everyone a chance to recuperate.",
    "Fallen logs form a rough bench; sap and bark smell sharp and alive.",
    "A brook mutters nearby, hidden by fern—just enough sound to mask their voices.",
    "Spiderwebs gleam between branches; no one disturbs them. The woods grant a fragile peace.",
    "An old lightning scar in a trunk cups dry needles—dry seating, if you're careful.",
    "The undergrowth thins around a ring of mushrooms; they give it a wide berth and rest beyond.",
    "Birdsong returns in layers as they go still, as if the forest approves of the pause.",
  ],
  "mountain & highland": [
    "A sheltered alcove in the rock offers a brief respite from the wind.",
    "The party spots a shallow cave and rests safely inside.",
    "A ring of stones breaks the gusts; they huddle in its lee.",
    "A flat shelf on the face of the cliff—just room enough to sit and steady their nerves.",
    "Loose scree gives way to solid bedrock; they claim the stable patch and don't move.",
    "Mist clings to the pass; in the grey quiet, even breathing feels like a strategy.",
    "A cairn marks someone else's pause long ago—they add nothing, only borrow the spot.",
    "The echo of their own footsteps fades; the mountain holds its breath with them.",
    "Thin grass in a crevice proves life finds a way; so does the party, for a few minutes.",
    "Ropes and packs come off; shoulders unclench against cold stone that has waited ages.",
  ],
  "snow & ice biomes": [
    "They tuck behind a snowdrift; out of the wind, breathing comes easier.",
    "A shallow ice hollow glows faintly—cold, but calm enough to recuperate.",
    "Packed snow and a rocky overhang make a cramped but sheltered nook.",
    "They stamp warmth back into stiff limbs in a sunlit hollow between drifts.",
    "Frost glitters on their lashes; shared body heat and stillness do the rest.",
    "A frozen pond's edge cracks underfoot elsewhere—here the ice looks thick and undisturbed.",
    "Snow muffles every sound; the silence itself feels like cover.",
    "They brush powder from a boulder and sit; cold seeps through cloth, but the wind does not.",
    "A line of stunted pines wears snow like cloaks; beneath them, the drifts are shallower.",
    "Their breath steams and freezes on scarves; small price for a moment off the exposed ridge.",
  ],
  "desert & arid": [
    "The ground here is hard-packed and flat—a small mercy after the shifting dunes.",
    "Sun-bleached rocks throw a thin stripe of shade; the party rests inside it.",
    "They find relief in the lee of a tall dune, sand still whispering overhead.",
    "A scrap of scrub and packed earth offers the only cover for miles.",
    "A dry wash's bank cuts the glare; pebbles shift under them, but the angle is right.",
    "Night-cold still lingers in the stone at dawn; they press palms to it and sigh.",
    "A lizard watches from a crevice, unblinking—they mirror it and stay motionless.",
    "Mirage-shimmer dances on the horizon; here, the air above the sand is merely hot, not cruel.",
    "Wind-carved hoodoos cast jagged shade; they fit into the puzzle like another stone.",
    "Their waterskins pass hand to hand; rest without water would be foolish—luckily, they found both.",
  ],
  "water & wetlands": [
    "A dry hummock above the reeds lets everyone rest with their boots mostly dry.",
    "A quiet braid of water nearby; they drink and catch their breath on firm mud.",
    "They claim a tussocky rise in the marsh—damp underfoot, but defensible.",
    "Twisted roots and raised ground keep them clear of the worst of the mire.",
    "Dragonflies skim the surface; ripples lap at roots, a lullaby instead of a threat.",
    "Mist hangs over the bog; shapes blur ten steps out—good enough to hide in.",
    "A half-sunken log bridges two clumps of sedge; they perch like herons.",
    "The smell of rot and life mixes; they ignore the first and trust the second.",
    "Cattails rustle; something splashes away—whatever it was, it isn't interested in them.",
    "Mud cracks under a thin crust of dry algae; they test each step, then stop where it holds.",
  ],
  volcanic: [
    "Sheltered behind a cooled ridge of lava, the air is warm but still.",
    "They rest on cracked basalt, tucked out of sight of the worst vents.",
    "Ash drifts down, but a volcanic overhang keeps their faces clear for a while.",
    "Heat radiates from the stone, yet this hollow feels oddly safe to pause in.",
    "Sulphur stings the nose; they breathe shallow and count heartbeats until it fades.",
    "Obsidian glints underfoot—beautiful, sharp. They choose their seats with care.",
    "A thin trickle of warm water threads the rock; they don't drink, but the steam comforts.",
    "The ground thrums once, distant; they wait. Silence returns. They stay a little longer.",
    "Cinders crunch like gravel; every sound feels loud until they accept the noise as normal.",
    "Glassy bubbles in the stone tell of old fire; the party's fire is only the need to keep going.",
  ],
  "coastal & sea edge": [
    "A tucked cove cuts the wind; waves lap softly while the party rests.",
    "Driftwood and a dry shelf above the tide line make a brief haven.",
    "Salt spray still finds them, but the leeward side of the rocks is calm enough.",
    "They catch their breath where dunes meet shore, sand still warm at their backs.",
    "Gulls wheel overhead, indifferent; the party is just another bit of clutter on the beach.",
    "Tide pools mirror cloud fragments; no one pokes the anemones—this is rest, not foraging.",
    "Seaweed dries to leathery ribbons on stone; it makes a surprisingly tolerable windbreak.",
    "Foam hisses up the sand and retreats; the rhythm steadies nerves better than words.",
    "A fishing net, abandoned and frayed, flaps once—then stills. They leave it be.",
    "The horizon line is clean knife-cut between blue and blue; for now, they're only tired, not lost.",
  ],
};

/** When quadrant has no terrain tags or none match known categories. */
const SAFE_SPACE_FLAVOR_DEFAULT = [
  "The party catches their breath in a quiet, defensible spot.",
  "A sheltered nook gives everyone a moment of calm.",
  "The group finds a brief respite and steadies themselves.",
  "Whatever the land around them, this spot feels safe enough to rest.",
  "They lean packs against stone or earth and let silence do the healing.",
  "Someone shares dried meat; someone shares water; the pause becomes almost companionable.",
  "No tracks lead here—whether luck or care, they'll take it.",
  "A thin strip of sky is all they see between obstacles; it's enough to remember they're still outside.",
  "Joints pop. Shoulders drop. No one speaks until breathing slows on its own.",
  "The world keeps moving beyond this hollow; inside it, for a few minutes, nothing is required of them.",
];

function normalizeTerrainForMatch(t) {
  return String(t)
    .replace(/\p{Emoji}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Pick one canonical terrain flavor key from quadrant meta (mirrors embeds.js getExplorationFlavorText).
 * @param {object} [quadrantMeta]
 * @returns {string|null}
 */
function pickSafeSpaceTerrainKey(quadrantMeta) {
  const terrain = Array.isArray(quadrantMeta?.terrain) ? quadrantMeta.terrain : [];
  const matchedTerrainKeys = [];
  for (const t of terrain) {
    const key = normalizeTerrainForMatch(t);
    if (!key) continue;
    let flavorKey = null;
    if (key.includes("mountain") || key.includes("highland")) flavorKey = "mountain & highland";
    else if (key.includes("snow") || key.includes("ice")) flavorKey = "snow & ice biomes";
    else if (key.includes("water") || key.includes("wetland")) flavorKey = "water & wetlands";
    else if (key.includes("desert") || key.includes("arid")) flavorKey = "desert & arid";
    else if (key.includes("forest") || key.includes("woodland")) flavorKey = "forest & woodland";
    else if (key.includes("grassland") || key.includes("plains")) flavorKey = "grasslands & plains";
    else if (key.includes("coastal") || key.includes("sea")) flavorKey = "coastal & sea edge";
    else if (key.includes("volcanic")) flavorKey = "volcanic";
    if (flavorKey && !matchedTerrainKeys.includes(flavorKey)) matchedTerrainKeys.push(flavorKey);
  }
  if (matchedTerrainKeys.length === 0) return null;
  return matchedTerrainKeys[Math.floor(Math.random() * matchedTerrainKeys.length)];
}

/**
 * Pick a random camp flavor message. For /explore camp (overnight camp).
 * @param {object} [quadrantMeta] — from getQuadrantMeta (uses .terrain[])
 * @returns {string}
 */
function getRandomCampFlavor(quadrantMeta) {
  const categoryKey = pickSafeSpaceTerrainKey(quadrantMeta);
  const pool =
    categoryKey && Array.isArray(CAMP_FLAVOR_BY_TERRAIN[categoryKey]) && CAMP_FLAVOR_BY_TERRAIN[categoryKey].length > 0
      ? CAMP_FLAVOR_BY_TERRAIN[categoryKey]
      : CAMP_FLAVOR_DEFAULT;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Pick a random safe space flavor message. For finding a safe space during exploration roll.
 * @param {object} [quadrantMeta] — from getQuadrantMeta (uses .terrain[])
 * @returns {string}
 */
function getRandomSafeSpaceFlavor(quadrantMeta) {
  const categoryKey = pickSafeSpaceTerrainKey(quadrantMeta);
  const pool =
    categoryKey && Array.isArray(SAFE_SPACE_FLAVOR_BY_TERRAIN[categoryKey]) && SAFE_SPACE_FLAVOR_BY_TERRAIN[categoryKey].length > 0
      ? SAFE_SPACE_FLAVOR_BY_TERRAIN[categoryKey]
      : SAFE_SPACE_FLAVOR_DEFAULT;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  CAMP_FLAVOR_BY_TERRAIN,
  CAMP_FLAVOR_DEFAULT,
  SAFE_SPACE_FLAVOR_BY_TERRAIN,
  SAFE_SPACE_FLAVOR_DEFAULT,
  getRandomCampFlavor,
  getRandomSafeSpaceFlavor,
};
