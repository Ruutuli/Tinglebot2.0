# Village Command - Mechanics Documentation

## Overview
This document consolidates all mechanics and features for the `/village` command system, including implemented systems and planned features. Based on community discussions and design decisions.

---

## 1. Village Levels & Health System

### Village Levels
Villages have two key attributes:
- **Village Level** (1-3) - Determines max HP, capabilities, and benefits
- **Village HP** (current health) - Capped by level-based maximum

### Max HP by Level
- **Level 1** → Max HP: 100
- **Level 2** → Max HP: 200
- **Level 3** → Max HP: 300

### Level-Based Restrictions

#### Village Status Restrictions
**⚠️ Status: Planned Feature (Not Yet Implemented)**

When a village has the `'damaged'` status, the following restrictions apply:
- **Cannot change jobs** - Characters in damaged villages cannot change their job
- **Cannot move villages** - Characters in damaged villages cannot move to a different village

**Rationale**: When a village is damaged, the infrastructure and stability are compromised, preventing job mobility and inter-village travel. Characters must help repair their village (restore HP to 100%) before these options become available again.

**When Restrictions Lift**:
- Restrictions are removed when the village status returns to `'upgradable'` (HP at 100%)
- Characters can then change jobs and move villages normally
- If a village takes damage again and enters `'damaged'` status, restrictions are re-applied

**Implementation Notes**:
- Restrictions apply to all characters currently located in a village with `'damaged'` status
- Job change commands (e.g., `/character job`) should check village status before allowing changes
- Village move commands (e.g., `/character move`) should check village status before allowing moves
- Mod characters may be exempt from these restrictions (subject to design decision)

### Village Statuses
Villages have three possible statuses that determine what actions can be taken:

#### `'upgradable'` (Default Status)
- **Meaning**: Village is healthy and can accept upgrade contributions
- **Conditions**: 
  - Village HP is at 100% (full health)
  - Village is not at maximum level (Level 3)
- **What Can Be Done**:
  - Players can contribute tokens and materials toward upgrades
  - Village can level up when requirements are met
- **Display**: Shows as "📈 **Upgradable**" in `/village view`

#### `'damaged'`
- **Meaning**: Village has taken damage and needs repair before upgrades can resume
- **Conditions**:
  - Village HP is below 100% (any amount of damage, even 1 HP)
  - Status is set immediately when damage is applied
- **What Can Be Done**:
  - Players can contribute tokens to repair the village (see Section 2)
  - HWQs can still generate and be completed
  - Gathering bonuses remain active (if implemented)
- **What Cannot Be Done**:
  - Cannot contribute materials or tokens toward upgrades
  - Cannot level up until repaired
- **How to Clear**: Status automatically clears when HP reaches 100% (full repair)
- **Display**: Shows as "⚠️ **Damaged - Needs repair**" in `/village view`

#### `'max'`
- **Meaning**: Village has reached maximum level (Level 3)
- **Conditions**:
  - Village level is 3
  - All upgrade requirements have been met
- **What Can Be Done**:
  - Village can still take damage and be repaired if needed
  - All Level 3 benefits are active (vending discounts, gathering bonuses, etc.)
- **What Cannot Be Done**:
  - Cannot level up further (already at maximum)
- **Display**: Shows as "🌟 **Max level reached**" in `/village view`

**Status Transitions**:
- `'upgradable'` → `'damaged'`: Occurs immediately when any damage is applied
- `'damaged'` → `'upgradable'`: Occurs automatically when HP reaches 100%
- `'upgradable'` → `'max'`: Occurs when village reaches Level 3
- `'max'` → `'damaged'`: Can occur if a Level 3 village takes damage
- `'max'` → `'upgradable'`: Cannot occur (max level cannot be lost through damage, only through level drop at 0 HP)

**Note**: If a village drops a level (reaches 0 HP), it resets to the new level's max HP but remains in `'damaged'` status until repaired. See "What Happens at 0 HP" below for details.

### What Happens When a Village Levels Up
When an upgrade completes:
- Village level increases immediately
- **Max HP increases to the new level's maximum**
- **Village HP is set to full (the new max)** at the moment the upgrade completes

**Examples**:
- Level 1 → Level 2: Max HP becomes 200, HP set to 200/200
- Level 2 → Level 3: Max HP becomes 300, HP set to 300/300

**So yes: leveling up fully restores the village's HP to the new maximum.**

### What Happens When a Village Takes Damage
- Damage subtracts from current Village HP
- All damage sources apply directly to HP
- Damage can stack across multiple events

**Example**:
- Village is Level 2 (200 Max HP)
- Takes 12 damage
- Becomes 188 / 200 HP

### What Happens at 0 HP
If Village HP reaches 0:
- Village **drops 1 level**
- **Loses ALL upgrade progress** toward the next level
- **All tokens and materials are cleared** (set to 0)
- **HP is set to the new level's max HP** (not 0)
- Village status remains `'damaged'` (status was already set when HP dropped below max)
- Lost resources are not tracked - they are simply gone
- Repair requires re-contributing tokens to restore HP (materials would be needed for upgrades if leveling up again)

**After Level Drop**:
- Level 3 → Level 2: New Max HP is 200, Village becomes 200/200 HP (but Damaged + progress reset)
- Level 2 → Level 1: New Max HP is 100, Village becomes 100/100 HP (but Damaged + progress reset)

**So the "punishment" is the level loss + progress wipe + repair lockout, not sitting at 0 HP forever.**

---

## 2. Upgrade & Repair System

### Overview
Village upgrades and repairs are separate but related systems. Upgrading requires both tokens and materials to level up, while repairs use tokens only to restore HP.

### Upgrade System

#### Overview
Village upgrades are intentional, manual, and gated. Upgrading requires both tokens and materials, and only one upgrade tier can be worked on at a time.

#### Level 1 → Level 2 Upgrade
**Requirements**:
- **10,000 tokens**
- **250-300 regional materials** (exact mix is flexible, but all required totals must be met)

**When upgrade completes**:
- Village level becomes 2
- Max HP increases to 200
- HP set to 200/200 (fully restored)
- Upgrade progress toward Level 3 is unlocked

#### Level 2 → Level 3 Upgrade
**Requirements**:
- **50,000 tokens**
- **500+ regional materials**
- Dragon parts
- Special rare items (e.g., Goddess Plumes)

**When upgrade completes**:
- Village level becomes 3
- Max HP increases to 300
- HP set to 300/300 (fully restored)
- Village enters max-level state

#### Upgrade Restrictions
- Villages **cannot be upgraded while status is `'damaged'`** (see Section 1 for status details)
- If a village drops a level:
  - All progress toward the next level is wiped
  - Repairs must be completed before upgrades resume (status must return to `'upgradable'`)
- Materials and tokens are **cumulative** - they carry forward when leveling up (see Section 3 for details)
- Contributions apply toward the current active upgrade tier requirements

### Repair System

#### Overview
Villages can be repaired using tokens to restore HP. Repairs are separate from upgrades - **tokens repair HP**, while **materials contribute toward leveling up**.

#### Repair Mechanics
- **Repair uses tokens only** - materials are not used for repairs
- **Token-to-HP conversion scales with village level**:
  - **Level 1**: 50 tokens = 1 HP (5,000 tokens to fully repair 100 HP)
  - **Level 2**: 100 tokens = 1 HP (20,000 tokens to fully repair 200 HP)
  - **Level 3**: 150 tokens = 1 HP (45,000 tokens to fully repair 300 HP)
- **Formula**: `tokens_needed = HP_needed × (village_level × 50)`
- **Repair completes when HP reaches 100%** (full HP)
- Villages can be repaired at any time when HP is below 100%
- **Villages cannot be repaired proactively** - repair only restores HP, it doesn't prevent damage

**Examples**:
- Level 1 village at 80/100 HP needs 20 HP: 20 × 50 = **1,000 tokens**
- Level 2 village at 150/200 HP needs 50 HP: 50 × 100 = **5,000 tokens**
- Level 3 village at 0/300 HP needs 300 HP: 300 × 150 = **45,000 tokens**

#### Repair Requirements
- Repair requirements are based on missing HP, not fixed amounts
- The token cost scales with the village's level and current HP deficit
- Repair contributions count toward the weekly contribution cooldown (same as upgrade contributions)
- Repair and upgrade contributions can happen simultaneously in different villages (cooldown is per user, not per village)

#### Repair vs. Upgrades
- **Repairs**: Use tokens to restore HP to 100%
- **Upgrades**: Use materials and tokens to level up the village
- These are separate systems - materials only contribute to upgrades, tokens can be used for either repairs or upgrades

---

## 3. Material Requirements

### How Material Requirements Work (Cumulative System)
**Materials are cumulative across levels.** When a village levels up, contributed materials are **NOT reset to 0** - they carry forward toward the next level's requirements.

**Example**:
- **To reach Level 2**: Village needs 250 Wood total
- **To reach Level 3**: Village needs 500 Wood total (cumulative)
  - If village is Level 2 with 250 Wood already contributed, it only needs **250 more Wood** to reach the 500 total required for Level 3
  - The 250 Wood from Level 2 is kept and counts toward Level 3 requirements

**Important Notes**:
- Material contributions accumulate - they don't reset when leveling up
- Each level has a **total cumulative requirement**, not a per-level requirement
- If a village drops a level (reaches 0 HP), all materials and tokens are reset to 0 (see Section 1)
- Tokens work the same way - cumulative totals, not per-level

### Material Structure
Each village uses a themed material pool. Only materials listed for that village may be contributed. Material pools are defined in `VillageModel.js` and validated during contribution.

Materials are split into:
- **Core Materials** (bulk requirements)
- **Support Materials** (variety + flavor)
- **Rare Materials** (high-tier upgrades only)

### 🔥 Rudania (Eldin)

#### To Reach Level 2 (Cumulative Total Required)
**Core Materials**:
- Wood ×250
- Goron Ore ×100
- Gold Ore ×50

**Support Materials**:
- Spicy Pepper ×75
- Sunshroom ×80
- Fireproof Lizard ×50
- Volcanic Ladybug ×60 (Note: Currently only available from Beekeeper table. May be added to Hunter table at Level 2 as a level-up perk)
- Eldin Roller ×40
- Gold Dust ×30 (Note: May be increased in future rebalancing)
- Flint ×40
- Rock Salt ×30

**Total for Level 2**: 805 materials

#### To Reach Level 3 (Cumulative Total Required)
**Core Materials** (additional needed after Level 2):
- Wood ×250 more (500 total)
- Goron Ore ×100 more (200 total)
- Gold Ore ×0 more (50 total - already met at Level 2)

**Support Materials** (additional needed after Level 2):
- Spicy Pepper ×75 more (150 total)
- Sunshroom ×80 more (160 total)
- Fireproof Lizard ×50 more (100 total)
- Volcanic Ladybug ×60 more (120 total)
- Eldin Roller ×40 more (80 total)
- Gold Dust ×30 more (60 total)
- Flint ×0 more (40 total - already met at Level 2)
- Rock Salt ×0 more (30 total - already met at Level 2)

**Rare Materials** (Level 3 only):
- Dinraal's Claw ×1
- Shard of Dinraal's Scale ×1
- Shard of Dinraal's Fang ×1
- Shard of Dinraal's Horn ×1
- Goddess Plume ×1

**Total for Level 3**: 1,610 materials + 5 rare items (cumulative)
**Additional needed after Level 2**: 805 materials + 5 rare items

---

### 💧 Inariko (Lanayru)

#### To Reach Level 2 (Cumulative Total Required)
**Core Materials**:
- Wood ×250
- Silver Ore ×200
- Luminous Stone ×50

**Support Materials**:
- Silent Princess ×40
- Blue Nightshade ×60
- Sneaky River Snail ×50
- Hyrule Bass ×40
- Lanayru Ant ×45
- Fleet-Lotus Seeds ×55

**Total for Level 2**: 790 materials

#### To Reach Level 3 (Cumulative Total Required)
**Core Materials** (additional needed after Level 2):
- Wood ×250 more (500 total)
- Silver Ore ×50 more (250 total)
- Luminous Stone ×50 more (100 total)

**Support Materials** (additional needed after Level 2):
- Silent Princess ×40 more (80 total)
- Blue Nightshade ×60 more (120 total)
- Sneaky River Snail ×50 more (100 total)
- Hyrule Bass ×40 more (80 total)
- Lanayru Ant ×45 more (90 total)
- Fleet-Lotus Seeds ×55 more (110 total)
- Staminoka Bass ×30 (new material for Level 3)

**Rare Materials** (Level 3 only):
- Naydra's Claw ×1
- Shard of Naydra's Scale ×1
- Shard of Naydra's Fang ×1
- Shard of Naydra's Horn ×1
- Goddess Plume ×1

**Total for Level 3**: 1,580 materials + 5 rare items (cumulative)
**Additional needed after Level 2**: 790 materials + 5 rare items

---

### 🍃 Vhintl (Faron)

#### To Reach Level 2 (Cumulative Total Required)
**Core Materials**:
- Wood ×250
- Tree Branch ×200
- Korok Leaf ×50

**Support Materials**:
- Mighty Bananas ×70
- Palm Fruit ×65
- Hydromelon ×60
- Voltfruit ×55
- Faron Grasshopper ×50
- Deku Hornet ×45
- Spider Silk ×40
- Kelp ×50
- Thornberry ×60

**Total for Level 2**: 795 materials

#### To Reach Level 3 (Cumulative Total Required)
**Core Materials** (additional needed after Level 2):
- Wood ×250 more (500 total)
- Tree Branch ×50 more (250 total)
- Korok Leaf ×50 more (100 total)

**Support Materials** (additional needed after Level 2):
- Mighty Bananas ×70 more (140 total)
- Palm Fruit ×65 more (130 total)
- Hydromelon ×60 more (120 total)
- Voltfruit ×55 more (110 total)
- Faron Grasshopper ×50 more (100 total)
- Deku Hornet ×45 more (90 total)
- Spider Silk ×40 more (80 total)
- Kelp ×50 more (100 total)
- Thornberry ×60 more (120 total)

**Rare Materials** (Level 3 only):
- Farosh's Claw ×1
- Shard of Farosh's Scale ×1
- Shard of Farosh's Fang ×1
- Shard of Farosh's Horn ×1
- Goddess Plume ×1

**Total for Level 3**: 1,590 materials + 5 rare items (cumulative)
**Additional needed after Level 2**: 795 materials + 5 rare items

---

### Material Summary by Village
| Village | Level 2 Total | Level 3 Total | Additional for Level 3 |
|---------|---------------|---------------|------------------------|
| 🔥 Rudania | 805 materials | 1,610 materials + 5 rare | 805 materials + 5 rare |
| 💧 Inariko | 790 materials | 1,580 materials + 5 rare | 790 materials + 5 rare |
| 🍃 Vhintl | 795 materials | 1,590 materials + 5 rare | 795 materials + 5 rare |

**Note**: All villages have similar total requirements (~800 for Level 2, ~1,600 for Level 3) for balance.

### Material Rules
- Materials must be obtainable via normal gameplay
- Support materials exist to reduce single-item grind and encourage varied gathering
- Rare materials are only required for Level 3 upgrades (1 of each dragon part + 1 Goddess Plume)
- No village requires another village's exclusive material
- Requirements are balanced across villages for fairness
- Wood appears in all villages as a shared baseline (250 for Level 2, 500 total for Level 3)
- Dragon part requirements are identical across all villages (1 of each type + 1 Goddess Plume for Level 3)

### Dragon Parts Requirements
**Note**: Dragon parts are only required for Level 3 upgrades. They are **not** required for Level 2.

**For Level 3 (Required Once)**:
- 1 Dragon Claw (village-specific)
- 1 Dragon Scale Shard (village-specific)
- 1 Dragon Fang Shard (village-specific)
- 1 Dragon Horn Shard (village-specific)
- 1 Goddess Plume

**Dragon Part Types** (per village):
- **🔥 Rudania**: Dinraal's Claw, Shard of Dinraal's Scale, Shard of Dinraal's Fang, Shard of Dinraal's Horn
- **💧 Inariko**: Naydra's Claw, Shard of Naydra's Scale, Shard of Naydra's Fang, Shard of Naydra's Horn
- **🍃 Vhintl**: Farosh's Claw, Shard of Farosh's Scale, Shard of Farosh's Fang, Shard of Farosh's Horn
- **Goddess Plume**: Required by all villages (same item for all)

**Total for Level 3**: 5 rare items (1 of each dragon part type + 1 Goddess Plume)

---

## 4. Damage System

### Overview
Villages can lose HP from multiple sources. All damage is applied directly to current Village HP and can stack across events. When damage occurs, villages also lose resources (tokens and materials) based on the damage percentage.

### Resource Loss on Damage
When a village takes damage (but HP does not reach 0), resources are lost based on the damage percentage.

#### Damage Percentage Calculation
**Formula**: `damage_percentage = damage_amount / max_HP`
- Example: 12 damage to Level 2 village (200 max HP) = 12/200 = 6% damage
- Example: 50 damage to Level 3 village (300 max HP) = 50/300 = 16.67% damage

#### Material Loss
- **One random material** is selected from materials with `current > 0`
- **Amount removed**: `max(1, floor(material_current × damage_percentage))`
- **Maximum loss per event**: Capped at 25% of that material's current amount (prevents catastrophic single-event losses)
- If the selected material has 0 current, no material is lost (but tokens may still be lost)

**Example**:
- Village has 150 Wood, takes 12 damage (6% of 200 max HP)
- Wood loss = floor(150 × 0.06) = floor(9) = **9 Wood lost**
- If damage was 50 HP (25% of 200), Wood loss = min(floor(150 × 0.25), floor(150 × 0.25)) = **37 Wood lost** (capped at 25%)

#### Token Loss
- **Amount removed**: `max(1, floor(current_tokens × damage_percentage))`
- **Maximum loss per event**: Capped at 25% of current tokens
- If village has 0 tokens, no tokens are lost

**Example**:
- Village has 5,000 tokens, takes 12 damage (6% of 200 max HP)
- Token loss = floor(5,000 × 0.06) = floor(300) = **300 tokens lost**
- If damage was 50 HP (25% of 200), Token loss = min(floor(5,000 × 0.25), floor(5,000 × 0.25)) = **1,250 tokens lost** (capped at 25%)

#### Complete Formula
```
damage_percentage = min(damage_amount / max_HP, 0.25)  // Cap at 25% per event

// Material loss (one random material)
selected_material = random(materials where current > 0)
material_loss = max(1, floor(selected_material.current × damage_percentage))

// Token loss
token_loss = max(1, floor(village.currentTokens × damage_percentage))
```

#### Notes
- **Lost resources are not tracked for repair** - they are simply removed
- Players can check village status to see what materials/tokens are missing
- Repair requires re-contributing tokens to restore HP (materials would be needed for upgrades if level was lost)
- The 25% cap prevents a single large damage event from wiping out all resources
- Multiple small damage events can still accumulate to significant losses over time

### 🛡️ Raids & Village Damage

#### Raid Applicability
- **All three villages** (Rudania, Inariko, Vhintl) can receive random raids
- **There is no raid immunity at any village level**
- Village level **does not prevent raids** from occurring

#### Raid Types
Villages may take damage from:

**Random Raids**:
- Occur automatically
- Frequency scales by village level

**Triggered Raids**:
- Blood Moons
- RP / mod-run plot raids
- Boss appearances
- (Triggered raids ignore frequency scaling)

#### Random Raid Frequency
Village level affects how often random raids occur:
- **Level 1** → ~1 random raid per week
- **Level 2** → ~2 random raids per month
- **Level 3** → ~1 random raid per month

Applies equally to all villages.

#### Raid Failure & Damage
- Failing a raid damages the village
- Damage is applied directly to Village HP
- Damage stacks across events
- If Village HP reaches 0, the village drops one level (see Section 1 for level drop consequences)

#### Current Raid Damage Values (Subject to tuning)
- Tier 5 → 8 HP
- Tier 6 → 9 HP
- Tier 7 → 11 HP
- Tier 8 → 12 HP
- Tier 9 → 14 HP
- Tier 10 → 15 HP

**Values may be adjusted after live testing.**

#### RP & Boss Raids
- RP-driven raids and large bosses can deal village damage
- These events may:
  - Deal heavy damage
  - Cause villages to lose levels
  - Affect multiple villages

#### Monster Encounter Damage
**⚠️ Status: Planned Feature (Not Yet Implemented)**

**Mechanic**: When a player loses a fight to any Tier 1-4 monster (outside of raids), there is a **percentage chance** that the monster gets angry and follows the player back to the village, causing damage.

**Rationale**: 
- Represents monsters getting past scout patrols
- More flavorful than HWQ damage (monster encounters vs. NPC tantrums)
- Provides chip damage without being too punishing
- Only applies on losses, not victories

**Implementation Details** (Planned):
- **Damage Chance**: X% chance per monster loss (exact percentage subject to balance testing)
- **Damage Amount**: Small amount (e.g., 1-3 HP, subject to balance)
- **Applies To**: All Tier 1-4 monsters (Tier 5+ are too rare to be reliable damage sources)
- **Does Not Apply To**: 
  - Raid monsters (raids have their own damage system)
  - Monsters encountered outside village territory (if tracking is implemented)
- **Flavor**: Could include named rivalry enemies (e.g., "Ze'al's Black Lizalfos") for extra flavor

**Note**: This is intended to provide consistent chip damage to prevent villages from staying at 100% HP constantly, while being more fair and flavorful than HWQ damage.

---

### 🌦️ Weather Damage

#### Overview
Some weather conditions cause automatic village damage when they occur. Damage is applied once per weather period. Village level does not prevent or reduce weather damage.

#### Wind Damage (Chip Damage)
If wind reaches the following categories, the village takes chip damage due to structural strain, fallen debris, and travel disruption:
- **Strong Winds** (41-62 km/h) → 1 HP
- **Gale** (63-87 km/h) → 1 HP
- **Storm** (88-117 km/h) → 1 HP
- **Hurricane** (≥118 km/h) → 2 HP

**Cinder Storms**:
- Cinder storms always have strong winds by necessity
- Currently causes wind-based damage (1-2 HP depending on wind category)
- **Under Discussion**: May be adjusted to cause additional damage beyond wind effects (subject to balance testing)

Applies equally to all villages.

#### Precipitation-Based Damage

**Heavy Snow & Blizzard**:
- Extreme snow conditions may cause damage due to roof collapse, blocked roads, and supply disruption
- **Heavy Snow** → 2 HP
- **Blizzard** → 5 HP

**Hail**:
- **Hail** → 3 HP
- Represents crop loss, damaged structures, and injuries

#### Special Weather Damage
Special weather events represent major environmental or magical disasters.

**High-Damage Events**:
- **Blight Rain** → 50 HP
- Corruptive, supernatural weather
- Always causes heavy damage

**Moderate-Damage Events**:
- **Avalanche** → 15 HP
- **Rock Slide** → 15 HP
- **Flood** → 20 HP

These events:
- Block travel
- Damage infrastructure
- Require community response RP

**Lightning Storm**:
- **Lightning Storm** → 5 HP
- Represents fires, injuries, and damaged structures

#### Weather That Does NOT Cause Village Damage
The following weather types never deal village damage on their own:
- Rain / Light Rain
- Snow / Light Snow
- Fog
- Cloudy / Partly Cloudy
- Heat Lightning
- Sleet
- Drought (affects gathering, not HP)
- Muggy
- Rainbow
- Flower Bloom
- Fairy Circle
- Jubilee

These may affect gathering, affect travel, or trigger special commands, but do not reduce Village HP .

#### Additional Weather Damage Rules
**⚠️ Status: Planned Feature (Not Yet Implemented)**

- Weather damage is applied when weather posts at 8am EST
- Weather damage applies once per weather period (defined by the weather system code)
- Multiple damaging weather effects in one period: **Damage values are cumulative (all damage sources apply)**
  - Example: If Strong Winds (1 HP) and Heavy Snow (2 HP) occur in the same period, the village takes 3 HP total
- Weather damage is **unavoidable** - villages cannot prevent weather damage, and higher-level villages have no resistance
- Weather damage can push a village into a Damaged state and contribute to level loss if HP reaches 0
- Weather damage interacts with other damage sources (raids, HWQ expiration) - all damage is cumulative

---

### 📝 Quest-Related Damage

#### Ignored Help Wanted Quests (HWQs)
**⚠️ Status: REMOVED (May be re-added if villages level up too quickly)**

**Current Decision**: HWQ damage has been removed from the system. The village will NOT take damage from expired Help Wanted Quests.

**Rationale**: 
- Some HWQ requests are genuinely impossible or too expensive to complete
- With multiple HWQs per day at higher levels, this would cause constant daily damage
- Would make it very difficult to maintain village HP and upgrade villages
- Damage from raids and special weather already provides sufficient challenge

**Future Consideration**: If villages level up too quickly in practice, HWQ damage may be re-added as a balancing mechanism. If re-added, it would likely:
- Only apply to monster hunt HWQs (not all HWQ types)
- Or require multiple consecutive days of ignored HWQs before causing damage
- Be subject to community feedback and balance testing

**Note**: For details on HWQ generation and lifecycle, see Section 5 (Help Wanted Quests).

#### RP & Mod-Run Quests
- Story events, boss encounters, or plot raids may deal village damage
- May cause large HP loss
- Potentially trigger level loss
- Damage amount is determined per event, not standardized

---

### ⚠️ Other Damage Sources
Additional sources of village damage may include:
- Large boss encounters
- Story-driven disasters
- Event-specific mechanics

These are handled case-by-case and announced when relevant.

---

## 5. Help Wanted Quests (HWQs)

### Overview
Help Wanted Quests (HWQs) represent daily needs and problems generated by a village. Village level directly affects how many HWQs are created each day.

### HWQ Generation by Village Level
- **Level 1** → 1 HWQ per day
- **Level 2** → 2 HWQs per day
- **Level 3** → 3 HWQs per day

Higher village levels generate more opportunities for members to participate and earn rewards.

### HWQ Lifecycle
- HWQs are generated daily per village
- Each HWQ is available for a limited time
- Any eligible member may complete an HWQ
- HWQs do not require sign-ups — first completion resolves it

### Ignored HWQs & Damage
**⚠️ Status: REMOVED (May be re-added if villages level up too quickly)**

**Current Decision**: HWQ damage has been removed from the system. Expired Help Wanted Quests do NOT cause village damage.

**Rationale**: 
- Some HWQ requests are genuinely impossible or too expensive to complete
- With multiple HWQs per day at higher levels, this would cause constant daily damage
- Would make it very difficult to maintain village HP and upgrade villages
- Damage from raids and special weather already provides sufficient challenge

**Future Consideration**: If villages level up too quickly in practice, HWQ damage may be re-added as a balancing mechanism. If re-added, it would likely:
- Only apply to monster hunt HWQs (not all HWQ types)
- Or require multiple consecutive days of ignored HWQs before causing damage
- Be subject to community feedback and balance testing

### Interaction with Village State
- HWQs can still generate while a village is Damaged
- Completing HWQs during a Damaged state:
  - Helps prevent further HP loss
  - Does not replace required repairs

### HWQ Generation Restrictions (Under Discussion)
**⚠️ Status: Under Discussion (Not Decided)**

**Idea**: Prevent HWQs from spawning on Blight Rain days, since most people won't risk going out during Blight Rain.

**Rationale**:
- Blight Rain already causes 50 HP damage to villages
- Most players avoid going out during Blight Rain
- HWQs spawning on Blight Rain days would likely go unfulfilled, adding unnecessary chip damage
- However, it's also "heinously funny" to imagine NPCs demanding urgent tasks during dangerous weather

**Note**: This is currently just a discussion idea and has not been approved for implementation. Current system allows HWQs to spawn on any day regardless of weather.

---

## 6. Contribution System

### Overview
Village upgrades and repairs rely on member contributions. Players may donate tokens or materials to help their village progress.

### What Can Be Contributed
Members may contribute:
- **Tokens**
- **Approved village materials** (based on the village's material pool - see Section 3 for material lists)

Contributions can be made toward:
- Active village upgrades
- Repairs after village damage

**Material Validation**: When contributing via `/village upgrade`, the system validates the item name against the village's approved material list using case-insensitive fuzzy matching. Materials are stored as a `Map` in the Village schema: `{ current: number, required: { 2: number, 3: number } }`.

### Contribution Tracking
All contributions are:
- Tracked per item and per token amount
- Logged under the contributing member
- Used for leaderboards and recognition of top contributors

**Leaderboards are informational and do not grant mechanical advantages.**

### Contribution Cooldowns
- Contributions are subject to a cooldown
- **Cooldown: 1 contribution per user per week**
- Cooldown applies per user (not per village or per contribution type)
- Cooldown applies regardless of:
  - Tokens vs materials
  - Upgrade vs repair contributions
  - Which village is being contributed to

**⚠️ Cooldown duration is tweakable and may be adjusted after launch.**

### Contribution Limits & Safeguards
- Contributions only apply to the currently active village state
- You cannot pre-pay for future upgrade tiers
- If your contribution would exceed what's needed, the system will check remaining need before processing and reject the contribution with an error
- System checks remaining need (e.g., if 100 Wood needed and 80 already contributed, only 20 more can be contributed)
- Players must contribute one material type at a time - multiple different materials cannot be contributed in a single contribution
- Each material type must be contributed separately
- Check is done before the contribution is processed
- If two players try to contribute simultaneously, the first command processed succeeds and the second gets an error (this is extremely rare as commands process sequentially)
- If a village drops a level or enters a Damaged state:
  - All upgrade contributions are locked until repairs are completed
- Excess contributions do not carry over between levels
- **⚠️ Planned Feature**: Contribution limits per week may be implemented to prevent single players from fully funding village upgrades. Exact limits subject to balance testing.

### Clarifications
**Q: Can one person fully fund a village upgrade?**
- ⚠️ Currently possible, but **contribution limits per week are planned** to prevent single-player completion. Cooldowns already provide some limitation (1 contribution per week per user).

**Q: Can I contribute to multiple villages in the same week?**
- 🔧 This depends on cooldown tuning and may be allowed or restricted later.

**Q: Do contributions get refunded if a village loses a level?**
- ❌ No. Lost upgrade progress is permanent.

**Q: Do repair contributions count toward leaderboards?**
- ✅ Yes. All contributions are tracked equally.

---

## 7. Village Benefits by Level

### Overview
Village level determines various benefits available to players, including gathering bonuses, vending discounts, and special features. This section consolidates all level-based benefits.

---

### Gathering System

#### Current Implementation

**How Gathering Works**:
When using `/gather` in a village:
1. **Location Requirement**: Characters must be physically located in the village (`character.currentVillage`) and use the command in the village's designated Discord channel
2. **Quantity**: Characters receive **1 item** per gather action (regardless of village level)
3. **Item Selection**: Items are filtered by:
   - **Job tag** - Item must have the character's job in its `allJobsTags` array
   - **Region tag** - Item must have the village's region property set to `true` (eldin, lanayru, or faron)
4. **Weighted Selection**: Items are selected using weighted random selection based on:
   - Item rarity (1-10 scale)
   - Item weight (affects probability within rarity tier)
5. **Item Source**: All items come from the global item database, filtered by job and region

**Special Cases**:
- **Scholar Boost**: Allows gathering from a different village's item table without being physically there (target village specified in boost request)
- **Village-Exclusive Jobs**: Some jobs (Miner, Fisherman) tied to specific villages override character location requirements
- **Testing Channel**: Exception allows bypass for development purposes

**What Items Can Be Gathered**:
- Available items depend on character's job (determines which items are eligible) and village location (determines which region's items are available)
- Items must have matching job tag AND region property

**Examples of items by region** (not exhaustive - depends on job):
- **🔥 Eldin Region (Rudania)**: Eldin Ore, Goron Ore, Rock Salt, Gold Ore, Spicy Pepper, Sunshroom, Fireproof Lizard, etc.
- **💧 Lanayru Region (Inariko)**: Luminous Stone, Sneaky River Snail, Hyrule Bass, Silent Princess, Blue Nightshade, Fleet-Lotus Seeds, etc.
- **🍃 Faron Region (Vhintl)**: Korok Leaf, Mighty Bananas, Palm Fruit, Spider Silk, Thornberry, Faron Grasshopper, etc.

**Current Limitations**:
- **No village level bonuses** - All villages (Level 1, 2, or 3) currently provide the same gathering experience
- **No quantity bonuses** - Always 1 item per gather, regardless of village level
- **No rarity bonuses** - Item rarity distribution is the same regardless of village level
- **No unlockable items** - All region-appropriate items are available from Level 1

#### Planned Enhancements (Not Yet Implemented)

**⚠️ Status: Planned Feature**

The following bonuses will apply only when gathering in that village. Gathering bonuses are **NOT disabled** when the village is in a Damaged state.

**1. Item Quantity Bonuses**:
Village prosperity improves gathering efficiency.

- **Level 1** (Current): 1 item per gather
- **Level 2** (Planned): Base: 1 item per gather, Bonus: Small chance (e.g., 10-15%) to receive +1 extra item, **Total possible**: 1-2 items per gather
- **Level 3** (Planned): Base: 1 item per gather, Bonus: Higher chance (e.g., 20-25%) to receive +1 extra item, Bonus: Very small chance (e.g., 5%) to receive +2 extra items, **Total possible**: 1-3 items per gather

**Bonus Item Rules**:
- Bonus items are pulled from the same gather table as the original roll
- Same job and region filtering applies
- Each bonus item is selected independently (weighted random)

**2. Rarity Odds by Village Level**:
Village level improves the odds of pulling rarer items by adjusting weight distribution.

- **Level 1** (Current): Standard rarity distribution, Items selected based on base weight and rarity
- **Level 2** (Planned): **Rarity weight multiplier**: +10-15% weight bonus for items of rarity 3-5, Slightly increased chance for uncommon items (rarity 3-4) and low-tier rare items (rarity 5), Common items (rarity 1-2) remain at base probability
- **Level 3** (Planned): **Rarity weight multiplier**: +20-30% weight bonus for items of rarity 3-7, Noticeably increased chance for rare items (rarity 5-7) and village-specific specialty items (if tagged as such), Very rare items (rarity 8-10) get smaller bonus to maintain balance

**Implementation Notes**:
- This does not guarantee rare drops — it only shifts probabilities
- Weight multipliers are applied after base item filtering
- Exact percentages subject to balance testing

**3. Gathering Table Unlocks by Level**:
Villages unlock new items on their gather tables as they grow. Items are tagged with a `villageLevelUnlock` property.

- **Level 1 — Basic Resources** (Currently Available): All items with no `villageLevelUnlock` tag or `villageLevelUnlock: 1` are available. Examples (varies by job and region): Wood, Stone, Flint, Common herbs, Basic fish, Common mushrooms, Basic ores
- **Level 2 — Regional Specialty Items** (Planned): Items tagged with `villageLevelUnlock: 2` are added to the gather table. Examples (by region):
  - **🔥 Rudania (Eldin)**: Rock Salt, Sunshroom, Iron Ore, Gold Dust
  - **💧 Inariko (Lanayru)**: Luminous Stone, Fleet-Lotus Seeds, Silent Princess, Blue Nightshade
  - **🍃 Vhintl (Faron)**: Korok Leaf, Palm Fruit, Mighty Bananas, Faron Grasshopper
  - **Unlock Behavior**: Items unlock when village reaches Level 2, Items remain available as long as village is Level 2 or higher, If village drops to Level 1, these items are removed from gather table
- **Level 3 — Thriving Village Items** (Planned): Items tagged with `villageLevelUnlock: 3` are added to the gather table. Examples (by region):
  - **🔥 Rudania (Eldin)**: Gold Ore, Fireproof Lizard, Volcanic Ladybug, Eldin Roller
  - **💧 Inariko (Lanayru)**: Staminoka Bass, Sneaky River Snail, Rare crystals
  - **🍃 Vhintl (Faron)**: Spider Silk, Thornberry, Rare forest botanicals
  - **Unlock Behavior**: Items unlock when village reaches Level 3, Items remain available as long as village is Level 3, If village drops below Level 3, these items are immediately removed from gather table

**4. Village Identity Bonuses (Current Implementation)**:
- **Implementation**: Gathering filters items by character's current village location and associated region (Eldin, Lanayru, or Faron). Items must have both the correct job tag AND correct region tag. The filtering code checks `item.allJobsTags` for job match and `item[regionKey]` (where regionKey is 'eldin', 'lanayru', or 'faron') for region match. Gathering bias is a natural result of this region-based filtering, not a separate probability modifier.
- Each village's region database naturally contains items matching its theme:
  - **🔥 Rudania (Eldin)**: Ores, Stones, Mineral-based items (e.g., "Eldin Ore", "Goron Ore", "Rock Salt")
  - **💧 Inariko (Lanayru)**: Crystals, Fish, Water-related materials (e.g., "Luminous Stone", "Sneaky River Snail", "Hyrule Bass")
  - **🍃 Vhintl (Faron)**: Plants, Forest byproducts, Organic materials (e.g., "Korok Leaf", "Mighty Bananas", "Spider Silk")

**Summary of Current vs. Planned**:

| Feature | Current (All Levels) | Planned Level 2 | Planned Level 3 |
|---------|---------------------|-----------------|-----------------|
| **Items per Gather** | 1 | 1-2 (chance for +1) | 1-3 (chance for +1 or +2) |
| **Rarity Bonuses** | None | +10-15% weight for rarity 3-5 | +20-30% weight for rarity 3-7 |
| **Unlockable Items** | All region items available | +Level 2 tagged items | +Level 3 tagged items |
| **Item Selection** | Weighted by rarity/weight | Same + rarity bonus | Same + larger rarity bonus |

**Clarifications**:
- **Current Implementation**: All villages (Level 1-3) provide identical gathering experience
- **Planned Bonuses**: Will stack with village level (Level 2 gets Level 2 bonuses, Level 3 gets Level 2 + Level 3 bonuses)
- **Village-Specific**: Bonuses only apply when gathering in that specific village
- **Cross-Village**: Gathering bonuses do not stack across villages (gathering in Rudania doesn't benefit from Inariko's level)
- **Damaged State**: Gathering bonuses remain active even when the village is in a Damaged state
- **Item Availability**: Unlockable items are removed from gather table if village drops below required level
- **Not Relics**: Rare village items are not relics and do not replace exploration rewards

---

### Looting System

#### Current Implementation

**How Looting Works**:
When using `/loot` in a village:
1. **Location Requirement**: Characters must be physically located in the village (`character.currentVillage`) and use the command in the village's designated Discord channel
2. **Monster Encounter**: Characters encounter monsters based on their job and village location
3. **Item Selection**: Items are filtered by the encountered monster's loot table
4. **Weighted Selection**: Items are selected using weighted random selection based on:
   - Final Value (FV) roll (1-100)
   - Item rarity (1-10 scale)
   - Item weight (affects probability within rarity tier)
5. **Item Source**: All items come from the monster's loot table in the global item database

**Special Cases**:
- **Job Vouchers**: Allow looting with different jobs temporarily
- **Village-Exclusive Jobs**: Some jobs (Miner, Fisherman) tied to specific villages override character location requirements
- **Testing Channel**: Exception allows bypass for development purposes

**Current Limitations**:
- **No village level bonuses** - All villages (Level 1, 2, or 3) currently provide the same looting experience
- **No rarity bonuses** - Item rarity distribution is the same regardless of village level
- **No damage reduction** - Monster damage is not reduced by village level
- **No quantity bonuses** - Always 1 item per successful loot, regardless of village level

#### Implemented Enhancements

**✅ Status: Implemented**

The following bonuses apply only when looting in that village. Looting bonuses are **NOT disabled** when the village is in a Damaged state.

**1. Rarity Odds by Village Level**:
Village level improves the odds of pulling rarer items from monster loot tables by adjusting weight distribution. Additionally, higher village levels improve villagers' combat effectiveness (better fed and equipped warriors), which can improve loot rolls.

- **Level 1**: Standard rarity distribution, Items selected based on Final Value (FV) roll and base weight/rarity
- **Level 2**: **Rarity weight multiplier**: +10-15% weight bonus for items of rarity 3-5, Slightly increased chance for uncommon items (rarity 3-4) and low-tier rare items (rarity 5), Common items (rarity 1-2) remain at base probability, **Combat effectiveness bonus**: +1-3 to dice roll (improved FV rolls)
- **Level 3**: **Rarity weight multiplier**: +20-30% weight bonus for items of rarity 3-7, Noticeably increased chance for rare items (rarity 5-7), Very rare items (rarity 8-10) get smaller bonus to maintain balance, **Combat effectiveness bonus**: +3-5 to dice roll (maximum FV rolls)

**Implementation Notes**:
- This does not guarantee rare drops — it only shifts probabilities
- Weight multipliers are applied after Final Value calculation and base item filtering
- Bonuses apply to the `createWeightedItemList` function in `rngModule.js`
- Combat effectiveness bonuses may affect FV roll ranges or loot success rates
- Exact percentages subject to balance testing

**2. Damage Reduction by Village Level**:
Higher-level villages provide better protection and support, reducing damage taken from monster encounters.

- **Level 1**: No damage reduction, Full monster damage applies
- **Level 2**: **5-10% damage reduction** - Village infrastructure and community support help mitigate combat damage
- **Level 3**: **10-15% damage reduction** - Thriving village provides maximum protection and support

**Implementation Notes**:
- Damage reduction applies after all other damage calculations (elixirs, boosts, etc.)
- Reduction is calculated as: `finalDamage = damage × (1 - reductionPercentage)`
- Minimum damage of 1 heart always applies (cannot reduce to 0)
- Damage reduction does not affect KO mechanics (0 hearts still results in KO)

**3. Loot Quantity Bonuses**:
Village prosperity improves looting efficiency, providing chances for bonus items.

- **Level 1**: 1 item per successful loot
- **Level 2**: Base: 1 item per loot, Bonus: 5-10% chance to receive +1 extra item, **Total possible**: 1-2 items per loot
- **Level 3**: Base: 1 item per loot, Bonus: 10-15% chance to receive +1 extra item, Bonus: 2-3% chance to receive +2 extra items, **Total possible**: 1-3 items per loot

**Bonus Item Rules**:
- Bonus items are pulled from the same monster loot table as the original roll
- Same Final Value and rarity filtering applies
- Each bonus item is selected independently (weighted random)
- Bonus items only apply on successful loots (victory outcomes)

**Summary of Implementation**:

| Feature | Level 1 | Level 2 | Level 3 |
|---------|---------|---------|---------|
| **Items per Loot** | 1 | 1-2 (5-10% chance for +1) | 1-3 (10-15% chance for +1, 2-3% chance for +2) |
| **Rarity Bonuses** | None | +10-15% weight for rarity 3-5 | +20-30% weight for rarity 3-7 |
| **Damage Reduction** | None | 5-10% reduction | 10-15% reduction |
| **Combat Effectiveness** | None | +1-3 to dice roll | +3-5 to dice roll |
| **Item Selection** | Weighted by FV/rarity/weight | Same + rarity bonus | Same + larger rarity bonus |

**Clarifications**:
- **Implementation**: All bonuses are now active and working as described
- **Bonuses Stack**: Level 2 gets Level 2 bonuses, Level 3 gets Level 2 + Level 3 bonuses
- **Village-Specific**: Bonuses only apply when looting in that specific village
- **Cross-Village**: Looting bonuses do not stack across villages (looting in Rudania doesn't benefit from Inariko's level)
- **Damaged State**: Looting bonuses remain active even when the village is in a Damaged state
- **Monster-Specific**: Bonuses apply to all monsters encountered in that village, regardless of monster tier
- **Implementation Location**: Implemented in `bot/commands/jobs/loot.js` (village level fetch, damage reduction, quantity bonuses, combat bonuses) and `bot/modules/rngModule.js` (rarity weight adjustments)

**Technical Implementation Details**:
- Village level is fetched from `Village` model using `character.currentVillage` in `processLootingLogic()`
- Village level is passed to `createWeightedItemList()` function for rarity bonuses
- Rarity weight multipliers are applied in `adjustRarityWeights()` function in `rngModule.js`
- Damage reduction is applied after `getEncounterOutcome()` in `processLootingLogic()` (after all other damage calculations)
- Quantity bonus logic is implemented in `generateLootedItem()` function which now returns an array of items
- Combat effectiveness bonuses are applied to the initial dice roll before `calculateFinalValue()`
- All bonus items are added to inventory via updated `handleInventoryUpdate()` function

---

### Crafting System

#### Current Implementation

**How Crafting Works**:
When using `/crafting` in a village:
1. **Location Requirement**: Characters must be physically located in the village (`character.currentVillage`) and use the command in the village's designated Discord channel
2. **Job Validation**: Characters must have a job with the CRAFTING perk (or ALL perks for mod characters)
3. **Item Validation**: Items must be craftable by the character's job (Cook, Blacksmith, Craftsman, etc.)
4. **Stamina Cost**: Each item requires stamina to craft (varies by item)
5. **Material Cost**: Each item requires specific materials from inventory
6. **Quantity**: Characters can craft multiple items at once (stamina and materials scale with quantity)

**Special Cases**:
- **Job Vouchers**: Allow crafting with different jobs temporarily (limited to items requiring ≤5 stamina)
- **Village-Exclusive Jobs**: Some jobs (Miner, Fisherman) tied to specific villages require being in that village
- **Testing Channel**: Exception allows bypass for development purposes

**Current Limitations**:
- **No recipe unlocks** - All craftable items are available from Level 1

#### Implemented Enhancements

**✅ Status: Implemented**

The following bonuses will apply only when crafting in that village. Crafting bonuses are **NOT disabled** when the village is in a Damaged state.

**1. Stamina Cost Reduction by Village Level**:
Higher-level villages have better infrastructure and community support, reducing the stamina required for crafting.

- **Level 1**: No stamina reduction, Full stamina cost applies
- **Level 2**: **5-10% stamina cost reduction** - Improved workshops and tools reduce crafting effort
- **Level 3**: **10-15% stamina cost reduction** - Advanced facilities and expert support provide maximum efficiency

**Implementation Notes**:
- Stamina reduction applies after all other stamina calculations (Priest boost, Teacher contribution, etc.)
- Reduction is calculated as: `finalStaminaCost = staminaCost × (1 - reductionPercentage)`
- Minimum stamina cost of 1 always applies (cannot reduce to 0)
- Reduction stacks multiplicatively with Priest boost (applied after Priest's 20% reduction)

**2. Material Cost Reduction by Village Level**:
Thriving villages have better resource networks and supply chains, reducing material requirements.

- **Level 1**: No material reduction, Full material cost applies
- **Level 2**: **5-10% material cost reduction** - Better supply chains and resource sharing reduce waste
- **Level 3**: **10-15% material cost reduction** - Optimized production and expert knowledge minimize material needs

**Implementation Notes**:
- Material reduction applies after Scholar boost (if active) - village bonus stacks with Scholar's 30% reduction
- Reduction is calculated per material: `finalMaterialQty = Math.ceil(materialQty × (1 - reductionPercentage))`
- Minimum quantity of 1 always applies (cannot reduce to 0)
- Reduction applies to all materials in the crafting recipe

**Summary of Implementation**:

| Feature | Level 1 | Level 2 | Level 3 |
|---------|---------|---------|---------|
| **Stamina Reduction** | None | 5-10% reduction | 10-15% reduction |
| **Material Reduction** | None | 5-10% reduction | 10-15% reduction |
| **Crafting Efficiency** | Standard | Improved | Maximum |

**Clarifications**:
- **Implementation**: Village level bonuses are now active and provide different crafting experiences based on village level
- **Bonuses**: Level 3 replaces Level 2 bonuses (Level 3 gets 10-15% reduction, not cumulative)
- **Village-Specific**: Bonuses only apply when crafting in that specific village
- **Cross-Village**: Crafting bonuses do not stack across villages (crafting in Rudania doesn't benefit from Inariko's level)
- **Damaged State**: Crafting bonuses remain active even when the village is in a Damaged state
- **Job-Specific**: Bonuses apply to all crafting jobs, but recipes may be job-locked
- **Stacking with Boosts**: Village bonuses stack with existing boosts (Priest stamina reduction, Scholar material reduction, etc.)
- **Implementation Location**: Implemented in `crafting.js` (village level fetch, cost calculations)

**Technical Implementation**:
- ✅ Fetch village level from `Village` model using `character.currentVillage`
- ✅ Apply stamina reduction in stamina cost calculation (after Priest boost and Teacher contribution)
- ✅ Apply material reduction in material cost calculation (after Scholar boost)
- ✅ Comprehensive logging shows village level effects on crafting costs

---

### Vending System

#### Overview
Village level determines what items are available in vending machines and applies cost discounts.

#### Stock Availability by Level
- **Level 1**: Basic stock only (items tier 1-3)
- **Level 2**: Mid-tier stock unlocked (items tier 1-6) + **-10% cost discount**
- **Level 3**: Rare stock unlocked (items tier 1-10) + **-20% cost discount**

#### Item Tier System
Items are ranked 1 (common) to 10 (super rare). Village level determines which tier items are available in vending machines.
- Both stock availability AND discount apply at higher levels
- Discount applies to all purchases in that village's vending machines
- Stock is determined by village's current level

#### Planned Enhancements
**⚠️ Status: Planned Feature (Not Yet Implemented)**

**Enhanced Vending System**:
- Higher village levels unlock more items in vending machines
- Level 2: Additional mid-tier items (already implemented)
- Level 3: Additional rare items (already implemented)
- Stock could rotate or be expanded based on level
- Could add special "village exclusive" items at higher levels

**Implementation Notes**:
- Should integrate with existing `VillageShopsModel`
- May need to add level-based filtering to shop stock

---

### Rest Spots System

**⚠️ Status: Planned Feature (Not Yet Implemented)**
**Priority**: High

#### Overview
Special locations in each village that provide free heart healing. Each village has a themed rest spot accessible to all characters physically located in that village.

#### Rest Spot Mechanics

**Benefit**: Restores 1-2 hearts (random: 50% chance for 1, 50% chance for 2)

**Cooldown**: Once per character per day (resets at 8am EST)

**Mechanics**:
- Uses `recoverHearts()` function (see `characterStatsModule.js`)
- Hearts cannot exceed `character.maxHearts`
- Free - no token or item cost
- Cannot revive KO'd characters (requires Healer)
- Cannot be used if character is at full hearts

#### Village-Specific Theming

Each village has a unique rest spot theme:
- **🔥 Rudania**: Hot Springs (natural geothermal pools)
- **💧 Inariko**: Cleansing Pool (purifying water source)
- **🍃 Vhintl**: Sacred Grove (restorative forest clearing)

#### Command Structure
**Planned Command**: `/village rest`
- **Requirements**:
  - Character must be physically located in the village (`character.currentVillage`)
  - Command must be used in village's designated Discord channel
  - Character must meet cooldown requirements
  - Character must not be at full hearts
  - Character must not be KO'd

#### Unlock Requirements
- **Level 1**: Rest spots are **not available**
- **Level 2**: Rest spots unlock
- **Level 3**: Rest spots remain available (no additional benefits)

**Note**: If a village drops below Level 2, rest spots become unavailable until village reaches Level 2 again.

#### Cooldown System
- **Per-character daily cooldown**
  - Tracked in character database (new field: `restSpotCooldown`)
  - Format: `Date` (timestamp of last use)
  - Resets at 8am EST daily
  - Separate cooldown per village (can use rest spot in different villages on same day)

#### Implementation Details
**Database Schema** (planned):
```javascript
// Character schema addition
restSpotCooldown: {
  Rudania: Date,    // Last use of Rudania rest spot
  Inariko: Date,    // Last use of Inariko rest spot
  Vhintl: Date      // Last use of Vhintl rest spot
}
```

**Validation Logic**:
- Check `character.currentVillage` matches target village
- Check `character.restSpotCooldown[villageName]` against current time
- Check village level >= 2
- Check `character.currentHearts < character.maxHearts`
- Check `character.ko === false`

**Healing Logic**:
```javascript
// Pseudo-code for rest spot healing
const heartsToRestore = Math.random() < 0.5 ? 1 : 2; // 50/50 chance
const maxRestore = character.maxHearts - character.currentHearts;
const actualRestore = Math.min(heartsToRestore, maxRestore);
await recoverHearts(character._id, actualRestore);
```

**Benefits by Village Level**:
- **Level 2**: Rest spots available (1-2 hearts restored, random: 50% chance for 1, 50% chance for 2)
- **Level 3**: Rest spots available with choice between stamina or hearts:
  - **Option 1**: Restore 1 stamina (50% chance)
  - **Option 2**: Restore 2 hearts (50% chance)
  - Player chooses which benefit they want when using the rest spot
  - Cannot have both - must choose one or the other

---

## 8. Technical Considerations

### Database Schema Updates
May need to add fields for:
- Rest spot cooldowns (per character)
- Event history

### Command Structure
- `/village view` - View village status (existing)
- `/village upgrade` - Contribute to upgrades (existing)
- `/village repair` - Repair damaged village (existing)
- `/village rest` - Use rest spots (planned)
- `/village event` - View recent events (planned)

### Integration Points
- Raid system (for damage)
- Weather system (for random events and damage)
- Character system (for rest spot cooldowns)
- Inventory system (for contributions)
- Token system (for contributions)

---

## 9. Implementation Checklist

### Core Systems
- [x] Village level and HP system (Level 1-3, max HP scaling)
- [x] Village status system (`'upgradable'`, `'damaged'`, `'max'`)
- [x] Upgrade system (tokens + materials)
- [x] Repair system (tokens only)
- [x] Resource loss on damage (tokens and materials)
- [x] Level drop mechanics (at 0 HP)

### Restrictions & Status
- [x] Job change restrictions when village is `'damaged'` (implemented in `validation.js` - `canChangeJob`)
- [x] Village move restrictions when village is `'damaged'` (implemented in `validation.js` - `canChangeVillage` and `travel.js`)

### Damage Sources
- [x] Raid damage system (Tier 5-10 damage values)
- [x] Weather damage system (wind, precipitation, special weather)
- [x] Monster encounter damage (percentage chance on Tier 1-4 losses)
- [ ] Named rivalry enemies (flavor feature for monster damage)

### Auto-Level-Up System
- [x] Auto-level-up check after material contributions
- [x] Auto-level-up check after token contributions
- [x] Auto-level-up check in mod villageresources command
- [x] Level-up announcement system (town hall channel posts)

### Material Requirements
- [x] Rudania material requirements (all levels)
- [x] Inariko material requirements (all levels)
- [x] Vhintl material requirements (all levels)
- [ ] Volcanic Ladybug added to Hunter table at Level 2 (Rudania)
- [ ] Gold Dust rebalancing (increase amount for Rudania)

### Gathering System Enhancements
- [x] Level 2 quantity bonuses (chance for +1 item)
- [x] Level 3 quantity bonuses (chance for +1 or +2 items)
- [x] Level 2 rarity weight multipliers (+10-15% for rarity 3-5)
- [x] Level 3 rarity weight multipliers (+20-30% for rarity 3-7)

### Looting System Enhancements
- [x] Level 2 rarity weight multipliers (+10-15% for rarity 3-5)
- [x] Level 3 rarity weight multipliers (+20-30% for rarity 3-7)
- [x] Level 2 damage reduction (5-10%)
- [x] Level 3 damage reduction (10-15%)
- [x] Level 2 loot quantity bonuses (chance for +1 item)
- [x] Level 3 loot quantity bonuses (chance for +1 or +2 items)
- [x] Level 2 combat effectiveness bonuses (improved FV rolls)
- [x] Level 3 combat effectiveness bonuses (maximum FV rolls)

### Crafting System Enhancements
- [x] Level 2 stamina cost reduction (5-10%) - **Implemented in `crafting.js`**
- [x] Level 3 stamina cost reduction (10-15%) - **Implemented in `crafting.js`**
- [x] Level 2 material cost reduction (5-10%) - **Implemented in `crafting.js`**
- [x] Level 3 material cost reduction (10-15%) - **Implemented in `crafting.js`**

### Vending System
- [ ] Level 2 stock unlocks (tier 1-6) + 10% discount - **Vending tier and discount are set on level-up but not used in vending handler**
- [ ] Level 3 stock unlocks (tier 1-10) + 20% discount - **Vending tier and discount are set on level-up but not used in vending handler**

### Rest Spots System
- [ ] Rest spot command (`/village rest`)
- [ ] Level 2 rest spots (1-2 hearts, random)
- [ ] Level 3 rest spots (choice: 1 stamina OR 2 hearts)
- [ ] Rest spot cooldown system (per character, per village, daily)
- [ ] Database schema for rest spot cooldowns

### Help Wanted Quests (HWQs)
- [x] HWQ generation by village level (1/2/3 per day) - **Implemented in `helpWantedModule.js` - `generateDailyQuests` (Level 1: 1 quest/day, Level 2: 2 quests/day, Level 3: 3 quests/day)**
- [x] HWQ expiration system (implemented in `helpWanted.js` - `validateQuestExpiration`)
- [ ] HWQ damage system (REMOVED - may be re-added if needed)
- [ ] HWQ generation restrictions on Blight Rain days (Under Discussion)

### Contribution System
- [x] Contribution cooldown system (1 per week per user) - **Note: Currently disabled for testing (COOLDOWN_ENABLED = false), configured for 1 week but not active**
- [ ] Contribution limits per week (planned feature)
- [x] Material validation and fuzzy matching (implemented in `village.js`)
- [x] Contribution leaderboards (implemented in `village.js` - `generateContributorsEmbed`)

### Weather System Integration
- [x] Wind damage (Strong Winds, Gale, Storm, Hurricane) - **Implemented in `scheduler.js` - `applyWeatherDamage`**
- [x] Precipitation damage (Heavy Snow, Blizzard, Hail) - **Implemented in `scheduler.js` - `applyWeatherDamage`**
- [x] Special weather damage (Blight Rain, Avalanche, Rock Slide, Flood, Lightning Storm) - **Implemented in `scheduler.js` - `applyWeatherDamage`**
- [x] Cinder storm damage (wind-based, 1-2 HP) - **Implemented in `scheduler.js` - `applyWeatherDamage`**
- [ ] Cinder storm additional damage (beyond wind - Under Discussion)
- [ ] Meteor shower damage chance (Under Discussion)

### Testing & Balance
- [ ] Raid damage value tuning
- [ ] Weather damage value tuning
- [ ] Monster encounter damage chance tuning
- [ ] Contribution limit tuning
- [ ] Gathering bonus percentage tuning
- [ ] Looting bonus percentage tuning
- [ ] Crafting reduction percentage tuning

---

## 10. Implementation Status Summary

### ✅ Fully Implemented Features
- **Core Systems**: Village level/HP, status system, upgrade/repair, resource loss, level drop
- **Restrictions**: Job change and village move restrictions when damaged
- **Damage Sources**: Raid damage, weather damage (all types), monster encounter damage
- **Auto-Level-Up**: Automatic level-up checks and announcements
- **Material Requirements**: All village material requirements configured
- **Weather Integration**: All weather damage types implemented
- **HWQ Expiration**: Quest expiration validation system
- **HWQ Generation by Village Level**: Quest generation based on village level (Level 1: 1 quest/day, Level 2: 2 quests/day, Level 3: 3 quests/day)
- **Gathering System Bonuses**: Quantity bonuses (Level 2: chance for +1, Level 3: chance for +1 or +2) and rarity weight multipliers (Level 2: +10-15% for rarity 3-5, Level 3: +20-30% for rarity 3-7)
- **Looting System Bonuses**: Rarity weight multipliers, damage reduction, quantity bonuses, and combat effectiveness bonuses (FV roll improvements)
- **Crafting System Bonuses**: Stamina cost reduction (Level 2: 5-10%, Level 3: 10-15%) and material cost reduction (Level 2: 5-10%, Level 3: 10-15%)

### ⚠️ Partially Implemented Features
- **Contribution Cooldown**: System exists but currently disabled for testing (`COOLDOWN_ENABLED = false`)
- **Vending System**: Tier and discount are set on level-up but not applied in vending handler
- **Cinder Storm Damage**: Wind-based damage implemented, but additional damage beyond wind is under discussion

### ❌ Not Yet Implemented Features

#### High Priority
1. **Vending System Integration**: Vending tier and discount are stored but not used:
   - Level 2: Stock tier 1-6 + 10% discount
   - Level 3: Stock tier 1-10 + 20% discount

2. **Rest Spots System**: Complete system not implemented:
   - `/village rest` command
   - Level 2: 1-2 hearts (random)
   - Level 3: Choice of 1 stamina OR 2 hearts
   - Daily cooldown per character per village

#### Medium Priority
3. **Gathering System Item Unlocks**:
   - Level-based item unlocks (`villageLevelUnlock` property)

#### Low Priority / Future Enhancements
6. **Material Rebalancing**:
   - Volcanic Ladybug added to Hunter table at Level 2 (Rudania)
   - Gold Dust rebalancing (increase amount for Rudania)

7. **Flavor Features**:
   - Named rivalry enemies for monster encounter damage

8. **Planned Features**:
   - Contribution limits per week
   - HWQ generation restrictions on Blight Rain days (under discussion)
   - Cinder storm additional damage beyond wind (under discussion)
   - Meteor shower damage chance (under discussion)

---
