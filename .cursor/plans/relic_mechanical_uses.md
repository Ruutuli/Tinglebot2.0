# Relic Mechanical Uses Implementation

## Current state

- **Relics** are stored as [RelicModel](bot/models/RelicModel.js) documents (discovered by a character, `characterId` / `discoveredBy`). The schema already has a `uses` string field (lore only). Relics are **not** in character inventory; they are separate discovery/archival records.
- **Blight**: Daily roll at 8pm EST via [blightHandler.js](bot/handlers/blightHandler.js) `rollForBlightProgression`. Characters have `currentVillage`, `blightPaused`, `lastRollDate`. There is no village-level "skip roll" today; only per-character `blightPaused` (mod-set).
- **Exploration map**: Map has quadrants/squares; dashboard removes fog of war from the quadrant the party is currently in. Unexplored areas are hidden until the party reaches them (or gets "Quadrant Explored!" outcome).
- **Village**: [VillageModel](bot/models/VillageModel.js) has no relic-related fields; we can add optional fields for active relic effects (e.g. Blessed Hourglass expiry).

From the CSV and [relicOutcomes.js](bot/data/relicOutcomes.js), the relics with **actionable** mechanical uses in scope:

| Relic | Lore use | Priority |
|-------|----------|----------|
| Blessed Hourglass | Activate in village → no blight roll for 1 week | High |
| Blight Candle | Detect/repel blight; "burns out" (consumable) | High |
| Moon Pearl | Immunity to blight corruption | High |
| Lens of Truth | Reveal the entire exploration map so they can see everything | Medium |

**Out of scope for this plan:** Poe's Lantern, Shard of Agony (removed for now).

---

## 1. Relic "use" / activation entry point

- Add a **`/relic use`** (or **`activate`**) subcommand in [bot/commands/inventory/relic.js](bot/commands/inventory/relic.js):
  - Options: `relic_id`, `character` (owner of the relic), and possibly `target` (e.g. village name for Blessed Hourglass).
  - Resolve relic by ID; verify it's appraised, not archived, and owned by the given character.
  - Dispatch to relic-specific logic based on `relic.rollOutcome` (e.g. "Blessed Hourglass", "Blight Candle").
- Only relics with implemented mechanical uses are accepted; others return a "this relic has no mechanical use (yet)" message.

---

## 2. Blessed Hourglass — village blight respite

- **Effect**: When activated in a village, characters in that village do not need to roll for blight for **one week** (no progression, no missed-roll penalty).
- **Data**: Extend [VillageModel](bot/models/VillageModel.js) with e.g. `blessedHourglassActiveUntil: Date`, or store in TempData keyed by village name.
- **Flow**:
  - `/relic use` with Blessed Hourglass: require target = village (or infer from character's `currentVillage`). Set `blessedHourglassActiveUntil = now + 7 days` for that village. Mark relic as used for that activation (one-shot or reusable per your design).
  - In [blightHandler.js](bot/handlers/blightHandler.js): In `rollForBlightProgression` and in missed-roll logic, if `character.currentVillage` has Blessed Hourglass active (now < `blessedHourglassActiveUntil`), treat as "no roll needed this period" (no progression, no missed penalty).

---

## 3. Blight Candle — detect/repel blight, consumable

- **Effect**: (1) Reduce or negate blight exposure when exploring (e.g. ruins); (2) optionally improve or skip daily blight roll while candle is "lit"; (3) "Once the candle burns out it loses its abilities" → consumable (e.g. 1 use or N uses then mark relic as "burned out").
- **Data**: Relic document: add optional `usedCount` / `consumedAt` or `relicState`; or TempData keyed by relic `_id` for uses left / burned out.
- **Flow**: In [explore.js](bot/commands/exploration/explore.js) where blight exposure is applied, check if the party has an active Blight Candle relic; if yes, reduce chance of contracting blight or grant one save, and consume a use. In `rollForBlightProgression`, optional favorable modifier or skip when character has active Blight Candle; then consume/burn out per lore.

---

## 4. Moon Pearl — blight immunity

- **Effect**: "Immunity against the corrupting influence of the blight" → bearer does not contract blight from exposure, and/or blight does not progress.
- **Flow**: Before applying blight (explore ruins, loot, help wanted, raid, etc.), check if the character has an appraised, non-archived Moon Pearl relic; if yes, do not apply blight. In `rollForBlightProgression`, if the character has Moon Pearl, treat as immune (no roll needed, no progression). Ownership = relic discovered by that character, not archived/consumed.

---

## 5. Lens of Truth — reveal the entire exploration map

- **Effect**: When the party has the Lens of Truth (as **relic** or **inventory item**), they can **see the entire map** — all quadrants/squares revealed (no fog of war), so they can see everything.
- **Implementation**:
  - **Where map visibility is determined**: In the code that serves exploration map data to the party (dashboard API for the explore map, and/or any bot-side map payload), add a check: does the party have Lens of Truth? Options:
    - **By relic**: Any party member has an appraised relic with `rollOutcome === "Lense Of Truth"` (or normalized name), not archived.
    - **By item**: Any party member has "Lens of Truth" in inventory (existing item check).
  - If either is true, **treat all quadrants/squares as revealed** for that party (e.g. when building the map response, return full map with no fog of war instead of only current/explored areas).
  - **Files to touch**: Likely [dashboard](dashboard) API that serves map data for the explore page (e.g. parties/[partyId] or map endpoint), and/or [explore.js](bot/commands/exploration/explore.js) / [exploreModule.js](bot/modules/exploreModule.js) if the bot sends map state. Need to locate the exact place(s) that apply fog-of-war / "discovered" filtering and add a branch: if `partyHasLensOfTruth(party)`, return full map.
  - **Grotto maze bypass**: The existing grotto maze bypass in [explore.js](bot/commands/exploration/explore.js) that uses the **inventory item** "Lens of Truth" can remain as-is (optional: also allow the **relic** to satisfy that check so discovering the relic grants both map reveal and grotto bypass).
- **Helper**: `partyHasLensOfTruth(party)` — true if any party member has inventory item "Lens of Truth" **or** an appraised, non-archived relic "Lense Of Truth" (name normalized from [relicOutcomes.js](bot/data/relicOutcomes.js)).

---

## 6. Relic ownership and "has relic" helpers

- Add helpers (e.g. in [relicUtils.js](bot/utils/relicUtils.js)): `characterHasRelic(characterId, relicName)`, `partyHasRelic(partyMemberIds, relicName)`. Check Relic collection: `rollOutcome` normalized to match [relicOutcomes.js](bot/data/relicOutcomes.js) names, `characterId` (or `discoveredBy`) matching, `appraised === true`, `archived === false`, not consumed/burned out if applicable.
- Use canonical list from `RELIC_OUTCOMES` for name matching ("Lens of Truth" / "Lense Of Truth" etc.).

---

## 7. Schema and compatibility

- **RelicModel**: Optionally add `usedAt`, `consumedAt`, or `relicState: { burnedOut, usesLeft }` for consumables (Blight Candle). Or use TempData keyed by relic `_id`.
- **VillageModel**: Add `blessedHourglassActiveUntil: { type: Date, default: null }` for Blessed Hourglass. Mirror in dashboard Village model if needed.

---

## Implementation order (recommended)

1. **Relic "use" entry point** and **"has relic" / "party has Lens of Truth"** helpers.
2. **Blessed Hourglass**: Village field + `/relic use` + blightHandler skip for village.
3. **Moon Pearl**: Blight-application sites + `rollForBlightProgression` immunity check.
4. **Blight Candle**: Explore blight exposure reduction + optional daily-roll benefit + consumable state.
5. **Lens of Truth**: Locate map-serving code (dashboard + bot if applicable); add `partyHasLensOfTruth` and full-map reveal when true. Optionally extend grotto maze bypass to relic.

---

## Files to touch (summary)

- [bot/commands/inventory/relic.js](bot/commands/inventory/relic.js): add `use` subcommand.
- [bot/utils/relicUtils.js](bot/utils/relicUtils.js): `characterHasRelic`, `partyHasRelic`, `partyHasLensOfTruth` (item or relic), canonical name mapping.
- [bot/models/RelicModel.js](bot/models/RelicModel.js): optional consumable fields for Blight Candle.
- [bot/models/VillageModel.js](bot/models/VillageModel.js): `blessedHourglassActiveUntil`.
- [bot/handlers/blightHandler.js](bot/handlers/blightHandler.js): Blessed Hourglass skip; Moon Pearl immunity; optional Blight Candle logic.
- [bot/commands/exploration/explore.js](bot/commands/exploration/explore.js): blight exposure check for Blight Candle and Moon Pearl; optional grotto bypass for Lens of Truth relic.
- **Dashboard and/or bot**: Map API / explore state — add Lens of Truth check and return full map (all quadrants revealed) when party has Lens of Truth (relic or item).
