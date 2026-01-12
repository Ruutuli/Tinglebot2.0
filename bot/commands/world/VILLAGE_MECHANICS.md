# Village Command - Planned Mechanics

## Overview
This document consolidates planned mechanics and features for the `/village` command system, based on community discussions and design decisions.

---

## Core Mechanics (Currently Implemented)

### Village Levels
- **Level 1**: Base village (100 HP)
- **Level 2**: Upgraded village (200 HP)
- **Level 3**: Maximum level (300 HP)

### Village Health System
- Villages have health that can be damaged by raids
- When health reaches 0, village levels down and loses all progress
- Health can be restored through repair contributions

### Upgrade System
- Players can contribute **Items** or **Tokens** to upgrade villages
- Each level requires specific materials and token amounts
- Progress is tracked per material and token
- Contributors are tracked for leaderboards

### Repair System
- Damaged villages require repair before upgrading
- Repair contributions restore health and lost resources
- Repair progress tracked separately from upgrade progress

### Protection System
- **Level 1**: Vulnerable to all raids
- **Level 2**: Protected from random raids
- **Level 3**: Immune to all raids (including Blood Moons)

### Vending System
- **Level 1**: Basic stock only
- **Level 2**: Mid-tier stock unlocked (-10% cost)
- **Level 3**: Rare stock unlocked (-20% cost)

---

## Planned Mechanics

### 1. Village Maintenance / Top-Up System
**Status**: Planned  
**Priority**: High

**Description**: Allow players to top up Village HP before it drops a level and forces everyone to redo the entire item gathering quest.

**Mechanics**:
- Players can contribute items/tokens to restore village health
- Prevents village from leveling down when health is low
- Separate from repair system (maintenance is proactive, repair is reactive)
- May have cooldowns or limits to prevent abuse

**Implementation Notes**:
- Should be accessible via `/village maintain` or similar subcommand
- Should show current health and how much is needed to reach safe threshold
- Should warn players when village health is critically low

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

### 3. Village Traps System
**Status**: Planned  
**Priority**: Medium

**Description**: Traps that can damage large monsters before raids start, but require reset/repair after use.

**Mechanics**:
- Traps can be built/upgraded at village level 2+
- When a raid monster appears, traps have a chance to activate
- Traps deal damage (e.g., d4 hearts) to the monster before the raid begins
- After use, traps must be reset/repaired (requires materials)
- Higher level villages can have more/better traps

**Example**:
- "Oh a level 10 Lynel appeared at the gate, the log trap activated and did (d4) hearts to the lynel!"

**Implementation Notes**:
- Trap effectiveness could scale with village level
- Different trap types could be unlocked at different levels
- Trap reset could be automatic over time or require player contribution
- Should integrate with existing raid system

---

### 4. Rest Spots System
**Status**: Planned  
**Priority**: Medium

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

## Village-Specific Flavor

### Rudania (Eldin)
- **Theme**: Goron/Mountain village
- **Rest Spot**: Hot Springs (Stamina)
- **Current Materials**: Wood, Eldin Ore, Goron Ore, Fancy Fabric, Dinraal parts, Goddess Plume

### Inariko (Lanayru)
- **Theme**: Zora/Water village
- **Rest Spot**: Cleansing Pool (Hearts)
- **Current Materials**: Wood, Silver Ore, Luminous Stone, Silver Thread, Naydra parts, Goddess Plume

### Vhintl (Faron)
- **Theme**: Korok/Forest village
- **Rest Spot**: Grove (Gathering Blessing)
- **Current Materials**: Wood, Tree Branch, Korok Leaf, Vintage Linen, Farosh parts, Goddess Plume
- **Special Flavor**: Lost Woods mist (flavor only, not mechanical)

---

## Recommended Village Materials

Based on analysis of all available items in the database, here are recommended additions to each village's material requirements:

### Rudania (Eldin) - Suggested Additions

**Current Materials:**
- Wood, Eldin Ore, Goron Ore, Fancy Fabric, Dinraal's Claw, Shard of Dinraal's Fang, Shard of Dinraal's Horn, Goddess Plume

**Recommended Additions (Eldin-specific, stackable, rarity 1-3):**
1. **Flint** (Rarity 2) - Common Eldin material, good for basic crafting
2. **Rock Salt** (Rarity 2) - Found in Eldin, useful resource
3. **Spicy Pepper** (Rarity 2) - Eldin-specific food/material
4. **Sunshroom** (Rarity 2) - Eldin shroom, thematic
5. **Fireproof Lizard** (Rarity 2) - Eldin-specific creature
6. **Volcanic Ladybug** (Rarity 2) - Eldin-specific insect
7. **Eldin Roller** (Rarity 2) - Eldin-specific beetle
8. **Gold Ore** (Rarity 3) - Eldin ore, higher tier material
9. **Gold Dust** (Rarity 2) - Refined from gold ore

**Rationale**: These items are all Eldin-specific, stackable, and have appropriate rarity levels (1-3) for village upgrades. They fit the Goron/mountain theme and provide variety in material types (ores, creatures, plants, refined materials).

---

### Inariko (Lanayru) - Suggested Additions

**Current Materials:**
- Wood, Silver Ore, Luminous Stone, Silver Thread, Naydra's Claw, Shard of Naydra's Fang, Shard of Naydra's Horn, Goddess Plume

**Recommended Additions (Lanayru-specific, stackable, rarity 1-3):**
1. **Silent Princess** (Rarity 2) - Lanayru flower, iconic and thematic
2. **Blue Nightshade** (Rarity 2) - Lanayru plant, fits water theme
3. **Sneaky River Snail** (Rarity 2) - Lanayru water creature
4. **Staminoka Bass** (Rarity 3) - Lanayru fish, higher tier
5. **Hyrule Bass** (Rarity 3) - Common Lanayru fish
6. **Lanayru Ant** (Rarity 2) - Lanayru-specific insect
7. **Fleet-Lotus Seeds** (Rarity 2) - Lanayru water plant

**Rationale**: These items are Lanayru-specific and fit the Zora/water theme. They include aquatic creatures, water plants, and iconic flowers. All are stackable and have appropriate rarity for village upgrades.

---

### Vhintl (Faron) - Suggested Additions

**Current Materials:**
- Wood, Tree Branch, Korok Leaf, Vintage Linen, Farosh's Claw, Shard of Farosh's Fang, Shard of Farosh's Horn, Goddess Plume

**Recommended Additions (Faron-specific, stackable, rarity 1-3):**
1. **Mighty Bananas** (Rarity 2) - Faron fruit, thematic
2. **Palm Fruit** (Rarity 2) - Faron tree fruit
3. **Hydromelon** (Rarity 2) - Faron fruit
4. **Voltfruit** (Rarity 2) - Faron fruit
5. **Faron Grasshopper** (Rarity 2) - Faron-specific insect
6. **Deku Hornet** (Rarity 2) - Faron-specific creature
7. **Spider Silk** (Rarity 2) - Faron material, good for crafting
8. **Kelp** (Rarity 2) - Faron water plant
9. **Thornberry** (Rarity 2) - Faron plant

**Rationale**: These items are Faron-specific and fit the Korok/forest theme. They include tropical fruits, forest creatures, and natural materials. All are stackable and have appropriate rarity for village upgrades.

---

### Universal Materials (All Villages)

These items appear in multiple regions and could work for any village:
- **Flint** (Rarity 2) - Found everywhere, basic crafting material
- **Rock Salt** (Rarity 2) - Found everywhere, useful resource
- **Cotton** (Rarity 3) - Useful crafting material, found in all regions
- **Fairy** (Rarity 1) - Common, useful, found everywhere
- **Fairy Dust** (Rarity 2) - Refined fairy material, found everywhere

**Note**: These could be used as "common" materials that all villages need, providing a baseline requirement that's easier to fulfill.

---

### Material Selection Criteria

Items were selected based on:
1. **Region-specific**: Items that are primarily found in the village's region
2. **Stackable**: Items that can stack in inventory (required for village contributions)
3. **Appropriate Rarity**: Rarity 1-3 (not too common, not too rare)
4. **Thematic Fit**: Items that match the village's theme (Goron/mountain, Zora/water, Korok/forest)
5. **Gatherable/Lootable**: Items that can be obtained through gathering or looting jobs
6. **Material Category**: Items classified as materials in the database

**Total Items Analyzed**: 717 items  
**Potential Candidates**: 154 items (stackable, gather/loot, rarity ≤3)  
**Region-Specific Breakdown**:
- Eldin (Rudania): 63 items
- Lanayru (Inariko): 71 items
- Faron (Vhintl): 70 items
- Multiple Regions: 61 items
- No Region: 47 items

---

## Implementation Priority

### High Priority
1. Village Maintenance / Top-Up System
2. Rest Spots System

### Medium Priority
3. Random Events System
4. Village Traps System

### Low Priority
5. Enhanced Vending System
6. Random Damage Events (if implemented at all)

---

## Technical Considerations

### Database Schema Updates
- May need to add fields for:
  - Trap status/levels
  - Rest spot cooldowns (per character)
  - Event history
  - Maintenance contributions

### Command Structure
- `/village view` - View village status (existing)
- `/village upgrade` - Contribute to upgrades (existing)
- `/village repair` - Repair damaged village (existing)
- `/village maintain` - Top up village health (planned)
- `/village rest` - Use rest spots (planned)
- `/village trap` - Manage/repair traps (planned)
- `/village event` - View recent events (planned)

### Integration Points
- Raid system (for traps and damage)
- Weather system (for random events)
- Character system (for rest spot cooldowns)
- Inventory system (for contributions)
- Token system (for contributions)

---

## Notes from Discussion

- **November 22, 2025**: Initial discussion about random events, top-up system, and community stockyard
- **November 23, 2025**: Discussion about rest spots split by type (stamina/hearts/blessing)
- **November 24, 2025**: Discussion about traps and random damage events (landmine concept)
- **January 12, 2026**: Vhintl flavor discussion (Lost Woods mist - flavor only, not mechanical)

---

## Open Questions

1. Should rest spots be village-specific or available in all villages?
2. How should trap reset/repair work? Automatic over time or player-contributed?
3. What should be the frequency/rarity of random events?
4. Should random damage events be implemented, or is the risk too high?
5. How should maintenance contributions differ from repair contributions?
6. Should there be limits on how often players can use rest spots?
7. How should traps integrate with existing raid mechanics?

---

## Future Considerations

- Village-specific quests or challenges
- Seasonal events tied to villages
- Village leaderboards or achievements
- Village-specific NPCs or interactions
- Village customization options (cosmetic)
