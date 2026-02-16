# Exploring System README (Bot + Dashboard)

## One sentence summary
Players spend stamina to explore map quadrants via the bot (`/explore`) and the dashboard. Outcomes come from Party state plus database models (Square, Monster, Item, Relic) until a quadrant is cleared, then the party chooses what to do next.

## Core rules and intent
* Exploring is the “leave the village and push the map forward” system.
* All interaction is through the bot and dashboard.
* No `/tableroll` and no table rolls. Outcomes are driven by commands, Party state, and database models.
* The Party holds moment to moment expedition state. The canonical map lives in `exploringMap` (Square model) for display and long term truth. This is important.

---

# 1) Data models and collections

## Map (Squares and Quadrants)
* Model: `Square` in `bot/models/mapModel.js`
* Collection: `exploringMap`
* Key fields
  * `squareId`
  * `region`
  * `status` (inaccessible | explorable)
  * `quadrants[]` (QuadrantSchema)
    * `quadrantId` (Q1 to Q4)
    * `status` (inaccessible | unexplored | explored | secured)
    * `blighted`
    * `discoveries[]`
    * `exploredBy`
    * `exploredAt`

Dashboard mirrors the same schema in `dashboard/models/mapModel.js`.

## Expedition Party
* Model: `Party` in `bot/models/PartyModel.js`
* Key fields
  * `partyId`
  * `leaderId`
  * `region`
  * `square`
  * `quadrant`
  * `status` (open | started) and code uses completed for retreat, make sure enum supports it
  * `quadrantState` (unexplored | explored | secured)
  * `currentTurn`
  * `totalHearts`
  * `totalStamina`
  * `characters[]` (includes `items[]`)
  * `gatheredItems[]`

Dashboard mirrors in `dashboard/models/PartyModel.js`.

## Relics
* Model: `Relic` in `bot/models/RelicModel.js`
* Collection: `relics`
* Key fields (partial list, keep schema as source)
  * `name`
  * `unique`
  * `rollOutcome`
  * `discoveredBy`
  * `appraised`
  * `appraisedBy`
  * `artSubmitted`
  * `imageUrl`
  * `archived`
  * `deteriorated`

Dashboard mirrors in `dashboard/models/RelicModel.js`.

## Monsters (by region)
* Model: `Monster` in `bot/models/MonsterModel.js`
* Region flags used by `getMonstersByRegion(region)` in `bot/modules/rngModule.js`
  * `eldin`
  * `lanayru`
  * `faron`
* Exploration specific flags (available for explore only pools later)
  * `exploreEldin`
  * `exploreLanayru`
  * `exploreFaron`

## Items (gather)
* Model: `ItemModel` (used by explore gather logic)
* Region flags on items
  * `eldin`
  * `lanayru`
  * `faron`
* Explore gather filters with `item[party.region] === true`

## Character stats
* Model: `Character` in `bot/models/CharacterModel.js`
* Required fields
  * `currentHearts`
  * `currentStamina`

## Pins (dashboard)
* Model: `dashboard/models/PinModel.js`
* Key fields (as implemented)
  * `name`, `description`
  * `coordinates` (lat, lng in a 24000 by 20000 canvas space)
  * `gridLocation` (A1 to J12, derived by `calculateGridLocation()`)
  * `icon`, `color`, `category`
  * `createdBy`, `discordId`
  * `isPublic`
  * `imageUrl`

---

# 2) Commands (bot)

## `/explore` subcommands
File: `bot/commands/exploration/explore.js`

Subcommands and parameters:
* `roll` (id, charactername)
* `rest` (id, charactername)
* `secure` (id, charactername)
* `move` (id, charactername, direction)
* `retreat` (id, charactername)
* `camp` (id, charactername, duration)
* `item` (id, charactername) (uses a healing item from loadout)

Creation, join, and start are dashboard only. There is no bot setup, join, start.

## Region storage and starting squares
* Regions stored lowercase: `eldin`, `lanayru`, `faron`
* Start squares per region
  * Eldin: D3 Q3
  * Lanayru: G4 Q2
  * Faron: H6 Q4

---

# 3) Roll loop (the heart of exploring)

## Stamina cost for `/explore roll`
Cost is determined by `Party.quadrantState` and deducted from `Party.totalStamina`:
* `unexplored`: 2
* `explored`: 1
* `secured`: 0

## Roll outcomes and odds
Each `/explore roll` produces exactly one outcome.

* Monster: 45%
  * Tier 4 and below: simple encounter
  * Tier 5 and above: raid path exists but is currently disabled by `DISABLE_EXPLORATION_RAIDS`
* Item: 25% (gather a region item)
* Explored: 15% (quadrant cleared, prompt choice menu)
* Ruins: 6% (Yes or No buttons, Yes costs 3 stamina when implemented)
* Camp: 5% (camp site found)
* Chest: 1% (open chest flow, costs 1 stamina when implemented)
* Old map: 1% (take to Inariko Library to decipher)
* Monster camp: 1% (report to town hall to mark on map)
* Relic: 0.5% (rare, appraisal flow)
* Grotto: 0.5% (rare, Yes or No buttons, Yes costs 1 stamina plus 1 goddess plume when implemented)

Ruins and Grotto show Yes or No buttons. Other outcomes continue with next turn messaging. It repeats a bit by design.

## What happens on each outcome (current behavior plus planned hooks)

### Monster
* Monster is selected via `getMonstersByRegion(party.region)` (queries `Monster` by `{ [region]: true }`)
* Tier logic
  * Tier 4 and below: encounter flow, may loot on win
  * Tier 5 and above: raid path exists but currently disabled
* Loot rule in design
  * Killing blow earns loot, unless high tier then each member gets a loot outcome via relevant flag

### Item
* Gather item chosen from `ItemModel` filtered by region flag
* Item goes to the acting member (the current turn character)
* Also recorded in `Party.gatheredItems[]`

### Explored (quadrant cleared prompt)
When the system prints “Quadrant Explored” and “What to do next”, it is the menu state:
* Rest (3 stamina)
* Secure (5 stamina plus resources)
* Roll again in same quadrant (1 stamina, meaning run `/explore roll` again)
* Move to next quadrant (2 stamina via `/explore move`)

### Ruins
* Shows Yes or No buttons
* Yes should deduct 3 stamina and run ruins flow (not implemented yet)
* No continues to next turn

### Grotto
* Shows Yes or No buttons
* Yes should consume 1 goddess plume plus 1 stamina and run grotto cleanse flow (not implemented yet)
* No marks for later (and still should be reportable for map marking)

### Chest
* Costs 1 stamina when implemented
* Runs chest flow when implemented

### Old map
* Take to Inariko Library to decipher (follow up system TBD)

### Monster camp
* Report to town hall and mark on map (dashboard pin or marking workflow)

### Relic
* Adds relic discovery context, then goes into relic flow later (see Relics section)

### Camp (found)
* This is “camp site found” as an outcome.
* Separately, `/explore camp` is the action used to camp for a duration in secured quadrants.

---

# 4) Quadrants, movement, and map state

## Grid and naming
* Map is a grid of squares labeled A to J and 1 to 12 (example: A1, F8, D11).
* Each square has 4 quadrants (Q1 to Q4).

## Quadrant statuses, meaning, and UI color
Status lives on `Square.quadrants[].status` and is mirrored by `Party.quadrantState` for the current expedition location.

* Inaccessible
  * Meaning: cannot be explored or entered
  * Dashboard color: Black
  * Code: `Quadrant.status = 'inaccessible'`

* Unexplored
  * Meaning: not yet visited, entering and starting costs 2 stamina
  * Dashboard color: Red
  * Code: `Quadrant.status = 'unexplored'`
  * Party runtime: `Party.quadrantState = 'unexplored'`

* Explored
  * Meaning: visited and cleared for now, still risky to backtrack unless secured
  * Dashboard color: Yellow
  * Code: `Quadrant.status = 'explored'`
  * Party runtime: `Party.quadrantState = 'explored'`

* Secured
  * Meaning: path paved, safe travel without monster or blight chance
  * Dashboard color: Green
  * Code: `Quadrant.status = 'secured'`
  * Party runtime: `Party.quadrantState = 'secured'`

Explored but not secured is intentional. Backtracking can be risky but rewarding.

## Movement rule
* Complete exploration required: all four quadrants of a square must be explored before moving on to the next square.
* You cannot explore A2 until all of A1 has been explored and marked at least Explored.

Implementation note: this needs enforcement (see checklist).

## Party location vs canonical map
* Party tracks `region`, `square`, `quadrant`, and `quadrantState` during expedition.
* Canonical map is `exploringMap` Square documents. Post expedition, update Square quadrant statuses based on party activity so the public map stays in sync. This sync is not done yet.

---

# 5) Stamina and action costs

Stamina is deducted from the current turn character and totals are recalculated from all characters.

Costs enforced in `explore.js` where implemented:
* `/explore roll`
  * 2 stamina if `Party.quadrantState = unexplored`
  * 1 stamina if `Party.quadrantState = explored`
  * 0 stamina if `Party.quadrantState = secured`
* `/explore rest`
  * 3 stamina
  * Allowed only in explored or secured quadrant
* `/explore secure`
  * 5 stamina
  * Explored quadrant only
* `/explore move`
  * 2 stamina
  * Moves to adjacent quadrant, new quadrant becomes unexplored
* `/explore camp`
  * 0 stamina cost, cost is time
  * 1 to 8 hours, recovers hearts and stamina over time
  * Currently secured quadrants only

Planned action costs for special flows:
* Chest open: 1 stamina
* Ruins explore: 3 stamina
* Grotto cleanse: 1 stamina plus 1 goddess plume

---

# 6) Blight and exposure

## Blighted quadrants
When a quadrant is revealed and has 25% or more blight coverage:
* The party that explored it must run exposure logic (exposure command or database flag).
* This should trigger when the quadrant is revealed and threshold is met.

When a party travels through a previously explored or secured quadrant that has blight:
* They must also run exposure every time they enter or pass through.
* Exposure can stack across repeated travel. Yeah, it can get nasty.

Implementation note: Quadrant has `blighted` in schema, exposure wiring is still to do.

---

# 7) Parties and turn order

## Party size and loadout
* Party size: 1 to 4.
* Per member gear: 1 set of armor plus 3 items.
* Items can be healing items and or paving bundles.

## Shared pools
* Total hearts and total stamina are summed for the party.
* Actions draw from this pool, but the acting member is still the “owner” of a result for attribution.

## Turn order
* Predetermined before expedition.
* Everyone takes turns running `/explore roll` until “explored this area” appears.
* The member whose turn produced a gatherable keeps that item.
* The last person to act in a context (killing blow, securing) is recorded as responsible for attribution and reporting.

## Expedition start
* At start, post each character’s hearts, stamina, and items once. The app computes combined totals.

## End of expedition split (design rule)
* Remaining hearts and stamina are evenly divided among members.
* If remainder exists, a tiebreaker decides who gets it.
* If there is “too much”, extra is discarded.
Implementation note: not yet in code.

---

# 8) KO, failure, and being stuck

## Individual KO
* Only the KO’d member loses hearts, not the whole party.
* A fairy or tonic revives that member.
* KO’d characters are skipped in turn order during monster encounters until revived.

## Full party KO (all collective hearts lost)
Design consequences:
* All items collected and brought are lost.
* Any quadrants marked Explored revert to Unexplored.
* Characters wake in their starting village with 0 hearts and 0 stamina.
* Week long debuff
  * No healing or stamina items
  * No healer services
  * Cannot explore
  * Stamina recovers 1 per day during this period
* After week, the character can use healing and stamina items to return to full.

Current code:
* `handleExpeditionFailed` exists and returns party to region start with 0 hearts and 0 stamina, items lost.
* Week debuff and 1 per day recovery are not implemented.

## Running out of stamina (cannot get home)
Design:
* Party is stuck until they recover enough stamina.
* Use `/explore camp` in the wild to recover hearts and stamina, then continue.

Current code:
* `/explore camp` exists but is secured quadrant only.
* Decide whether to allow camp in explored quadrants for “stuck” recovery or keep secured only and document it.

---

# 9) Items and paving bundles

## Item slot rule
* Each party member can bring 3 items.

## Bundles for paving
* 5 Eldin Ore equals 1 bundle equals 1 item slot
* 10 wood equals 1 bundle equals 1 item slot

## Secure quadrant (paving)
Design requirement:
* 5 stamina plus 500 tokens plus 10 wood plus 5 Eldin Ore
* Materials must be brought on expedition
* Track who paid the 500 tokens

Current code:
* Checks for Wood and Eldin Ore presence in party items
* No quantity checks, no token check, no consumption yet
* Sets `Party.quadrantState = secured`

---

# 10) Healing rules

* Fairies: revive with hearts equal to the party member with the highest heart count.
* Fairy Tonics: heal the entire party’s hearts.
* Rest: heals entire party hearts and revives KO’d members, costs 3 stamina.
* When healing is allowed
  * During tier 5 and above monster encounters, healing is allowed.
  * Otherwise healing happens only when prompted (after “explored this area” type prompts), using the healing item action.

Implementation note: Rest is already full party heal and revive in code as of your implemented checklist.

---

# 11) Relics

Relics are cultural items found during exploration (quadrants, ruins, chests). The identity is determined after appraisal, then the relic outcome is revealed.

## Finding and getting to Inariko
* Relics can be found while searching quadrants, in ruins, or in chests.
* If finder does not reside in Inariko, use travel or delivery mechanic to get the relic to Inariko before appraisal.

## Appraisal eligibility and cost
* Only Artists or Researchers residing in Inariko can appraise, or an NPC appraiser for 500 tokens.
* Appraiser spends 3 stamina to perform appraisal.
* When a character discovers a relic, that character’s owner must pause further expedition participation until the relic is appraised.

## After appraisal, relic outcome and art
* After mod approval, the finder triggers the relic outcome via bot or dashboard. System runs the `relic` command or flag to determine which relic.
* First to find and successfully appraise in full including artwork receives 1,000 tokens.
* Art requirements
  * 1:1 ratio
  * At least 500 by 500 px
  * PNG
  * Transparent background
* Time limit for art: within 2 months of appraisal or the relic is lost to time.
* After art submission, relic is removed from character inventory and donated to the library.

## Library Archives
* Archives is a room found during “The Mystery Door: Quest for Ancient Secrets” event.
* Dashboard and site should display a relic list plus images.

## Duplicates
* Duplicates must still be turned in for appraisal.
* Same process, minus the image requirement.
* A reward may be given for submitting duplicates.

## Deadlines and consequences
* Appraisal within 7 days of discovery
  * If missed, relic deteriorates and is removed from inventory, becomes unappraisable.
* Submission including form and art within 2 months
  * Some relics are unique, missed submissions can mean lost forever.

## Relic locks and roster rule
* Relics are locked to the character who found them.
* If a character holding an unappraised or unsubmitted relic leaves the active roster, the relic is lost with that character.

## Relic flow steps (new system)
1. Find relic (added to inventory, expedition participation paused for that character)
2. Get to Inariko (travel or delivery if needed)
3. Appraisal request (dashboard, choose PC appraiser or NPC 500 tokens, optional description)
4. Appraisal (appraiser confirms, 3 stamina deducted, payment if applicable, mod approves)
5. Relic outcome (finder triggers via bot or dashboard, run relic flag, staff can limit uniques)
6. Art submission (upload art, deadline 2 months)
7. Library donation (remove from inventory, add to archives, award first completion 1,000 tokens if applicable)

Implementation note: Model exists and discovery messaging exists. Full wiring, deadlines, locks, and archive display are not wired yet.

---

# 12) Dashboard map UI and assets

## Base square images
* URL pattern:
  * `https://storage.googleapis.com/tinglebot/maps/squares/MAP_0002_Map-Base/MAP_0002_Map-Base_{squareId}.png`
* Example:
  * `.../MAP_0002_Map-Base_A1.png`
* Assets exist for A1 to J9 in that set.
* Plan expects full grid A1 to J12, so squares 10 to 12 should follow same pattern when assets exist.

## CSV seed and cross check
File: `ROTW_Map Coords_2025 - Sheet1.csv`

Columns:
* Square (example A1)
* Square Letter
* Square Number
* Quadrant (1 to 4)
* Blight? (Yes or No)
* Region
* Status (Inaccessible | Explorable)

Mapping:
* Status Explorable means quadrant can start as `unexplored`
* Status Inaccessible means `inaccessible`
* Blight? maps to `Quadrant.blighted`
* Region maps to `Square.region` and should be normalized to lowercase to match the bot. Example Eldin to eldin.
The CSV does not define pixel coordinates. It defines existence, region, blight, and accessibility.

## Pins
* Pin placement is click on map, dashboard converts click to the stored coordinate system and creates a Pin.
* Pins can mark grottos, monster camps, and other POIs.
* Filter by category and visibility as needed.

## Drawing layer (roads, paths, boundaries)
* Drawing is separate from pins.
* Store strokes as polyline or polygon data per square or per map in a new collection or in Square metadata.
* Render over base image.
This part is TBD, but it is in plan.

## Mobile note
* Map page will be ugly on mobile.
* Recommend desktop view and show a notice on small screens.

---

# 13) Expedition timing and reporting

* Parties have 24 hours from expedition start to complete the journey and submit a report.
* Separately, map marking must be completed within 24 hours of expedition
  * Mark grottos, monster camps, roads, and other findings
  * If party does not complete marking in time, a mod completes it

New system intent:
* No manual forms. Bot actions and dashboard state are the report.
* Dashboard should surface party location, hearts, stamina, items used, and discoveries for mods to apply to the canonical map.

---

# 14) Example output (what players see)
🗺️ Expedition: Tingle Encountered a Monster!
Tingle encountered Stalizalfos during exploration!
Expedition ID: E593661
Current Location: H8 Q2
Party Hearts: 9996
Party Stamina: 9993
Tingle Hearts: 9996/9999
Battle Outcome: Win!/Loot
Loot Found: Lizalfos Talon

Quadrant Explored!
You have successfully explored this quadrant. You can now:
Rest (3 stamina)
Secure quadrant (5 stamina + resources)
Roll again in same quadrant (1 stamina)
Move to next quadrant (2 stamina)

Next turn: Tingle
Command: Use /explore roll with Expedition ID E593661 and Character Tingle to take your turn

---

# 15) Codebase pointers (key files)
* `bot/commands/exploration/explore.js`
* `bot/models/mapModel.js` (Square, exploringMap)
* `bot/models/PartyModel.js`
* `bot/models/RelicModel.js`
* `bot/models/MonsterModel.js`
* `bot/modules/rngModule.js` (getMonstersByRegion)
* `bot/modules/exploreModule.js` (calculateTotalHeartsAndStamina, getCharacterItems, formatCharacterItems)
* `dashboard/models/mapModel.js`
* `dashboard/models/PartyModel.js`
* `dashboard/models/RelicModel.js`
* `dashboard/models/PinModel.js`
* Dashboard page: `explore/[partyId]/page.tsx`
* Dashboard API: `/api/explore/parties/[partyId]`

---

# 16) Implementation status (as of current codebase)

## Implemented
☑ Map and quadrant schema in Square (exploringMap), QuadrantSchema includes status, blighted, discoveries. Bot and dashboard models.
☑ Party schema includes region, square, quadrant, quadrantState, currentTurn, totalHearts, totalStamina, characters, gatheredItems, progressLog.
☑ Relic schema exists with appraisal and art fields (appraised, rollOutcome, artSubmitted, etc.).
☑ Bot `/explore` subcommands exist: roll, rest, item, secure, move, retreat, camp. Setup, join, start are dashboard only.
☑ Roll stamina costs use Party.quadrantState: 2 unexplored, 1 explored, 0 secured.
☑ Roll outcomes exist in code: Monster, Item, Explored, Chest, Old map, Ruins, Relic, Camp, Monster camp, Grotto. Odds match your list (45, 25, 15, 6, 5, 1, 1, 1, 0.5, 0.5).
☑ Monster encounters use `getMonstersByRegion(region)`. Tier 5 plus raid path exists but disabled by `DISABLE_EXPLORATION_RAIDS`.
☑ Item gather uses region filtered items and records in inventory and gatheredItems.
☑ Rest costs 3 stamina, heals all party hearts and revives KO’d.
☑ Secure costs 5 stamina and checks for Wood and Eldin Ore presence, then sets quadrantState secured (no full consumption yet).
☑ Move costs 2 stamina and sets new quadrantState unexplored.
☑ Camp is secured quadrant only, duration 1 to 8 hours, recovers hearts and stamina per member.
☑ Retreat sets party status completed and returns party to village.
☑ Full party KO handler exists: return to region start, 0 hearts and 0 stamina, items lost.
☑ Ruins and Grotto have Yes or No buttons with messaging and progress log, but their Yes flows are TBD.
☑ Dashboard party page supports create, join, start expedition, add characters and items, view party state and progress log, square preview.
☑ Dashboard API endpoint exists for party data.

## Partial or not implemented
☐ Map sync: Party actions should update exploringMap Square quadrant statuses and blight so public map matches canonical state.
☐ Movement rule enforcement: all 4 quadrants before moving to adjacent square should be enforced in move logic where square transitions happen.
☐ Secure full cost: enforce 500 tokens plus exact quantities 10 wood and 5 Eldin Ore, consume items, track token payer.
☐ Blight exposure: trigger exposure when quadrant revealed with 25% plus blight and when traveling through blighted quadrants, exposure stacks.
☐ Week debuff after expedition failure: no healing items, no healer, no exploring, stamina recovers 1 per day for a week.
☐ End of expedition split: evenly divide remaining hearts and stamina, tiebreak remainder, discard excess.
☐ Relic full flow wiring: lock participation, appraisal request, appraiser stamina and payments, mod approval, outcome reveal, deadlines, archive display.
☐ Map UI: quadrant colors, clouded vs resolved squares, mod tools to update and mark findings.
☐ User map updates: drawing layer and pins workflow for exploring map UI (Pin model exists).
☐ 24 hour rules enforcement in app for expedition completion and for map marking fallback.
☐ Ruins Yes flow: deduct 3 stamina and run ruins exploration system.
☐ Grotto Yes flow: consume 1 goddess plume plus 1 stamina and run cleanse flow.
☐ Tier 5 plus retreat attempts inside encounter loop: retreat is a subcommand, confirm the in encounter retreat attempt flow and its 1 stamina cost per attempt.
☐ Optional: explore specific monster pool using `Monster.exploreEldin` and friends.
☐ Future: mount exploring (basic, mid, high stamina) remains out of scope.

---

# 17) Future extension: exploring pouch size upgrade
Add an upgrade path later to increase exploring pouch size beyond 3 item slots per member. This should integrate with:
* Party loadout validation (max items)
* Dashboard party builder UI
* Balance rules around bundles for paving vs healing items

No behavior change now, just keep it on the roadmap so we do not paint ourselves into corner.
