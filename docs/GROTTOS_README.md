# Grotto System — Detailed Guide

Grottos are underground spaces beneath tree stumps discovered during exploration. After cleansing with a Goddess Plume, the grotto reveals a trial. Completing the trial grants each party member a Spirit Orb.

**All grotto interactions use commands** (e.g. `</explore grotto …>`, `</raid>`). Outcomes are driven by the bot and database state.

---

## Table of Contents

1. [Discovery & Cleansing](#discovery--cleansing)
2. [Trial Types Overview](#trial-types-overview)
3. [Grotto Flow — Detailed Command Flow](#grotto-flow--detailed-command-flow)
4. [Blessing](#1-blessing)
5. [Target Practice (Blimp)](#2-target-practice-blimp)
6. [Puzzle (Offering Statue / Odd Structure)](#3-puzzle-offering-statue--odd-structure)
7. [Test of Power](#4-test-of-power)
8. [Maze](#5-maze)
9. [Reference](#reference)
10. [Implementation Checklist](#implementation-checklist)
11. [Future Grotto Ideas](#future-grotto-ideas)

---

## Discovery & Cleansing

### How You Find a Grotto

During `/explore roll`, the outcome can be `grotto`. The party receives a Yes/No choice:

- **Yes** — Attempt to cleanse now (requires Goddess Plume + 1 stamina).
- **No** — Mark the grotto on the map for later. Continue exploring; return to cleanse on another expedition.

### Cleansing Flow

1. **Requirements:** 1 Goddess Plume (must be in expedition loadout) + 1 stamina (or hearts via Struggle). Other grotto items (puzzle offerings, Lens of Truth) use regular character inventory.
2. **Cost applied:** Goddess Plume removed from holder; stamina or hearts paid.
3. **Grotto created:** Random name from `bot/data/grottoNames.js` (e.g. "Mayak Grotto"), added to map with discoveryKey. Names are deduplicated — no repeats.
4. **Trial rolled:** blessing (weight 3), target_practice (2), puzzle (2), test_of_power (2), maze (1).
5. **If blessing:** Grant Spirit Orbs immediately, set completedAt. Trial over.
6. **Else:** Show trial embed with command hint. Party uses trial-specific commands to complete.

### Blocking Behavior

While a trial is active (sealed: false, completedAt: null, and for target_practice not failed): `/explore roll`, `/explore move`, and `/explore discovery` (monster camp) are blocked.

Revisiting: use `</explore discovery>`; same cleanse flow runs with another Goddess Plume and 1 stamina.

---

## Trial Types Overview

| Trial | Theme | Reward | Status |
|-------|-------|--------|--------|
| **Blessing** | Simple gift | 1 Spirit Orb each | ✅ Done |
| **Target Practice** | Blimp shooting | 1 Spirit Orb each | ✅ Done |
| **Puzzle** | Offering statue / odd structure | 1 Spirit Orb each | ⚠️ Partial |
| **Test of Power** | Construct / Gloom Hands battle | 1 Spirit Orb each | ❌ Not implemented |
| **Maze** | Labyrinth with Song of Scrying | 1 Spirit Orb each (+ chests) | ✅ Done |

---

## Grotto Flow — Detailed Command Flow

This section explains how grottos integrate with the exploration system and the exact commands needed at each step.

### Exploration Commands (Context)

| Command | Purpose |
|---------|---------|
| `</explore roll>` | Roll for encounter in current quadrant. Can yield: normal (nothing/monster/chest/landmark), **grotto**, monster_camp, ruins. Uses expedition **id** and **charactername**. Turn-based—only the current turn character can roll. |
| `</explore move>` | Move party to an adjacent quadrant. Costs stamina. Uses **id**, **charactername**, **quadrant**. |
| `</explore camp>` | Recover stamina (no heart cost). Uses **id**, **charactername**. |
| `</explore discovery>` | Revisit a monster camp or grotto marked on the map in your current quadrant. Uses **id**, **charactername**, **discovery** (autocomplete lists available discoveries). |
| `</explore secure>` | Secure the quadrant (Wood + Eldin Ore + 5 stamina). Uses **id**, **charactername**. |
| `</explore end>` | End the expedition. Uses **id**. |

### Where Grottos Appear

1. Party is on an expedition (`</explore roll>`, `</explore move>`, etc.).
2. Party uses `</explore roll>` in a quadrant.
3. Roll outcome = **grotto** → Bot shows Yes/No choice to cleanse now.
4. **Yes** (needs Goddess Plume + 1 stamina): Cleanses immediately; grotto created; trial rolled.
5. **No**: Grotto is marked on the map. Party continues exploring. Return later via `</explore discovery>` to cleanse.

### High-Level Flow: Discovery → Trial → Completion

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. EXPLORE ROLL → outcome "grotto"                                          │
│    → Yes (Goddess Plume + 1🟩) or No (mark for later)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. IF YES: Grotto cleansed. Trial type rolled (blessing/target_practice/     │
│    puzzle/test_of_power/maze).                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. IF BLESSING: Spirit Orbs granted immediately. → Use </explore roll> or   │
│    </explore move> to continue expedition.                                   │
│    IF OTHER TRIAL: Trial embed shown. Must complete before roll/move.        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. TRIAL COMPLETE: Spirit Orbs granted. → Use </explore roll> or             │
│    </explore move> to continue expedition.                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Blocking Behavior

While an **active grotto trial** exists at your location:

- `</explore roll>` — **blocked** (must complete trial first)
- `</explore move>` — **blocked**
- `</explore discovery>` (monster camp) — **blocked**

**Exception:** Target Practice **failed** trials (grotto sealed) do NOT block—party can use roll/move.

**Allowed during active trial:** `</explore camp>`, `</explore item>`, trial-specific grotto commands, `</raid>` (when trial spawns a battle).

### Per-Trial Command Flow

#### Blessing

| Step | Command | Who | Notes |
|------|---------|-----|-------|
| 1 | `</explore roll>` → outcome grotto | Current turn | Yes/No to cleanse |
| 2 | Click **Yes** (or choose Yes) | — | Consumes Goddess Plume + 1🟩 |
| 3 | — | Bot | Grants Spirit Orbs to all; trial done |
| 4 | `</explore roll>` or `</explore move>` | Next turn | Continue expedition |

**No grotto subcommand needed.** Blessing completes instantly on cleanse.

---

#### Target Practice

| Step | Command | Who | Notes |
|------|---------|-----|-------|
| 1 | `</explore roll>` → outcome grotto | Current turn | Yes/No to cleanse |
| 2 | Click **Yes** | — | Consumes Goddess Plume + 1🟩 |
| 3 | (Optional) `</explore grotto continue>` | Any | See instructions |
| 4 | `</explore grotto targetpractice>` | **Current turn** | Each turn: one character shoots |
| 5 | Repeat step 4 | Rotating turns | Until 3 successes (complete) or 1 fail (sealed) |
| 6 | `</explore roll>` or `</explore move>` | Next turn | After complete; or after fail (trial sealed) |

**Key:** Must use `charactername` of the **current exploration turn** for targetpractice. Bot rotates turn on success.

**If chest spawns on complete:** Use bot's chest command first, then `</explore roll>` or `</explore move>`.

---

#### Puzzle

| Step | Command | Who | Notes |
|------|---------|-----|-------|
| 1 | `</explore roll>` → outcome grotto | Current turn | Yes/No to cleanse |
| 2 | Click **Yes** | — | Consumes Goddess Plume + 1🟩 |
| 3 | `</explore grotto continue>` | Any | See puzzle instructions |
| 4 | `</explore grotto puzzle items:... description:...>` | One character | Submit offering; items consumed |
| 5 | Staff review | Dashboard | Approve or deny |
| 6 | `</explore grotto continue>` | Any | **Required**—checks approval; if approved, grants Spirit Orbs |
| 7 | `</explore roll>` or `</explore move>` | Next turn | Continue expedition |

**Key:** `</explore grotto continue>` is **required** after staff approval to receive Spirit Orbs.

---

#### Test of Power (Intended — not fully implemented)

| Step | Command | Who | Notes |
|------|---------|-----|-------|
| 1 | `</explore roll>` → outcome grotto | Current turn | Yes/No to cleanse |
| 2 | Click **Yes** | — | Consumes Goddess Plume + 1🟩 |
| 3 | `</explore grotto continue>` | Any | Should start raid (currently shows instructions only) |
| 4 | `</raid>` | Party | Fight construct or Gloom Hands |
| 5 | (Gloom Hands only) Gloom hands follow-up command | Participants | 25% blight chance |
| 6 | On victory: bot grants Spirit Orbs | — | (Gap: not wired yet) |
| 7 | `</explore roll>` or `</explore move>` | Next turn | Continue expedition |

---

#### Maze

| Step | Command | Who | Notes |
|------|---------|-----|-------|
| 1 | `</explore roll>` → outcome grotto | Current turn | Yes/No to cleanse |
| 2 | Click **Yes** | — | Consumes Goddess Plume + 1🟩 |
| 3 | (Optional) `</explore grotto continue>` | Any | See instructions |
| 4 | `</explore grotto maze action:left>` (or right/straight/back/wall) | Current turn | First use generates maze |
| 5 | Repeat step 4 | Rotating turns | Move through maze; hit traps, chests, Song of Scrying (wall), battles |
| 6 | On **exit** cell: Spirit Orbs granted | — | Trial complete |
| 7 | On **trap**: hearts/stamina cost applied | — | Continue with maze command |
| 8 | On **Song of Scrying (wall)**: roll 1d6; pit/battle/collapse/faster path/nothing | — | Battles use `</raid>`; after victory, continue maze |
| 9 | On **chest**: 1 Spirit Orb to opening character | — | Continue maze |
| 10 | `</explore roll>` or `</explore move>` | Next turn | After reaching exit |

**Maze action values:** `left`, `right`, `straight`, `back`, `wall` (Song of Scrying).

**Costs:** Traps and Song of Scrying can cost hearts and/or stamina. Battles use `</raid>`.

---

### Revisiting a Grotto (Marked for Later)

If you chose **No** when you found the grotto (or ran out of stamina/plume):

1. Grotto is on the map in that quadrant.
2. **Return to that quadrant** (via `</explore move>` on a later expedition or when you're already there).
3. Use `</explore discovery>` → select the grotto from autocomplete.
4. Same cleanse flow: Goddess Plume + 1 stamina. Trial type rolled. Complete trial.
5. Continue with `</explore roll>` or `</explore move>`.

**Revisiting a completed grotto:** Use `</explore discovery>` → select grotto → cleanse again (another Goddess Plume + 1 stamina) → new trial, new Spirit Orbs if completed.

---

### Command Quick Reference

| Need to… | Command |
|----------|---------|
| Roll for encounter (may find grotto) | `</explore roll id:... charactername:...>` |
| Move to another quadrant | `</explore move id:... charactername:... quadrant:...>` |
| Revisit grotto or monster camp | `</explore discovery id:... charactername:... discovery:...>` |
| See grotto instructions | `</explore grotto continue id:... grotto:...>` |
| Shoot blimp (Target Practice) | `</explore grotto targetpractice id:... charactername:... grotto:...>` |
| Submit puzzle offering | `</explore grotto puzzle id:... grotto:... items:... description:...>` |
| Navigate maze | `</explore grotto maze id:... charactername:... grotto:... action:left/right/straight/back/wall>` |
| Fight construct / Gloom Hands | `</raid>` (with Raid ID from grotto embed when applicable) |
| Continue expedition after trial | `</explore roll>` or `</explore move>` |

---

## 1. Blessing

### Theme

The grotto holds a simple blessing. No challenge; everyone receives a Spirit Orb immediately.

### Flavor

**Variants (one used at random):**

1. *"As you enter the grotto, you encounter a really interesting looking chest. Your group opens it and voila... a Spirit Orb! It's almost a bit boring without having to work for it..."*
2. *"The grotto opens into a small chamber lit by soft blue light. At its center, an ancient tree stump holds a shallow basin. Spirit orbs materialize within—one for each of you. The old roots seem to sigh with approval."*
3. *"You step into a pocket of warmth beneath the earth. Golden dust drifts from cracks in the ceiling. As it settles, orbs of light coalesce before each party member. A gentle blessing, freely given."*
4. *"A pedestal of weathered stone stands at the far end. Resting upon it: spirit orbs, gleaming and ready. No guardian, no trial—just a gift from the grotto itself."*
5. *"The air shimmers. Something in this place has been waiting. One by one, spirit orbs emerge from the walls and float into your hands. Perhaps the forest remembers those who cleanse its blight."*
6. *"Beneath a tangle of roots, you find a hollow filled with glowing orbs. They pulse softly, as if breathing. Your party takes one each. The grotto hums contentedly."*

↳ Continue exploring ➾ Use `</explore roll>` or `</explore move>` to proceed with the expedition.

### Flow

1. Party cleanses grotto (Goddess Plume + 1 stamina).
2. Trial type rolled = **blessing**.
3. **Immediate:** Grant 1 Spirit Orb to each party member; set completedAt.
4. Show blessing embed. Party uses `</explore roll>` or `</explore move>` to continue the expedition.

---

## 2. Target Practice (Blimp)

### Theme

A moving or airborne blimp that sounds like Koroks and maracas. Characters take turns shooting it with bows or slingshots. Reach 3 successes to complete, or fail and the grotto seals.

### Entry Flavor

- *"As you enter the grotto, you encounter a moving blimp that sounds a bit like the children of the forest and their maracas..."*
  ↳ Shoot it! ➾ `</explore grotto targetpractice>`

- *"As you enter the grotto, you encounter an airborne blimp that keeps fleeing from you. Somewhere deep within the primordial bowels of your soul, you feel the urge to..."*
  ↳ Shoot it! ➾ `</explore grotto targetpractice>`

### Flow

1. Party uses `</explore grotto targetpractice>` on each turn.
2. **Roll:** fail / miss / success (modified by ranged weapon, Hunter/Scout job, weapon quality).
3. **Bow bonus:** If the rolling character has a **bow** (or slingshot) equipped, they get a bonus: lower fail chance (−8%) and lower miss chance (−5%). Hunter/Scout job and weapon quality add further reductions.
4. **Fail:** targetPracticeState.failed = true; grotto sealed; party can return later. Continue with `</explore roll>` or `</explore move>`.
5. **Miss:** Try again; same command.
6. **Success:** successCount++; turn rotates; at 3 successes → complete.
7. On complete: Grant 1 Spirit Orb to each; set completedAt. Continue with `</explore roll>` or `</explore move>`.
8. **State:** targetPracticeState { turnIndex, successCount, failed }

### Outcome Table (Full Flavor)

| Result | Flavor |
|--------|--------|
| **Fail** (Roll 1) | *The blimp looms before you. You go to take a shot and... a shadow emerges behind the group, halting all shooting in its tracks. No one is able to turn in time before a disembodied and ominous "Ya. Ha. Ha." eeks into your ears. You're suddenly back above the grotto grounds and it is locked for the time being.* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Fail** | *The blimp looms before you. You go to take a shot and... the blimp wobbles mockingly—then a chorus of tiny voices echoes from nowhere. "Ya ha ha!" Before you know it, you're whisked back to the grotto entrance. The trial seals shut behind you.* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Fail** | *The blimp looms before you. You go to take a shot and... the blimp bursts into golden leaves. A Korok pops out with a cheeky grin. "You found me... but you missed the target!" The grotto gates slam closed. Better luck next expedition.* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Fail** | *The blimp looms before you. You go to take a shot and... a maraca rattles from the shadows. The blimp balloons to twice its size—then pops. Seeds rain down and roots erupt from the grotto floor, sealing the trial until you return.* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Fail** | *The blimp looms before you. You go to take a shot and... the blimp drifts into a crack in the ceiling. The ground shudders. When the dust settles, the grotto entrance has sealed. The Koroks have spoken.* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Narrow miss** (Roll 4) | *The blimp looms before you. You go to take a shot and... you NARROWLY miss it! So close, yet so far.* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Miss** (Roll 3) | *The blimp looms before you. You go to take a shot and... you miss the blimp entirely! It wasn't even over in that direction!* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Bad miss** (Roll 3) | *The blimp looms before you. You go to take a shot and... you miss so bad the blimp disappears entirely before you can hear it again behind you. Is it judging you??* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Hit but not enough** (Roll 2) | *The blimp looms before you. You go to take a shot and... you hit it, yay! It still keeps moving like normal even with the object sticking out of it so maybe hit it again?* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Injury** (Roll 2) | *The blimp looms before you. You go to take a shot and... your finger gets caught in the string of your slingshot or bow. OW??? You take one heart of damage.* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Miss** | *The blimp looms before you. You go to take a shot and... your arrow whistles through empty air. The blimp bobs gently on the breeze, utterly unimpressed.* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Miss** | *The blimp looms before you. You go to take a shot and... your shot goes wide—you swear the blimp snickered. Or maybe that was the wind.* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Miss** | *The blimp looms before you. You go to take a shot and... you fire, and the projectile vanishes into the grotto mist. The blimp remains, drifting tauntingly.* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Miss** | *The blimp looms before you. You go to take a shot and... you aim, fire—and the blimp floats sideways at the last moment. A tiny leaf drifts down. Mockery.* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Miss** | *The blimp looms before you. You go to take a shot and... your ammunition bounces off a root and ricochets into the ceiling. The blimp wobbles with what might be laughter.* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Miss** | *The blimp looms before you. You go to take a shot and... you blink at a critical moment. By the time you focus, the blimp has drifted elsewhere.* ↳ Try again! ➾ `</explore grotto targetpractice>` |
| **Success (flutters)** | *The blimp looms before you. You go to take a shot and... you hit it! It flutters pathetically to the ground, taking about a minute and a half on its descent. You've completed the shrine! Each party member gets a spirit orb.* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Success (chest)** | *The blimp looms before you. You go to take a shot and... you hit perfectly! It POPS loudly and out drops a chest that... definitely did not fit inside that blimp? You've completed the shrine! Each party member gets a spirit orb.* ↳ Open that chest! ➾ Use the bot's chest command, then `</explore roll>` or `</explore move>`. |
| **Success** | *The blimp looms before you. You go to take a shot and... you hit it! The blimp deflates with a satisfying wheeze and drifts down.* ↳ Success! ➾ `</explore grotto targetpractice>` |
| **Success** | *The blimp looms before you. You go to take a shot and... your arrow punches right through! The blimp hisses and spirals down like a deflating balloon.* ↳ Success! ➾ `</explore grotto targetpractice>` |
| **Success** | *The blimp looms before you. You go to take a shot and... you nail it! The blimp squishes in the middle and plops to the ground with a soft thud.* ↳ Success! ➾ `</explore grotto targetpractice>` |
| **Success** | *The blimp looms before you. You go to take a shot and... you strike true! A tiny "Yah!" echoes as the blimp wilts and drifts earthward.* ↳ Success! ➾ `</explore grotto targetpractice>` |
| **Complete** | *The blimp looms before you. You go to take a shot and... your final shot strikes true! The blimp pops in a shower of golden leaves. The shrine glows—spirit orbs materialize for each party member.* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Complete** | *The blimp looms before you. You go to take a shot and... you aim true! The blimp bursts and a chest tumbles out (somehow). Shrine complete! Everyone receives a spirit orb.* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Complete** | *The blimp looms before you. You go to take a shot and... your last shot punctures the blimp's core. It explodes in a cascade of seeds and leaves—and spirit orbs coalesce for each party member. Trial complete!* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Complete** | *The blimp looms before you. You go to take a shot and... you deliver the final blow! The blimp deflates like a dying sigh, and the grotto shimmers. Spirit orbs appear before each of you.* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |
| **Complete** | *The blimp looms before you. You go to take a shot and... you hit the bullseye! The blimp pops—and something clatters free: a small chest, plus orbs of light for everyone. The trial is yours!* ↳ Continue exploring! ➾ `</explore roll>` or `</explore move>` |

---

## 3. Puzzle (Offering Statue / Odd Structure)

### Theme

Either an odd structure to build with materials, or a statue with an offering pit and cryptic clues. Submit items; the bot validates against the puzzle requirements. Correct items = Spirit Orbs for everyone. Wrong items = denied, items still consumed.

### Flavor

**A. Odd Structure (Build It)**

**Variant 1:** *"As you enter the space beneath the stump, you encounter an odd structure, with runes of an age far gone. It doesn't seem fully built, however, but maybe help building it will open up something cool?"*  
↳ Offer 50 wood & 20 ancient screws.

**Variant 2:** *"As you enter the space beneath the stump, you encounter an odd structure, with runes of an age far gone. It doesn't seem fully built, however, but maybe help building it will open up something cool?"*  
↳ Offer 40 flint & 20 ancient shafts.

**Variant 3:** *"A half-finished frame of wood and metal sits in the grotto. Ancient script winds around its beams. It looks like something was meant to be completed here—and perhaps still can be."*  
↳ Offer materials to complete it (wood, flint, ancient parts, etc., as required).

**Variant 4:** *"You find a scaffold of roots and stone. Parts are missing—gaps where metal or wood should slot in. The runes suggest a ritual of assembly. Contribute what you carry."*  
↳ Offer materials as required. *Suggested: Wood (×40–50), Flint (×20–40), Ancient Screw or Ancient Shaft (×15–20), Eldin Ore or Iron bar.*

**Variant 5:** *"A skeletal structure dominates the chamber. It hums with dormant energy. Scattered components lie nearby. Perhaps if you supply the rest, it will awaken—and reward you."*  
↳ Offer materials as required. *Suggested: Wood (×40–50), Ancient Screw (×15–20), Ancient Shaft (×15–20), Ancient Gear or Ancient Core, Flint (×20–40).*

**B. Offering Statue (Cryptic Clues)**

**Entry flavor:** *"As you enter the space beneath the stump, you find a statue with an offering pit. Before it lies a sheet of paper—a mess of writing, several colors of notes scrawled on top of each other and nearly incoherent. One clue stands out:"*

**Clues (one used per puzzle):**

1. *"...the hood of a Golden God."*
2. *"...they have eight, but **I** only need one..."*
3. *"Is this thing even real gold?"*
4. *"...a flower that makes robots gain life."*
5. *"If I keep having to steal tatters from those creepy undead creatures, so help me Hylia.."*
6. *"...these petrified bones..."*
7. *"It took me 10 years to spin this but at last!"*
8. *"...something that holds the cold of Death Mountain's heart."*
9. *"...wings that never flew, from a creature long asleep."*
10. *"...the tears of a Zora prince."*
11. *"...sand that remembers the desert."*
12. *"...a blade that cut the darkness."*
13. *"...something the Koroks would weep to lose."*
14. *"...a gift from the sky, fallen and still warm."*

**Clue → Item Reference** (staff/player guide; all from `tinglebot.items.json`):

| # | Clue | Item |
|---|------|------|
| 1 | "...the hood of a Golden God." | Tingle's Hood |
| 2 | "...they have eight, but I only need one..." | Spider's Eye |
| 3 | "Is this thing even real gold?" | Golden Skull or Gold Dust |
| 4 | "...a flower that makes robots gain life." | Ancient Flower |
| 5 | "...tatters from those creepy undead creatures..." | Gibdo Wing or Gibdo Guts |
| 6 | "...these petrified bones..." | Stal Skull or Gibdo Bone |
| 7 | "It took me 10 years to spin this but at last!" | Silk or Spider Silk |
| 8 | "...something that holds the cold of Death Mountain's heart." | Sapphire |
| 9 | "...wings that never flew, from a creature long asleep." | Gibdo Wing |
| 10 | "...the tears of a Zora prince." | Zora Scale |
| 11 | "...sand that remembers the desert." | Sand Cicada or Sandy Ribbon |
| 12 | "...a blade that cut the darkness." | Guardian Sword or Guardian Sword+ |
| 13 | "...something the Koroks would weep to lose." | Korok Leaf |
| 14 | "...a gift from the sky, fallen and still warm." | Star Fragment |

↳ Try offering something ➾ Use `</explore grotto puzzle items:... description:...>` to submit. The bot consumes items on submit and validates automatically. Correct = Spirit Orbs for everyone; wrong = denied, items still consumed.

### Flow

1. Party sees the puzzle flavor (odd structure variant or offering statue clue) on cleanse or `</explore grotto continue>`.
2. Submitting character uses `</explore grotto puzzle items:A,B description:...>` (e.g. `Wood x50, Ancient Screw x20` or `Tingle's Hood`).
3. **Validate:** Character must have each item in inventory (enforced).
4. **Consume items:** removeItemInventoryDatabase called for each; items removed on submit.
5. **Auto-validate:** Bot checks against puzzle requirements; sets offeringApproved true/false immediately.
6. Party uses `</explore grotto continue>` to collect Spirit Orbs if approved; if denied, trial over. Then `</explore roll>` or `</explore move>`.
7. **State:** puzzleState { puzzleSubType, puzzleVariant/puzzleClueIndex, offeringSubmitted, offeringApproved, offeringItems, ... }

---

## 4. Test of Power

### Theme

A boss battle—constructs (Lynel, Talus, Hinox, Blight Copies, etc.) or Gloom Hands. Defeat the monster to complete; each party member receives a Spirit Orb. Gloom Hands apply a 25% blight chance on defeat.

### Flavor

**Shared room intro (variants):**

1. *"… A large open area, it is lit up by large luminous stones embedded into the roots and rock. Scattered around are pieces of odd scraps of metal and stone. At the center of the room is a chest, but as your group steps closer, an ominous dark glow emerges from the ground below it and the scraps begin to shake as they're drawn to the blight coming from the ground."*
2. *"The cavern opens into a wide chamber. Luminous stones line the walls. In the center: a chest, its metal corroded with age. You feel eyes on you—no, not eyes. The scrap metal and stone scattered across the floor begin to tremble. Something is pulling them together."*
3. *"You emerge into a vault of roots and rock. A chest sits in a pool of shadow. As you approach, the shadow surges. Scraps of ancient machinery fly toward it, snapping into place. A construct is forming."*
4. *"Stone pillars ring the chamber. At their center, a chest rests on a dais. The moment your foot crosses the threshold, the ground cracks. Blight seeps up. Metal shards and rock fragments whirl through the air, drawn to the darkness."*

**Battle rules (all constructs):** One character per battle turn. Wait for others to roll; you may roll again only after no one else has rolled for 2+ minutes. Use characters in the village the monster appears in. Characters can heal during battle in-channel. The person who rolls posts remaining hearts; no one else rolls until that's done.

**Golden Lynel Construct** — *It swallows the chest into its shadowy form and the scraps help it form into a large construct with the strange appearance of a lynel. It lets out a warped scream and charges at you!* **Hearts:** 20/20 — `</explore grotto continue>` starts the raid; party fights via `</raid>`. On victory the bot grants spirit orbs (1 each) and completes the grotto. Then `</explore roll>` or `</explore move>`.

**Lynel Construct** — *It swallows the chest into its shadowy form and the scraps help it form into a large construct with the strange appearance of a Lynel! It's fiery eyes stare at you as it pulls out its mangled weapons and lets out a warped ear piercing roar!* **Hearts:** 18/18 — Same flow.

**Talus Construct** — *It swallows the chest into its shadowy form and the scraps help it form into a large construct with the strange appearance of a Talus! It slams the ground around it, shaking you in the process before it starts you!* **Hearts:** 16/16 — Same flow.

**Talus Construct (alternate)** — *The chest vanishes into the blight. Stones and metal fuse into a lumbering shape—a Talus, but wrong, twisted. It heaves itself up and swings a massive fist your way!* **Hearts:** 16/16 — Same flow.

**Hinox Construct** — *The chest disappears into the shadow. A Hinox-sized figure rises from the scraps—one bulging eye fixed on you, weapons forming in its grip. It bellows and attacks!* **Hearts:** 14/14 — Same flow.

**Blight Copies** — *It swallows the chest. Tendrils appear from below, and shoot past you, a sickly feeling and a tinge of dread come over you briefly as you turn to face a shadowy figure that has your face. The shadow dawns copies of your armor and weaponry, it stances up before charging at you!* **Hearts:** 18/18 — Same flow.

**Blight Copies (alternate)** — *The chest melts into the darkness. Tendrils shoot out—not at you, past you. You whirl. A figure made of shadow stands in your likeness. It draws a copy of your weapon. Fight!* **Hearts:** 18/18 — Same flow.

**Gloom Hands** — *"As you enter the grotto, you encounter a really interesting looking chest. Your group opens it and voila... HANDS REACH OUT! This foe is especially tough... Multiple people can fight this monster!"* **Hearts:** 10/10 — `</explore grotto continue>` starts the raid; party fights via `</raid>`. After victory, everyone who participated runs the gloom hands follow-up command. Bot grants spirit orbs (1 each). Then `</explore roll>` or `</explore move>`.

**Gloom Hands (alternate)** — *A chest sits in the grotto. Too easy. You open it—and Gloom Hands erupt from within, grasping, pulling. This foe is especially tough. Multiple people can fight this monster!* **Hearts:** 10/10 — Same flow.

### Monster Types & Hearts

| Monster | Hearts |
|---------|--------|
| Golden Lynel Construct | 20/20 |
| Lynel Construct | 18/18 |
| Talus Construct | 16/16 |
| Blight Copies | 18/18 |
| Hinox Construct | 14/14 |
| Rare Talus Construct | 14/14 |
| Stone Talus Construct | 10/10 |
| Mini-Boss Bokoblin Construct | 14/14 |
| Gloom Hands | 10/10 |

### Battle Rules

- One character per battle turn; wait for others to roll.
- Wait 2+ minutes before rolling again if no one else has.
- Use characters in the village the monster appears in.
- Characters can heal during battle in the channel.
- The person who rolls posts remaining hearts; no one else is allowed to roll until that's done.

### Flow (Intended)

1. Party uses `</explore grotto continue>`. **Currently:** Only shows instructions. **Should:** Auto-start raid on first continue.
2. Select monster (roll/weight from pool); triggerRaid with grottoId stored.
3. Party fights via `</raid>`.
4. On victory: complete grotto and grant Spirit Orbs to all party members.

**Implementation gap:** Raid not triggered; grottoId not on Raid; victory handler doesn't complete grotto.

---

## 5. Maze

### Theme

A labyrinth beneath the stump—luminous stones, roots, fog, korok giggles. Navigate with directions or Wall (Song of Scrying). Traps, chests, constructs. Reach the exit for Spirit Orbs.

### Entry Flavor

↳ Enter the maze... ➾ `</explore grotto maze action:...>`. The bot generates the maze and handles moves, traps, and battles. If your expedition extends beyond 24 hours, the due date auto-extends. If you hold a Lens of Truth, the bot can let you bypass the maze for immediate spirit orbs (forgoing chests). On completion, continue with `</explore roll>` or `</explore move>`.

**Entry variants:**

1. *"As you journey beneath the earth, a landing comes into view, foggy and softly lit by rows of luminous stones. An ambient empty noise permeates with a dull hum from the ground - you feel the vibrations in the roots of your being. Walls stop your view on three sides, only leaving the path in which you began to retreat."*
2. *"Your consciousness drifts the moment you interact with the stump, coiled down into the earth like the stump's roots. As you emerge from drifting, your group is no longer above ground but instead in the heart of the grotto, blue flames illuminating walls surrounding you. A few passages are open, but which is the right way? And where did you come from? The smell of rotting wood lingers as a faint background to your wandering mind and you wonder if you can make it back out in one piece."*
3. *"Interlocking roots align the floor of the entry into this grotto in particular. A tripping hazard, for sure, but a stump so ancient answers to no one, including death. The rotting insides of this one are a bit too easy to see, perhaps even worrisome, as they form their ways into jagged pathways and walls, tighter as you climb in further. It's almost hard to breath with such dense air weighing you down, but a maze should be easy... right?"*
4. *"Are we in Vhintl right now? The distinct sounds of korok giggles and maracas echo in this grotto, but you can't be sure if there really are hidden koroks surviving this far out or creatures that have developed so intelligently as to mimic them. As you listen, the grotto path makes a sharp turn, then another, and another... You follow it until the fog overtakes your vision and the giggling becomes louder, more discordant too. When you come back to reality, you're back at the beginning of what you believe to be a maze."*
5. *"You descend into the grotto. The walls are alive—roots pulse with faint light, and mist rolls along the floor. Pathways branch left and right. Somewhere ahead, you hear the drip of water. Or is it something else? The maze awaits."*
6. *"Darkness gives way to blue luminescence. You stand at a crossroads of earthen corridors. Moss glows on the walls. The air is cold and still. Choose your path—but tread carefully. This grotto has teeth."*
7. *"The stump's interior opens into a labyrinth of stone and root. Torchlight wouldn't help much—the walls seem to drink the light. Luminous fungi mark the way in patches. You have a bad feeling about the turns ahead."*
8. *"You step into the maze. The ceiling is low, the passages narrow. Something scrapes in the distance. Korok laughter? Wind through roots? You can't tell. The paths twist and fold. Find the exit—or get lost trying."*

**Exit flavor (on completing the maze):**

- *"The corridor opens into a chamber washed with golden light. Spirit orbs float toward each of you. You've made it through."*
- *"The maze spits you out at last. Roots part. Fresh air—or what passes for it down here—rushes in. Spirit orbs materialize. The trial is complete."*
- *"You emerge into a small sanctum. The walls here are smooth, almost welcoming. Orbs of light drift into your hands. The labyrinth is behind you now."*

### Flow

1. First use: `</explore grotto maze action:...>` generates maze; stored in mazeState.layout.
2. **Move (left/right/straight/back):** Update currentNode, facing, steps. Cell: exit → complete; chest → 1 orb to active char; trap → roll trap outcome; path → move.
3. **Wall (Song of Scrying):** Roll 1d6; apply outcome (battle, pit, stalagmites, collapse, faster path, nothing).
4. Battles: trigger raid with expeditionId; trial continues after victory.
5. **State:** mazeState { currentNode, facing, steps, layout, openedChests }

### Song of Scrying (Wall) Outcomes — Full Flavor

| Roll | Flavor | Follow-up |
|-----|--------|-----------|
| **6** | *You sing the sequence on the wall and... you did amazing! The wall slides down into the ground, revealing a FASTER path to the end, hurray!* | Continue with `</explore grotto maze action:...>`. |
| **6** | *You sing the sequence on the wall and... the ancient runes glow in approval. The wall grinds downward—a shortcut to the exit opens!* | Continue with maze command. |
| **5** | *You sing the sequence on the wall and... nothing changes, it's just as still as it was to begin with. Maybe there's another way?* | ↳ Continue with `</explore grotto maze action:...>`. |
| **5** | *You sing the sequence on the wall and... out pops a construct! Guess you're a REALLY bad musician? The construct pulls at the wall to form into a large construct with the strange appearance of a Hinox! It's goofy eye stares at you as it pulls out its mangled weapons and lets out a warped ear piercing roar!* **Hinox Construct** (14 hearts). | Bot triggers `</raid>`; when defeated, continue with `</explore grotto maze action:...>`. |
| **5** | *You sing the sequence on the wall and... out pops a construct! Guess you're a REALLY bad musician? The construct pulls at the wall to form into a large construct with the strange appearance of a Stone Talus. Its body jumps as you prepare for impact!* **Stone Talus Construct** (10 hearts). | Bot triggers `</raid>`; when defeated, continue with maze command. |
| **4** | *You sing the sequence on the wall and... you sing something loose, the ground crumbles around you and you've fallen into a pit trap! You lose 3❤️ hearts in the fall! You spend 3🟩 stamina to climb out!* | Continue with maze command. |
| **4** | *You sing the sequence on the wall and... wrong note! The floor gives way beneath you. You lose 3❤️ hearts in the fall! You spend 3🟩 stamina to climb out!* | Continue with maze command. |
| **3** | *You sing the sequence on the wall and... the entire passageway rumbles. Your group is forced to flee as it collapses in on itself - your group is back in an earlier part of the maze.* | ↳ Continue with maze command. |
| **3** | *You sing the sequence on the wall and... the walls tremble. A cascade of roots and stone forces you to retreat—you're back at an earlier junction.* | ↳ Continue with maze command. |
| **3** | *You sing the sequence on the wall and... the wall begins moving downward. As it does, you notice several weird shapes in it moving and rumbling that weren't doing that before... A stone talus construct has blocked your faster path! It's giant body jumps and goes airborne before crashing down and getting ready to launch an attack!* **Stone Talus Construct** (10 hearts). | Bot triggers `</raid>`; when defeated, continue on your FASTER path. |
| **2** | *You sing the sequence on the wall and... nothing changes, it's just as still as it was to begin with. Maybe there's another way?* | ↳ Continue with maze command. |
| **2** | *You sing the sequence on the wall and... the runes flicker once, then go dark. Perhaps you need a different approach?* | ↳ Continue with maze command. |
| **2** | *You sing the sequence on the wall and... There is a rumbling above you, you look up to find loose rocks shaking and come loose from the ceiling. You dive out of the way as rows of stalagmites fall around you, you narrowly avoided death, but you're a little scraped up. But alive! You spend 3🟩 stamina avoiding the rocks!* | Continue with maze command. |
| **2** | *You sing the sequence on the wall and... the wall begins moving downward. As it does, you notice several weird shapes in it moving and rumbling that weren't doing that before... A rare talus construct has blocked your faster path! It's giant body jumps and goes airborne before crashing down and getting ready to launch an attack!* **Rare Talus Construct** (14 hearts). | Bot triggers `</raid>`; when defeated, continue on your FASTER path. |
| **1** | *You sing the sequence on the wall and... dear Hylia, that was terrible! The wall still slides downward into the ground, opening up a FASTER path to the end of the maze, hurray!* | ↳ Continue with maze command. |
| **1** | *You sing the sequence on the wall and... somehow it works anyway! The wall slides aside, revealing a faster route. Beginner's luck?* | ↳ Continue with maze command. |
| **1** | *You sing the sequence on the wall and... the entire passageway rumbles. Your group is forced to flee as it collapses in on itself - your group is back in an earlier part of the maze.* | ↳ Continue with maze command. |
| **1** | *You sing the sequence on the wall and... dear Hylia, that was terrible! You should really change your job... the Boss Bokoblin construct you awoke agrees!* **Mini-Boss Bokoblin Construct** (14 hearts). | Bot triggers `</raid>`; when defeated, continue with maze command. |

### Trap Cell Outcomes — Full Flavor

| Roll | Flavor |
|-----|--------|
| **5** | *You feel something snap against your foot, the sounds of some type of mechanism behind the stone walls activate as thin sharp objects shoot from the cracks. Diving down you avoid the deadly barrage but you are not without injury. You lose 4❤️ hearts as the wooden darts pierce you. You spend 4🟩 Stamina getting out of the way.* |
| **5** | *Something clicks. Sharpened stakes shoot from hidden slots—you dodge most, but one grazes your side. You lose 4❤️ hearts. You spend 4🟩 stamina scrambling to safety.* |
| **4** | *You step on something loose, the ground crumbles around you and you've fallen into a pit trap! You lose 3❤️ hearts in the fall! You spend 3🟩 stamina to climb out!* |
| **4** | *The ground collapses! You tumble into a shallow pit. You lose 3❤️ hearts in the fall! You spend 3🟩 stamina to climb out!* |
| **4** | *There is a rumbling above you, you look up to find loose rocks shaking and come loose from the ceiling. You dive out of the way as rows of stalagmites fall around you, you narrowly avoided death, but you're a little scraped up. But alive! You spend 3🟩 stamina avoiding the rocks!* |
| **3** | *You feel something snap against your foot, the sounds of some type of mechanism behind the stone walls activate as thin sharp objects shoot from the cracks. Thinking fast, you dive down, and avoid the deadly barrage. You spend 2🟩 Stamina getting out of the way, good job!* |
| **3** | *A tripwire snaps! Darts fly from the walls. You spin aside in time—winded but unharmed. You spend 2🟩 stamina recovering your balance.* |
| **3** | *You feel the floor beneath you crumble, but you run fast enough to avoid falling in! You spend 1🟩 stamina in the process but avoid injury! Good job!* |
| **3** | *The tiles crack underfoot—you leap to solid ground just in time! You spend 1🟩 stamina in the scramble but suffer no injuries.* |
| **1** | *You hear something click... but nothing happens? Perhaps whatever was here doesn't work anymore... lucky!* |
| **1** | *Your foot lands on a suspicious stone—it shifts, then... nothing. The mechanism must be rusted shut. Lucky break!* |

### Maze Chests

Some cells contain chests. Open one and a party member receives a Spirit Orb. Continue with the maze command.

---

## Reference

### Commands

| Action | Command |
|--------|---------|
| **Enter trial / see instructions** | `</explore grotto continue>` |
| Target practice (shoot blimp) | `</explore grotto targetpractice>` |
| Submit puzzle offering | `</explore grotto puzzle items:... description:...>` |
| Navigate maze | `</explore grotto maze action:left\|right\|straight\|back\|wall>` |
| Fight construct / Gloom Hands | `</raid>` |
| After Gloom Hands | Gloom hands follow-up command |
| **Continue expedition** (after trial complete) | `</explore roll>` or `</explore move>` |
| Revisit grotto | `</explore discovery>` |

### When is `</explore grotto continue>` needed?

| Trial | When to use it |
|-------|----------------|
| **Blessing** | Not needed — Spirit Orbs granted immediately on cleanse. |
| **Target Practice** | Optional — use it to see instructions; you can go straight to `</explore grotto targetpractice>`. |
| **Puzzle** | **Required** — after submitting correct items, run continue to receive Spirit Orbs. |
| **Test of Power** | Use it to enter the trial; it will start the raid. |
| **Maze** | Optional — use it to see instructions; you can go straight to `</explore grotto maze action:...>`. |

After any trial completes, use `</explore roll>` or `</explore move>` to continue the expedition. No grotto command needed.

### Revisiting Grottos

Completed grottos remain on the map. Use the discovery command to revisit monster camps or grottos in a quadrant. Revisiting a cleansed grotto lets you re-do the trial (e.g. blessing) with another Goddess Plume and 1 stamina per visit.

---

## Implementation Checklist

### Puzzle — Implemented
- [x] Validate submitting character has each offered item (and quantity) in inventory
- [x] Call `removeItemInventoryDatabase` for each item before setting `offeringSubmitted`
- [x] Reject submission if any remove fails; do not consume partial items
- [x] Add quantity support to puzzle command (e.g. `items:Wood x50,Ancient Screw x20`)
- [x] Odd Structure variants 1–5 and Offering Statue clues 1–14 with flavor text
- [x] Auto-validate and approve/deny on submit

### Test of Power — Full Implementation
- [ ] Add `grottoId` to RaidModel schema
- [ ] Add `testOfPowerState: { raidStarted, raidId? }` to GrottoModel
- [ ] Extend triggerRaid/startRaid to accept and store `grottoId`
- [ ] In grotto continue: when test_of_power and no raid started, select monster and trigger raid
- [ ] Store grottoId on raid when Test of Power
- [ ] In raid.js victory handler: if raidData.grottoId, complete grotto + grant Spirit Orbs to party
- [ ] Define monster pool/weights for Test of Power (constructs, Gloom Hands)

### Maze Enhancements
- [ ] Lens of Truth bypass: check party for item, offer "Skip maze?" choice, grant Spirit Orbs on confirm
- [ ] Optional: time extension notice when maze exceeds 24h expedition

### Dashboard & UX
- [ ] Confirm grotto puzzle approve/deny UI exists
- [ ] Grotto list/filter for staff (pending puzzle offerings)

---

## Future Grotto Ideas

Ideas for new trial types. Not yet implemented.

| Idea | Theme | Mechanic sketch | Complexity |
|------|-------|-----------------|------------|
| **Stealth** | Sneak past sleeping guardians | Stamina-based rolls; Scout job bonus. Fail = wake them (battle or seal). | Medium |
| **Memory** | Fragments of the past | Answer riddles or match runes about region history. Staff or preset answers. | Medium |
| **Cooking** | Ancient recipe stone | Submit correct ingredient combo. Database of valid recipes. | Medium |
| **Song Trial** | Melody on ancient stones | Play notes in sequence (different from maze Song of Scrying). Bard bonus. | Medium |
| **Stamina Sprint** | Race to the altar | Timed stamina drain; reach exit before 0. | Medium |
| **Trial of Wisdom** | Riddle or quiz | Single riddle with preset answer, or trivia. Automated or staff. | Low |
| **Fairy Spring** | Healing waters | Pay hearts or stamina to "purify"; get Spirit Orb. Simple trade. | Low |
| **Gathering Trial** | Collect from the grotto | Gather X items within grotto (mini gather loop). | Medium |
| **Elemental** | Strike crystals in order | Use fire/ice/electro items or abilities in correct sequence. | High |
| **Mirror Match** | Face yourself | 1v1 vs weaker copy. Raid-style but solo or simplified. | High |
| **Escort** | Protect the light | Carry a flame/crystal through hazards; if it goes out, fail. | High |
| **Blessed Fishing** | Sacred pool | Catch a specific fish (fishing command integration). | Medium |
| **Multi-stage** | Several small challenges | 2–3 mini-trials in sequence (e.g. puzzle → combat → blessing). | High |
