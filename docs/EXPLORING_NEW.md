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
  * `squareId`, `region`, `status` (inaccessible | explorable)
  * `quadrants[]` (QuadrantSchema)
    * `quadrantId` (Q1 to Q4), `status`, `blighted`
    * `discoveries[]` (DiscoverySchema: type, discoveredBy, discoveredAt, discoveryKey, pinned, pinId)
    * `exploredBy`, `exploredAt`
    * `oldMapNumber`, `oldMapLeadsTo` (chest | ruins | relic | shrine)
    * `ruinRestStamina` (stamina recovered when rolling in a quadrant where ruins camp was found)
  * `image`, `pathImageUrl` (user-drawn path image per square, from expeditions)
  * `mapCoordinates`, `displayProperties`

Dashboard mirrors the same schema in `dashboard/models/mapModel.js`.

## Expedition Party
* Model: `Party` in `bot/models/PartyModel.js`
* Key fields
  * `partyId`, `leaderId`, `region`, `square`, `quadrant`
  * `status` (open | started | completed | cancelled)
  * `quadrantState` (unexplored | explored | secured)
  * `currentTurn`, `totalHearts`, `totalStamina`
  * `characters[]` (includes `items[]`), `gatheredItems[]`
  * `blightExposure` (incremented when revealing or traveling through blighted quadrants)
  * `progressLog[]`, `reportedDiscoveryKeys[]`, `exploredQuadrantsThisRun[]`, `pathImageUploadedSquares[]`

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
* `secure` (id, charactername)
* `move` (id, charactername, quadrant)
* `item` (id, charactername, item) — use a healing item from loadout
* `camp` (id, charactername) — rest in place (cost depends on quadrant state; see Stamina and action costs)
* `end` (id, charactername) — end expedition and return home (only at starting quadrant)
* `retreat` (id, charactername) — attempt to retreat from a tier 5+ monster battle (1 stamina per attempt)
* `grotto` (subcommand group):
  * `continue` — enter or continue the grotto trial after cleansing
  * `targetpractice` — take your turn in a Target Practice grotto trial
  * `puzzle` — submit an offering for a Puzzle grotto (mod approves or denies)
  * `maze` — maze direction or wall roll (left/right/straight/back, or “wall” for Song of Scrying)
  * `travel` — return to a known grotto (costs 2 stamina per party member)

There is no separate `rest` subcommand; “Rest (3 stamina)” in the post-explore menu is done via `/explore camp` when in an explored quadrant (3 stamina, 25% max hearts per member). Creation, join, and start are dashboard only.

## Region storage and starting squares
* Regions stored lowercase: `eldin`, `lanayru`, `faron`
* Start squares per region (party returns here on full party KO; used for “end expedition” check)
  * Eldin: **H5 Q3**
  * Lanayru: **H8 Q2**
  * Faron: **F10 Q4**

---

# 3) Roll loop (the heart of exploring)

## Stamina cost for `/explore roll`
Cost is determined by `Party.quadrantState` and deducted from `Party.totalStamina`:
* `unexplored`: 2
* `explored`: 1
* `secured`: 0

## Roll outcomes and odds
Each `/explore roll` produces exactly one outcome. Rerolls apply when: (1) “explored” would occur twice in a row at the same location; (2) a special outcome (ruins/relic/grotto/monster_camp) is rolled but the square already has 3 special discoveries (only Yes choices count); (3) grotto is rolled but the square already has a grotto; (4) the square has ≥1 special discovery and a discovery-reduce roll fails (special is then skipped and rerolled).

Nominal probabilities (after any reroll):
* Monster: 45%
  * Tier 4 and below: simple encounter
  * Tier 5 and above: raid path exists but is currently disabled by `DISABLE_EXPLORATION_RAIDS`
* Item: 22% (gather a region item; rarity-weighted)
* Explored: 16% (quadrant cleared, prompt choice menu)
* Fairy: 3% (fairy encounter)
* Chest: 1% (Yes/No; Yes costs 1 stamina, opens chest — implemented)
* Old map: 1% (take to Inariko Library to decipher)
* Ruins: 2% (Yes/No; Yes costs 3 stamina and runs ruins exploration — implemented)
* Relic: 0.5%
* Camp: 4% (camp site found; immediate hearts + stamina recovery for current character)
* Monster camp: 5% (report to town hall to mark on map)
* Grotto: 0.5% (Yes/No; Yes costs 1 Goddess Plume + 1 stamina, then grotto trial — implemented)

Ruins, Grotto, Chest, and Monster camp show Yes or No buttons where applicable. Other outcomes continue with next turn messaging.

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
* Yes: deducts 3 stamina (or struggle), then weighted roll: chest 7, camp 3, landmark 2, relic 2, old_map 2, star_fragment 2, blight 1, goddess_plume 1 (total 20). Outcomes include ruin-rest spot (stored on map `ruinRestStamina` for future visits), relic, old map, Star Fragment, blight, Goddess Plume, landmark (marked on map), or nested chest (Yes/No, 1 stamina to open). Implemented.
* No: continue to next turn; does not count toward special-discovery cap.

### Grotto
* Yes: consumes 1 Goddess Plume (from loadout) + 1 stamina; creates Grotto doc; rolls trial type (blessing / maze / target practice / puzzle). Blessing = Spirit Orbs for all; maze/target/puzzle run via `/explore grotto continue`, `maze`, `targetpractice`, `puzzle`. Implemented.
* No: mark for later; reportable for map marking.

### Chest
* Yes: costs 1 stamina (or struggle); opens chest — each party member gets loot (item or relic; relic chance 8%). Implemented.
* No: continue with `/explore roll`.

### Old map
* Take to Inariko Library to decipher (follow up system TBD)

### Monster camp
* Report to town hall and mark on map (dashboard pin or marking workflow)

### Relic
* Adds relic discovery context, then goes into relic flow later (see Relics section)

### Camp (found)
* Roll outcome “camp”: safe space found; current character recovers 1–3 hearts and 1–3 stamina immediately.
* Separately, `/explore camp` is the action: in **secured** quadrant costs 0 stamina and recovers 50% max hearts per member; in **explored** quadrant costs 3 stamina and recovers 25% max hearts per member. When the party is stuck (not enough stamina for 3), camp costs 0 and recovers 25% hearts plus 1–3 stamina per member. Camp is allowed in both explored and secured quadrants.

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
* Complete exploration required: all four quadrants of a square must be explored or secured before moving to an adjacent square (except when moving back to the **starting square** to end the expedition, which is allowed even if the current square is not fully explored).
* Enforcement: move logic blocks leaving the square until every non-inaccessible quadrant in the current square is explored or secured.

## Party location vs canonical map
* Party tracks `region`, `square`, `quadrant`, and `quadrantState` during expedition.
* Canonical map is `exploringMap` (Square model). Map sync is implemented: when a quadrant is marked explored (roll outcome “explored” or move into unexplored), or secured (secure action), the bot updates the corresponding Square document. On full party KO, quadrants this expedition had marked explored are reset to unexplored.

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
  * Cost depends on **destination** quadrant state: 2 stamina (unexplored), 1 stamina (explored), 0 (secured). Moving into a new quadrant marks it explored on the map if it was unexplored.
* `/explore camp`
  * Secured: 0 stamina; recovers 50% max hearts per member.
  * Explored: 3 stamina; recovers 25% max hearts per member.
  * Stuck in wild (party cannot pay 3): 0 cost; recovers 25% max hearts and 1–3 stamina per member.

Special flows (implemented):
* Chest open: 1 stamina (or hearts if struggling).
* Ruins explore: 3 stamina (or struggle).
* Grotto cleanse: 1 Goddess Plume + 1 stamina.

---

# 6) Blight and exposure

## Blighted quadrants
* Quadrant has `blighted` (boolean) in schema. When a quadrant is **revealed** (roll outcome “explored” or first entry) and the map quadrant is blighted, the party runs `applyBlightExposure`: `Party.blightExposure` is incremented and a progress log entry is added.
* When a party **moves** into a quadrant that is blighted (e.g. previously explored or secured but blighted), exposure is applied again. Exposure stacks on repeated travel.
* Exposure is logged as outcome `blight_exposure` with reason “reveal” or “travel” and total exposure count.

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

## End of expedition split
* On **end** (return home from starting quadrant): remaining hearts and stamina are divided evenly among members (integer division); remainder is assigned in order (first members get +1). Each character is capped at their max hearts and max stamina; excess is effectively discarded. Party status set to `completed`; characters’ `currentVillage` set to region village. Loadout items are returned to each character’s inventory. Implemented.

---

# 8) KO, failure, and being stuck

## Individual KO
* Only the KO’d member loses hearts, not the whole party.
* A fairy or tonic revives that member.
* KO’d characters are skipped in turn order during monster encounters until revived.

## Full party KO (all collective hearts lost)
* `handleExpeditionFailed`: party returns to region start square with 0 hearts and 0 stamina; all items brought and gathered are lost; any quadrants this expedition had marked Explored are reset to Unexplored on the map.
* **Recovery debuff:** 7 days (`EXPLORATION_KO_DEBUFF_DAYS`). During this time characters cannot use healing or stamina items, cannot use healer services, and cannot join or go on expeditions. Debuff is stored on character (`debuff.active`, `debuff.endDate`); character timers and join/explore checks enforce it. (Stamina “1 per day” passive recovery during debuff is not implemented.)

## Running out of stamina (cannot get home)
* Party can continue actions by **struggling** (pay cost in hearts: 1 heart = 1 stamina) when stamina is insufficient, or use `/explore camp` to recover.
* Camp is allowed in both explored and secured quadrants. When the party cannot afford the 3-stamina camp cost (“stuck in wild”), camp costs 0 and still grants 25% hearts and 1–3 stamina per member so the party can recover and continue or move home.

---

# 9) Items and paving bundles

## Item slot rule
* Each party member can bring 3 items.

## Bundles for paving
* 5 Eldin Ore equals 1 bundle equals 1 item slot
* 10 wood equals 1 bundle equals 1 item slot

## Secure quadrant (paving)
* Cost: 5 stamina (or struggle) plus **Wood** and **Eldin Ore** in party loadout (or “Wood Bundle” and “Eldin Ore Bundle”). Code consumes **one** of each from whichever party member has it (one Wood or Wood Bundle, one Eldin Ore or Eldin Ore Bundle removed from loadout).
* Not implemented: 500 tokens, exact quantities (10 wood, 5 Eldin Ore), or tracking who paid tokens. Map and party quadrant are set to `secured` and canonical map is updated.

---

# 10) Healing rules

* Fairies: revive with hearts equal to the party member with the highest heart count.
* Fairy Tonics: heal the entire party’s hearts.
* Rest: heals entire party hearts and revives KO’d members, costs 3 stamina.
* When healing is allowed
  * During tier 5 and above monster encounters, healing is allowed.
  * Otherwise healing happens only when prompted (after “explored this area” type prompts), using the healing item action.

Rest (3 stamina in explored quadrant) is done via `/explore camp`: 3 stamina, 25% max hearts per member; it does not explicitly “revive” KO’d in a separate step but adding hearts raises current hearts. Fairies and tonics revive KO’d; `/explore item` uses healing items from loadout when the expedition prompts.

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
☑ Map and quadrant schema in Square (exploringMap): status, blighted, discoveries, exploredBy, exploredAt, oldMapNumber, oldMapLeadsTo, ruinRestStamina, pathImageUrl. Bot and dashboard models.
☑ Party schema: region, square, quadrant, quadrantState, currentTurn, totalHearts, totalStamina, characters, gatheredItems, progressLog, blightExposure, reportedDiscoveryKeys, exploredQuadrantsThisRun, pathImageUploadedSquares.
☑ Relic schema with appraisal and art fields; discovery and creation from explore (roll, ruins, chest).
☑ Bot `/explore` subcommands: roll, secure, move, item, camp, end, retreat; grotto (continue, targetpractice, puzzle, maze, travel). Setup, join, start are dashboard only.
☑ Roll stamina costs: 2 unexplored, 1 explored, 0 secured. Struggle (hearts when stamina short) for roll, secure, move, ruins, chest, grotto.
☑ Roll outcomes: Monster, Item, Explored, Fairy, Chest, Old map, Ruins, Relic, Camp, Monster camp, Grotto — with reroll rules (explored twice, special cap per square, one grotto per square, discovery-reduce).
☑ Monster encounters via `getMonstersByRegion(region)`; tier 5+ raid path disabled by `DISABLE_EXPLORATION_RAIDS`.
☑ Item gather: region-filtered, rarity-weighted; inventory and gatheredItems updated.
☑ (Rest in menu = camp in explored: 3 stamina, 25% max hearts per member.)’d.
☑ Secure: 5 stamina; consumes one Wood (or Wood Bundle) and one Eldin Ore (or Eldin Ore Bundle) from party loadout; updates map and party to secured.
☑ Move: cost by destination (2 / 1 / 0 for unexplored / explored / secured); movement rule enforced (all 4 quadrants explored or secured before leaving square, except to start to end). Map sync on explore/secure/move; full party KO resets explored quadrants this run.
☑ Camp: secured 0 stamina / 50% hearts; explored 3 stamina / 25% hearts; stuck-in-wild 0 cost / 25% hearts + 1–3 stamina per member. Allowed in explored and secured.
☑ Blight exposure: applyBlightExposure on reveal and on move through blighted quadrant; stacks.
☑ Full party KO: handleExpeditionFailed — return to start, 0 hearts/stamina, items lost, map reset, 7-day debuff (no items, no healer, no explore).
☑ End-of-expedition split: on end, hearts and stamina divided evenly with remainder, capped at max; loadout items returned to inventory.
☑ Ruins Yes: 3 stamina, weighted roll (chest, camp, landmark, relic, old_map, star_fragment, blight, goddess_plume); ruin-rest stored on map.
☑ Grotto Yes: 1 Goddess Plume + 1 stamina; Grotto doc, trial (blessing/maze/target/puzzle); grotto subcommands for continue, targetpractice, puzzle, maze, travel.
☑ Chest Yes: 1 stamina, open flow with loot (relic chance 8%); can nest from ruins chest outcome.
☑ Dashboard: party create/join/start, characters and items, progress log, square preview, reportable discoveries and pins, path image upload; quadrant status colors; API for party, map quadrant statuses, path images.

## Partial or not implemented
☐ Secure: 500 tokens and exact quantities (10 wood, 5 Eldin Ore) not enforced; no token-payer tracking.
☐ Week debuff: 7-day debuff implemented; passive "1 stamina per day" during debuff not implemented.
☐ Relic full flow: discovery and creation in explore; appraisal request, appraiser stamina/payments, mod approval, outcome reveal, deadlines, archive display — partially wired.
☐ Map UI: quadrant statuses API and explore party page quadrant colors; full map page drawing layer and mod tools TBD as needed.
☐ 24-hour rules for expedition completion and map marking fallback not enforced in app.
☐ Optional: explore-specific monster pool (`Monster.exploreEldin` etc.).
☐ Future: mount exploring (basic, mid, high stamina) out of scope.

---

# 17) Future extension: exploring pouch size upgrade
Add an upgrade path later to increase exploring pouch size beyond 3 item slots per member. This should integrate with:
* Party loadout validation (max items)
* Dashboard party builder UI
* Balance rules around bundles for paving vs healing items

No behavior change now, just keep it on the roadmap so we do not paint ourselves into corner.
