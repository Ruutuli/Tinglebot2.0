# 🧪 Elixir Mixing (Design)

This document outlines a **more robust elixir mixing system** for Tinglebot.

It covers:
- why mixing should exist in the bot
- how it connects to current systems
- how mixing should resolve outputs
- a realistic implementation path

---

# 📌 Why Mixing Belongs in the Bot

Freeform mixing is messy in tabletop-style systems.

People:
- forget materials
- mix things that shouldn’t work
- expect different outcomes
- require staff to constantly adjudicate

The bot solves this cleanly:

### What the bot enables

- **Atomic inventory validation**
  - Exact materials required
  - All consumed in one transaction
  - No partial or “oops I forgot”

- **Deterministic outcomes**
  - One centralized logic source (`ELIXIR_EFFECTS`-style)
  - Same behavior across combat, travel, explore, etc.

- **Clear feedback**
  - “You are missing X”
  - “These ingredients conflict”
  - Optional preview of result

- **Balance control**
  - Adjust numbers globally
  - No drift between systems

Mixing is not just flavor. It connects:

> gathering → crafting → buffs → jobs

---

# 📦 Current Baseline (What Exists Right Now)

These systems already work and should **not be replaced**, only extended:

- `elixirModule.js`
  - `ELIXIR_EFFECTS`
  - consumption logic
  - hazard helpers

- `crafting.js`
  - fixed recipe crafting (Witch)

- `item.js`
  - applying elixirs from inventory

- `ItemModel.js`
  - materials + item definitions

### Important

Right now:
> mixing = fixed recipe → fixed elixir

The new system adds a **resolution layer**, not a replacement.

### Item data: `type`, `effectFamily`, `element`

`docs/tinglebot.items.json` is a large export (~763 items). Instead of editing every object by hand, use:

| File | Purpose |
|------|---------|
| `docs/elixir-type-mapping.json` | Maps each `ItemModel.type[]` value (e.g. `Creature`, `Monster`) to an **ingredientRole** for mixing: critter, monsterPart, optionalFood, gear, etc. |
| `docs/elixir-ingredient-labels.json` | **Sparse** map: `itemName` → `effectFamily` and/or `element`. **Organic materials only** — live critters (`Creature`), body parts / slime / bone / tails / wings (`Monster`), and monster-derived fluids or extracts. **Excluded** from this file: ancient tech (cores, gears, screws… use `type: Monster` in data but no label here), minerals (`Like Like Stone`), cloth (`Gibdo Bandage`). `Poe Soul` is labeled `element: undead` (exception). Omitted names → no label. No `notes`, no all-null rows. |

**Custom vocabulary (Tinglebot — resolver must define behavior):**

| Key | Values | Meaning |
|-----|--------|--------|
| `effectFamily` | `extract` | `Monster Extract`: **catalyst** / potency bump where recipes allow. |
| `effectFamily` | `fairy` | Fairy / Mock Fairy: **fairy-tonic** style outcomes (healing/special). |
| `effectFamily` | `bright`, `sticky` | Light- and slip-control brew lines. |
| `element` | `light` | Blessed Butterfly — pairs with `bright` for light-themed mixes. |
| `element` | `undead` | Gibdo bone/guts/wing, `Spider's Eye`, **`Poe Soul`** — blight- or curse-themed modifiers. (Skull items stay unlabeled.) |

Canon-aligned families (`mighty`, `chilly`, `electro`, …) should stay aligned with `ELIXIR_EFFECTS` / `elixirModule.js` where those elixirs exist.

**Resolver order (recommended):**

1. Load the item from DB/export.
2. Derive **ingredientRole** from `type` using `elixir-type-mapping.json`.
3. If `itemName` exists in `elixir-ingredient-labels.json`, overlay **effectFamily** and/or **element** keys that are present.
4. Otherwise, neutral parts use **itemRarity** only; gear may still use `ItemModel.element` when relevant.

New fields on `ItemModel` are optional later; the sidecar JSON keeps mixing data versioned next to exports.

### Coverage check (`tinglebot.items.json` export)

Run against current `docs/tinglebot.items.json` (763 items):

| Pool | In export | In `elixir-ingredient-labels.json` | Notes |
|------|-----------|-------------------------------------|--------|
| **Creature** (`type` includes `Creature`) | 39 | 38 | **Insect Parts** has no row — generic mixed bundle; resolver should not infer one `effectFamily`. |
| **Monster** (`type` includes `Monster`) | 64 | 16 | **Sparse by design:** neutral horns/fangs/guts (no element) use **`itemRarity`** only. |

**Monster names with no label (expected):**

- **Ancient line (6):** `Ancient Core`, `Ancient Gear`, `Ancient Screw`, `Ancient Shaft`, `Ancient Spring`, `Giant Ancient Core` — `type: Monster` in export; no `effectFamily` here (not “organic elixir critter” tags).
- **Non-organic (2):** `Gibdo Bandage`, `Like Like Stone` — excluded from this file.
- **Cooked / meal (5):** `Monster Cake`, `Monster Curry`, `Monster Rice Balls`, `Monster Soup`, `Monster Stew` — food, not mixer ingredients unless you add a rule later.
- **Neutral organic parts (34):** e.g. `Bokoblin Horn`, `Chuchu Jelly`, `Golden Skull`, `Keese Wing`, `Lizalfos Tail`, `Octo Balloon`, `Stal Skull`, … — no `element` / no special family; potency from rarity in code. (Undead-tagged items without skulls: `Spider's Eye`, `Poe Soul`, plus Gibdo parts.)

Every key in `elixir-ingredient-labels.json` matches an `itemName` in the export (no typos).

---

# 🎯 Design Goals

### Predictable
Players should be able to learn how mixing works without staff help.

### Composable
New materials should work automatically via tags, not new code everywhere.

### Bounded
- Conflicts are handled clearly
- No accidental “god elixirs”
- Failures are intentional

### Integrated
All results still go through:
- `ELIXIR_EFFECTS`
- normal item usage

---

# 🧠 Mixing Model

## Core Flow

1. Player selects ingredients
2. System resolves outcome
3. If valid → consume materials + stamina
4. Grant **one** elixir item

---

## Resolution Approaches

### A. Explicit Recipes (Safest)

Each combo is defined:

```
inputs → output
```

Pros:
- very easy to balance
- no surprises

Cons:
- lots of maintenance
- not flexible

---

### B. Tag-Based (BotW Style)

Ingredients have tags:

```
spicy, electro, hearty, etc
```

System:
- collects tags
- applies rules
- resolves to an elixir

Pros:
- flexible
- scalable

Cons:
- needs strong conflict rules

---

### C. Hybrid (Recommended)

- Tags determine **effect family**
- Small override table handles edge cases

This keeps flexibility without chaos.

---

# ⚖️ Suggested Rules

- One **primary effect only**
- Extra ingredients:
  - increase potency
  - reduce stamina cost
  - extend duration

- Conflicts:
  - fail → dubious
  - OR pick dominant effect
  - OR downgrade

- Element control:
  - jelly (or equivalent) can influence outcome

- Optional:
  - failure still gives a weak item instead of nothing

- Witch job:
  - still gate for full-strength elixirs

---

# 🤖 Bot Responsibilities

Mixer must:

- load character + inventory
- resolve outcome **before consuming anything**
- validate all requirements
- consume materials + stamina in one action
- output exactly one item
- ensure item exists in DB
- log mixes for balancing

---

# 🔧 Implementation

## Command

```
/mix
```
or
```
/brew
```

---

## Module

```
elixirMixingModule.js
```

Returns:

```
{
  outputItemName,
  reason,
  consumed
}
```

---

## Data Changes (Optional)

Add tags to materials:

```
recipeTag: "spicy"
```

---

## Important Rule

Do NOT duplicate buff logic.

Everything must still flow through:
- `ELIXIR_EFFECTS`
- normal item usage

---

# 🗺️ Roadmap

### Phase 0 — Parity Check
- Make sure all elixirs match definitions

---

### Phase 1 — Recipe-Based Mixer
- Recreate current crafting via mixer
- proves system works

---

### Phase 2 — Tag System
- Add tags to materials
- allow simple mixes

---

### Phase 3 — Conflict + Tiers
- add failure states
- add potency scaling
- add logging

---

### Phase 4 — Discovery (Optional)
- recipes found through gameplay

---

# 🧪 Canon Reference (BotW / TotK)

## Basic Rules

Elixirs require:
- 1 critter
- 1 monster part
- optional extras

Same-type ingredients:
→ stronger / longer effects

---

## Monster Part Tiers

- Tier 1 → short duration
- Tier 2 → medium
- Tier 3 → long

Critical success:
→ +5:00 duration

---

## Core Elixirs

- Chilly → heat resist
- Spicy → cold resist
- Fireproof → flame guard
- Electro → shock resist
- Hasty → speed
- Sneaky → stealth
- Energizing → stamina restore
- Enduring → extra stamina
- Mighty → attack up
- Tough → defense up
- Hearty → extra hearts

---

## TotK Additions

- Bright → light
- Sticky → anti-slip

---

# 🔄 Tinglebot Mapping

Convert open-world effects into bot systems:

- Chilly → heat hazard reduction
- Spicy → cold hazard reduction
- Fireproof → fire mitigation
- Electro → electric mitigation
- Hasty → faster travel / fewer ambushes
- Sneaky → avoid encounters
- Energizing → stamina restore
- Enduring → extra stamina chunk
- Mighty → attack bonus
- Tough → defense bonus
- Hearty → heal + buffer
- Bright → dark area bonus
- Sticky → rain/climb protection

---

# ⚙️ System Rules (Bot-Specific)

- Only **one active elixir**
- Resistance types are mutually exclusive
- Consumption is **event-based**

Optional:
- fallback benefit if never triggered

Always show:
- what the buff does
- when it triggers
- what it affects

---

# ⚖️ Mixing Balance

## Potency Model

- critter → effect type
- monster part → duration/power
- catalyst → modifier

---

## Conflict Rules

1. dominant tag wins
2. equal conflict → failure/dubious
3. compatible → upgraded version

---

## Balance Lever

Better mixes require:
- rarer materials
- higher stamina cost

---

# 🚀 Rollout Plan

1. launch with existing elixirs
2. add new ones behind config flags
3. track usage data
4. adjust based on real behavior

---

# ✅ Decide These First (Implementation Checklist)

Before writing mixer code, lock these decisions so you do not rebalance everything twice.

## 1) Item tagging model

Decide exactly which fields every ingredient needs:

- `effectFamily` (mighty, sneaky, spicy, etc.)
- `ingredientRole` (critter, monsterPart, catalyst, optionalFood)
- `tier` (use `itemRarity` first, unless you add explicit mix tier later)
- `element` (fire, ice, electric, none)

Recommended for current schema:

- derive `ingredientRole` from `type` first (since `ItemModel` already has `type: string[]`)
- only add a dedicated `ingredientRole` field if `type` becomes too ambiguous in real data

Also decide where tags live:

- in `ItemModel` directly, or
- in a separate resolver map keyed by `itemName`

## 2) Allowed input rules

Define what a valid mix requires:

- minimum 1 critter + 1 monster part?
- max ingredients per mix (2, 3, 5)?
- allow optional food or no?
- can players include duplicate ingredients?

## 3) Output resolution rules

Pick one primary resolver path now:

- fixed recipe table
- tag resolver
- hybrid (recommended)

Then lock tie-breakers:

- dominant family wins?
- tied incompatible families = dubious/fail?
- tied compatible families = stronger tier?

## 4) Power formula

Decide your balancing formula so outputs are predictable:

- critter sets base effect
- monster part tier adds potency/charge budget
- catalyst modifies chance, potency, or charge count
- hard caps per elixir family

### Recommended conversion: duration -> charges

Because Tinglebot elixirs are event-driven (not real-time), convert Zelda duration into **number of triggers**.

- `charges` = how many matching actions the buff can affect before consumption
- keep one active elixir buff; that buff can now have `charges > 1`
- consume one charge each time the effect actually triggers

Suggested starter model:

- base charges from critter rarity:
  - rarity 1-2 -> 1 charge
  - rarity 3-4 -> 2 charges
  - rarity 5+ -> 3 charges
- monster part tier adds +0/+1 charges (cap at 3 or 4 to avoid runaway power)
- rare catalyst can add +1 charge or +potency, but not both

This keeps the current single-buff architecture while making "duration-like" value possible in bot gameplay.

## 5) Consumption behavior

Confirm this for every elixir family:

- what exact event consumes it
- whether it can expire without trigger (yes/no)
- whether fallback value exists if never triggered

## 6) Slot and stacking policy

Lock stacking rules early:

- one active elixir total (recommended)
- resistance subgroup mutually exclusive (yes/no)
- does using a new one always overwrite old one

## 7) Economy + progression

Choose your economy targets:

- expected crafts per day/week
- average stamina cost by tier
- rarity gates for top-tier outcomes
- whether failed mixes refund anything

## 8) New TotK effects in bot terms

Define these before adding content:

- `Bright`: exactly which activities/conditions grant bonus
- `Sticky`: which travel/weather penalties it cancels

## 9) UX + command flow

Decide player flow:

- one-shot command (`/mix`) vs guided steps/buttons
- show preview result before confirm (yes/no)
- what failure messages must always appear

## 10) Analytics and tuning loop

Define metrics before launch:

- mixes attempted vs successful
- top recipes by guild
- buff trigger rate (how often consumed)
- underused and overused elixirs

If these are tracked from day 1, balancing becomes fast and objective.

---

# 📂 Related Files

- `elixirModule.js`
- `crafting.js`
- `item.js`
- `ItemModel.js`

---

# 📝 Notes

This is a working design doc.

It will change as:
- balance changes
- systems expand
- real usage reveals issues :contentReference[oaicite:0]{index=0}