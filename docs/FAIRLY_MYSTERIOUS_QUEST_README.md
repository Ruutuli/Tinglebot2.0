# That's Fairly Mysterious — Orange (Siati Quest)

## Overview

**Great Fairy of Power:** Siati  
**Quest name:** That's Fairly Mysterious — Orange  
**Location:** Rudania  
**Dates:** Month 2026  
**Type:** Rp/Interactive  
**Mechanics:** Scavenger hunt, Boss battle  
**Rewards:** TBD  
**Event size:** 15 players  

This minigame is intended to be part of the `/minigame` command (alongside "They Came for the Cows"). Ideally the full flow runs in one thread, similar to the They Came (THEM) quest style.

---

## Flavor / Hook

> There seems to be a commotion in the village square. Or the markets. Definitely the markets. A fairy, unlike what you've come to know, has taken to someone's stall and hid amongst their goods. It's afraid, pleading for those around to help it. Its friends are scattered, hidden around the village and too frightened to leave their sanctuaries. Will you help this fairy find its friends and help it return home? Be vigilant—there's a reason why the fairies are afraid.

---

## Quest Flow (Three Phases)

| Phase | Description |
|-------|-------------|
| **1. Scavenger hunt** | Grid over Rudania; players search squares (letter + number). Each square can contain: stray fairy, item, regular fairy, or nothing. Once searched, a square cannot be chosen again. Goal: find all **15 stray fairies**. |
| **2. Escort to fountain** | Party leads the 15 stray fairies to the corresponding fairy fountain. Movement: either table roll (CSV) or mod calls for `1d20` per segment. **Monster waves** attack periodically (e.g. via monster wave command if possible; otherwise manual). |
| **3. Boss battle** | At the fountain, a **raid monster** is fought. Use raid command if possible; otherwise manual. Players roll `/r 1d20`; each roll counts as damage against the boss. Rewards given on defeat. Stray fairies merge into **Great Fairy of Power, Siati**, restoring the fountain. |

---

## Mechanics to Develop for `/minigame`

### 1. New minigame type

- **Internal name:** `siati` or `fairlymysterious` (to add to `MinigameModel` `gameType` enum and `/mod minigame` options).
- **User-facing:** "That's Fairly Mysterious" or "Siati (Great Fairy of Power)".

### 2. Phase 1: Grid scavenger hunt

- **Map:** Use a snippet of the Rudania map image (same style as They Came village image). Overlay a **grid** where each cell is identified by **letter + number** (e.g. `A1`, `B3`, `C2`).
- **Session state (gameData):**
  - `phase: 'scavenger' | 'escort' | 'boss' | 'finished'`
  - `grid`: definition of valid cells (e.g. rows A–N, cols 1–10, or whatever fits the image).
  - `searchedCells`: array of `{ cellId: 'A1', result: 'stray_fairy' | 'item' | 'fairy' | 'nothing', foundBy?: discordId }`.
  - `strayFairiesFound`: number (target 15).
  - Pre-generated **loot table** for the grid: exactly 15 cells with stray fairies; remaining cells are mix of item / regular fairy / nothing (or weighted random). Once generated at session start, it is fixed so the same cell always returns the same result.
- **Player action:**  
  - `/minigame siati-search` (or similar) with `session_id` and `cell` (e.g. `A1`).  
  - Validate: session exists, phase is scavenger, player is in session, cell is valid and not yet in `searchedCells`.  
  - Append to `searchedCells`, update `strayFairiesFound` if result is stray fairy.  
  - Reply with result (stray fairy / item / fairy / nothing). If automation is complex, fallback: **manual** — mod reads pre-generated grid and posts results.
- **Phase transition:** When `strayFairiesFound === 15`, set `phase: 'escort'` and post that the party is leading the fairies to the fountain.

### 3. Phase 2: Escort to fountain

- **Movement:** Either:
  - **Table roll:** Use existing table roll (e.g. CSV) to determine progress/events per “step”; or  
  - **Manual:** Mod asks for `1d20` (or similar) per segment and narrates.
- **Monster waves:** Trigger monster encounters periodically. If the codebase has a **monster wave command** that can be invoked in-context (e.g. by mod or by bot when phase advances), use it; otherwise mod runs waves manually and narrates.
- **Session state:** Optional `escortSteps`, `encountersTriggered`, etc., if automating; otherwise phase is just narrative and mod-driven.
- **Phase transition:** When the party “arrives” at the fountain (after N steps or when mod says so), set `phase: 'boss'`.

### 4. Phase 3: Boss battle

- **Boss:** Use a **raid monster** (existing raid setup). If **raid command** can be started programmatically or by mod for this channel/session, use it; otherwise mod runs the raid manually.
- **Damage:** Players use `/r 1d20` (or a dedicated `/minigame siati-boss-roll`). Each roll is treated as damage to the boss (e.g. sum of 1d20s until boss HP is depleted, or fixed number of rounds).
- **Session state:** Optional `bossHp`, `damageDealt`, `rounds` if automating; otherwise mod tracks and declares victory.
- **Completion:** On boss defeat, set `phase: 'finished'`. Narrative: stray fairies merge into **Siati**; fountain restored. Grant rewards (TBD).

### 5. Commands and mod tools

- **User-facing:**
  - `/minigame siati-join` — join with character (session_id, character, questid if tied to quest).
  - `/minigame siati-search` — search a grid cell (session_id, cell e.g. `A1`) during scavenger phase.
- **Mod-only (e.g. under `/mod minigame`):**
  - Create session: `/mod minigame` with minigame name `siati` (or “That's Fairly Mysterious”), village Rudania, optional quest ID.
  - Start scavenger phase (e.g. post grid image + instructions).
  - Advance to escort / boss / finished if not fully automated.
  - Optional: “Reveal cell” or “Set phase” for manual control.

### 6. Automation vs manual

- **Fully automated:** Grid pre-generated; search command looks up cell in session’s loot table and updates state; phase transitions when 15 stray fairies found; escort/boss driven by commands or timers. Requires more implementation (wave/raid integration, boss HP tracking).
- **Semi-automated:** Only scavenger phase is automated (grid + search); escort and boss are manual (mod calls for rolls, runs wave/raid, declares victory).
- **Manual fallback:** Mod has a pre-generated grid (e.g. spreadsheet or list of cell → result). Players post “I search A1”; mod replies with result and marks the cell done. No new commands required, but more mod workload.

---

## Data Structure (MinigameModel.gameData for `siati`)

```javascript
// When gameType === 'siati'
gameData: {
  phase: 'scavenger' | 'escort' | 'boss' | 'finished',
  village: 'rudania',
  // Phase 1: Scavenger
  grid: {
    rows: ['A', 'B', 'C', ...],   // row labels
    cols: [1, 2, 3, ...],         // column labels
    imageUrl: '...',               // Rudania map snippet URL
  },
  cellResults: {                   // pre-generated at session create; key = 'A1', value = result
    'A1': 'stray_fairy',
    'A2': 'nothing',
    'B1': 'item',
    // ... exactly 15 stray_fairy, rest mixed
  },
  searchedCells: [
    { cellId: 'A1', result: 'stray_fairy', foundBy: 'discordId', characterName: '...' },
  ],
  strayFairiesFound: 1,
  // Phase 2: Escort (optional)
  escortStep: 0,
  // Phase 3: Boss (optional)
  bossHp: 100,
  bossMaxHp: 100,
  raidMonsterId: null,             // if using raid command
}
```

---

## Implementation Checklist

- [ ] Add `siati` (or `fairlymysterious`) to `MinigameModel` `gameType` enum.
- [ ] Add minigame option to `/mod minigame` (create session for Siati).
- [ ] Create session creation logic: generate `cellResults` with exactly 15 `stray_fairy`, fill rest randomly (item / fairy / nothing). Store grid dimensions and map image URL.
- [ ] Implement `/minigame siati-join` (reuse quest-validation pattern from theycame if tied to a quest).
- [ ] Implement `/minigame siati-search` (validate session, phase, cell, update searchedCells and strayFairiesFound).
- [ ] Optional: generate grid overlay image (like They Came overlay) showing searched vs unsearched cells.
- [ ] Phase transition: scavenger → escort when strayFairiesFound === 15.
- [ ] Escort: document or implement table roll / 1d20 flow; integrate or document monster wave usage.
- [ ] Boss: document or implement raid + 1d20-as-damage; rewards TBD.
- [ ] Embeds and in-thread messages for phase intros and phase change announcements.

---

## Rewards

TBD. To be defined and then wired into `results.rewards` and any existing reward pipeline when the boss is defeated.

---

## Questions to Answer (Plain Language)

*Answer these so the quest runs the way you want. No coding knowledge needed.*

---

### Phase 1: The search (finding the fairies)

1. **How big is the search area?** (e.g. 10×10 squares, or “rows A through N, columns 1 through 10”—whatever you picture.)
2. **Do you already have a picture of Rudania (or the market) to put a grid on?** If not, does one need to be made?
3. **Should players see the grid drawn on the map**, or just pick squares by name (e.g. “A1”, “B3”) without a picture?
4. **How many squares total?** And should the 15 stray fairies be **random** each time, or **fixed** (you decide where they are)?
5. **When someone finds “item” in a square**, what do they get? Specific items, random from a list, or “we’ll decide later”?
6. **When someone finds a “regular fairy”** (not a stray), does anything special happen, or is it just story flavor?
7. **Who gets to search when?** One search per person per round in order, or can anyone search anytime (first-come first-served)?
8. **Can one person search more than one square in a row**, or only one per turn?

---

### Phase 2: Leading the fairies to the fountain

9. **How do you want to move the party?** (e.g. roll 1d20 when you say, or use a table/list you’ve already made.)
10. **Roughly how many “steps”** from the market to the fountain? (e.g. 3, 5, or “however many I call for”.)
11. **How often do monsters attack** on the way? (Every step? Every other step? Only when you say?)
12. **Who runs the monster fights?** You (the mod) calling for rolls and describing, or should the bot try to run the wave for you?
13. **If the party loses a fight on the way**, what happens? (Start over, lose some fairies, keep going with a penalty, or you decide in the moment?)
14. **Is there a time limit** to get to the fountain, or do you just say “you’ve arrived” when it feels right?

---

### Phase 3: The boss at the fountain

15. **Which monster is the boss?** (Name or type, and whether it already exists in your raid list or needs to be added.)
16. **How tough is the boss?** (e.g. “100 HP” or “needs about 10 good hits” — we can translate that into numbers.)
17. **When a player rolls 1d20 for damage**, does the **number on the die** = damage? (e.g. roll 15 = 15 damage.) Or is it “roll 1d20, and every roll counts as 1 hit”?
18. **Does the boss hit the players back**, or do players just keep rolling until the boss is down?
19. **If the party loses to the boss**, do they get to try again, or is that the end of the event?
20. **Who rolls when?** One roll per person per round in order, or can anyone roll whenever (until the boss is dead)?

---

### Rewards and who can play

21. **What do players get for finishing?** (Tokens, items, titles, etc.—list whatever you have in mind, even “TBD”.)
22. **Does everyone get the same reward**, or do you want bonuses (e.g. extra for finding a stray fairy, or for dealing the final blow)?
23. **Do players have to sign up for a quest first** (like “They Came”), or can anyone in the thread join the minigame when you post it?
24. **Is 15 players the max?** If more want to join, do you say no, or allow extras (and how)?

---

### How much the bot does vs. what you do

25. **Search phase:** Should the bot **automatically** tell players what they find when they pick a square (you’d set up the grid once), or do you want to **manually** read a list and reply yourself?
26. **Escort and boss:** Do you want the bot to **run** the escort steps and boss fight (with you just advancing when needed), or do you prefer to **run it yourself** (you call for rolls, you describe, bot only helps with dice or not at all)?
27. **When all 15 fairies are found**, should the bot **automatically** say “Phase 2: escort to the fountain” and show the next instructions, or do **you** post that?
28. **Should players see a running tally** (e.g. “Stray fairies found: 7/15” and “Squares already searched”) in the channel, or is that only for you/the bot behind the scenes?

---

## Summary

| Item | Detail |
|------|--------|
| **Quest** | That's Fairly Mysterious — Orange (Great Fairy of Power: Siati) |
| **Minigame type** | `siati` (or `fairlymysterious`) under `/minigame` |
| **Phases** | 1) Grid scavenger (find 15 stray fairies) → 2) Escort to fountain (table roll or 1d20 + monster waves) → 3) Boss battle (raid + 1d20 damage) |
| **Automation** | Scavenger can be automated with grid + search command; escort and boss can be manual or integrated with wave/raid commands as needed. |

This README is the spec for implementing the Siati quest mechanic as part of the `/minigame` command.
