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
| `docs/elixir-ingredient-labels.json` | **Sparse** map. **Rule:** **`Creature`** rows use **`effectFamily` only** (boost / elixir family). **`Monster`** rows use **`element` only** (fire, ice, undead, …). Never mix both keys on one item. Organic scope and exclusions unchanged. Omitted names → no label. |

### Standard reference: `effectFamily` (critters)

Used on **`Creature`** items in `elixir-ingredient-labels.json`. Each value is the **primary effect class** a critter contributes when mixing. Behavior below matches `ELIXIR_EFFECTS` / `elixirModule.js` where a row exists; unimplemented families are **mixer targets** until wired into `ELIXIR_EFFECTS`.

| `effectFamily` | Role | What it does (Tinglebot) |
|------------------|------|---------------------------|
| `chilly` | Resistance / weather | Less damage from water-tagged threats; helps vs blight-rain-style penalties (`waterResistance`, `blightResistance`). |
| `spicy` | Cold resistance | Less damage from ice/cold enemies; expedition **cold** hazard protection when rules allow. |
| `fireproof` | Heat / fire resistance | Less damage from fire enemies; expedition **heat** hazard protection when rules allow. |
| `electro` | Shock resistance | Less damage from electric enemies; expedition **thunder** hazard protection when rules allow. |
| `enduring` | Stamina pool | Temporary extra stamina chunk until consumed on stamina activities. |
| `energizing` | Stamina restore | Stamina recovery when the elixir fires (instant or on gather/loot/craft per rules). |
| `hasty` | Speed / travel | Faster travel, rush bonuses, fewer bad travel rolls where implemented. |
| `hearty` | Vitality | Healing and/or temporary extra hearts until consumed on damage/combat. |
| `mighty` | Offense | Attack boost for combat / help wanted / raid / loot. |
| `tough` | Defense | Defense boost for the same combat loop. |
| `sneaky` | Stealth | Stealth and flee bonuses on gather, loot, travel. |
| `fairy` | Special recovery | Fairy-tonic style outcomes (strong heal / special rules) — define in resolver; not a standard resistance line. |
| `bright` | Light / exploration | Dark-area / night / cave bonuses, trap stumble reduction — **define in resolver**; no `ELIXIR_EFFECTS` entry yet. |
| `sticky` | Traction | Rain / ice / slip penalties on travel or climb checks — **define in resolver**; no `ELIXIR_EFFECTS` entry yet. |

### Standard reference: `element` (monster parts)

Used on **`Monster`** items only. Tags **material affinity** for parts (jelly color, elemental wings/tails, etc.); the mixer uses this to bias resistance output or potency, not to replace `effectFamily` on critters.

| `element` | Role | What it does (Tinglebot) |
|-----------|------|---------------------------|
| `fire` | Fire affinity | Biases fire-themed outputs; pairs with fireproof/spicy lines; colored **Red** jelly / fire keese / fire lizalfos tail. |
| `ice` | Ice / cold affinity | Biases ice/cold outputs; **White** jelly, ice keese, icy lizalfos tail, **Freezard Water**. |
| `electric` | Shock affinity | Biases electric outputs; **Yellow** jelly, electric keese, yellow lizalfos tail. |
| `undead` | Gloom / curse | Blight-adjacent or curse-themed modifiers; **Gibdo** parts, `Spider's Eye`, **`Poe Soul`**. |

---

### What actually runs in the bot (decision: ingredients vs buff)

There are **two different things** — do not confuse them:

| Layer | Data | When it matters |
|-------|------|-----------------|
| **Ingredient tags** | `docs/elixir-ingredient-labels.json` (`effectFamily` on critters, `element` on parts) | **Mixer only (not built yet).** Tags do **not** read into `character.buff` by themselves. |
| **Active elixir buff** | `character.buff` + `ELIXIR_EFFECTS` in `bot/modules/elixirModule.js` | **Live today.** Set when someone uses an elixir item (`/item`, crafting, shops). Loot, travel, explore, combat, help wanted, raid, flee, etc. call `getActiveBuffEffects(character)`. |

**`element` on monster parts:** The game does **not** apply these labels during combat or travel yet. They exist so the **mixer** can choose an output elixir (e.g. red jelly biases fire-themed results). The **output elixir** then behaves like any other elixir and fills `buff.effects` from `ELIXIR_EFFECTS`.

**`effectFamily` on critters:** Same story until mixing exists — the **named elixir items** (Mighty Elixir, Chilly Elixir, …) are what actually set `buff.type` and the numbers below.

---

### Runtime buff effects (`character.buff.effects`) — what each stat does in code

Values come from `ELIXIR_EFFECTS` when the elixir is applied (often `1.5` for resistances, `1` for boosts, etc.). Code reads **`getActiveBuffEffects`** (`elixirModule.js`).

| `buff.effects` field | Tied elixir families (`buff.type`) | What it does in the bot |
|----------------------|-------------------------------------|-------------------------|
| `attackBoost` | `mighty` | Added to attack in `buffModule.calculateAttackBuff` → used in encounter / loot combat resolution. |
| `defenseBoost` | `tough` | Added to defense in `calculateDefenseBuff`, then defense is **×1.5** (floor) for success weighting. |
| `electricResistance` | `electro` | If the attacker is electric-type (`encounterModule.calculateDamage` + monster `element` / name), mitigates damage by a **percentage**: `reduction = min(0.95, stat × 0.5)`; dealt damage = `base × (1 − reduction)`. Same cap/coefficient for all elemental resists below. |
| `fireResistance` | `fireproof` | Same **percentage** mitigation for **fire**-type attackers. **Does not** affect blight rain infection (only `blightResistance` does). |
| `coldResistance` | `spicy` | Same for **ice**-type attackers; `ice` damage type aliases to cold resistance in `buffModule.getDamageResistance`. |
| `waterResistance` | `chilly` | Same for **water**-type attackers in `encounterModule`. |
| `blightResistance` | `chilly` | In **blight rain** (travel, gather, loot, help wanted, etc.), lowers blight infection chance **−30% per point** of stat in those paths (values clamped); fire resistance is not part of this. |
| `speedBoost` | `hasty` | **Explore:** added to the d100-style roll in `rngModule.calculateFinalValue`. **Travel:** `calculateSpeedBuff` adds to speed when consumed on travel. |
| `stealthBoost` | `sneaky` | **Explore:** added to the same roll in `calculateFinalValue` (with speed). **Gather/loot:** stealth calculations in `buffModule` / `loot` flows. |
| `fleeBoost` | `sneaky` | **Flee:** `rngModule.attemptFlee` adds **`fleeBoost × 15%`** to base flee chance (capped). |
| `staminaBoost` | `enduring` | Extra max/current stamina until the buff is consumed (see `consumeElixirBuff` / stamina activities). |
| `staminaRecovery` | `energizing` | Stamina restore; consumed on gather / loot / crafting per `shouldConsumeElixir`. |
| `extraHearts` | `hearty` | Temporary hearts buffer until consumed on combat-style activities. |

**Consumption:** `shouldConsumeElixir(character, activity, context)` in `elixirModule.js` decides **when** the buff is used up (e.g. matching monster element for resists, `travel` for hasty, combat for mighty). If activity does not match, the buff can stay active.

---

### Ingredient labels → future mixer → same runtime

When mixing is implemented:

1. Critter **`effectFamily`** + part **`element`** + rarity resolve to **one output elixir item name** (or failure).
2. That item must already exist in the DB and in `ELIXIR_EFFECTS` so `/item` behavior stays unchanged.
3. **`bright`**, **`sticky`**, **`fairy`:** not in `ELIXIR_EFFECTS` yet — add effects + `CharacterModel.buff.effects` fields (if needed) before they do anything in combat/travel.

**Resolver order (recommended):**

1. Load the item from DB/export.
2. Derive **ingredientRole** from `type` using `elixir-type-mapping.json`.
3. If `itemName` exists in `elixir-ingredient-labels.json`, read **critter → `effectFamily`**, **monster part → `element`** for the mixer only.
4. Otherwise, neutral parts use **itemRarity** only; gear may still use `ItemModel.element` when relevant.

New fields on `ItemModel` are optional later; the sidecar JSON keeps mixing data versioned next to exports.

### Coverage check (`tinglebot.items.json` export)

Run against current `docs/tinglebot.items.json` (763 items):

| Pool | In export | In `elixir-ingredient-labels.json` | Notes |
|------|-----------|-------------------------------------|--------|
| **Creature** (`type` includes `Creature`) | 39 | 38 | **Insect Parts** has no row — generic mixed bundle; resolver should not infer one `effectFamily`. |
| **Monster** (`type` includes `Monster`) | 64 | 15 | **Sparse by design:** neutral horns/fangs/guts (no element) use **`itemRarity`** only. |

**Mixer rules (hard reject):**

- **Ancient materials** cannot be used: `Ancient Core`, `Ancient Gear`, `Ancient Screw`, `Ancient Shaft`, `Ancient Spring`, `Giant Ancient Core`.
- **Cooked food** (`Monster` type meals) cannot be used: `Monster Cake`, `Monster Curry`, `Monster Rice Balls`, `Monster Soup`, `Monster Stew`.

**Monster names with no label (expected) — other cases:**

- **Non-organic (2):** `Gibdo Bandage`, `Like Like Stone` — excluded from `elixir-ingredient-labels.json` and not valid mixer inputs.
- **Neutral organic parts (~35):** e.g. `Bokoblin Horn`, `Chuchu Jelly`, `Golden Skull`, `Keese Wing`, `Lizalfos Tail`, `Monster Extract`, `Octo Balloon`, `Stal Skull`, … — valid ingredients when rules allow; no `element` in labels → potency from **`itemRarity`** in code. (Undead-tagged: `Spider's Eye`, `Poe Soul`, Gibdo parts.)

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