# Exploring System — Plan for Bot & Dashboard

## One-sentence summary

Users spend stamina to explore map quadrants via the **bot** (`/explore` commands) and **dashboard**; the system uses **Party** state and **database models** (Square, Monster, Item, Relic) to resolve outcomes until the quadrant is cleared, then users can secure it (pave a path), move on, or return to the village—with all state and reports handled in-app so staff can update the public map.

---

## Overview

Exploring is the “leave the village and push the map forward” system. Users spend stamina to move through unknown quadrants; the system resolves outcomes via **commands and database state** (region, party state, and models), not table rolls. When a quadrant is cleared the user can secure it, continue in the same quadrant, or move on. Results are tracked so mods can update the public map. All interaction is through the **bot** and **dashboard**; we **do not use** `/tableroll` or table rolls in the new system.

---

## Codebase alignment (models, commands, and data)

**Models and collections**

| Purpose | Model / collection | Key fields |
|--------|---------------------|------------|
| **Map (squares and quadrants)** | `Square` in `bot/models/mapModel.js` (collection **`exploringMap`**) | `squareId`, `region`, `status` (inaccessible \| explorable), `quadrants[]` with `QuadrantSchema`: `quadrantId`, `status` (inaccessible \| unexplored \| explored \| secured), `blighted`, `discoveries[]`, `exploredBy`, `exploredAt` |
| **Expedition party** | `Party` in `bot/models/PartyModel.js` | `partyId`, `leaderId`, `region`, `square`, `quadrant`, `status` (open \| started), `quadrantState` (unexplored \| explored \| secured), `currentTurn`, `totalHearts`, `totalStamina`, `characters[]` (with `items[]`), `gatheredItems[]` |
| **Relics** | `Relic` in `bot/models/RelicModel.js` (collection **`relics`**) | `name`, `unique`, `rollOutcome`, `discoveredBy`, `appraised`, `appraisedBy`, `artSubmitted`, `imageUrl`, `archived`, `deteriorated`, etc. |
| **Monsters (by region)** | `Monster` in `bot/models/MonsterModel.js` | Region flags: `eldin`, `lanayru`, `faron` (used by `getMonstersByRegion(region)` in `rngModule.js`). Exploration-specific: `exploreEldin`, `exploreLanayru`, `exploreFaron` (available for exploration-only pools). |
| **Character stats** | `Character` in `bot/models/CharacterModel.js` | `currentHearts`, `currentStamina` (required). |

**Bot commands**

- **`/explore`** (`bot/commands/exploration/explore.js`): **roll** (id, charactername), **rest** (id, charactername), **secure** (id, charactername), **move** (id, charactername, direction), **retreat** (id, charactername), **camp** (id, charactername, duration). Setup, join, and start are dashboard-only.
- Regions are stored lowercase: `eldin`, `lanayru`, `faron`. Start squares per region: Eldin D3 Q3, Lanayru G4 Q2, Faron H6 Q4.

**Current explore flow (roll)**

- Stamina cost from **Party.quadrantState**: unexplored → 2, explored → 1, secured → 0. Deducted from **Party.totalStamina**.
- Outcome: ~70% monster, ~30% gather (item). Monsters from **getMonstersByRegion(party.region)** (query `Monster` by `{ [region]: true }`). Gather items from **ItemModel** filtered by `item[party.region]`.
- When “quadrant explored” triggers, **Party.quadrantState** is set to `explored`. Turn advances: **Party.currentTurn**.
- **Canonical map**: `Square` in **exploringMap** holds per-quadrant `status` and `blighted`. **Party** holds current location and **quadrantState** for the current quadrant. Post-expedition, map quadrants (in **exploringMap**) should be updated from party activity so the public map stays in sync.

**Other**

- `bot/modules/exploreModule.js`: `calculateTotalHeartsAndStamina(party)`, `getCharacterItems`, `formatCharacterItems`.
- Dashboard shares `dashboard/models/mapModel.js` (same Square/Quadrant schema) and `dashboard/models/PartyModel.js`, `RelicModel.js` for consistency.

---

## Map structure

- The world map is a **grid of Squares** named by **letters A–J** and **numbers 1–12** (e.g. A1, F8, D11).
- Each Square is split into **4 Quadrants** (Q1–Q4) for exploration.
- **Complete exploration required:** All four quadrants of a map square must be explored before moving on to the next square. You cannot explore A2 until all of A1 has been explored (and marked at least **Explored**).

**Events per quadrant:** Each explore action (`/explore roll`) can result in (among other outcomes) encounter monster (from **getMonstersByRegion(party.region)**), gather (from **ItemModel** by region), blight chance, or special finds (ruins, shrines, etc.). Current roll logic in `explore.js` uses ~70% monster / ~30% item; “quadrant explored” then allows rest, secure, continue, move, or return.

**Alignment with codebase:** The **Square** model (`mapModel.js`, collection **exploringMap**) embeds **QuadrantSchema**: `quadrantId` (Q1–Q4), `status` enum `['inaccessible', 'unexplored', 'explored', 'secured']`, `blighted`, `discoveries[]`. The **Party** model tracks current location (`square`, `quadrant`) and **quadrantState** (unexplored \| explored \| secured) for the quadrant the party is in.

---

## Quadrant statuses (design → implementation)

| Design term   | Meaning | Map color (dashboard) | In code |
|---------------|---------|------------------------|---------|
| **Inaccessible** | Blocked off; cannot be explored. | **Black** | **Quadrant.status** `'inaccessible'` (in Square.quadrants). No entry or explore. |
| **Unexplored** | Not yet visited; costs **2 stamina** to enter and start exploring. | **Red** | **Quadrant.status** `'unexplored'`. **Party.quadrantState** `'unexplored'` → stamina cost 2 in `/explore roll` (`explore.js`). |
| **Explored**   | Visited and cleared for now; visible on the map. Temporary—unless secured, characters must re-explore when passing back through. | **Yellow** | **Quadrant.status** `'explored'`. **Party.quadrantState** `'explored'` → stamina cost 1 to continue in same quadrant. |
| **Secured**    | Path paved; travel without monster/blight chance. | **Green** | **Quadrant.status** `'secured'`. **Party.quadrantState** `'secured'` → stamina cost 0. Set by `/explore secure` when party has resources. |

The “Explored but not Secured” state is intentional: backtracking can be risky but rewarding (might find something new, or get attacked/blighted).

---

## Blighted quadrants

When a quadrant is **revealed** and has **25% or more blight coverage**, the party that explored it must run **exposure** logic (exposure command/flag in the database). The bot/dashboard triggers this when the quadrant is revealed and blight level meets the threshold.

When a party **travels through** a previously explored (or secured) quadrant that has blight, they must also run exposure. This happens **every time** the party travels through any blighted quadrant, and **exposure can stack**. Plan expeditions carefully.

**New system:** We use the **exposure** command/flag when (1) a quadrant is revealed with ≥25% blight, or (2) the party enters/travels through a quadrant that has blight. Outcomes are applied in-app; no table rolls.

---

## Updating and revealing map quadrants

After an expedition, a mod provides a **“clear” version** of the quadrants with their updated status. The party (or dashboard workflow) then marks **significant findings** on the map, such as:

- Grottos  
- Monster camps  
- Newly paved roads in secured quadrants  

A map square is considered **“clouded”** and its overall status undetermined until **all its quadrants are revealed and updated** post-expedition.

**24-hour rule (as of July 1st 2024):** Maps that need to be marked with grottos, monster camps, roads, etc. must be completed by members of the exploration party **within 24 hours** of the expedition. If not completed in this time frame, a mod will complete the marking.

**New system:** Dashboard should support (1) mod upload/update of “clear” quadrant status, (2) party (or designated user) marking findings on quadrants, and (3) fallback for mods to complete marking after 24 hours. “Clouded” vs “resolved” state per square can drive what the map UI shows.

**User-driven map updates:** Users will update the map via the dashboard themselves: they can **draw** on maps (e.g. roads, paths, boundaries) and add **pins** for important locations (grottos, monster camps, points of interest). This replaces or supplements manual mod updates for marking findings.

---

## Dashboard map: images, coordinates, drawing, and pins

**Map base images**

- Square tiles are served from a fixed URL pattern. Example:  
  `https://storage.googleapis.com/tinglebot/maps/squares/MAP_0002_Map-Base/MAP_0002_Map-Base_A1.png`
- Format: `…/MAP_0002_Map-Base/MAP_0002_Map-Base_{squareId}.png` where **squareId** is the square code (e.g. **A1**, **B2**, …, **J9**). Letters **A–J**, numbers **1–9** (asset set "a1–j9"); the full grid in the plan is A–J × 1–12, so squares 10–12 may use the same pattern when assets exist.
- Dashboard map UI should load one image per square (by squareId) and optionally overlay quadrant status, pins, and drawing.

**Map coordinates (CSV source)**

- The file **ROTW_Map Coords_2025 - Sheet1.csv** provides per-square, per-quadrant reference data. Columns: **Square** (e.g. A1), **Square Letter**, **Square Number**, **Quadrant** (1–4), **Blight?** (Yes/No), **Region**, **Status** (Inaccessible | Explorable).
- Use this data to seed or cross-check the **exploringMap** (Square/Quadrant) schema: **Status "Explorable"** → quadrant can start as `unexplored`; **"Inaccessible"** → `inaccessible`. **Blight?** maps to **Quadrant.blighted**; **Region** to **Square.region** (normalize to lowercase to match bot: e.g. Eldin → eldin, Central Hyrule → central hyrule or as defined in code).
- The CSV does not define pixel/canvas coordinates; it defines which squares/quadrants exist and their initial region and accessibility.

**Pins**

- The dashboard already has a **Pin** model (`dashboard/models/PinModel.js`): user-created markers with **name**, **description**, **coordinates** (lat/lng in a 24000×20000 canvas space), **gridLocation** (A1–J12), **icon**, **color**, **category** (e.g. homes, farms, shops, points-of-interest), **createdBy**, **discordId**, **isPublic**, **imageUrl**. **gridLocation** is derived from coordinates (e.g. `calculateGridLocation()`).
- For the exploring map, pins can mark important locations (grottos, camps, POIs). Pin placement can be done by clicking on the map; the dashboard converts click position to the same coordinate system and stores a new Pin (with an exploring-friendly category if needed).

**Drawing**

- "Drawing" on the map (roads, paths, boundaries) is a separate layer from pins. Implementation is TBD: e.g. store polyline/polygon or stroke data per square (or per map) in a new collection or in Square/Quadrant metadata, and render it over the base image. The plan assumes the dashboard will support this layer so users can mark roads and other drawn features.

**Alignment with codebase**

- **Square** (`mapModel.js`): has **image** (URL), **mapCoordinates** (center, bounds) for positioning; **quadrants[]** with status and blighted. Map base URL above can populate **Square.image** or be built client-side from squareId.
- **Pin**: existing schema; ensure exploring map UI can create/read pins by **gridLocation** or coordinates and filter by category/visibility as needed.

---

## Stamina use (fuel for exploring)

Stamina is consumed while exploring via:

| Action | Cost |
|--------|------|
| **Initial exploration** of an unexplored quadrant | **2 stamina** |
| **Continue exploring** the same quadrant (after “explored this area”) | **1 stamina** |
| **Explore next** quadrant | **2 stamina** |
| **Rest** (heals all party hearts, revives KO’d members) | **3 stamina** |
| **Secure quadrant** (pave path: permanent safe travel) | **5 stamina** + 500 tokens + 10 wood + 5 Eldin Ore |
| **Retreat attempt** (tier 5+ monster encounters only) | **1 stamina** per attempt |
| Ruins / Shrines | Extra stamina (activity-dependent) |

**Secure quadrant:** The party must **bring** the materials (wood, Eldin Ore) on the expedition to pave; one member pays the 500 tokens (track who in bot/dashboard).

---

## Core loop and choice tree

1. **User picks where they’re exploring:** Region (Eldin, Lanayru, Faron), Square (e.g. D9), Quadrant (e.g. Q3).

2. **System deducts stamina** from **Party.totalStamina** (2 when **Party.quadrantState** is unexplored, 1 when explored) and **resolves outcome** via `/explore roll`: monster list from **getMonstersByRegion(party.region)** or gather from **ItemModel** filtered by region.

3. **Outcome is applied** (only one of these per explore action):
   - **Encounter monster** → monster flow; then next action can be “explore quadrant” again (same or next).
   - **Gather** → that party member (the one whose turn it was) keeps the gatherable; next in order runs the explore command.
   - **Become blighted** → only the party member whose turn it was is blighted; next in line continues.
   - **Find something special** → system runs the **relevant command/flag** (e.g. chest, ruins, shrines); next in line continues.
   - **“You have explored this area. What will you do next?”** → quadrant is marked **Explored**; party chooses one of the options below.

4. **After “You have explored this area” — choice tree:**

   | Choice | Cost / notes |
   |--------|----------------|
   | **Consume a healing item** | Item effect (hearts/stamina as per item). |
   | **Rest** | 3 stamina; heals **all** party hearts and **revives** any KO’d members. |
   | **Secure this quadrant** | 5 stamina + 500 tokens + 10 wood + 5 Eldin Ore (materials must be brought). |
   | **Explore next quadrant** | 2 stamina; then run explore command/flag for new quadrant. |
   | **Continue exploring same quadrant** | 1 stamina; then run explore command/flag again. |
   | **Return to village** | Record route; if backtracking through unsecured quadrants, must run explore until “explored area” per quadrant (costs stamina). |

**Travel vs exploring:** Exploring uses its own commands and flags (e.g. `exploreEldin`). Travel, relic, and map outcomes use different commands/flags for specific finds, appraisals, or follow-up actions.

**Important:** Only the first “enter and explore” per quadrant costs 2 stamina. Continuing in the same quadrant costs 1 stamina per explore action.

---

## KO and running out of stamina

**Individual KO:** When the outcome says a party member is KO’d (e.g. “Ankle is KO’d! He had 3 hearts. The party loses 3 hearts”), only **that member** loses those hearts—not the whole party. A **fairy** or **tonic** must be used to revive that member. Party KO occurs only when **all collective hearts** are lost.

**Full party KO (all collective hearts lost):**
- All items collected and brought on the expedition are **lost**.
- Any quadrants marked **Explored** **revert to Unexplored**.
- Character(s) wake in the **village they started from** with **0 hearts and 0 stamina**.
- **Week-long debuff:** For an entire week, the character cannot use any healing or stamina items, cannot use healer services, and **cannot explore** (recovering strength). Stamina recovers **1 per day** during this period. There may be a future option (e.g. boosting perk) to remove the debuff.
- After the week, the character can use healing/stamina items to return to full stats.

**Running out of stamina (can’t get home):** The character/party is stuck until they recover enough stamina (e.g. camping in the wild). During this time the system runs **camping** logic (camping command/flag in the database) to determine what happens; the bot/dashboard records the outcome and state.

---

## Parties (solo or up to 4)

- **Party size:** 1–4. Expeditions can be done alone or in a party.
- **Gear per member:** **1 set of armor** (what they’re wearing) + **3 items**. Items can be healing items and/or **bundles for paving** (see Items below).
- **Shared pool:** Total hearts and total stamina are summed for the party. All actions draw from this pool.
- **Turn order:** A predetermined order is set before the expedition (e.g. by deciding or randomizing). Everyone takes a turn running the explore command in that order until “You have explored this area” appears. The person whose turn produced a **gatherable** keeps that item. The **last person to act** in a given context (e.g. defeating a monster, securing a quadrant) is the one “responsible” for that outcome—track this for attribution/reporting.
- **At start:** Each character’s hearts, stamina, and items are posted once so combined totals are clear (bot/dashboard computes and displays).
- **End of expedition:** Remaining hearts and stamina are **evenly divided** among the group. If there isn’t enough to divide evenly, members use a tiebreaker (e.g. random) to see who gets the remainder. If there’s too much, any extra is **discarded**.

**Alignment with codebase:** `PartyModel`, `exploreModule.calculateTotalHeartsAndStamina`, and `/explore` (roll, rest, secure, move, retreat, camp) in `explore.js` support totals, turn order, and roll outcome (monster/gather). Party creation/join/start are dashboard-only. **End-of-expedition split** of hearts/stamina and **sync of Party.quadrantState to Square.quadrants** in **exploringMap** are planned.

---

## Items

- Each party member may bring **3 items** (in addition to armor).
- Items can be **healing items** and/or **bundles for paving**:
  - **5 Eldin Ore = 1 bundle = 1 item slot**
  - **10 wood = 1 bundle = 1 item slot**
- Securing a quadrant requires 10 wood + 5 Eldin Ore (and 5 stamina + 500 tokens), so members must sacrifice healing item slots if they want to bring paving materials.

---

## Monster encounters

- When a monster is encountered, the party fights in the **same predetermined order** as exploration.
- **Loot:** The party member who lands the **killing blow** earns the loot—unless it’s a **high-tier** monster, in which case each party member gets a loot outcome (via the relevant command/flag).
- **KO’d members:** A KO’d character is **skipped** in the turn order during monster encounters until a fairy or tonic revives them. Hearts are still shared; only the member whose turn produced the KO loses those hearts (see KO section).
- **Tier 5 and below:** Sometimes a “you fight back!” prompt appears; when it does, the **next** character in line takes the action, not the same one.
- **Retreat (tier 5 and above only):** Parties may choose to **retreat** at any time during the battle. Retreat is not always guaranteed; each attempt costs **1 stamina**. The party can keep attempting to retreat as long as they have stamina. The system runs the **retreat** command/flag for each attempt.

---

## Healing

- **Fairies:** Revive with hearts equal to the **party member with the highest heart count** (e.g. if three have 3 and one has 5, fairy heals 5).
- **Fairy Tonics:** Heal the **entire party’s** hearts.
- **Rest:** Heals the entire party’s hearts and **revives** any KO’d members (costs 3 stamina).
- **When healing is allowed:** Parties can heal **during tier 5 and above** monster encounters. Otherwise healing is only when prompted (e.g. after “explored this area”). The healing item action/report is used in those cases.

---

## Expedition timing

- Parties have **24 hours from the start** of their expedition to **complete their journey and submit a report**. (Separately, map marking—grottos, camps, roads—must be completed within 24 hours of the expedition per the “Updating and revealing map quadrants” section.)

---

## Mount exploring

At this time **mount exploring is not an option**. For future reference when/if it is added:
- Basic mounts: 2 stamina (carrots).
- Mid mounts: 4 stamina.
- High mounts: 6 stamina.

---

## Relics

Relics are items from the past with cultural importance, found while exploring (quadrants, ruins, chests). Explorers don’t immediately know what they’ve found; some relics have special abilities. The specific relic is determined by the **relic** command/flag (or relic data in the database) once appraised.

### Finding and getting to Inariko

- Relics can be found while searching quadrants, in ruins, or in chests (explore or special command/flag outcomes).
- If the finder’s character does **not** reside in Inariko, they must use the **travel or delivery** mechanic to get the relic to Inariko before appraisal.

### Appraisal

- Only **Artists** or **Researchers** residing in **Inariko** are qualified to appraise relics (or an **NPC appraiser** for **500 tokens**).
- The **appraiser** spends **3 stamina** to perform the appraisal.
- When a character discovers a relic, that character’s owner must **pause further participation in expeditions** until the found relic is appraised.
- **New system:** Appraisal is requested via bot/dashboard (e.g. “Relic Appraisal Request”); PC appraiser or 500 tokens for NPC; system tracks request, appraiser, and stamina deduction. Mod approval finalizes the appraisal.

### After appraisal — relic outcome and art

- Once the appraisal is **approved by a mod**, the **member who found** the relic triggers the **relic** command/flag (bot/dashboard runs it). This reveals what the relic is. Some relics have duplicates; others are incredibly rare.
- **First to find and successfully appraise in full (including artwork)** receives a reward of **1,000 tokens**.
- The **owner of the character who found** the relic must provide an **artistic rendition** of the item based on the appraisal description. Once provided, it goes on display in the **Library Archives**. If an **NPC** appraiser was used, the art is **mandatory** by the appraisee (finder’s owner). Artists/Researchers can assist in creating the art (agreed between appraiser and appraisee).
- **Art specs:** 1:1 ratio, at least **500×500 px**, **PNG**, **transparent background**.
- **Time limit for art:** All appraised relics must have art submitted within **2 months** of appraisal; otherwise the relic is lost to time.
- After the relic is submitted (with art where required), the relic is **removed from the character’s inventory** and **donated to the library**.

### The Library Archives

- The Archives is a room found during “The Mystery Door: Quest for Ancient Secrets” event. Appraised relics (and their art) are displayed there; the archives can be viewed on the website. **New system:** Dashboard/site should support viewing the Library Archives (relic list + images).

### Duplicates

- If a character finds a relic that has **already been discovered** by another player (a duplicate), they must still **turn it in** for appraisal. The process is the same as for a new find, **minus the image requirement**. A reward may be given to the character who submits duplicate relics.

### Deadlines and consequences

| Deadline | Consequence |
|----------|-------------|
| **Appraisal within 7 days** of discovery | If not appraised in time, the relic **deteriorates** (improper care/storage) and is **removed from inventory**; it becomes unappraisable. |
| **Submission (form/art) within 2 months** | Some relics are **unique** (only one in the world). Relics not submitted in time are **lost forever**, along with any lore. |

### Relic locks and roster

- Relics are **locked to the character who found them**. If a character holding an **unappraised** (or unsubmitted) relic is no longer active or is removed from the active roster, the relic is **lost** with that character. Consider this when choosing which characters to send on expeditions.

### Relic flow (new system) — steps

1. **Find a relic** (explore or special command/flag outcome; item added to character inventory; expedition participation paused for that character until appraised).
2. **Get to Inariko** (travel/delivery if character doesn’t reside there).
3. **Appraisal request** (dashboard: character, appraiser choice [PC Artist/Researcher or NPC 500 tokens], optional description). No manual form in #community-board; bot/dashboard records and notifies.
4. **Appraisal** (appraiser confirms, 3 stamina deducted; payment from client if applicable; mod approves).
5. **Relic outcome** (finder triggers via bot/dashboard; system runs `relic` command/flag to determine which relic; staff can remove/update result for limited uniques).
6. **Art submission** (finder’s owner uploads art per specs; or appraiser/assistant per rules; deadline 2 months from appraisal).
7. **Library donation** (relic removed from inventory; added to Library Archives display; first full completion reward 1,000 tokens if applicable).

**Alignment with codebase:** `RelicModel`, relic commands, and appraisal flows should support: discovery → inventory lock → appraisal request → appraiser stamina → mod approval → relic command/flag → art submission and deadlines → library donation and archives display.

---

## Where expeditions run (legacy → new)

In the old system, expeditions took place in a dedicated exploring channel, in threads titled e.g. **Exploring | Party Name / Members**, with a separate exploring-discussion channel for planning. In the new system, the bot and dashboard can still use a designated Discord channel/thread for expedition posts and links, or surface everything in the dashboard; the 24-hour completion and report submission rules apply regardless.

---

## State and reporting (no manual forms)

“Forms” in the old system were status posts for staff and players. In the new system, **state updates and reports** are handled by:

- **Bot:** Commands and flows that start an expedition, continue exploring, consume healing, reveal a quadrant, or return to village. Each action updates character/party state and records location (square, quadrant), hearts, stamina, items used.
- **Dashboard:** Views and (if needed) mod tools that show:
  - Where parties/characters are (square, quadrant).
  - Current hearts/stamina and items used.
  - What was done (explored, revealed, returned) so staff can update the **public map**.

So instead of “fill out a form,” users use the bot/dashboard; the system stores the same information and can surface it for mods to apply to the canonical map.

---

## Commands and outcome logic (no table rolls)

We **do not use** `/tableroll` or table rolls. Outcomes are driven by **bot commands**, **Party** state, and **database models** (Monster, Item, Square, Relic).

**Bot: `/explore` subcommands** (`bot/commands/exploration/explore.js`)

Create party, join, and start are **dashboard-only**. The bot has no `/explore setup`, `/explore join`, or `/explore start`. Use the dashboard to create expeditions, add characters/items, and start.

| Subcommand | Purpose | Notes |
|------------|---------|--------|
| **roll** | Resolve one explore action (first time or again in same quadrant) | Stamina from Party.quadrantState (2 unexplored / 1 explored / 0 secured). Outcome: monster or gather. Sets Party.quadrantState = explored when “quadrant explored” triggers; advances Party.currentTurn. |
| **rest** | Rest at current location (3 stamina) | Only in explored or secured quadrant. Plan: heal all party hearts + revive KO'd; current code recovers stamina for acting character only. |
| **item** | Use a healing item from expedition loadout | Consumes one item from party loadout; applies hearts/stamina per item. Bundles (Wood/Eldin Ore) only when securing. |
| **secure** | Pave quadrant (5 stamina + resources) | Only in explored quadrant. Plan: 5 stamina + 500 tokens + 10 wood + 5 Eldin Ore; code checks presence of Wood and Eldin Ore (no quantity/token deduction yet). Sets Party.quadrantState = secured. |
| **move** | Move to adjacent quadrant (direction) | Costs 2 stamina. Updates Party.square/quadrant; Party.quadrantState = unexplored. |
| **retreat** | Return to village (leader only) | Sets party status to completed; moves all characters to region village. |
| **camp** | Camp for duration (1–8 hours) | Only in **secured** quadrant. Recovers stamina and hearts per member. Plan: "when stuck (e.g. out of stamina)" — currently safe rest in secured areas only. |

**Exploration commands audit (vs plan)**

- **Setup / join / start:** Removed from bot; create party, add characters/items, and start expedition on dashboard only. Plan table above updated.
- **Continue:** Redundant with **roll**. Plan: “Continue exploring same quadrant” means next action is run **roll** again (1 stamina). The bot had a separate `/explore continue` that did the same encounter logic; removed so one command (**roll**) covers both “first time in quadrant” and “explore again in same quadrant.”
- **Rest:** Plan: heal all party hearts and revive KO’d (3 stamina). Code: 3 stamina, recovers only stamina for the acting character (up to 5). Align if full party heal/revive is required.
- **Secure:** Plan: 5 stamina + 500 tokens + 10 wood + 5 Eldin Ore; track payer. Code: 5 stamina + checks for Wood and Eldin Ore in party items (no quantities, no token check, no deduction). To do: quantities, token payment, consumption.
- **Retreat:** Code sets `party.status = 'completed'`. Party schema must include `completed` in status enum (see PartyModel.js).
- **Camp:** Plan: “when party is stuck (e.g. out of stamina).” Code: allowed only in **secured** quadrants; grants stamina/hearts recovery. Either allow camp in explored quadrants for “stuck” recovery or keep secured-only and document.
**Region and outcome data**

- **Monster** (`MonsterModel.js`): Region flags `eldin`, `lanayru`, `faron` are used by **getMonstersByRegion(region)** in `rngModule.js` for explore encounters. The model also has **exploreEldin**, **exploreLanayru**, **exploreFaron** for future exploration-specific monster pools if desired.
- **Item** (`ItemModel.js`): Has `eldin`, `faron`, `lanayru` booleans; gather outcomes in explore use items where `item[party.region]` is true.
- **Blight exposure, relic outcome, special finds (chest/ruins/shrines):** Implemented as commands or logic keyed by context; no separate roll tables. Relic identity stored in **Relic** model (`rollOutcome`, etc.).

---

## Implementation checklist (aligned with codebase)

**Existing in code**

- [x] **Map/quadrant schema:** `Square` (exploringMap), `QuadrantSchema` with status `inaccessible` \| `unexplored` \| `explored` \| `secured`, `blighted`, `discoveries` — `mapModel.js` (bot + dashboard).
- [x] **Party and turn order:** `Party` with `region`, `square`, `quadrant`, `quadrantState`, `currentTurn`, `totalHearts`, `totalStamina`, `characters[]`, `gatheredItems[]` — `PartyModel.js`. Bot: `/explore roll | rest | item | secure | move | retreat | camp` (setup/join/start are dashboard-only; continue removed, use roll for same-quadrant exploration). — `explore.js`.
- [x] **Stamina costs in roll:** 2 (unexplored), 1 (explored), 0 (secured) from Party.quadrantState — `explore.js` roll subcommand.
- [x] **Explore outcome logic:** Monster from getMonstersByRegion(party.region) (`rngModule.js`), gather from ItemModel filtered by region; “quadrant explored” sets Party.quadrantState = explored.
- [x] **Relic model:** Relic schema with appraised, rollOutcome, artSubmitted, etc. — `RelicModel.js` (bot + dashboard).

**To do or extend**

- [ ] **Map ↔ Party sync:** When party secures or explores, update **exploringMap** (Square.quadrants[].status, blighted) so public map matches; or have Party read initial quadrant state from Square. Currently Party.quadrantState is source of truth during expedition; map is canonical for display.
- [ ] **“All 4 quadrants before next square”:** Enforce in `/explore move` (or equivalent) using Square.quadrants in exploringMap.
- [ ] **Stamina:** Rest 3, Secure 5 + 500 tokens + 10 wood + 5 Eldin Ore (secure cost partially in code; confirm token + material validation and payer tracking).
- [ ] **Blight exposure:** When Quadrant.blighted and (reveal or travel-through), run exposure logic; stack on repeated travel. Quadrant has `blighted` in schema; exposure flow to be wired.
- [ ] **Camping / retreat:** `/explore camp` exists; outcome logic (e.g. camping table equivalent) and retreat during tier 5+ to be fully aligned with plan.
- [ ] **KO & debuff:** Individual vs party KO, week debuff, 1 stamina/day recovery — implement or confirm in character/explore flow.
- [ ] **End-of-expedition split:** Even split of remaining hearts/stamina; tiebreaker for remainder; discard excess — not yet in code.
- [ ] **Relics:** Full flow (find → lock character → appraisal → relic outcome → art → library); Relic model and deadlines; use Relic.rollOutcome or equivalent for outcome.
- [ ] **Dashboard:** Map UI (quadrant colors, clouded/resolved), mod tools to update map and mark findings; 24h expedition + 24h map-marking. User-driven updates: **draw** on maps (roads, paths) and **pins** for locations (grottos, camps, POIs)—see “Dashboard map: images, coordinates, drawing, and pins.” Map base images: `…/MAP_0002_Map-Base/MAP_0002_Map-Base_{squareId}.png` (A1–J9). Seed/cross-check from **ROTW_Map Coords_2025 - Sheet1.csv**; **Pin** model exists.
- [ ] **Explore-specific monster pool (optional):** Use Monster.exploreEldin / exploreLanayru / exploreFaron in getMonstersByRegion or a dedicated explore lookup for region.
- [ ] **Mount exploring:** Not in scope; Basic/Mid/High stamina documented for future.

---

## Dashboard / map UI note

The map page will be **very ugly on mobile**. Recommend users view it in **desktop view** for proper use. Consider a dashboard notice or responsive message when the map is opened on small screens.

---

## Doc history

- **Sources:** (1) Legacy “leave the village and push the map forward” system (manual forms + `/tableroll`). (2) Map squares guide: quadrant colors, blight/exposure, updating/revealing, 24h marking, mobile UI. (3) Full exploring doc: grid A–J × 1–12, stamina costs, KO/debuff, camping, retreat, monster loot, healing, items & bundles, choice tree, end-of-expedition split, 24h journey, mount exploring (future). (4) Relics doc: find in quadrants/ruins/chests, Inariko appraisal, relic outcome, art, Library Archives, duplicates, deadlines, relic locks.
- **Purpose:** Plan for the **new** system where users interact only with the bot and dashboard. We **do not use table rolls**; outcomes are driven by **commands** (`/explore` subcommands), **Party** state, and **database models** (Square/exploringMap, Monster, Item, Relic). Doc aligned with code: `explore.js`, `mapModel.js`, `PartyModel.js`, `RelicModel.js`, `rngModule.js`, `exploreModule.js`.

**Key files:** `bot/commands/exploration/explore.js`, `bot/models/mapModel.js` (Square, collection exploringMap), `bot/models/PartyModel.js`, `bot/models/RelicModel.js`, `bot/models/MonsterModel.js`, `bot/modules/rngModule.js` (getMonstersByRegion), `bot/modules/exploreModule.js`, `dashboard/models/mapModel.js`, `dashboard/models/PartyModel.js`, `dashboard/models/RelicModel.js`, `dashboard/models/PinModel.js`. **Map assets:** Map base URL pattern for square images (A1–J9). **Data:** ROTW_Map Coords_2025 - Sheet1.csv for quadrant/region/blight/status.
