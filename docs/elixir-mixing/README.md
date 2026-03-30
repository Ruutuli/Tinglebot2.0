# Elixir mixing

Design notes for a **mixer command** that turns ingredients into a real item, then uses the **same path as today**: `ELIXIR_EFFECTS` in `elixirModule.js`, `/item`, `character.buff`, and `getActiveBuffEffects` elsewhere. No second set of buff math.

| | |
| --- | --- |
| **Now** | Fixed recipes (e.g. Witch `crafting.js`) → one elixir item. |
| **Later** | Optional resolver **before** consume; output must still be an item that exists in the DB **and** in `ELIXIR_EFFECTS`. |

---

## Rules that bite if you get them wrong

- **Chilly** = heat and **fire** only (`fireResistance`). It is **not** water or blight.
- **Sticky** = water (`waterResistance`, `plusBoost`). **Bright** = blight (`blightResistance`).
- **Hearts:** `extraHearts`, `recoverHearts`, and any heart outcomes are **whole full hearts** (integers ≥ 0). No halves or fractions in storage or display.
- **Stamina:** **5 chunks = 1 wheel.** Refill (`staminaRecovery`) and extra max (`staminaBoost`) use **whole chunks** only.

---

## Files and potency

| File | What it’s for |
| --- | --- |
| `docs/elixir-ingredient-labels.json` | Maps item names → **`effectFamily`** (critters) or **`element`** (monster parts). **`none`** = neutral filler. Critters + monster parts only (no cooking plants/fish/meals). One of the two keys per row, never both. Version and ordering: see `$comment` in the file (~92 keys in v7). |

**`elixirLevel`** (potency): Catalog has one name per elixir (e.g. `Mighty Elixir`). On each **inventory** stack, **`1`** = basic, **`2`** = mid, **`3`** = high; missing on old rows = **1**. Stacks with different levels **don’t merge**. Optional **`ItemModel.elixirLevel`** is the default when `addItemInventoryDatabase` is called without `options.elixirLevel`. Magnitudes scale via **`ELIXIR_LEVEL_FACTORS`** in `elixirModule.js` (**1.0 / 1.15 / 1.3** — tunable). **`/item`** uses the **lowest** `elixirLevel` stack first. Active buff can store **`character.buff.elixirLevel`**.

**Catalog `itemRarity`** values for labeled mixer ingredients are in [Item catalog](#item-catalog) (from **`tinglebot.items.json`**). How those numbers map to brew strength is below.

### Rarity and mixer effectiveness

For the **mixer** (future `/mix` / `/brew`), each ingredient’s **`itemRarity` (1–10)** is **effectiveness in the elixir**, not “must be rare in the world.”

| Idea | Meaning |
| --- | --- |
| **`R_agg`** | Combine critter + part rarities (e.g. sum, max, or weighted — **TBD** when the command ships). |
| **Low `R_agg`** | Baseline band: smaller stamina chunks, lower resist %, lower hearty band, fewer **charges** — see live magnitudes in `ELIXIR_EFFECTS` / tier notes in this doc. |
| **High `R_agg`** | Pushes toward **middle / high** bands in the design tables (chunks, resists, hearts). |
| **Example** | Critter **2** + part **2** → weak aggregate. Critter **6** + part **8** → much stronger aggregate. |
| **Fairy** | Catalog **`itemRarity`** is in the item table; **Fairy Tonic** heal-on-use is **`ELIXIR_EFFECTS`** + `/item`. For **mixer tier math**, Fairies get a **minimum effective rarity** — see [Mixer brew score (live)](#mixer-brew-score-live). |
| **Chuchu Egg** | **Never** a mixer part — hatch / pet + 100-jelly compression only. Use **Chuchu Jelly** as the neutral part. |

**Today:** Witch crafting and non-mixer `/item` still use fixed recipes; **`itemRarity`** also affects loot weights and explore rolls. Elixir **potency tier** from the **mixer** follows [Mixer brew score (live)](#mixer-brew-score-live). Older **`R_agg`** design targets for future stat bands remain under [Future rarity tiers](#future-rarity-tiers-r_agg).

### Mixer brew score (live)

Implemented in **`bot/modules/elixirBrewModule.js`** (`mixerBrewOutcomeFromIngredientRarities`, `countMixerExtraSynergy`, `effectiveMixerIngredientRarity`). Constants: **`MIXER_SYNERGY_BONUS_PER_EXTRA`** `0.45`, **`MIXER_SYNERGY_BONUS_MAX`** `1.35`, Fairy floor **`5`**.

| | |
| --- | --- |
| **Pot** | One **critter** + one **monster part** + up to **three** optional extras |
| **Normalize** | Each ingredient’s **`itemRarity`** → clamp **1–10** (invalid/low → 1, above 10 → 10) |
| **Fairy / Mock Fairy** | Effective rarity for blend is **`max(catalog, 5)`** — catalog may still list **1** |
| **Peak / average / weakest** | **Max**, **mean**, and **min** of the normalized rarities (all ingredients in the pot) |
| **Blend** | `blendRaw = (2 × peak + average) / 3` — best single ingredient counts more than a flat mean |
| **Synergy** | **`+0.45`** per optional extra that matches (same **effectFamily** critter, or on-theme monster part on threaded elixirs), capped at **`+1.35`** (three extras) |
| **Score** | `round(blendRaw + synergyRaw)`, clamp **1–10** |
| **Tier → `elixirLevel`** | **1–3** Basic (**1**), **4–6** Mid (**2**), **7–10** High (**3**) |

The in-Discord brew embed only shows **tier**, **numeric score**, and **bands**; this section is the full breakdown.

---

## Mixer recipe (source of truth)

**Two slots:** one **critter** + one **monster part**. Not the old Witch “pick any of these critters” columns for the mixer.

- **Critter:** Same **`effectFamily`** as the output. If two critters **tie on the same `itemRarity` number** (same effectiveness tier), use this order: Cold Darner before Winterwing; Electric before Thunderwing; Warm before Summerwing; Restless Cricket before Energetic Rhino Beetle; Sticky Lizard before Sticky Frog; **Bright** uses **Deep Firefly** (not Blessed Butterfly); Hightail before Hot-Footed Frog. **Enduring:** only **Tireless Frog** is labeled in v7 JSON.
- **Part:** Usually **`element`: `none`** (Chuchu Jelly, Bokoblin Horn, … — **not** Chuchu Egg). **Chilly** (heat / fire) needs a **fire**-aligned part (e.g. **Red Chuchu Jelly**).
- **Jelly rule:** **Chuchu Jelly** is the neutral part slot — don’t treat “any part + jelly” as two parts. **Chilly thread:** **Red Chuchu Jelly** *is* the fire part, not a second jelly.

| Elixir | Critter + part |
| --- | --- |
| Bright | Deep Firefly |
| Chilly | Cold Darner (heat / fire — **Fireproof Lizard** is this family) |
| Electro | Electric Darner |
| Enduring | Tireless Frog |
| Energizing | Restless Cricket |
| Hasty | Hightail Lizard |
| Hearty | Hearty Lizard |
| Mighty | Bladed Rhino Beetle |
| Sneaky | Sunset Firefly |
| Spicy | Warm Darner |
| Sticky | Sticky Lizard |
| Tough | Rugged Rhino Beetle |

**Fairy Tonic:** **Fairy** + part (legacy materials). **No Fairy Dust** in this recipe.

### Economy snapshot (`tinglebot.items.json`)

Witch-era numbers; **mixer baseline may be nerfed** — revisit buy/sell, **`modifierHearts`**, **`staminaRecovered`**, **`staminaToCraft`**, rarity when balance locks. Buff strength lives in **`ELIXIR_EFFECTS`**, not duplicated here.

† Rebalance with nerfed baseline. **`staminaToCraft`** is a string in JSON. **`craftingJobs`:** `["Witch"]` today; add **`Mixer`** when the command ships.

| Item | Buy | Sell | Rarity | Hearts† | Stamina rec.† | Craft | `buff.type` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Chilly Elixir | 750 | 190 | 5 | 0 | 0 | 4 | `chilly` |
| Electro Elixir | 750 | 190 | 5 | 0 | 0 | 3 | `electro` |
| Enduring Elixir | 750 | 190 | 5 | 2 | 4 | 4 | `enduring` |
| Energizing Elixir | 750 | 190 | 5 | 0 | 7 | 4 | `energizing` |
| Fairy Tonic | 1200 | 300 | 5 | 9999 | 0 | 4 | `fairy` |
| Hasty Elixir | 750 | 190 | 5 | 0 | 0 | 3 | `hasty` |
| Hearty Elixir | 750 | 190 | 5 | 20 | 0 | 3 | `hearty` |
| Mighty Elixir | 750 | 190 | 5 | 0 | 0 | 4 | `mighty` |
| Sneaky Elixir | 750 | 190 | 5 | 0 | 0 | 4 | `sneaky` |
| Spicy Elixir | 750 | 190 | 5 | 0 | 0 | 4 | `spicy` |
| Tough Elixir | 750 | 190 | 5 | 0 | 0 | 4 | `tough` |
| Bright Elixir | 750 | 190 | 5 | 0 | 0 | 4 | `bright` |
| Sticky Elixir | 750 | 190 | 5 | 0 | 0 | 4 | `sticky` |

**Legacy Witch** still uses **OR** critters per row (mixer ignores that list):

Chilly: Cold Darner, Winterwing, Fireproof Lizard · Electro: Electric Darner, Thunderwing · Enduring: Tireless Frog · Energizing: Energetic Rhino Beetle, Restless Cricket · Fairy: Fairy · Hasty: Hightail, Hot-Footed · Hearty: Hearty Lizard, Hearty Blueshell Snail · Mighty: Bladed Rhino Beetle, Razorclaw Crab · Sneaky: Sunset Firefly, Sneaky River Snail · Spicy: Warm Darner, Summerwing · Tough: Rugged Rhino Beetle, Ironshell Crab.

**Weather (resist elixirs):** baseline **25%** mitigation for the matching hazard; stacks with extras — see [Weather stacking](#weather-stacking). **Charges** replace duration (map from rarity/tier later).

---

## Labels (`elixir-ingredient-labels.json`)

Add labels **before** the mixer trusts new items.

- **`effectFamily`** must **match** the elixir you’re making (e.g. Electric Darner can’t anchor Chilly). **`"none"`** = filler — steers strength/rarity, not family.
- **`element`** on parts: **`none`** = generic. **`fire` / `ice` / `electric` / `undead`** only when they match that elixir’s thread (see table).

**`none` filler** comes from Creature / Monster / Ancient Parts in `tinglebot.items.json`, minus: Ancient Core, Gear, Screw, Shaft, Spring, Giant Ancient Core; cooked Monster meals; Insect Parts bundle; Gibdo Bandage; Like Like Stone; Freezard Water. Fairy Dust: label if used elsewhere; **not** for Fairy Tonic here.

### Element-aligned parts

| `element` | Examples | Pair with |
| --- | --- | --- |
| `fire` | Fire Keese Wing, Red Chuchu Jelly, Red Lizalfos Tail | Chilly (heat / fire) |
| `ice` | Ice Keese Wing, Icy Lizalfos Tail, White Chuchu Jelly | Spicy |
| `electric` | Electric Keese Wing, Yellow Chuchu Jelly, Yellow Lizalfos Tail | Electro |
| `undead` | Gibdo parts, Poe Soul, Spider's Eye | Bright |
| `none` | Chuchu Jelly, horns/claws, most drops (no Chuchu Egg) | Any (filler / strength) |

### Fairy / Mock Fairy (additive)

Only as an **extra** on an otherwise valid brew: output family stays from critter + part (e.g. Chilly + Mock Fairy → still **Chilly Elixir**, not Tonic unless Fairy leads the recipe). On consume: normal elixir effects **plus** **`recoverHearts`** — refills **current** toward **real max** only (not `extraHearts`). Full hearts only. **At most one** Fairy or Mock Fairy per brew. Treat `effectFamily` **`fairy`** so it never **conflicts** when additive.

**Who counts as a critter:** labeled insects, crabs, snails, lizards, frogs, fairies — not mushrooms, fish-as-food, plants, or meals. **Full list + `itemRarity`:** [Item catalog](#item-catalog) (synced from **`tinglebot.items.json`**; refresh when you re-export).

---

## Families → effects (and where they matter)

`effectFamily` lines up with **`character.buff.type`** when the buff is active. Combat resist uses `reduction = min(0.95, stat × 0.5)` on matching elemental hits (`encounterModule.calculateDamage`).

**Climate vs combat:** Chilly = heat + fire → `fireResistance`. Spicy = cold + ice → `coldResistance`. Sticky = wet → `waterResistance` + `plusBoost`. Bright = blight → `blightResistance`. Electric = thunder + electric foes. Heat and fire share **`fireResistance`** (no separate heat stat in code).

| Family | `buff.effects` | In plain terms | Mechanics |
| --- | --- | --- | --- |
| `chilly` | `fireResistance` | Heat + fire | combat, exploring, travel |
| `spicy` | `coldResistance` | Cold + ice | combat, exploring, travel |
| `electro` | `electricResistance` | Shock / lightning | combat, exploring |
| `enduring` | `staminaBoost` | Extra max stamina (chunks): **tier × max** at `/item` (Basic **×1.2**, Mid **×1.3**, High **×1.4** of pre-drink max; gain = `ceil(max×tier)−max`, min +1) | exploring, gathering, looting, travel |
| `energizing` | `staminaRecovery` | Stamina refill (chunks) | crafting, gathering, looting |
| `hasty` | `speedBoost` | Speed checks; travel can halve days | exploring, travel |
| `hearty` | `extraHearts` | Temporary hearts at `/item`: **tier × max hearts** (Basic **×1.2**, Mid **×1.3**, High **×1.4**; gain = `ceil(max×tier)−max`, min +1) — live `/item` adds to **current** only | combat, gathering, helpwantedquests, looting, raid |
| `mighty` | `attackBoost` | Attack-weighted success | combat, helpwantedquests, looting, raid |
| `tough` | `defenseBoost` | Defense (×1.5 floor in `buffModule`) | combat, helpwantedquests, looting, raid |
| `sneaky` | `stealthBoost`, `fleeBoost` | Stealth + flee — **not** loot-job encounter rates | exploring, gathering, looting, travel |
| `fairy` | `recoverHearts` | Heal toward existing max only | combat, gathering, helpwantedquests, looting, exploring, raid |
| `bright` | `blightResistance` | Blight; light / maze angles (flags TBD) | exploring, gathering |
| `sticky` | `waterResistance`, `plusBoost` | Wet/rain + extra yield — **not** Sneaky | combat, crafting, exploring, gathering, looting |

**Hearty vs Fairy:** `extraHearts` vs `recoverHearts` — different on purpose. **Sneaky vs Sticky:** stealth/flee vs water + yield. **Blight:** only on Bright, not Chilly.

### Weather stacking

For matching hazard (hot → chilly, cold → spicy, thunder → electro, wet → sticky): think of **W** = “how much you dodge the bad outcome.” Base resist elixir: **W = 25%**. Extras add up, then clamp:

`W_total = min(W_cap, 25 + bonus_critters + bonus_neutral + bonus_elemental + bonus_stat)` with **W_cap = 70** (tunable). Above 25%, only **compatible** extras count (same mixing rules — no second family anchor).

- Same-family extra critters: **+5%** each, **max +10%** from critters (usual cap: two extras).
- Neutral parts (`element: none`): **+1% × itemRarity** each, subtotal **capped +20%**.
- One matching elemental part per brew: **+5%** (first matching part only).
- Optional tie to resist stat: `bonus_stat = min(15, floor(10 × (stat − 1.0)))` — skip if weather should ignore buff stats.

Separate from combat elemental reduction unless you wire them together.

**Mechanic names** (for descriptions): `combat`, `crafting`, `exploring`, `gathering`, `helpwantedquests`, `looting`, `raid`, `travel`.

**Consumption:** charges / `shouldConsumeElixir` — decide after mechanics are locked.

---

## What the code does today

Numbers come from **`ELIXIR_EFFECTS`** in `elixirModule.js` — one static `effects` blob per elixir name (no low/mid/high tiers in code yet). When the mixer ships, **`itemRarity`** aggregation might map to stronger values ([Future rarity tiers](#future-rarity-tiers-r_agg)); until then, ignore that for combat math.

| Topic | Rule | Where |
| --- | --- | --- |
| Weather (design) | Base 25%; keys: heat→`fireResistance`, cold→`coldResistance`, thunder→`electricResistance`, wet→`waterResistance` | wire in `weatherService` / explore / travel |
| Elemental hit damage | `1 − min(0.95, resistanceStat × 0.5)` | `encounterModule.applyElementalResistancePercent` |
| Blight rain | Base 75% infection; each `blightResistance` −10 pp, clamp [10%, 95%] | `travel.js` |
| Flee | `min(0.95, 0.50 + failedFlee×0.05 + fleeBoost×0.15)` | `rngModule.attemptFlee` |
| Attack / Defense / Speed / Stealth | buff modules add stat; defense uses ×1.5 floor | `buffModule` |
| Travel (Hasty) | `speedBoost > 0` → days `max(1, ceil(days/2))` | `travel.js` `getTravelDuration` |

### `ELIXIR_EFFECTS` snapshot (item names must match)

| Item | `type` | Effects |
| --- | --- | --- |
| Chilly Elixir | `chilly` | `fireResistance: 1.5` |
| Bright Elixir | `bright` | `blightResistance: 1` |
| Sticky Elixir | `sticky` | `waterResistance: 1.5`, `plusBoost: 1` |
| Spicy Elixir | `spicy` | `coldResistance: 1.5` |
| Electro Elixir | `electro` | `electricResistance: 1.5` |
| Enduring Elixir | `enduring` | `staminaBoost` placeholder in `ELIXIR_EFFECTS`; **live `/item`** uses `scaleElixirEffects` + `maxStaminaForEnduring` → chunk delta per tier (**×1.2 / ×1.3 / ×1.4**) |
| Energizing Elixir | `energizing` | `staminaRecovery: 2` |
| Hasty Elixir | `hasty` | `speedBoost: 1` |
| Hearty Elixir | `hearty` | `extraHearts` placeholder in `ELIXIR_EFFECTS`; **live `/item`** uses `scaleElixirEffects` + `maxHeartsForHearty` → heart delta per tier (**×1.2 / ×1.3 / ×1.4**) |
| Mighty Elixir | `mighty` | `attackBoost: 1.5` |
| Tough Elixir | `tough` | `defenseBoost: 1.5` |
| Sneaky Elixir | `sneaky` | `stealthBoost: 1`, `fleeBoost: 1` |

**Not in object yet:** Fairy Tonic / `fairy` (`recoverHearts`). Legacy **`fireproof`** buff type is still handled as **`chilly`** on consume.

For **`1.5`** resists: same formula as elemental row above.

---

## Future rarity tiers (`R_agg`)

Tinglebot does **not** store BotW-style potency pots. Strength is driven by **`itemRarity`** **1–10** in `tinglebot.items.json` plus an **aggregate rule** (sum / max / weighted — **TBD**).

**`R_agg`** = combined score from ingredient rarities (which rows count — **TBD**). The tables below are **design targets** for low / middle / high bands **after** you implement aggregation — **not** current `ELIXIR_EFFECTS` values.

**Sanity check:** Anchor critter + neutral jelly is often rarity sum **~4–6** (e.g. Cricket 2 + Jelly 2 = 4). That should sit **below** “middle” unless you boost with extras or rarer parts.

### Stat boosts and resists

**—** = no high tier in this sketch. **\*** = new for mixer and/or not standalone in `ELIXIR_EFFECTS` yet.

| Outcome | Family (`effect`) | Base | Middle | High | Live elixir (flat until mixer) |
| --- | --- | ---: | ---: | ---: | --- |
| Attack / Defense / Speed | mighty / tough / hasty | 3 | 5 | 8 | 1.5 / 1.5 / 1 |
| Sneaky | sneaky | 3 | 6 | 9 | 1 / 1 |
| Flame guard | chilly (`fireResistance`) | 3 | 6 | — | 1.5 |
| \* Heat (climate) | chilly (same stat) | 3 | 5 | — | mixer-only second track |
| Cold / Shock / Blight / Sticky | spicy / electro / bright / sticky | 3–4 | 5–6 | 6–8 | see snapshot |

### Hearty — **max multiplier** tiers (live) + `R_agg` design sketch

**Live `/item`:** **`HEARTY_MAX_HEARTS_MULTIPLIERS`** in `elixirModule.js` (**×1.2 / ×1.3 / ×1.4** of max hearts before drink; `computeHeartyExtraHeartsFromMax` / shared `computeTieredGainFromMaxBase`). Same formula as **Enduring**, but hearts go to **temporary** current HP (not a persistent max change on the character sheet in the main `/item` path).

The table below is a **historical design** for fixed **+1…+5** heart bands vs `R_agg` — **not** the live tier numbers; use it only as a rarity balance reference.

| +Hearts (design sketch) | Min `R_agg` |
| --- | ---: |
| 1 | 4 |
| 2 | 5 |
| 3 | 6 |
| 4 | 8 |
| 5 | 10 |

**Critter anchors (critter-only path):** +3 → Hearty Blueshell Snail; +4 → Hearty Lizard (see [Item catalog](#item-catalog) `itemRarity`).

### Energizing — fixed chunk ladder; Enduring — **max multiplier** tiers

**Energizing** = refill (`staminaRecovery`): **Basic +5 / Mid +7 / High +9** chunks (fixed tier ladder). **Enduring** = extra max (`staminaBoost`): **not** the same fixed numbers — **Basic ×1.2 / Mid ×1.3 / High ×1.4** of the character’s **max stamina in chunks** *before* drinking; chunk gain = **`ceil(max × tier) − max`** (minimum **+1** chunk), applied to **max and current**. Both use **integer chunks** only; **5 chunks = 1 wheel**; UI can show wheels as chunks ÷ 5.

Live: **`staminaRecovery`** uses `RESOURCE_ELIXIR_LEVEL_STATS` (**5 / 7 / 9**). **Enduring** uses `ENDURING_MAX_STAMINA_MULTIPLIERS` in `elixirModule.js` (see `computeEnduringStaminaChunkBoost`). The chunk/wheel table below is mainly for **Energizing** and for **rough** display; Enduring’s chunk yield **scales with max stamina**.

| Chunks (Energizing refill *or* rough scale) | Wheels (display) |
| ---: | --- |
| 1–4 | ⅕–⅘ wheel |
| 5 | 1 wheel |
| 6–9 | 1 + ⅕ … ⅘ |
| 10 | 2 wheels |

**`R_agg` bands (design):** Energizing refill — chunks 1–3 → R 1–4; 4–6 → R 4–7; 7–10 → R 7–10. Enduring — historical sketch was **chunks 1–5 → R 1–5; 6–10 → R 6–10** when max gain was fixed; **live Enduring is max-multiplier-based**, so treat those bands as **optional** balance targets for mixer rarity, not a literal chunk ladder. (**R** = aggregated ingredient rarity **1–10**, not chunk count.)

**Critter hints:** Restless Cricket → low refill band; Bright-Eyed Crab / Faron Grasshopper → mid; Golden Insect → upper mid; Energetic Rhino Beetle → high. **Tireless Frog** = enduring. BotW fish/shrooms for stamina are **out of scope** for the mixer; push tiers with **`R_agg`**.

**Bright / Sticky / Fairy:** base or TBD in `ELIXIR_EFFECTS`; tie tiers when the mixer lands.

---

## Item catalog

**Scope:** critters + monster parts only — no mushrooms, fish fillets, plants, meat, or other cooking rows. **Chuchu Egg** is **out of scope** for mixing (see [Rarity and mixer effectiveness](#rarity-and-mixer-effectiveness)). The **`itemRarity`** column below matches **`docs/tinglebot.items.json`** as the live catalog snapshot (re-export may drift; treat the JSON as authoritative when they disagree).

Critters set the elixir **family**; higher **`itemRarity`** values in this table contribute more to **`R_agg`** once the mixer aggregates them. Parts add **element** and **strength** (colored jellies, tails, wings; boss parts often rated higher).

### Critters

| Item | `effectFamily` | BotW-style note | `itemRarity` |
| --- | --- | --- | ---: |
| Blessed Butterfly | `bright` | Bright / glow; blight-adjacent | 4 |
| Deep Firefly | `bright` | Strong bright; maze / dark | 6 |
| Starry Firefly | `bright` | Bright / glow | 2 |
| Cold Darner | `chilly` | Chill / heat & fire | 3 |
| Eldin Roller | `chilly` | Hot-region critter | 2 |
| Fireproof Lizard | `chilly` | Flame guard / heat | 2 |
| Smotherwing Butterfly | `chilly` | Chill | 2 |
| Volcanic Ladybug | `chilly` | Chill | 2 |
| Winterwing Butterfly | `chilly` | Stronger chilly than basic darner | 4 |
| Electric Darner | `electro` | Shock | 2 |
| Thunderwing Butterfly | `electro` | Shock | 2 |
| Tireless Frog | `enduring` | Extra max stamina (chunks) | 2 |
| Bright-Eyed Crab | `energizing` | Mid refill band | 2 |
| Energetic Rhino Beetle | `energizing` | Strong refill | 2 |
| Faron Grasshopper | `energizing` | Mid refill | 2 |
| Golden Insect | `energizing` | Rare / strong refill | 6 |
| Restless Cricket | `energizing` | Lowest refill band | 2 |
| Fairy | `fairy` | Tonic / full heal thread | 1 |
| Mock Fairy | `fairy` | Fairy-like additive | 6 |
| Hightail Lizard | `hasty` | Haste / speed | 2 |
| Hot-Footed Frog | `hasty` | Haste / speed | 2 |
| Lizard Tail | `hasty` | Haste / speed | 2 |
| Sand Cicada | `hasty` | Haste / speed | 4 |
| Hearty Blueshell Snail | `hearty` | Anchors +3 full hearts band | 2 |
| Hearty Lizard | `hearty` | Anchors +4 full hearts band | 2 |
| Bladed Rhino Beetle | `mighty` | Attack up | 2 |
| Deku Hornet | `mighty` | Attack up | 2 |
| Hornet Larvae | `mighty` | Attack up | 2 |
| Razorclaw Crab | `mighty` | Attack up | 2 |
| Sky Stag Beetle | `mighty` | Stronger | 4 |
| Skyloft Mantis | `mighty` | SS pinch / forelimbs | 3 |
| Fabled Butterfly | `sneaky` | Stealth | 6 |
| Sneaky River Snail | `sneaky` | Stealth | 2 |
| Sunset Firefly | `sneaky` | Stealth | 2 |
| Gerudo Dragonfly | `spicy` | Cold resist | 4 |
| Summerwing Butterfly | `spicy` | Cold resist | 2 |
| Warm Darner | `spicy` | Cold resist | 2 |
| Sticky Frog | `sticky` | Water-adjacent | 4 |
| Sticky Lizard | `sticky` | Water-adjacent | 3 |
| Ironshell Crab | `tough` | Defense up | 2 |
| Lanayru Ant | `tough` | Desert swarm (SS) | 2 |
| Rugged Rhino Beetle | `tough` | Defense up | 2 |
| Woodland Rhino Beetle | `tough` | Armored forest beetle (SS) | 2 |

### Monster parts

| Item | `element` | BotW-style note | `itemRarity` |
| --- | --- | --- | ---: |
| Electric Keese Wing | `electric` | Shock affinity | 2 |
| Yellow Chuchu Jelly | `electric` | Electric | 2 |
| Yellow Lizalfos Tail | `electric` | Electric | 4 |
| Fire Keese Wing | `fire` | Fire / heat | 2 |
| Red Chuchu Jelly | `fire` | Fireproof thread | 2 |
| Red Lizalfos Tail | `fire` | Fire | 4 |
| Ice Keese Wing | `ice` | Ice / cold | 2 |
| Icy Lizalfos Tail | `ice` | Ice | 4 |
| White Chuchu Jelly | `ice` | Ice | 2 |
| Gibdo Bone | `undead` | Blight thread | 10 |
| Gibdo Guts | `undead` | Blight thread | 9 |
| Gibdo Wing | `undead` | Blight thread | 10 |
| Poe Soul | `undead` | Dark | 4 |
| Spider's Eye | `undead` | Blight | 5 |
| Blin Bling | `none` | Generic part | 6 |
| Bokoblin Fang | `none` | Common | 3 |
| Bokoblin Guts | `none` | Common | 4 |
| Bokoblin Horn | `none` | Common | 3 |
| Chuchu Jelly | `none` | Baseline neutral | 2 |
| Golden Skull | `none` | Mid | 4 |
| Hinox Guts | `none` | Mid–high | 4 |
| Hinox Toenail | `none` | Mid–high | 5 |
| Hinox Tooth | `none` | Mid–high | 5 |
| Horriblin Claw | `none` | Mid | 6 |
| Horriblin Guts | `none` | Mid | 6 |
| Horriblin Horn | `none` | Mid | 6 |
| Keese Eyeball | `none` | Common | 3 |
| Keese Wing | `none` | Common | 2 |
| Lizalfos Horn | `none` | Mid | 4 |
| Lizalfos Tail | `none` | Mid | 4 |
| Lizalfos Talon | `none` | Mid | 4 |
| Lynel Guts | `none` | Rare | 4 |
| Lynel Hoof | `none` | Rare | 4 |
| Lynel Horn | `none` | Rare | 4 |
| Moblin Fang | `none` | Mid | 4 |
| Moblin Guts | `none` | Mid | 4 |
| Moblin Horn | `none` | Mid | 4 |
| Molduga Fin | `none` | Very rare | 7 |
| Molduga Guts | `none` | Very rare | 7 |
| Monster Claw | `none` | Generic | 3 |
| Monster Horn | `none` | Generic | 2 |
| Octo Balloon | `none` | Common | 3 |
| Octorok Eyeball | `none` | Common | 3 |
| Octorok Tentacle | `none` | Common | 3 |
| Ornamental Skull | `none` | Mid | 2 |
| Rugged Horn | `none` | Mid | 4 |
| Serpent Fangs | `none` | Mid | 4 |
| Stal Skull | `none` | Undead-adjacent | 6 |

---

## Combat elements (reference)

Shared keys: `fire`, `ice`, `electric`, `water`, `earth`, `wind`, `undead`, `light`, `tech`, `none` — see `ELEMENTAL_ADVANTAGES`, `getWeaponElement`, `getMonsterElement` in `elixirModule.js`.

| Element | Strong vs | Weak to |
| --- | --- | --- |
| `fire` | Ice, Wind | Water, Earth |
| `ice` | Water, Electric | Fire |
| `electric` | Water, Wind | Earth |
| `water` | Fire, Earth | Electric, Ice |
| `wind` | Earth, Undead | Fire, Electric |
| `earth` | Electric, Fire | Water, Wind |
| `undead` | Ice, Water | Light, Fire, Wind |
| `light` | Undead | — |
| `tech` | Earth, Wind | Electric, Water |

Elixir resists: chilly / spicy / electro / sticky / bright. Earth / wind / light / tech don’t have full resist paths in the combat helper yet. **Part `element`** in JSON is for the mixer; unlabeled parts stay neutral.

---

## Coverage and roadmap

**Labels:** ~92 keys in v7 export vs ~763 items — only Creature/Monster (and similar) rows that participate in mixing. Roughly 38 critters labeled, 15 `element` monster rows; excludes ancient scrap, cooked monster meals, bundle, Gibdo Bandage, Like Like Stone, **Chuchu Egg**, etc.

**Resolver sketch:** validate → consume → grant one item that exists in `ELIXIR_EFFECTS`. Resolve from labels + **`itemRarity`**; hybrid resolver + small override table; on conflict: fail, dominant tag, or downgrade. **`/mix` or `/brew`** → e.g. `elixirMixingModule.js` → `{ outputItemName, reason, consumed }`.

**BotW vs bot:** BotW used duration + stronger duplicates; here **duration → charges** (rarity / tier).

| Phase | Goal |
| --- | --- |
| 0 | Item defs ↔ `ELIXIR_EFFECTS` parity |
| 1 | Recipe mixer E2E |
| 2 | Tags + simple mixes |
| 3 | Conflicts, rarity tuning, logging |
| 4 | *(opt)* Hidden recipes |

**Still open:** tagging edge cases, input limits, tie-breakers, charges vs clock, one buff slot / overwrite, failed-mix economy, UX, analytics. Flag-gate and tune from play.

---

## Related code

`bot/modules/elixirModule.js` · `bot/commands/jobs/crafting.js` · item apply path · `ItemModel.js`
