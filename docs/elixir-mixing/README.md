# Elixir mixing (design)

Design for a **mixer command** that resolves ingredients into a real item, then uses the **existing** pipeline: `ELIXIR_EFFECTS` in `elixirModule.js`, `/item`, `character.buff`, `getActiveBuffEffects` elsewhere. No parallel buff math.

| Mode | Behavior |
| --- | --- |
| **Today** | **Fixed recipes** (e.g. Witch `crafting.js`) → one elixir item. |
| **Future** | Optional resolver **before** consume; output must still be an item that exists in DB + `ELIXIR_EFFECTS`. |

---

## 1. Design guardrails (read first)

- **`chilly`** is **only** fire/heat resistance (`fireResistance`). Do **not** fold **water** or **blight** back into Chilly in tables or prose.
- **Water** mitigation → **Sticky** (`waterResistance`, `plusBoost`). **Blight** → **Bright** (`blightResistance`). If live code differs, fix code to match this doc.
- **Hearts (HP):** **`extraHearts`**, **`recoverHearts`**, and any elixir heart outcomes use **whole full hearts only** — **no** ½, ¼, ⅓, or other fractional hearts. Store and display as **integers ≥ 0**.
- **Stamina:** **5 chunks = 1 wheel.** Refill (`staminaRecovery`) and extra max (`staminaBoost`) are measured in **whole chunks only** — no fractional chunks. UI may show wheels as **chunks ÷ 5** for readability.

---

## 2. Sidecar data

| File | Role |
| --- | --- |
| `docs/elixir-type-mapping.json` | Maps `ItemModel.type[]` → **ingredientRole** (critter, monsterPart, optionalFood, …). Mixer uses **critter + monster part** only — ignore food roles for elixir mixing. |
| `docs/elixir-ingredient-labels.json` | Sparse `itemName` → **`effectFamily`** (critters) or **`element`** (monster parts). **`none`** = neutral filler. **Critters + monster parts only** — no food plants/mushrooms/fish/meals. Never both keys on one row. **v4:** ~93 keys. Order: `effectFamily` groups (A–Z by family, then item name), then `element` groups (`electric` → `fire` → `ice` → `none` → `undead`, then item name). See `$comment` in the file. |

**Item catalog:** [§7.2](#72-item-catalog-botw-contribution--target-itemrarity-design) lists every labeled **critter** and **monster part** with BotW-style effects and **target** `itemRarity` (what values *should* be in `tinglebot.items.json` — not a dump of current data).

---

## 3. Recipes & economy

### 3.1 Mixer (source of truth)

**Two slots:** one **fixed critter** + **Monster part**. No OR lists — not the legacy Witch critter columns.

**How the fixed critter is chosen:** From `elixir-ingredient-labels.json`, same `effectFamily` as the output; pick the **most basic** option using **`itemRarity`** in `docs/tinglebot.items.json` (**1–10**, lower = more common). Align item rarities to **target** values in [§7.2](#72-item-catalog-botw-contribution--target-itemrarity-design) when tuning data.

**Monster part:** Usually **`element`: `none`** (e.g. Chuchu Jelly, Bokoblin Horn). **Fireproof** uses a **fire**-aligned part (e.g. **Red Chuchu Jelly**) — see [§4.2 Element-only parts](#42-element-only-parts).

**Slot rule (legacy + mixer):** **`Chuchu Jelly`** fills the neutral monster part slot — do **not** count “any part” + “Chuchu Jelly” as two slots. **Fireproof:** **`Red Chuchu Jelly`** is the part (fire-aligned), not a second jelly.

| Elixir | Ingredients |
| --- | --- |
| Bright Elixir | Deep Firefly + Monster part |
| Chilly Elixir | Cold Darner + Monster part |
| Electro Elixir | Electric Darner + Monster part |
| Enduring Elixir | Tireless Frog + Monster part |
| Energizing Elixir | Restless Cricket + Monster part |
| Fireproof Elixir | Fireproof Lizard + Monster part |
| Hasty Elixir | Hightail Lizard + Monster part |
| Hearty Elixir | Hearty Lizard + Monster part |
| Mighty Elixir | Bladed Rhino Beetle + Monster part |
| Sneaky Elixir | Sunset Firefly + Monster part |
| Spicy Elixir | Warm Darner + Monster part |
| Sticky Elixir | Sticky Lizard + Monster part |
| Tough Elixir | Rugged Rhino Beetle + Monster part |

**Tie-breaks (same target rarity):** If two critters share **`itemRarity`**, use a fixed order: Cold Darner before Winterwing; Electric Darner before Thunderwing; Warm Darner before Summerwing; Restless Cricket before Energetic Rhino Beetle; Sticky Lizard before Sticky Frog; **Bright** output uses **Deep Firefly** (not Blessed Butterfly); Hightail Lizard before Hot-Footed Frog. **Enduring:** only **Tireless Frog** is labeled in v4 JSON.

**Not in table:** **Fairy Tonic** — **Fairy** + monster part (legacy DB materials). **No Fairy Dust** in this recipe.

### 3.2 Economy snapshot (`tinglebot.items.json`)

Numbers are **Witch-era** item defs. **Mixer baseline strength may be nerfed** — revisit buy/sell, **`modifierHearts`**, **`staminaRecovered`**, **`staminaToCraft`**, rarity when balance locks. **Buff math** = `ELIXIR_EFFECTS` + apply path — not duplicated here.

† **`modifierHearts`** / **`staminaRecovered`** — rebalance with nerfed baseline. **`staminaToCraft`** stored as string in JSON. **`craftingJobs`:** **`["Witch"]`** today; add **`Mixer`** when the command ships.

| Item | Mixer base | Buy | Sell | Rarity | Hearts† | Stamina rec.† | Craft | `buff.type` |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Chilly Elixir | Cold Darner + part | 750 | 190 | 5 | 0 | 0 | 4 | `chilly` |
| Electro Elixir | Electric Darner + part | 750 | 190 | 5 | 0 | 0 | 3 | `electro` |
| Enduring Elixir | Tireless Frog + part | 750 | 190 | 5 | 2 | 4 | 4 | `enduring` |
| Energizing Elixir | Restless Cricket + part | 750 | 190 | 5 | 0 | 7 | 4 | `energizing` |
| Fairy Tonic | Fairy + part | 1200 | 300 | 5 | 9999 | 0 | 4 | `fairy` |
| Fireproof Elixir | Fireproof Lizard + part | 600 | 150 | 5 | 0 | 0 | 3 | `chilly` (heat/fire thread) |
| Hasty Elixir | Hightail Lizard + part | 750 | 190 | 5 | 0 | 0 | 3 | `hasty` |
| Hearty Elixir | Hearty Lizard + part | 750 | 190 | 5 | 20 | 0 | 3 | `hearty` |
| Mighty Elixir | Bladed Rhino Beetle + part | 750 | 190 | 5 | 0 | 0 | 4 | `mighty` |
| Sneaky Elixir | Sunset Firefly + part | 750 | 190 | 5 | 0 | 0 | 4 | `sneaky` |
| Spicy Elixir | Warm Darner + part | 750 | 190 | 5 | 0 | 0 | 4 | `spicy` |
| Tough Elixir | Rugged Rhino Beetle + part | 750 | 190 | 5 | 0 | 0 | 4 | `tough` |
| Bright Elixir | Deep Firefly + part | — | — | — | — | — | — | `bright` |
| Sticky Elixir | Sticky Lizard + part | — | — | — | — | — | — | `sticky` |

**Legacy Witch** (`crafting.js`): **OR** critters per row — **mixer does not use these lists**; it uses §3.1 only. **Sources:** Crafting · Witch. **Special weather** on these rows: none in export.

| Elixir | Legacy critters (OR) |
| --- | --- |
| Chilly | Cold Darner, Winterwing Butterfly |
| Electro | Electric Darner, Thunderwing Butterfly |
| Enduring | Tireless Frog |
| Energizing | Energetic Rhino Beetle, Restless Cricket |
| Fairy Tonic | Fairy |
| Fireproof | Fireproof Lizard |
| Hasty | Hightail Lizard, Hot-Footed Frog |
| Hearty | Hearty Lizard, Hearty Blueshell Snail |
| Mighty | Bladed Rhino Beetle, Razorclaw Crab |
| Sneaky | Sunset Firefly, Sneaky River Snail |
| Spicy | Warm Darner, Summerwing Butterfly |
| Tough | Rugged Rhino Beetle, Ironshell Crab |

**Weather (resist elixirs):** base **25%** mitigation for matching hazard at baseline — see **Weather stacking** under §5. **Charges** replace duration — map from rarity/tier later.

---

## 4. Ingredients & labels

**Source of truth:** `docs/elixir-ingredient-labels.json` (`version` **4**). Add labels before the mixer trusts new items.

### 4.1 Rules

- **`effectFamily`:** Named family (`chilly`, `mighty`, …) must **match** the output elixir. **`"none"`** = filler — any mix; steers **rarity/tier** only, not family. Example: **Electric Darner** cannot anchor **Chilly**.
- **`element` (monster parts):** **`none`** = generic part, any elixir. **`fire` / `ice` / `electric` / `undead`** — only when they match that elixir’s **element thread** (see below). Example: **Yellow Chuchu Jelly** (`electric`) anchors **Electro**, not **Chilly**.
- **`none` filler list:** Labeled from `tinglebot.items.json` (`Creature` / `Monster` / `Ancient Parts`), minus **excludes:** Ancient Core / Gear / Screw / Shaft / Spring / Giant Ancient Core; cooked **Monster** meals (Cake, Curry, Rice Balls, Soup, Stew); **Insect Parts** (bundle); **Gibdo Bandage**; **Like Like Stone**; **Freezard Water**. **Fairy Dust** — label when wired (`fairy` or `none`) if used elsewhere; **not** a Fairy Tonic ingredient here.

### 4.2 Element-only parts

| `element` | Items | Use with output |
| --- | --- | --- |
| `fire` | Fire Keese Wing, Red Chuchu Jelly, Red Lizalfos Tail | `chilly` / Fireproof (`fireResistance`) |
| `ice` | Ice Keese Wing, Icy Lizalfos Tail, White Chuchu Jelly | `spicy` |
| `electric` | Electric Keese Wing, Yellow Chuchu Jelly, Yellow Lizalfos Tail | `electro` |
| `undead` | Gibdo Bone, Gibdo Guts, Gibdo Wing, Poe Soul, Spider's Eye | `bright` |
| `none` | Chuchu Jelly, Chuchu Egg, Bokoblin/Moblin/Lynel/… parts, Monster Horn/Claw/Extract, skulls, … — full list in JSON | **Any** (filler / rarity) |

### 4.3 Fairy / Mock Fairy (cross-family additive)

Only mix where a critter’s **`effectFamily`** may **differ** from the output: **`Fairy`** or **`Mock Fairy`** as an **extra** on an otherwise-valid brew. Output family stays anchored by critter + part (e.g. Chilly + Mock Fairy → still **Chilly Elixir**, not Fairy Tonic unless the recipe is Fairy-first).

On consume: that elixir’s **`buff.effects`** **plus** **`recoverHearts`** — refill **current** toward **real max** only (not `extraHearts`). **`recoverHearts`** uses **full hearts** only (§1). Example tuning: Mock Fairy **+1 full**, Fairy **+2 full** (exact numbers TBD in `ELIXIR_EFFECTS`). **At most one** of Fairy / Mock Fairy per brew. Implementation: special-case `effectFamily` **`fairy`** so it never **conflicts** when tagged as additive.

### 4.4 Allowed `effectFamily` critters by output

**Mixer ingredients:** **Critters** (and **Fairy** / **Mock Fairy**) — no mushrooms, fish-as-food, plants, or meals. Crabs, snails, and insects are **critters** here, not “cooking food.”

| Output (`buff.type`) | Allowed (`effectFamily` match) |
| --- | --- |
| `bright` | Blessed Butterfly, Deep Firefly, Starry Firefly |
| `chilly` | Cold Darner, Eldin Roller, Fireproof Lizard, Smotherwing Butterfly, Volcanic Ladybug, Winterwing Butterfly |
| `electro` | Electric Darner, Lanayru Ant, Thunderwing Butterfly |
| `enduring` | Tireless Frog |
| `energizing` | Bright-Eyed Crab, Energetic Rhino Beetle, Faron Grasshopper, Golden Insect, Restless Cricket |
| `fairy` | Fairy, Mock Fairy |
| `hasty` | Hightail Lizard, Hot-Footed Frog, Lizard Tail, Sand Cicada |
| `hearty` | Hearty Blueshell Snail, Hearty Lizard |
| `mighty` | Bladed Rhino Beetle, Deku Hornet, Hornet Larvae, Razorclaw Crab, Sky Stag Beetle, Woodland Rhino Beetle |
| `sneaky` | Fabled Butterfly, Skyloft Mantis, Sneaky River Snail, Sunset Firefly |
| `spicy` | Gerudo Dragonfly, Summerwing Butterfly, Warm Darner |
| `sticky` | Sticky Frog, Sticky Lizard |
| `tough` | Ironshell Crab, Rugged Rhino Beetle |

Plus **`effectFamily`: `"none"`** fillers per §4.1. **Additionally (any output):** Fairy, Mock Fairy — §4.3.

When JSON changes, refresh these tables (or generate from file in CI).

---

## 5. `effectFamily` / `buff.type` → `buff.effects`

Same string: mixer tag and `character.buff.type` when active. Shipped families match `ELIXIR_EFFECTS`. Combat resist: `reduction = min(0.95, stat × 0.5)` on matching elemental hits (`encounterModule.calculateDamage`).

**Climate + combat (one stat per thread):** **Chilly** = heat + fire → **`fireResistance`** only. **Spicy** = cold + ice → **`coldResistance`**. **Sticky** = water → **`waterResistance`** + **`plusBoost`**. **Electric** = thunder + electric foes. Heat and fire share **`fireResistance`** (no separate `heatResistance`).

**Weather (design):** For matching hazard — hot (`chilly`), cold (`spicy`), thunder (`electro`), wet/rain (`sticky`) — base-tier elixir: **25%** less likely to suffer that weather’s harmful effects. Modifiers (extras, rarity, boosted stats) **increase** mitigation. **Separate** from combat elemental reduction unless you wire them together in code.

**Weather stacking:** Let **W** = mitigation % on “bad outcome” rolls. **Base** valid resist elixir: **W = 25**. Extras add bonus; **sum then clamp**:

- `W_total = min(W_cap, 25 + bonus_critters + bonus_neutral + bonus_elemental + bonus_stat)` — **W_cap = 70** (tunable). Above **25**, only **compatible** extras count (same mixing rules — no second `effectFamily` anchor).
- **Extra same-family critters:** **+5%** each, **max +10%** from critters (two extras max in usual 3-critter cap).
- **Neutral monster parts** (`element`: `none`): **+1% × `itemRarity`** per part (**1–10**). **Subtotal** from all neutral parts in one brew **capped at +20%**.
- **Matching elemental part** (matches elixir thread): **+5%** once per brew (first matching part only).
- **`buff.effects` resist (optional):** `bonus_stat = min(15, floor(10 × (stat − 1.0)))` — optional; omit if weather should depend only on ingredients + base 25.

**Mechanic names** (for Description column): `combat`, `crafting`, `exploring`, `gathering`, `helpwantedquests`, `looting`, `raid`, `travel`

| Family | `buff.effects` | Description | Mechanics |
| --- | --- | --- | --- |
| `chilly` | `fireResistance` | Heat + fire damage: weather, fire-type enemies, ambient heat. | combat, exploring, travel |
| `spicy` | `coldResistance` | Cold + ice-aligned harm. | combat, exploring, travel |
| `electro` | `electricResistance` | Electric / thunder-aligned harm. | combat, exploring |
| `enduring` | `staminaBoost` | Raises max stamina (temporary **chunks**; **5 chunks = 1 wheel**). | exploring, gathering, looting, travel |
| `energizing` | `staminaRecovery` | Refills stamina (**chunks**; **5 chunks = 1 wheel**). | crafting, gathering, looting |
| `hasty` | `speedBoost` | Speed-weighted checks; travel halving — see §6. | exploring, travel |
| `hearty` | `extraHearts` | Temporary bonus max + current (**full hearts** only — integers). | combat, gathering, helpwantedquests, looting, raid |
| `mighty` | `attackBoost` | Attack-weighted success. | combat, helpwantedquests, looting, raid |
| `tough` | `defenseBoost` | Defense-weighted (×1.5 floor in `buffModule`). | combat, helpwantedquests, looting, raid |
| `sneaky` | `stealthBoost`, `fleeBoost` | Stealth; flee odds. **Not** loot-job encounter rates. | exploring, gathering, looting, travel |
| `fairy` | `recoverHearts` | Heal only — current toward **existing** max. Not temp hearts. | combat, gathering, helpwantedquests, looting, exploring, raid |
| `bright` | `blightResistance` | Blight; light for hidden maze routes / dark areas. | exploring, gathering |
| `sticky` | `waterResistance`, `plusBoost` | Water/wet/rain; **`plusBoost`** = extra yield (gather, loot, steal, optional craft) — not Sneaky rarity. | combat, crafting, exploring, gathering, looting |

**Family notes**

- **Hearty vs Fairy:** `extraHearts` vs `recoverHearts` — different keys on purpose.
- **Blight:** Only `bright` / `blightResistance` — not on Chilly. Infection + maze reveal (hidden passages, dark routing) — exact flags TBD.
- **Sneaky vs Sticky:** Sneaky = stealth / fewer random encounters on roads, blood moons, exploration; **not** loot-job rates; flee should stay allowed where escape exists; **`fleeBoost`** in `rngModule.attemptFlee`. Sticky = **`waterResistance`** + **`plusBoost`** (volume), not stealth.

**Consumption (deferred):** Charges / `shouldConsumeElixir` — define after Description + Mechanics are locked.

---

## 6. Base numbers & formulas

`buff.effects` values = **base-tier** magnitudes (plain elixir). **Mixer:** extras raise stats via **`itemRarity`** aggregate (see §7), not a separate potency stat. **Hearty** base **`extraHearts` = 1** (one **full** heart). **Energizing** / **Enduring** base **`staminaRecovery` / `staminaBoost` = 1** (**one chunk**; **5 chunks = 1 wheel** per §1) — align `ELIXIR_EFFECTS` + consume paths.

### Global formulas (live code)

| Topic | Rule | Where |
| --- | --- | --- |
| Weather (matching resist) | Base **25%**; grows with modifiers. Keys: heat → `fireResistance`, cold → `coldResistance`, thunder → `electricResistance`, wet → `waterResistance`. | Design — `weatherService` / explore / travel when wired |
| Elemental hit damage | `1 − min(0.95, resistanceStat × 0.5)` | `encounterModule.applyElementalResistancePercent` |
| Blight rain infection | Base **75%**; each `blightResistance` point **−10** pp, clamp **[10%, 95%]** | `travel.js` |
| Flee | `min(0.95, 0.50 + failedFleeAttempts×0.05 + fleeBoost×0.15)` | `rngModule.attemptFlee` |
| Attack | `finalAttack = baseAttack + attackBoost` (min **1**) | `buffModule.calculateAttackBuff` |
| Defense | `floor((baseDefense + defenseBoost) × 1.5)` | `buffModule.calculateDefenseBuff` |
| Speed | `baseSpeed + speedBoost` (min **1**) | `buffModule.calculateSpeedBuff` |
| Stealth | `baseStealth + stealthBoost` (min **1**) | `buffModule.calculateStealthBuff` |
| Travel (Hasty) | `speedBoost > 0` → days `= max(1, ceil(days/2))` | `travel.js` (`getTravelDuration`) |

### Base `buff.effects` by family

| Family | Keys | Base | At base |
| --- | --- | --- | --- |
| `chilly` | `fireResistance` | **1.5** | **75%** less from matching fire hits; heat uses same stat. |
| `spicy` | `coldResistance` | **1.5** | **75%** less from matching ice hits. |
| `electro` | `electricResistance` | **1.5** | **75%** less from matching electric hits. |
| `enduring` | `staminaBoost` | **1** | +**1 chunk** max (and matching current on apply); **5 chunks = 1 wheel** (`applyImmediateEffects`). |
| `energizing` | `staminaRecovery` | **1** | +**1 chunk** on consume (capped); **5 chunks = 1 wheel**. |
| `hasty` | `speedBoost` | **1** | Half travel days (min 1); +1 speed where used. |
| `hearty` | `extraHearts` | **1** | +**1 full** temp max + current (integer hearts only). |
| `mighty` | `attackBoost` | **1.5** | +1.5 attack in `calculateAttackBuff`. |
| `tough` | `defenseBoost` | **1.5** | +1.5 defense, then ×1.5 floor. |
| `sneaky` | `stealthBoost`, `fleeBoost` | **1**, **1** | +1 stealth; flee **+15%** (cap 95%). |
| `fairy` | `recoverHearts` | **TBD** | Set when `ELIXIR_EFFECTS` ships. |
| `bright` | `blightResistance` | **1** (proposed) | Example: infection **65%** at base before clamp. Maze **TBD**. |
| `sticky` | `waterResistance`, `plusBoost` | **1.5**, **TBD** | Water: same resist formula. **`plusBoost`** yield — **TBD**. |

**Tier vs `itemRarity`:** see [§7.1](#71-rarity-targets-for-similar-outcomes-design).

---

## 7. Mixer strength: `itemRarity` (not BotW potency)

Tinglebot does **not** store BotW **potency**. Strength comes from **`itemRarity`** **1–10** in `tinglebot.items.json`. Combine with an **aggregate rule** (sum, max, weighted — **TBD**) for effect tier.

### 7.1 Rarity targets for similar outcomes (design)

**`R_agg`** = aggregate score from ingredient **`itemRarity`** values (which ingredients count — anchor only, anchor + part, all non-filler — **TBD**). Values below are **minimum `R_agg`** to land in a **similar** outcome band to BotW-style **low / middle / high** once the aggregate rule is fixed. Tune when the mixer ships.

**Plain Reference mix (sanity check):** Anchor critter + neutral `none` part is often **`itemRarity` sum ~4–6** (e.g. **Restless Cricket** **2** + **Chuchu Jelly** **2** → **4**; **Cold Darner** **3** + jelly **2** → **5**). That should stay **below** “middle” for stat/resist rows unless you boost with **extras** or **rarer** parts.

#### Stat boosts & elemental resists

**—** = no **high** tier for that row. **`R_agg`** targets below are **Tinglebot mixer design** (set `itemRarity` / aggregate to match).

**\* row** = **new** for the mixer **or** **missing / not split** in live `ELIXIR_EFFECTS` yet (see last paragraph).

| Similar outcome | `buff.effects` (family) | Base | Middle | High | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| Attack Up | `attackBoost` (`mighty`) | 3 | 5 | 8 | `Mighty Elixir` |
| Defense Up | `defenseBoost` (`tough`) | 3 | 5 | 8 | `Tough Elixir` |
| Movement Speed | `speedBoost` (`hasty`) | 3 | 5 | 8 | `Hasty Elixir` |
| Stealth / flee | `stealthBoost`, `fleeBoost` (`sneaky`) | 3 | 6 | 9 | `Sneaky Elixir` |
| Flame Guard (fire combat) | `fireResistance` (`chilly`) | 3 | 6 | — | `Chilly Elixir` |
| \* Heat (climate) | `fireResistance` (`chilly`) | 3 | 5 | — | \* Mixer-only second track (same stat); live code does not split heat vs fire |
| Cold Resistance | `coldResistance` (`spicy`) | 3 | 6 | — | `Spicy Elixir` |
| Shock Resistance | `electricResistance` (`electro`) | 4 | 6 | 8 | `Electro Elixir` |
| \* Blight / Bright | `blightResistance` (`bright`) | 3 | 6 | 8 | \* No Bright elixir in `ELIXIR_EFFECTS` |
| \* Sticky (water + yield) | `waterResistance`, `plusBoost` (`sticky`) | 3 | 5 | 8 | \* No Sticky elixir; **`plusBoost`** is new vs other rows |

**Live `ELIXIR_EFFECTS`:** `Chilly Elixir` still bundles **`waterResistance`** and **`blightResistance`** with **`fireResistance`** — this doc’s design moves water → Sticky and blight → Bright ([§1](#1-design-guardrails-read-first)); update the module when you implement.

#### Hearty — `extraHearts` (**full hearts only**)

Maps **desired total bonus full hearts** (integers) from the elixir to **minimum `R_agg`**. No half/quarter hearts — see §1. Higher tiers assume **rare** critters, **extra** same-family ingredients, and/or **rare** monster parts — not just the baseline anchor + jelly.

| Extra **full** hearts (outcome) | Min `R_agg` (design) |
| --- | ---: |
| 1 | 4 |
| 2 | 5 |
| 3 | 6 |
| 4 | 8 |
| 5 | 10 |

#### Energizing — refill in **chunks** (**5 chunks = 1 wheel**)

Cross-reference **chunks refilled** in **§7.4**. Outcomes are **integer chunks** only. **`R_agg`** bands are **design** targets for similar refill strength.

| Chunks refilled (outcome) | Min `R_agg` (design) |
| --- | ---: |
| 1–3 | 1–4 |
| 4–6 | 4–7 |
| 7–10 | 7–9 |
| 11–15 | 9–10 |

*(Example: **5 chunks** = **1 wheel**; **15 chunks** max row ≈ **3 wheels** — cap **TBD**.)*

#### Enduring — extra max in **chunks** (**5 chunks = 1 wheel**)

Cross-reference **§7.5**. Bonus max stamina is **integer chunks** only.

| Extra max chunks (outcome) | Min `R_agg` (design) |
| --- | ---: |
| 1–5 | 1–5 |
| 6–10 | 5–8 |
| 11–15 | 8–10 |

#### Other families

**`bright`**, **`sticky`**, **`fairy`** — tie **`R_agg`** to **`blightResistance`**, **`waterResistance` / `plusBoost`**, **`recoverHearts`** when those numbers are locked in `ELIXIR_EFFECTS` (no separate table yet).

---

### 7.2 Item catalog: BotW contribution → target itemRarity (design)

**Scope:** **Critters** + **monster parts** only — no mushrooms, fish fillets, plants, meat, or other cooking ingredients. **Target `itemRarity`** (**1–10**) is what **`tinglebot.items.json` should use** so mixer strength matches BotW-style tiers; it is **not** a snapshot of whatever is in the DB today (you can change items to match this column).

**Critters** — BotW: critters set the elixir’s **effect type** (heat resist, shock, mighty, etc.); stronger critters raise **potency** toward higher tiers.

| Item | `effectFamily` | BotW-style contribution (elixirs) | Target `itemRarity` |
| --- | --- | --- | ---: |
| Blessed Butterfly | `bright` | Bright / glow; blight-adjacent “light” critter | 3 |
| Deep Firefly | `bright` | Strong bright effect; maze / dark (design) | 3 |
| Starry Firefly | `bright` | Bright / glow | 3 |
| Cold Darner | `chilly` | Chill / heat & fire resist thread | 3 |
| Eldin Roller | `chilly` | Chill; hot-region critter | 2 |
| Fireproof Lizard | `chilly` | Flame guard / heat (fire thread) | 3 |
| Smotherwing Butterfly | `chilly` | Chill | 3 |
| Volcanic Ladybug | `chilly` | Chill | 3 |
| Winterwing Butterfly | `chilly` | Chill (stronger chilly critter than basic darner) | 4 |
| Electric Darner | `electro` | Shock / electric resist | 2 |
| Lanayru Ant | `electro` | Shock | 3 |
| Thunderwing Butterfly | `electro` | Shock | 2 |
| Tireless Frog | `enduring` | Enduring — extra max stamina (**chunks**; **5 = 1 wheel**) | 2 |
| Bright-Eyed Crab | `energizing` | Energizing — mid **chunk** refill band | 3 |
| Energetic Rhino Beetle | `energizing` | Energizing — strong **chunk** refill | 6 |
| Faron Grasshopper | `energizing` | Energizing — mid **chunk** refill | 3 |
| Golden Insect | `energizing` | Energizing — rare / strong refill (**chunks**) | 4 |
| Restless Cricket | `energizing` | Energizing — lowest **chunk** refill band | 2 |
| Fairy | `fairy` | Fairy tonic / full heal thread | 8 |
| Mock Fairy | `fairy` | Fairy-like heal additive | 5 |
| Hightail Lizard | `hasty` | Haste / speed | 2 |
| Hot-Footed Frog | `hasty` | Haste / speed | 2 |
| Lizard Tail | `hasty` | Haste / speed | 2 |
| Sand Cicada | `hasty` | Haste / speed | 2 |
| Hearty Blueshell Snail | `hearty` | Hearty — anchors **+3 full** `extraHearts` band (critter path) | 5 |
| Hearty Lizard | `hearty` | Hearty — anchors **+4 full** `extraHearts` band | 6 |
| Bladed Rhino Beetle | `mighty` | Mighty — attack up | 2 |
| Deku Hornet | `mighty` | Mighty — attack up | 2 |
| Hornet Larvae | `mighty` | Mighty — attack up | 2 |
| Razorclaw Crab | `mighty` | Mighty — attack up | 3 |
| Sky Stag Beetle | `mighty` | Mighty — stronger | 4 |
| Woodland Rhino Beetle | `mighty` | Mighty — attack up | 3 |
| Fabled Butterfly | `sneaky` | Sneaky / stealth | 3 |
| Skyloft Mantis | `sneaky` | Sneaky / stealth | 3 |
| Sneaky River Snail | `sneaky` | Sneaky / stealth | 3 |
| Sunset Firefly | `sneaky` | Sneaky / stealth | 4 |
| Gerudo Dragonfly | `spicy` | Spicy — cold resist | 3 |
| Summerwing Butterfly | `spicy` | Spicy — cold resist | 2 |
| Warm Darner | `spicy` | Spicy — cold resist | 2 |
| Sticky Frog | `sticky` | Sticky — slip / water-adjacent | 4 |
| Sticky Lizard | `sticky` | Sticky — slip / water-adjacent | 3 |
| Ironshell Crab | `tough` | Tough — defense up | 3 |
| Rugged Rhino Beetle | `tough` | Tough — defense up | 2 |

**Monster parts** — BotW: parts mainly **extend duration** and add **element** (colored jellies, tails, wings); rare drops skew potency upward.

| Item | `element` | BotW-style contribution (elixirs) | Target `itemRarity` |
| --- | --- | --- | ---: |
| Electric Keese Wing | `electric` | Electric / shock affinity | 3 |
| Yellow Chuchu Jelly | `electric` | Electric element | 3 |
| Yellow Lizalfos Tail | `electric` | Electric element | 3 |
| Fire Keese Wing | `fire` | Fire / heat affinity | 3 |
| Red Chuchu Jelly | `fire` | Fire element (Fireproof thread) | 3 |
| Red Lizalfos Tail | `fire` | Fire element | 4 |
| Ice Keese Wing | `ice` | Ice / cold affinity | 3 |
| Icy Lizalfos Tail | `ice` | Ice element | 4 |
| White Chuchu Jelly | `ice` | Ice element | 3 |
| Gibdo Bone | `undead` | Undead / blight thread | 4 |
| Gibdo Guts | `undead` | Undead / blight thread | 4 |
| Gibdo Wing | `undead` | Undead / blight thread | 4 |
| Poe Soul | `undead` | Undead / dark | 5 |
| Spider's Eye | `undead` | Undead / blight | 4 |
| Blin Bling | `none` | Generic monster part — duration | 2 |
| Bokoblin Fang | `none` | Common part — duration | 2 |
| Bokoblin Guts | `none` | Common part — duration | 2 |
| Bokoblin Horn | `none` | Common part — duration | 2 |
| Chuchu Egg | `none` | Neutral part — duration | 2 |
| Chuchu Jelly | `none` | Neutral part — duration (baseline) | 2 |
| Golden Skull | `none` | Monster part — mid | 3 |
| Hinox Guts | `none` | Mid–high drop | 4 |
| Hinox Toenail | `none` | Mid–high drop | 4 |
| Hinox Tooth | `none` | Mid–high drop | 4 |
| Horriblin Claw | `none` | Mid drop | 3 |
| Horriblin Guts | `none` | Mid drop | 3 |
| Horriblin Horn | `none` | Mid drop | 3 |
| Keese Eyeball | `none` | Common part | 2 |
| Keese Wing | `none` | Common part | 2 |
| Lizalfos Horn | `none` | Mid part | 3 |
| Lizalfos Tail | `none` | Mid part | 3 |
| Lizalfos Talon | `none` | Mid part | 3 |
| Lynel Guts | `none` | Rare drop | 6 |
| Lynel Hoof | `none` | Rare drop | 6 |
| Lynel Horn | `none` | Rare drop | 7 |
| Moblin Fang | `none` | Mid part | 3 |
| Moblin Guts | `none` | Mid part | 3 |
| Moblin Horn | `none` | Mid part | 3 |
| Molduga Fin | `none` | Very rare drop | 8 |
| Molduga Guts | `none` | Very rare drop | 8 |
| Monster Claw | `none` | Generic part | 2 |
| Monster Horn | `none` | Generic part | 2 |
| Octo Balloon | `none` | Common part | 2 |
| Octorok Eyeball | `none` | Common part | 2 |
| Octorok Tentacle | `none` | Common part | 2 |
| Ornamental Skull | `none` | Mid part | 3 |
| Rugged Horn | `none` | Mid part | 3 |
| Serpent Fangs | `none` | Mid part | 3 |
| Stal Skull | `none` | Common undead-adjacent part | 2 |

---

**Hearty / stamina tables below** use **full hearts** and **stamina chunks** only (**5 chunks = 1 wheel**). Map outcomes to **`itemRarity`** using §7.1 **`R_agg`** + §7.2 targets — **not** BotW cooking-only ingredients.

### 7.3 Hearty — extra **full** hearts (critters-only path)

Outcomes are **integer full hearts** only (§1). BotW’s “yellow heart” cooking tiers used many **food** ingredients; for **critters only**, **`Hearty Blueshell Snail`** and **`Hearty Lizard`** anchor the stronger hearty bands below. Use §7.2 target rarities + extras + **`R_agg`** (§7.1) for other totals.

| Bonus full hearts (outcome) | Critters (anchor band) |
| --- | --- |
| +3 | Hearty Blueshell Snail |
| +4 | Hearty Lizard |

Lower/higher totals come from **`R_agg`** (extras + rarer parts), not from adding mushrooms/fish in the mixer.

### 7.4 Energizing (`staminaRecovery`) — refill in **chunks**

**Rule:** **`staminaRecovery`** grants **integer chunks** of green stamina refill only — **no fractional chunks.** **5 chunks = 1 wheel.** The **Wheels** column is **chunks ÷ 5** for display; the stored outcome is always **whole chunks**.

| Tier (outcome) | Chunks refilled | Wheels (display only) |
| ---: | ---: | --- |
| 1 | 1 | ⅕ wheel |
| 2 | 2 | ⅖ |
| 3 | 3 | ⅗ |
| 4 | 4 | ⅘ |
| 5 | 5 | **1 wheel** |
| 6 | 6 | 1 + ⅕ |
| 7 | 7 | 1 + ⅖ |
| 8 | 8 | 1 + ⅗ |
| 9 | 9 | 1 + ⅘ |
| 10 | 10 | **2 wheels** |
| 11 | 11 | 2 + ⅕ |
| 12 | 12 | 2 + ⅖ |
| 13 | 13 | 2 + ⅗ |
| 14 | 14 | 2 + ⅘ |
| 15 | 15 | **3 wheels** |

Tier index can match **chunks refilled** 1:1, or you map tier → chunks in code — either way the **grant** is an **integer chunk** count.

**Critters:** **Restless Cricket** → low chunk bands, **Bright-Eyed Crab** / **Faron Grasshopper** → mid, **Golden Insect** → upper mid, **Energetic Rhino Beetle** → high — see §7.2. BotW also used **fish / mushrooms** for stamina; those are **out of scope** for the mixer.

### 7.5 Enduring (`staminaBoost`) — extra max in **chunks**

**Rule:** **`staminaBoost`** grants **integer chunks** of **bonus max** stamina only — **no fractional chunks.** **5 chunks = 1 wheel.** The **Wheels** column is **chunks ÷ 5** for display.

| Tier (outcome) | Extra max chunks | Wheels (display only) |
| ---: | ---: | --- |
| 1 | 1 | ⅕ wheel |
| 2 | 2 | ⅖ |
| 3 | 3 | ⅗ |
| 4 | 4 | ⅘ |
| 5 | 5 | **1 wheel** |
| 6 | 6 | 1 + ⅕ |
| 7 | 7 | 1 + ⅖ |
| 8 | 8 | 1 + ⅗ |
| 9 | 9 | 1 + ⅘ |
| 10 | 10 | **2 wheels** |
| 11 | 11 | 2 + ⅕ |
| 12 | 12 | 2 + ⅖ |
| 13 | 13 | 2 + ⅗ |
| 14 | 14 | 2 + ⅘ |
| 15 | 15 | **3 wheels** |

**Critters:** **`Tireless Frog`** is the labeled enduring critter (§7.2). BotW used **Endura Shroom** / **Endura Carrot** for higher tiers — **not** mixer ingredients; reach higher chunk totals via **`R_agg`** (rarer monster parts, extras).

---

## 8. Elements (combat + parts)

Shared keys: `fire`, `ice`, `electric`, `water`, `earth`, `wind`, `undead`, `light`, `tech`, `none` — weapon vs monster (`ELEMENTAL_ADVANTAGES`, `getWeaponElement`, `getMonsterElement` in `elixirModule.js`).

| Element | Strong vs | Weak to |
| --- | --- | --- |
| 🔥 `fire` | Ice, Wind | Water, Earth |
| ❄️ `ice` | Water, Electric | Fire |
| ⚡ `electric` | Water, Wind | Earth |
| 💧 `water` | Fire, Earth | Electric, Ice |
| 🌪️ `wind` | Earth, Undead | Fire, Electric |
| 🌍 `earth` | Electric, Fire | Water, Wind |
| 💀 `undead` | Ice, Water | Light, Fire, Wind |
| ✨ `light` | Undead | — |
| ⚙️ `tech` | Earth, Wind | Electric, Water |

**Elixir resists (summary):** Already in §5 — `chilly`/`spicy`/`electro`/`sticky`/`bright`; earth/wind/light/tech have no full resist path in the combat helper yet.

**`element` on parts:** Biases mixer; unlabeled parts stay neutral (strength from `itemRarity`). **Labeled today:** fire/ice/electric/undead jellies & tails. **Unlabeled:** water, earth, wind, light, tech (monsters can still have those via field/name).

**Tags vs live buff:** JSON labels are mixer-only until the command exists. Live play: `character.buff` + `ELIXIR_EFFECTS`.

---

## 9. Label coverage (export)

Rough counts vs `tinglebot.items.json` (~763 items). **Mixer** uses only **critter + monster part** rows (~93 keys) — not cooking-only items.

| Pool | In export | Labeled |
| --- | --- | --- |
| Creature | 39 | 38 (no Insect Parts bundle) |
| Monster | 64 | 15 `element` rows |
| **Total keys in JSON** | | **~93** |

Hard rejects: Ancient cores/gears/screws/shaft/spring/giant core; cooked monster meals; Gibdo Bandage; Like Like Stone — see §4.1.

---

## 10. Implementation & roadmap

**Resolver flow:** Before consume → validate inventory → atomic consume → grant one DB item in `ELIXIR_EFFECTS`. `ingredientRole` → `effectFamily` / `element` → **`itemRarity`** rules. Hybrid resolver + small override table recommended; conflicts: fail, dominant tag, or downgrade.

**Sketch:** `/mix` or `/brew` → e.g. `elixirMixingModule.js` → `{ outputItemName, reason, consumed }`; no duplicated buff math.

**BotW:** 1 critter + 1 part (+ extras); duplicates strengthen. **This bot:** “duration” → **charges** (rarity / part tier), not minutes.

| # | Phase |
| --- | --- |
| 0 | Parity: item defs ↔ `ELIXIR_EFFECTS` |
| 1 | Recipe-based mixer (E2E proof) |
| 2 | Tags + simple mixes |
| 3 | Conflicts, rarity tuning, logging |
| 4 | *(opt)* Hidden recipes |

**Open decisions (condensed):** Tagging, min/max inputs, resolver tie-breakers, charges vs clock, one elixir slot / overwrite, economy on failed mix, consumption rules later, UX, analytics.

Roll out behind flags; tune from usage.

---

## Related code

`bot/modules/elixirModule.js` · `bot/commands/jobs/crafting.js` · item apply path · `ItemModel.js`
