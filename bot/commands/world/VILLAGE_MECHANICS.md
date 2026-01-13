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

### Village "Damaged" Status
A village enters a **Damaged state** when its HP is not at full (e.g., 99/100 HP would be considered Damaged).
- Status is set to `'damaged'` immediately when damage is applied
- A village is damaged if it doesn't have 100% HP
- The village must be repaired before upgrade contributions can resume
- **Status automatically clears when HP reaches 100%** - the system detects full HP and sets status to not damaged
- If HP is 100/100 (100%), the village is no longer in damaged status
- HP does not restore naturally - repairs are required to restore HP

### What Happens at 0 HP
If Village HP reaches 0:
- Village **drops 1 level**
- **Loses ALL upgrade progress** toward the next level
- **All tokens and materials are cleared** (set to 0)
- **HP is set to the new level's max HP** (not 0)
- Village remains in **Damaged state** (already set when HP dropped below max)
- Lost resources are not tracked - they are simply gone
- Repair requires re-contributing tokens to restore HP (materials would be needed for upgrades if leveling up again)

**After Level Drop**:
- Level 3 → Level 2: New Max HP is 200, Village becomes 200/200 HP (but Damaged + progress reset)
- Level 2 → Level 1: New Max HP is 100, Village becomes 100/100 HP (but Damaged + progress reset)

**So the "punishment" is the level loss + progress wipe + repair lockout, not sitting at 0 HP forever.**

---

## 2.5. Repair System

### Overview
Villages can be repaired using tokens to restore HP. Repairs are separate from upgrades - **tokens repair HP**, while **materials contribute toward leveling up**.

### Repair Mechanics
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

### Repair Requirements
- Repair requirements are based on missing HP, not fixed amounts
- The token cost scales with the village's level and current HP deficit
- Repair contributions count toward the weekly contribution cooldown (same as upgrade contributions)
- Repair and upgrade contributions can happen simultaneously in different villages (cooldown is per user, not per village)

### Repair vs. Upgrades
- **Repairs**: Use tokens to restore HP to 100%
- **Upgrades**: Use materials and tokens to level up the village
- These are separate systems - materials only contribute to upgrades, tokens can be used for either repairs or upgrades

---

## 2. Upgrade System

### Overview
Village upgrades are intentional, manual, and gated. Upgrading requires both tokens and materials, and only one upgrade tier can be worked on at a time.

### Level 1 → Level 2 Upgrade
**Requirements**:
- **10,000 tokens**
- **250-300 regional materials** (exact mix is flexible, but all required totals must be met)

**When upgrade completes**:
- Village level becomes 2
- Max HP increases to 200
- HP set to 200/200 (fully restored)
- Upgrade progress toward Level 3 is unlocked

### Level 2 → Level 3 Upgrade
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

### Upgrade Restrictions
- Villages **cannot be upgraded while Damaged**
- If a village drops a level:
  - All progress toward the next level is wiped
  - Repairs must be completed before upgrades resume
- Excess materials or tokens **do not carry over** between upgrade tiers
- Contributions only apply to the current active upgrade tier (no pre-paying)

---

## 3. Material Requirements

### Material Structure
Each village uses a themed material pool. Only materials listed for that village may be contributed.

Materials are split into:
- **Core Materials** (bulk requirements)
- **Support Materials** (variety + flavor)
- **Rare Materials** (high-tier upgrades only)

### 🔥 Rudania (Eldin)

#### Level 1 → Level 2
**Core Materials**:
- Wood ×250
- Gold Ore ×60 (at Level 3: ×50)
- Goron Ore ×100 (at Level 3: ×200)

**Support Materials**:
- Flint ×40
- Rock Salt ×30
- Spicy Pepper ×75 (at Level 3: ×150)
- Sunshroom ×80 (at Level 3: ×160)
- Fireproof Lizard ×50 (at Level 3: ×100)
- Volcanic Ladybug ×60 (at Level 3: ×120)
- Eldin Roller ×40 (at Level 3: ×80)
- Gold Dust ×30 (at Level 3: ×60)

**Total**: 685 materials (300+ for Level 2, additional for Level 3)

#### Level 2 → Level 3
**Core Materials**:
- Wood ×500 (total across levels, cumulative)
- Gold Ore ×50
- Goron Ore ×200

**Support Materials**:
- Spicy Pepper ×150 (total across levels, cumulative)
- Sunshroom ×160 (total across levels, cumulative)
- Fireproof Lizard ×100 (total across levels, cumulative)
- Volcanic Ladybug ×120 (total across levels, cumulative)
- Eldin Roller ×80 (total across levels, cumulative)
- Gold Dust ×60 (total across levels, cumulative)

**Rare Materials**:
- Dinraal's Claw ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Shard of Dinraal's Scale ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Shard of Dinraal's Fang ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Shard of Dinraal's Horn ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Goddess Plume ×3 (1 per level)

**Total**: 1,421 materials + 15 rare items (cumulative across all levels)

---

### 💧 Inariko (Lanayru)

#### Level 1 → Level 2
**Core Materials**:
- Wood ×250
- Silver Ore ×200 (at Level 3: ×250)
- Luminous Stone ×50 (at Level 3 only: ×100)

**Support Materials**:
- Silent Princess ×40 (at Level 3: ×80)
- Blue Nightshade ×60 (at Level 3: ×120)
- Sneaky River Snail ×50 (at Level 3: ×100)
- Hyrule Bass ×40 (at Level 3: ×80)
- Lanayru Ant ×45 (at Level 3: ×90)
- Fleet-Lotus Seeds ×55 (at Level 3: ×110)
- Staminoka Bass ×30 (at Level 3 only)

**Total**: 770 materials (300+ for Level 2, additional for Level 3)

#### Level 2 → Level 3
**Core Materials**:
- Wood ×500 (total across levels, cumulative)
- Silver Ore ×250 (total across levels, cumulative)
- Luminous Stone ×100

**Support Materials**:
- Silent Princess ×80 (total across levels, cumulative)
- Blue Nightshade ×120 (total across levels, cumulative)
- Sneaky River Snail ×100 (total across levels, cumulative)
- Hyrule Bass ×80 (total across levels, cumulative)
- Lanayru Ant ×90 (total across levels, cumulative)
- Fleet-Lotus Seeds ×110 (total across levels, cumulative)
- Staminoka Bass ×30

**Rare Materials**:
- Naydra's Claw ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Shard of Naydra's Scale ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Shard of Naydra's Fang ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Shard of Naydra's Horn ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Goddess Plume ×3 (1 per level)

**Total**: 1,480 materials + 15 rare items (cumulative across all levels)

---

### 🍃 Vhintl (Faron)

#### Level 1 → Level 2
**Core Materials**:
- Wood ×250
- Tree Branch ×200 (at Level 3: ×250)
- Korok Leaf ×50 (at Level 3: ×100)

**Support Materials**:
- Mighty Bananas ×70 (at Level 3: ×140)
- Palm Fruit ×65 (at Level 3: ×130)
- Hydromelon ×60 (at Level 3: ×120)
- Voltfruit ×55 (at Level 3: ×110)
- Faron Grasshopper ×50 (at Level 3: ×100)
- Deku Hornet ×45 (at Level 3: ×90)
- Spider Silk ×40 (at Level 3: ×80)
- Kelp ×50 (at Level 3: ×100)
- Thornberry ×60 (at Level 3: ×120)

**Total**: 895 materials (320+ for Level 2, additional for Level 3)

#### Level 2 → Level 3
**Core Materials**:
- Wood ×500 (total across levels, cumulative)
- Tree Branch ×250 (total across levels, cumulative)
- Korok Leaf ×100 (total across levels, cumulative)

**Support Materials**:
- Mighty Bananas ×140 (total across levels, cumulative)
- Palm Fruit ×130 (total across levels, cumulative)
- Hydromelon ×120 (total across levels, cumulative)
- Voltfruit ×110 (total across levels, cumulative)
- Faron Grasshopper ×100 (total across levels, cumulative)
- Deku Hornet ×90 (total across levels, cumulative)
- Spider Silk ×80 (total across levels, cumulative)
- Kelp ×100 (total across levels, cumulative)
- Thornberry ×120 (total across levels, cumulative)

**Rare Materials**:
- Farosh's Claw ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Shard of Farosh's Scale ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Shard of Farosh's Fang ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Shard of Farosh's Horn ×3 (1 for Level 1, 2 for Level 2, 3 for Level 3)
- Goddess Plume ×3 (1 per level)

**Total**: 1,690 materials + 15 rare items (cumulative across all levels)

---

### Material Rules
- Materials must be obtainable via normal gameplay
- Support materials exist to reduce single-item grind and encourage varied gathering
- Rare materials are only required for Level 3 upgrades
- No village requires another village's exclusive material
- Numbers are intentionally not symmetrical (villages differ in biome access)
- Wood appears in all villages as a shared baseline
- Dragon part requirements are kept equal for fairness

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

### Dragon Parts Requirements
Dragon parts are required for village upgrades, with quantities scaling by level:
- **Level 1 → Level 2**: 1 of each dragon part type + 1 Goddess Plume
- **Level 2 → Level 3**: 2 of each dragon part type + 1 Goddess Plume (cumulative: 3 total of each part + 3 total Goddess Plumes)

**Dragon Part Types** (per village):
- **Dragon Claw**: Dinraal's Claw (Rudania) / Naydra's Claw (Inariko) / Farosh's Claw (Vhintl)
- **Dragon Scale**: Shard of Dinraal's Scale (Rudania) / Shard of Naydra's Scale (Inariko) / Shard of Farosh's Scale (Vhintl)
- **Dragon Fang Shard**: Shard of Dinraal's Fang (Rudania) / Shard of Naydra's Fang (Inariko) / Shard of Farosh's Fang (Vhintl)
- **Dragon Horn Shard**: Shard of Dinraal's Horn (Rudania) / Shard of Naydra's Horn (Inariko) / Shard of Farosh's Horn (Vhintl)
- **Goddess Plume**: Required by all villages (1 per level)

**Total per Level**:
- Level 1 → 2: 5 rare items (1 of each part type + 1 Goddess Plume)
- Level 2 → 3: 5 rare items (2 of each part type + 1 Goddess Plume)
- **Cumulative to Level 3**: 15 rare items total (3 of each dragon part + 3 Goddess Plumes)

---

## 4. Damage System

### Overview
Villages can lose HP from multiple sources. All damage is applied directly to current Village HP and can stack across events.

---

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
- If Village HP reaches 0:
  - The village loses one level
  - All upgrade progress toward the next level is lost

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

#### Tier 4+ Monsters (VOTE)
**Open Question**: Should losing to Tier 4+ monsters outside of raids cause village damage?
- React with ✅ Yes, they should cause village damage
- React with ❌ No, they should not

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
- Meteor Shower

These may affect gathering, affect travel, or trigger special commands, but do not reduce Village HP.

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
**⚠️ Status: Planned Feature (Not Yet Implemented)**

If a village generates an HWQ and no one completes it, the village will take:
- **5 HP damage per ignored HWQ**
- Damage is applied after the quest expiration check completes (at midnight EST)
- If multiple villages have expired quests, damage is applied sequentially (one village at a time)
- If a village has 3 expired quests, it takes 15 HP damage total (5 HP × 3 quests)
- Villages are notified when damage is applied - notification appears in the village channel
- Quests expire at midnight EST - if a quest is completed before midnight, it is considered completed and does not cause damage

This represents:
- NPC needs going unmet
- Minor local fallout, not catastrophic failure

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

### Ignored HWQs
If an HWQ expires without being completed:
- The village takes **5 HP damage per ignored HWQ**
- Damage is applied immediately when the HWQ expires

This represents:
- NPC needs going unmet
- Minor but cumulative village strain

### Interaction with Village State
- HWQs can still generate while a village is Damaged
- Completing HWQs during a Damaged state:
  - Helps prevent further HP loss
  - Does not replace required repairs

---

## 6. Contribution System

### Overview
Village upgrades and repairs rely on member contributions. Players may donate tokens or materials to help their village progress.

### What Can Be Contributed
Members may contribute:
- **Tokens**
- **Approved village materials** (based on the village's material pool)

Contributions can be made toward:
- Active village upgrades
- Repairs after village damage

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

### Clarifications
**Q: Can one person fully fund a village upgrade?**
- ❌ No. Cooldowns and/or caps exist to prevent single-player completion.

**Q: Can I contribute to multiple villages in the same week?**
- 🔧 This depends on cooldown tuning and may be allowed or restricted later.

**Q: Do contributions get refunded if a village loses a level?**
- ❌ No. Lost upgrade progress is permanent.

**Q: Do repair contributions count toward leaderboards?**
- ✅ Yes. All contributions are tracked equally.

---

## 7. Gathering System

**⚠️ Status: Planned Feature (Not Yet Implemented)**

### Overview
Village level affects what you can gather, how much you get, and what type of items are favored. These bonuses apply only when gathering in that village. Gathering bonuses are **NOT disabled** when the village is in a Damaged state.

### 1. Item Quantity Bonuses
Village prosperity improves gathering efficiency.

**Level 1**:
- Normal gather: 1 item per gather

**Level 2**:
- Normal gather
- Small chance to receive +1 extra item

**Level 3**:
- Normal gather
- Higher chance to receive +1 extra item
- Very small chance to receive +2 extra items

Bonus items are pulled from the same gather table as the original roll.

### 2. Rarity Odds by Village Level
Village level slightly improves the odds of pulling rarer items.

**Level 1**:
- Standard rarity distribution

**Level 2**:
- Slightly increased chance for:
  - Uncommon items
  - Low-tier rare items

**Level 3**:
- Noticeably increased chance for:
  - Rare items
  - Village-specific specialty items

**This does not guarantee rare drops — it only shifts probabilities.**

### 3. Gathering Table Unlocks by Level
Villages unlock new items on their gather tables as they grow.

#### Level 1 — Basic Resources
Common, everyday materials.

**Examples**:
- Wood
- Stone
- Flint
- Common herbs
- Basic fish
- Common mushrooms

#### Level 2 — Regional Specialty Items
Items that reflect learned techniques, trade routes, or cultivation.

**Examples**:
- **Rudania**: Rock Salt, Sunshroom, Iron Ore
- **Inariko**: Luminous Stone, Fleet-Lotus Seeds, Silent Princess
- **Vhintl**: Korok Leaves, Palm Fruit, Mighty Bananas

#### Level 3 — Thriving Village Items
Village-exclusive or story-important materials that only appear while the village is thriving.

**Examples**:
- **Rudania**: Gold Ore, Fireproof Lizard, Rare volcanic minerals
- **Inariko**: Zora Scales, Sneaky River Snails, Rare crystals
- **Vhintl**: Vintage Linen, Spider Silk, Rare forest botanicals

**If a village drops below Level 3, these items are removed from the gather table.**

### 4. Village Identity Bonuses (Flavor + Function)
Each village has a subtle bias toward certain item types.

**🔥 Rudania**:
- Increased chance to gather: Ores, Stones, Mineral-based items

**💧 Inariko**:
- Increased chance to gather: Crystals, Fish, Water-related materials

**🍃 Vhintl**:
- Increased chance to gather: Plants, Forest byproducts, Soft or organic materials

These bonuses affect distribution, not quantity.

### Clarifications
- Gathering bonuses stack with village level
- Gathering bonuses do not stack across villages
- Rare village items are not relics and do not replace exploration rewards
- Gathering bonuses remain active even when the village is in a Damaged state

---

## 8. Protection & Vending System

### Protection System
- **All village levels are vulnerable to raids**
- There is no raid immunity at any level
- Village level affects random raid frequency, but does not prevent raids
- Triggered raids (Blood Moons, RP events, bosses) ignore frequency scaling

### Vending System
- **Level 1**: Basic stock only (items tier 1-3)
- **Level 2**: Mid-tier stock unlocked (items tier 1-6) + **-10% cost discount**
- **Level 3**: Rare stock unlocked (items tier 1-10) + **-20% cost discount**

**Item Tier System**: Items are ranked 1 (common) to 10 (super rare). Village level determines which tier items are available in vending machines.
- Both stock availability AND discount apply at higher levels

---

## 9. Village-Specific Flavor

### 🔥 Rudania (Eldin)
- **Theme**: Goron/Mountain village
- **Rest Spot** (Planned): Hot Springs (Stamina)
- **Current Materials**: Wood, Gold Ore, Goron Ore, Flint, Rock Salt, Spicy Pepper, Sunshroom, Fireproof Lizard, Volcanic Ladybug, Eldin Roller, Gold Dust, Dinraal's Claw, Shard of Dinraal's Scale, Shard of Dinraal's Fang, Shard of Dinraal's Horn, Goddess Plume
- **Gathering Bias**: Ores, Stones, Mineral-based items

### 💧 Inariko (Lanayru)
- **Theme**: Zora/Water village
- **Rest Spot** (Planned): Cleansing Pool (Hearts)
- **Current Materials**: Wood, Silver Ore, Luminous Stone, Silent Princess, Blue Nightshade, Sneaky River Snail, Hyrule Bass, Lanayru Ant, Fleet-Lotus Seeds, Staminoka Bass, Naydra's Claw, Shard of Naydra's Scale, Shard of Naydra's Fang, Shard of Naydra's Horn, Goddess Plume
- **Gathering Bias**: Crystals, Fish, Water-related materials

### 🍃 Vhintl (Faron)
- **Theme**: Korok/Forest village
- **Rest Spot** (Planned): Grove (Gathering Blessing)
- **Current Materials**: Wood, Tree Branch, Korok Leaf, Mighty Bananas, Palm Fruit, Hydromelon, Voltfruit, Faron Grasshopper, Deku Hornet, Spider Silk, Kelp, Thornberry, Farosh's Claw, Shard of Farosh's Scale, Shard of Farosh's Fang, Shard of Farosh's Horn, Goddess Plume
- **Special Flavor**: Lost Woods mist (flavor only, not mechanical)
- **Gathering Bias**: Plants, Forest byproducts, Soft or organic materials

---

## 10. Planned Mechanics

### 1. Village Maintenance / Top-Up System
**Status**: Removed  
**Priority**: N/A

**Note**: This feature has been removed. The repair system handles HP restoration - there is no separate maintenance/top-up system. Repairs use tokens to restore HP to 100%.

---

### 2. Random Events System
**Status**: Planned  
**Priority**: Medium

**Description**: Random events that can affect villages, similar to Stardew Valley events.

**Potential Events**:
- **Positive Events**:
  - Resource windfall (bonus materials found)
  - Traveling merchant (special items available)
  - Community celebration (temporary boost to contributions)
  
- **Negative Events**:
  - Natural disaster (damage to village)
  - Resource shortage (temporary increase in requirements)
  - Bandit raid (loss of some resources)

- **Neutral/Interesting Events**:
  - Mysterious visitor (special quest or interaction)
  - Weather anomaly (affects gathering rates)
  - "Witch turns chickens into void chickens" style events (fun flavor)

**Implementation Notes**:
- Events should be weighted (more positive than negative)
- Should have cooldowns to prevent spam
- Should be flavor-rich and engaging
- May tie into existing weather/special weather systems

---

### 4. Rest Spots System
**Status**: Planned  
**Priority**: High

**Description**: Special locations in each village that provide free healing/blessings, split by type.

**Rest Spot Types**:

1. **Stamina Rest Spot** (Rudania - Hot Springs)
   - Heals 1-2 stamina for free
   - Cooldown: Daily or per character
   - Primary benefit for crafters

2. **Heart Rest Spot** (Inariko - Cleansing Pool)
   - Heals 1-2 hearts for free
   - Cooldown: Daily or per character
   - Primary benefit for looters

3. **Gathering Blessing Spot** (Vhintl - Grove)
   - Provides gathering blessing (teacher boost equivalent)
   - Cooldown: Once per week
   - Primary benefit for gatherers

**Implementation Notes**:
- Each village should have all three types, but themed differently
- Should be accessible via `/village rest` or similar
- Cooldowns should be per-character to prevent abuse
- Could unlock at village level 2+

---

### 5. Enhanced Vending System
**Status**: Planned  
**Priority**: Low

**Description**: More vending options based on village levels.

**Mechanics**:
- Higher village levels unlock more items in vending machines
- Level 2: Additional mid-tier items
- Level 3: Additional rare items
- Stock could rotate or be expanded based on level

**Implementation Notes**:
- Should integrate with existing `VillageShopsModel`
- May need to add level-based filtering to shop stock
- Could add special "village exclusive" items at higher levels

---

### 6. Random Damage Events
**Status**: Under Consideration  
**Priority**: Low

**Description**: Random chance for villages to take damage based on activity (like landmines in Discord).

**Mechanics**:
- Each message/action in village has a small chance (e.g., 1/100) to trigger damage
- More characters in a village = higher chance of damage
- Damage amount would be small (1-5 HP)
- Could be themed as "accidents" or "mishaps"

**Concerns**:
- Could be frustrating if too frequent
- May need balancing based on village population
- Should probably be opt-in or very rare

**Implementation Notes**:
- If implemented, should be toggleable per village
- Should have safeguards to prevent excessive damage
- Could be tied to specific activities (e.g., only during certain commands)

---

### 7. Community Stockyard / Item Share
**Status**: Rejected  
**Priority**: N/A

**Description**: Community storage where players can deposit/withdraw items (like Neopets giving tree).

**Reason for Rejection**:
- Ruu prefers purposeful donations for village upgrades
- Concerns about fairness (people taking more than their share)
- Existing gift system already handles resource sharing

**Alternative**:
- Current donation system already serves this purpose
- Players can use `/gift` command to share resources
- Focus should be on purposeful contributions, not free-for-all storage

---

## 11. Technical Considerations

### Database Schema Updates
May need to add fields for:
- Rest spot cooldowns (per character)
- Event history
- Maintenance contributions

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

## 12. Implementation Priority

### High Priority
1. Rest Spots System

### Medium Priority
3. Random Events System

### Low Priority
5. Enhanced Vending System
6. Random Damage Events (if implemented at all)

---

## 13. Open Questions

1. Should rest spots be village-specific or available in all villages?
2. What should be the frequency/rarity of random events?
3. Should random damage events be implemented, or is the risk too high?
4. How should maintenance contributions differ from repair contributions?
5. Should there be limits on how often players can use rest spots?
6. Should losing to Tier 4+ monsters outside of raids cause village damage? (VOTE)

---

## 14. Future Considerations

- Village-specific quests or challenges
- Seasonal events tied to villages
- Village leaderboards or achievements
- Village-specific NPCs or interactions
- Village customization options (cosmetic)

---

## 15. Notes from Discussion

- **November 22, 2025**: Initial discussion about random events, top-up system, and community stockyard
- **November 23, 2025**: Discussion about rest spots split by type (stamina/hearts/blessing)
- **November 24, 2025**: Discussion about random damage events (landmine concept)
- **January 12, 2026**: Vhintl flavor discussion (Lost Woods mist - flavor only, not mechanical)

---
