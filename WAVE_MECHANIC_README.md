# Wave Mechanic Documentation

## Overview

Waves are sequential monster battle events where players fight through multiple monsters one at a time. Similar to raids, but instead of fighting a single powerful monster, players battle a series of monsters in sequence. Waves are triggered by moderators and take place in specific village channels.

## Key Concepts

### Wave Structure
- **Multiple Monsters**: A wave contains 5-15 monsters that must be defeated sequentially
- **Sequential Combat**: Players fight one monster at a time; only after defeating the current monster does the wave advance to the next
- **Turn-Based System**: Like raids, players take turns attacking the current monster
- **Progressive Difficulty**: Monsters are generated based on difficulty groups with tier distributions

### Wave States
- **active**: Wave is in progress, players can join and fight
- **completed**: All monsters have been defeated, wave is over
- **failed**: All participants have been KO'd, wave failed

## Starting Waves

### Mod Command: `/mod wavestart`

Moderators can start waves using the `/mod wavestart` command with the following parameters:

**Required Parameters:**
- **village**: The village where the wave occurs (Rudania, Inariko, or Vhintl)
- **monstercount**: Number of monsters in the wave (5-15)
- **difficulty**: Difficulty group (see Difficulty Groups section below)

**Process:**
1. Wave is created with a unique Wave ID (format: `W######`)
2. Monsters are generated based on difficulty and region
3. Wave announcement embed is posted in the village's town hall channel
4. A Discord thread is created for wave communication
5. Wave status is set to `active`

## Difficulty Groups

Waves support multiple difficulty levels, each with different tier distributions. Higher tiers are always weighted to appear less frequently.

### Beginner
- **Tiers**: 1-4
- **Distribution**: 
  - 30% Tier 1
  - 35% Tier 2
  - 25% Tier 3
  - 10% Tier 4

### Beginner+
- **Tiers**: 1-5
- **Distribution**: 
  - 28% Tier 1
  - 32% Tier 2
  - 23% Tier 3
  - 9% Tier 4
  - 8% Tier 5
- **Description**: Beginner difficulty with occasional tier 5 challenges

### Easy
- **Tiers**: 2-5
- **Distribution**: 
  - 35% Tier 2
  - 40% Tier 3
  - 20% Tier 4
  - 5% Tier 5

### Easy+
- **Tiers**: 2-6
- **Distribution**: 
  - 32% Tier 2
  - 36% Tier 3
  - 18% Tier 4
  - 10% Tier 5
  - 4% Tier 6
- **Description**: Easy difficulty with occasional higher tier monsters

### Mixed (Low)
- **Tiers**: 2-7
- **Distribution**: 
  - 30% Tier 2
  - 25% Tier 3
  - 20% Tier 4
  - 12% Tier 5
  - 8% Tier 6
  - 5% Tier 7
- **Description**: Wide range of tiers weighted heavily toward lower tiers

### Mixed (Medium)
- **Tiers**: 2-10
- **Distribution**: 
  - 25% Tier 2
  - 20% Tier 3
  - 18% Tier 4
  - 12% Tier 5
  - 10% Tier 6
  - 7% Tier 7
  - 4% Tier 8
  - 3% Tier 9
  - 1% Tier 10
- **Description**: Very wide range with heavy weighting toward lower tiers

### Intermediate
- **Tiers**: 3-6
- **Distribution**: 
  - 25% Tier 3
  - 45% Tier 4
  - 20% Tier 5
  - 10% Tier 6

### Intermediate+
- **Tiers**: 3-8
- **Distribution**: 
  - 22% Tier 3
  - 40% Tier 4
  - 18% Tier 5
  - 12% Tier 6
  - 6% Tier 7
  - 2% Tier 8
- **Description**: Intermediate difficulty with occasional high tier monsters

### Advanced
- **Tiers**: 4-7
- **Distribution**: 
  - 30% Tier 4
  - 35% Tier 5
  - 25% Tier 6
  - 10% Tier 7

### Advanced+
- **Tiers**: 4-9
- **Distribution**: 
  - 27% Tier 4
  - 32% Tier 5
  - 22% Tier 6
  - 12% Tier 7
  - 5% Tier 8
  - 2% Tier 9
- **Description**: Advanced difficulty with occasional very high tier monsters

### Boss Waves (Special)
Boss waves feature one high-tier boss monster (Tier 5-10, raid monsters) with the rest being Tier 1-4 support monsters. This allows for challenging boss encounters without overwhelming players with multiple high-tier monsters.

#### Tier 5 Boss Wave
- **Boss**: 1 Tier 5 monster (raid monster)
- **Support**: Rest are Tier 1-4
- **Support Distribution**:
  - 30% Tier 1
  - 35% Tier 2
  - 25% Tier 3
  - 10% Tier 4

#### Tier 6 Boss Wave
- **Boss**: 1 Tier 6 monster (raid monster)
- **Support**: Rest are Tier 1-4
- **Support Distribution**:
  - 30% Tier 1
  - 35% Tier 2
  - 25% Tier 3
  - 10% Tier 4

#### Tier 7 Boss Wave
- **Boss**: 1 Tier 7 monster (raid monster)
- **Support**: Rest are Tier 1-4
- **Support Distribution**:
  - 30% Tier 1
  - 35% Tier 2
  - 25% Tier 3
  - 10% Tier 4

#### Tier 8 Boss Wave
- **Boss**: 1 Tier 8 monster (raid monster)
- **Support**: Rest are Tier 1-4
- **Support Distribution**:
  - 30% Tier 1
  - 35% Tier 2
  - 25% Tier 3
  - 10% Tier 4

#### Tier 9 Boss Wave
- **Boss**: 1 Tier 9 monster (raid monster)
- **Support**: Rest are Tier 1-4
- **Support Distribution**:
  - 30% Tier 1
  - 35% Tier 2
  - 25% Tier 3
  - 10% Tier 4

#### Tier 10 Boss Wave
- **Boss**: 1 Tier 10 monster (raid monster)
- **Support**: Rest are Tier 1-4
- **Support Distribution**:
  - 30% Tier 1
  - 35% Tier 2
  - 25% Tier 3
  - 10% Tier 4

**Boss Wave Mechanics:**
- The boss monster is randomly placed in the wave (not always at the end)
- Support monsters are selected from Tier 1-4 using the distribution above
- Example: A Tier 10 Boss Wave of 5 monsters = 1 Tier 10 boss + 4 Tier 1-4 support monsters

### Yiga (Special)
- **Type**: Yiga clan members only
- **Rules**: 
  - Only Yiga Footsoldiers and Yiga Blademasters appear
  - First monster must always be a Yiga Footsoldier
  - Yiga Blademasters are always fewer than Footsoldiers
  - Filters monsters by `species === 'Yiga'`

## Monster Generation

### Normal Difficulty Logic
1. Monsters are filtered by the difficulty group's tier distribution
2. Monsters are further filtered by the village's region
3. Monsters are grouped by species
4. Species grouping logic:
   - Monsters of the same species appear in groups of 2-3
   - Maximum of 3 consecutive monsters of the same species
   - Groups are separated to add variety

### Boss Wave Logic
1. One boss monster is selected from the specified tier (5-10, raid monsters)
2. Remaining monsters are selected from Tier 1-4 using the support tier distribution
3. Boss monster is randomly placed in the wave (not always at the end)
4. Support monsters use normal species grouping logic
5. Example: Tier 10 Boss Wave of 5 = 1 Tier 10 boss (random position) + 4 Tier 1-4 support monsters

### Regular Difficulty with Tier 5+ Logic
For regular difficulties that include Tier 5+ monsters (raid monsters):
1. The highest tier (5+) in the difficulty is selected as the boss
2. Remaining monsters are selected from Tier 1-4 using the Tier 1-4 portion of the original distribution
3. Boss monster is randomly placed in the wave
4. Example: Easy+ (Tiers 2-6) = 1 Tier 6 boss + rest Tier 1-4 support monsters

### Yiga Difficulty Logic
1. Only monsters with `species === 'Yiga'` are selected
2. First monster is always a Yiga Footsoldier
3. Subsequent monsters maintain the rule: Blademasters < Footsoldiers
4. 30% chance to add a Blademaster (if ratio allows)

## Joining Waves

### Command: `/wave`

Players join waves using the `/wave` command:

**Required Parameters:**
- **id**: The Wave ID (from the announcement)
- **charactername**: The name of the character joining

**Join Requirements:**
1. Character must be in the same village as the wave
2. Character must not have Blight Stage 3 or higher (monsters don't attack them)
3. User can only have one character per wave
4. Wave must be `active`

**Join Timing:**
- **Joined at Start**: Players who join before any monster is defeated are eligible for loot
- **Joined Mid-Wave**: Players can still join after monsters are defeated, but may not receive loot

**First Join:**
- Automatically joins the wave and processes the character's first turn
- Character is added to the participant list
- Turn order is established

**Subsequent Uses:**
- If already participating, processes the character's turn
- If it's the character's turn, they can attack
- Turn order rotates automatically

## Turn Processing

### Turn Flow
1. Player uses `/wave` command with their character
2. System checks if it's the character's turn (or if they just joined)
3. Dice roll is generated (1-100, with party size and tier penalties)
4. Battle is processed using `processRaidBattle` (same logic as raids)
5. Damage is calculated and applied to both monster and character
6. Turn embed is created showing results
7. If monster is defeated, wave advances to next monster
8. If all monsters defeated, wave completes
9. Turn order advances to next participant

### Turn Embed Information
- **Wave Progress**: Shows "MONSTER WAVE X/Y" indicating current monster
- **Monster Status**: Current hearts, tier, total damage taken
- **Character Status**: Current hearts, damage taken this turn
- **Damage Dealt**: Damage to monster this turn, total damage across all monsters
- **Roll Details**: Original roll, adjusted value, attack/defense bonuses
- **Turn Order**: List of all participants with current turn indicator
- **Wave Progress**: Monsters defeated count, participant count

### Damage Calculation
- Uses the same battle logic as raids (`processRaidBattle`)
- Monster damage shown with blue hearts (💙)
- Player damage shown with red hearts (❤️)
- Flavor text is generated based on damage amount
- Tiers 1-4: Incremental damage with flavor text
- Tiers 5+: Full battle outcomes with dodge/partial/full hit mechanics

## Monster Defeat

### When a Monster is Defeated
1. Current monster's hearts reach 0
2. Monster is marked as defeated with timestamp and defeating player
3. Defeated monster is added to `defeatedMonsters` array
4. Wave advances to next monster (`advanceToNextMonster`)
5. Turn order resets to first participant
6. A follow-up embed is sent showing the defeated monster

### Defeat Embed
- Shows monster name and "Defeated!" message
- Displays monster image as thumbnail
- Includes wave number (e.g., "Monster 1 of 5")
- Shows turn order
- Includes Wave ID and join instructions

## Wave Completion

### Victory Conditions
- All monsters in the wave are defeated
- Wave status changes to `completed`
- Wave result is set to `victory`
- Analytics are updated (duration, success flag)

### Loot Distribution
- **Eligibility**: Only players who defeated at least one monster receive loot
- **Loot Source**: Items come from monsters the player defeated
- **Loot Quality**: Based on total damage dealt by the player
  - 8+ damage: Legendary items (rarity 10)
  - 6-7 damage: Rare items (rarity 8)
  - 4-5 damage: Uncommon items (rarity 6)
  - 2-3 damage: Better common items (rarity 4)
  - <2 damage: Common items (rarity 1-2)
- **Item Selection**: Weighted based on damage, filtered by target rarity
- **Inventory**: Items are added to character's inventory (if linked)

### Victory Embed
- Shows total damage dealt
- Lists all participants with their damage
- Shows loot distribution for each participant
- Includes quality indicators (🔥 high damage, ⚡ medium, ✨ low)

## Wave Failure

### Failure Conditions
- All participants are KO'd (no one can continue)
- Wave status changes to `failed`
- Wave result is set to `defeated`

### Failure Consequences
- All participants are automatically KO'd in the database
- Wave is marked as complete but unsuccessful
- No loot is distributed

## Turn Order

### How It Works
- Participants are added to the turn order when they join
- Turn order rotates sequentially: Player 1 → Player 2 → Player 3 → Player 1...
- KO'd participants are automatically skipped
- When a monster is defeated, turn order resets to the first participant

### Turn Order Display
- Shows numbered list of all participants
- Current turn is indicated (usually by position)
- KO'd participants are marked with 💀
- Turn order is shown in every turn embed

## Technical Details

### Database Schema (WaveModel)
- **waveId**: Unique identifier (W######)
- **village**: Village where wave occurs
- **monsters**: Array of all monsters in the wave
- **currentMonsterIndex**: Index of current monster
- **currentMonster**: Current monster data (name, hearts, tier, etc.)
- **defeatedMonsters**: Array of defeated monsters with timestamps
- **participants**: Array of participating characters
- **currentTurn**: Index of current turn in participants array
- **status**: active/completed/failed
- **analytics**: Total monsters, difficulty group, damage, duration, etc.
- **threadId**: Discord thread ID for wave communication

### Key Functions

#### waveModule.js
- **startWave()**: Creates a new wave with generated monsters
- **joinWave()**: Adds a character to the wave
- **processWaveTurn()**: Processes a single turn in the wave
- **generateWaveMonsters()**: Generates monster list based on difficulty
- **createWaveThread()**: Creates Discord thread for wave

#### wave.js (Command)
- **execute()**: Handles `/wave` command execution
- **createWaveTurnEmbed()**: Creates embed for turn results
- **handleWaveVictory()**: Handles wave completion and loot distribution

### Battle Logic
- Uses `processRaidBattle()` from `raidModule.js`
- Same damage calculation as raids
- Same flavor text system (`flavorTextModule.js`)
- Same tier-based outcome logic
- Supports character buffs, gear, and boosts

### Thread Management
- Thread is created when wave starts
- Thread name format: `🌊 [Village] - Wave of [Count]`
- Thread auto-archives after 60 minutes
- All wave communication happens in the thread
- Victory embed is sent to the thread

## User Experience

### Joining a Wave
1. See wave announcement in village town hall
2. Copy the Wave ID
3. Use `/wave` command with Wave ID and character name
4. First use automatically joins and processes turn
5. Subsequent uses process turns when it's your turn

### During a Wave
- Each turn shows current monster, damage dealt, turn order
- Monster defeat is clearly indicated
- Wave progress is shown (Monster X of Y)
- Can use `/item` to heal between turns
- Must wait for your turn to attack again

### Wave Completion
- Victory embed shows all participants and loot
- Loot is automatically added to inventory
- Wave thread remains for review
- Can see total damage and performance metrics

## Differences from Raids

| Feature | Raids | Waves |
|---------|-------|-------|
| Monsters | Single monster | 5-15 monsters sequentially |
| Duration | Time-limited (usually 30-60 min) | Until all monsters defeated |
| Loot | Single loot drop at end | Multiple monsters = multiple loot sources |
| Progression | Single target | Progressive difficulty through monsters |
| Turn Order | Resets on each turn | Continues through all monsters |
| Failure | Time expires or all KO'd | All participants KO'd |

## Special Features

### Yiga Difficulty
- Exclusive to Yiga clan monsters
- First monster always Footsoldier
- Blademasters always fewer than Footsoldiers
- Special flavor and challenge

### Species Grouping
- Normal difficulties group monsters by species
- Creates thematic waves (e.g., all Lizalfos, then all Bokoblins)
- Adds variety and makes waves feel more structured

### Damage Tracking
- Individual damage per participant tracked across all monsters
- Total wave damage tracked in analytics
- Damage affects loot quality at the end

### Thread Integration
- Wave announcements create threads automatically
- All turn results posted in thread
- Victory embeds sent to thread
- Easy to follow wave progress

## Error Handling

### Common Issues
- **Wave not found**: Invalid Wave ID or wave already completed
- **Wrong village**: Character not in same village as wave
- **Already participating**: User already has character in wave
- **Blight Stage 3+**: Character cannot participate (monsters don't attack)
- **Version conflicts**: Handled with retry logic in database operations

### Retry Logic
- Database operations use optimistic concurrency control
- Version conflicts automatically retry (up to 3 attempts)
- Prevents data loss from concurrent updates
- Ensures accurate turn order and damage tracking

## Future Enhancements

Potential improvements to the wave system:
- Wave difficulty scaling based on participant count
- Special wave types (boss waves, themed waves)
- Wave rewards beyond loot (tokens, achievements)
- Wave leaderboards
- Wave replays/history
- Scheduled wave events

