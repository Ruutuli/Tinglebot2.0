# Sources auto-calculate from ItemModel flags

## Problem

- On the website, **Sources** shows "None" for Honey Candy even though it is craftable (Cook job).
- The site should show obtain methods (Gathering, Looting, Traveling, Exploring, Vending, Special Weather, Pet Perk, **Crafting**) based on what is true in [bot/models/ItemModel.js](bot/models/ItemModel.js).
- The user also wants the **database** `obtain` field updated: add each method to `obtain` when the corresponding flag is true (if not already there).

## Approach

1. **Display**: Derive Sources from flags in `formatSources()` (add Crafting and Pet Perk) so the website always shows the correct list.
2. **Database**: Add a **backfill script** that, for every item, computes `obtain` from flags (activity + special weather) and updates the document when `obtain` is missing entries or is out of sync. That way the stored `obtain` array is populated from flags (adds e.g. "Crafting" when `crafting: true` and it’s not already there).

## Implementation

### 1. Display: `formatSources` and API ([dashboard/lib/item-utils.ts](dashboard/lib/item-utils.ts), [dashboard/app/api/models/items/route.ts](dashboard/app/api/models/items/route.ts))

- **ItemData** in item-utils: add `crafting?: boolean` and `petPerk?: boolean`.
- **formatSources**: after existing checks, add:
  - `item.crafting` → push `"Crafting"`.
  - `item.petPerk` → push `"Pet Perk"`.
- **Items API**: add `petPerk` to the `.select()` list so the frontend receives it.
- **Optional**: Add "Crafting" and "Pet Perk" to filter options and source filter conditions in the items API.

### 2. Database: compute `obtain` from flags and update documents

Use the same mapping as [dashboard/lib/item-field-sync.ts](dashboard/lib/item-field-sync.ts):

- **Activity → obtain**: `gathering` → "Gathering", `looting` → "Looting", `crafting` → "Crafting", `vending` → "Vending", `traveling` → "Travel", `exploring` → "Exploring".
- **Special weather → obtain**: `specialWeather.muggy` → "Muggy Weather", `flowerbloom` → "Flower Bloom", etc. (same as `syncSpecialWeather` in item-field-sync).

Note: "Pet Perk" is stored in **petperkobtain**, not `obtain`, so the backfill only syncs activity + weather into `obtain`.

**Backfill script** (e.g. [dashboard/scripts/sync-obtain-from-flags.js](dashboard/scripts/sync-obtain-from-flags.js)):

- Connect to MongoDB (reuse pattern from [dashboard/scripts/update-non-crafted-rarity.js](dashboard/scripts/update-non-crafted-rarity.js): `MONGODB_URI`, mongoose, minimal schema with `obtain`, activity flags, `specialWeather`).
- For each item:
  - Build target `obtain` array from flags (activity map + weather map; add only when flag is true).
  - If current `item.obtain` is different (missing entries or has extras that shouldn’t be there), set `obtain` to the target and `updateOne` (or bulkWrite).
- Log how many documents were updated.

Run once (or on demand) to fix existing items like Honey Candy so their `obtain` array includes "Crafting" when `crafting: true`.

### 3. Optional: shared “compute obtain from flags” helper

- Add a function (e.g. in [dashboard/lib/item-utils.ts](dashboard/lib/item-utils.ts) or [dashboard/lib/item-field-sync.ts](dashboard/lib/item-field-sync.ts)) that, given an item (or a subset of fields), returns the canonical `obtain` array (activity + weather names only). Use it in the backfill script so the same logic drives both display (formatSources) and DB (backfill). Display uses slightly different names for one entry (e.g. "Traveling" vs "Travel"); the backfill should use the **same** names as the dashboard sync (e.g. "Travel") so the DB stays consistent with what the admin form would produce.

## Files to change

| File | Change |
|------|--------|
| [dashboard/lib/item-utils.ts](dashboard/lib/item-utils.ts) | Add `crafting`, `petPerk` to ItemData; in `formatSources`, add Crafting and Pet Perk. |
| [dashboard/app/api/models/items/route.ts](dashboard/app/api/models/items/route.ts) | Add `petPerk` to select; optionally add Crafting/Pet Perk to source filter options and conditions. |
| **New**: [dashboard/scripts/sync-obtain-from-flags.js](dashboard/scripts/sync-obtain-from-flags.js) | Backfill script: for each item compute `obtain` from activity + weather flags; update document if `obtain` differs. |

## Result

- **Display**: Honey Candy (and any item with `crafting: true`) shows **Sources: Crafting**; items with `petPerk: true` show **Pet Perk**.
- **Database**: After running the backfill script, each item’s `obtain` array is updated to include all methods implied by its flags (e.g. "Crafting" added when not already there). The bot and any other consumer that reads `item.obtain` will then see the correct list.
