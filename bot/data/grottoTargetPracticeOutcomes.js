// ============================================================================
// Grotto Target Practice — Outcome flavor text (blimp/slingshot theme)
// Used by /explore grotto targetpractice. Replace {char} with character name.
// ============================================================================

const FAIL_OUTCOMES = [
  {
    flavor: "A shadow emerges behind the group, halting all shooting in its tracks. No one is able to turn in time before a disembodied and ominous \"Ya. Ha. Ha.\" eeks into your ears. You're suddenly back above the grotto grounds and it is locked for the time being.",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "The blimp wobbles mockingly—then a chorus of tiny voices echoes from nowhere. \"Ya ha ha!\" Before you know it, you're whisked back to the grotto entrance. The trial seals shut behind you.",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "The blimp bursts into golden leaves. A Korok pops out with a cheeky grin. \"You found me... but you missed the target!\" The grotto gates slam closed. Better luck next expedition.",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "A maraca rattles from the shadows. The blimp balloons to twice its size—then pops. Seeds rain down and roots erupt from the grotto floor, sealing the trial until you return.",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "The blimp drifts into a crack in the ceiling. The ground shudders. When the dust settles, the grotto entrance has sealed. The Koroks have spoken.",
    ctaHint: "Continue exploring!",
  },
];

const MISS_OUTCOMES = [
  {
    flavor: "{char} goes to take a shot and... narrowly misses it! So close, yet so far.",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char} goes to take a shot and... misses the blimp entirely! It wasn't even over in that direction!",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char} goes to take a shot and... misses so bad the blimp disappears entirely before they can hear it again behind them. Is it judging them??",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char} hits it—but it still keeps moving like normal even with the object sticking out of it. Maybe hit it again?",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char}'s finger gets caught in the string of their slingshot or bow. OW??? They take one heart of damage.",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char}'s arrow whistles through empty air. The blimp bobs gently on the breeze, utterly unimpressed.",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char}'s shot goes wide—they swear the blimp snickered. Or maybe that was the wind.",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char} fires, and the projectile vanishes into the grotto mist. The blimp remains, drifting tauntingly.",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char} aims, fires—and the blimp floats sideways at the last moment. A tiny leaf drifts down. Mockery.",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char}'s ammunition bounces off a root and ricochets into the ceiling. The blimp wobbles with what might be laughter.",
    ctaHint: "Try again!",
  },
  {
    flavor: "{char} blinks at a critical moment. By the time they focus, the blimp has drifted elsewhere.",
    ctaHint: "Try again!",
  },
];

const SUCCESS_OUTCOMES = [
  {
    flavor: "{char} hits it! It flutters pathetically to the ground, taking about a minute and a half on its descent.",
    ctaHint: "Success!",
  },
  {
    flavor: "{char} hits it! The blimp deflates with a satisfying wheeze and drifts down.",
    ctaHint: "Success!",
  },
  {
    flavor: "{char} lands a direct hit! The blimp wobbles, loses altitude, and lands in a crumpled heap.",
    ctaHint: "Success!",
  },
  {
    flavor: "{char}'s shot connects! The blimp sags and settles slowly onto the grotto floor.",
    ctaHint: "Success!",
  },
  {
    flavor: "{char}'s arrow punches right through! The blimp hisses and spirals down like a deflating balloon.",
    ctaHint: "Success!",
  },
  {
    flavor: "{char} nails it! The blimp squishes in the middle and plops to the ground with a soft thud.",
    ctaHint: "Success!",
  },
  {
    flavor: "{char} strikes true! A tiny \"Yah!\" echoes as the blimp wilts and drifts earthward.",
    ctaHint: "Success!",
  },
];

const COMPLETE_OUTCOMES = [
  {
    flavor: "{char} hits perfectly! It POPS loudly and out drops a chest that... definitely did not fit inside that blimp? You've completed the shrine! Each party member gets a spirit orb.",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "{char} hits it! It flutters pathetically to the ground, taking about a minute and a half on its descent. You've completed the shrine! Each party member gets a spirit orb.",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "{char}'s final shot strikes true! The blimp pops in a shower of golden leaves. The shrine glows—spirit orbs materialize for each party member.",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "{char} aims true! The blimp bursts and a chest tumbles out (somehow). Shrine complete! Everyone receives a spirit orb.",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "{char}'s last shot punctures the blimp's core. It explodes in a cascade of seeds and leaves—and spirit orbs coalesce for each party member. Trial complete!",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "{char} delivers the final blow! The blimp deflates like a dying sigh, and the grotto shimmers. Spirit orbs appear before each of you.",
    ctaHint: "Continue exploring!",
  },
  {
    flavor: "{char} hits the bullseye! The blimp pops—and something clatters free: a small chest, plus orbs of light for everyone. The trial is yours!",
    ctaHint: "Continue exploring!",
  },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getFailOutcome() {
  return pickRandom(FAIL_OUTCOMES);
}

function getMissOutcome() {
  return pickRandom(MISS_OUTCOMES);
}

function getSuccessOutcome() {
  return pickRandom(SUCCESS_OUTCOMES);
}

function getCompleteOutcome() {
  return pickRandom(COMPLETE_OUTCOMES);
}

module.exports = {
  FAIL_OUTCOMES,
  MISS_OUTCOMES,
  SUCCESS_OUTCOMES,
  COMPLETE_OUTCOMES,
  getFailOutcome,
  getMissOutcome,
  getSuccessOutcome,
  getCompleteOutcome,
};
