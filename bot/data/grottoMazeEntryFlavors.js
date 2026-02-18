// ============================================================================
// Grotto Maze — Entry flavor text (used when party first enters the maze)
// From GROTTOS_README.md Entry variants
// ============================================================================

const MAZE_ENTRY_FLAVORS = [
  "As you journey beneath the earth, a landing comes into view, foggy and softly lit by rows of luminous stones. An ambient empty noise permeates with a dull hum from the ground — you feel the vibrations in the roots of your being. Walls stop your view on three sides, only leaving the path in which you began to retreat.",
  "Your consciousness drifts the moment you interact with the stump, coiled down into the earth like the stump's roots. As you emerge from drifting, your group is no longer above ground but instead in the heart of the grotto, blue flames illuminating walls surrounding you. A few passages are open, but which is the right way? And where did you come from? The smell of rotting wood lingers as a faint background to your wandering mind and you wonder if you can make it back out in one piece.",
  "Interlocking roots align the floor of the entry into this grotto in particular. A tripping hazard, for sure, but a stump so ancient answers to no one, including death. The rotting insides of this one are a bit too easy to see, perhaps even worrisome, as they form their ways into jagged pathways and walls, tighter as you climb in further. It's almost hard to breathe with such dense air weighing you down, but a maze should be easy... right?",
  "Are we in Vhintl right now? The distinct sounds of korok giggles and maracas echo in this grotto, but you can't be sure if there really are hidden koroks surviving this far out or creatures that have developed so intelligently as to mimic them. As you listen, the grotto path makes a sharp turn, then another, and another... You follow it until the fog overtakes your vision and the giggling becomes louder, more discordant too. When you come back to reality, you're back at the beginning of what you believe to be a maze.",
  "You descend into the grotto. The walls are alive—roots pulse with faint light, and mist rolls along the floor. Pathways branch left and right. Somewhere ahead, you hear the drip of water. Or is it something else? The maze awaits.",
  "Darkness gives way to blue luminescence. You stand at a crossroads of earthen corridors. Moss glows on the walls. The air is cold and still. Choose your path—but tread carefully. This grotto has teeth.",
  "The stump's interior opens into a labyrinth of stone and root. Torchlight wouldn't help much—the walls seem to drink the light. Luminous fungi mark the way in patches. You have a bad feeling about the turns ahead.",
  "You step into the maze. The ceiling is low, the passages narrow. Something scrapes in the distance. Korok laughter? Wind through roots? You can't tell. The paths twist and fold. Find the exit—or get lost trying.",
];

function getRandomMazeEntryFlavor() {
  return MAZE_ENTRY_FLAVORS[Math.floor(Math.random() * MAZE_ENTRY_FLAVORS.length)];
}

module.exports = { MAZE_ENTRY_FLAVORS, getRandomMazeEntryFlavor };
