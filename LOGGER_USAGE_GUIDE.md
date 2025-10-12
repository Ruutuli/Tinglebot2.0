# 📝 Logger Usage Guide

Complete guide for using the centralized logging system in Tinglebot 2.0.

## 📚 Table of Contents
- [Quick Start](#quick-start)
- [Available Categories](#available-categories)
- [Logging Functions](#logging-functions)
- [Specialized Helpers](#specialized-helpers)
- [Examples & Patterns](#examples--patterns)
- [Migration Guide](#migration-guide)
- [Best Practices](#best-practices)

---

## 🚀 Quick Start

### 1. Import the Logger

Add this line at the top of your file with other imports:

```javascript
const logger = require('./utils/logger');        // From utils/
const logger = require('../utils/logger');       // From modules/
const logger = require('../../utils/logger');    // From commands/
```

### 2. Replace console.log with logger

**Before:**
```javascript
console.log('[myFile]: User logged in');
```

**After:**
```javascript
logger.info('SYSTEM', 'User logged in');
```

---

## 🏷️ Available Categories

Choose the category that best fits your log context:

### Core Systems
- **`SYSTEM`** - General system operations, startup, shutdown
- **`DATABASE`** - Database connections, queries, transactions
- **`API`** - External API calls and responses

### Game Features
- **`MINIGAME`** - Minigame sessions (They Came for the Cows, etc.)
- **`QUEST`** - Quest creation, tracking, completion
- **`RAID`** - Raid battles, monster encounters
- **`BLIGHT`** - Blight infection, healing, submissions

### Jobs & Economy
- **`LOOT`** - Looting operations, monster drops
- **`GATHER`** - Gathering resources, foraging
- **`CRAFT`** - Crafting items, recipes
- **`ECONOMY`** - Token transactions, shop purchases

### Character & Progression
- **`CHARACTER`** - Character creation, updates, validation
- **`LEVEL`** - XP gains, level ups
- **`BOOST`** - Boost activation, tracking, expiration

### World & Environment
- **`VILLAGE`** - Village operations, tracking
- **`WEATHER`** - Weather generation, changes
- **`TRAVEL`** - Travel system, movement
- **`BLOODMOON`** - Blood Moon events

### Automation
- **`SCHEDULER`** - Scheduled jobs, cron tasks
- **`CLEANUP`** - Data cleanup, maintenance

### User Interaction
- **`COMMAND`** - Command execution
- **`INTERACTION`** - Discord interactions, autocomplete

### Debugging
- **`DEBUG`** - Debug information (only shows in dev mode)

---

## 📊 Logging Functions

### Basic Logging

#### `logger.info(category, message, data)`
General information logging.

```javascript
logger.info('QUEST', 'Quest created successfully');
logger.info('DATABASE', 'Connected to MongoDB');
```

#### `logger.success(category, message, data)`
Positive outcomes, successful operations.

```javascript
logger.success('RAID', 'Monster defeated');
logger.success('CLEANUP', '50 expired entries removed');
```

#### `logger.warn(category, message, data)`
Warnings, potential issues that aren't errors.

```javascript
logger.warn('BLIGHT', 'Healer no longer eligible');
logger.warn('INTERACTION', 'Autocomplete expired');
```

#### `logger.error(category, message, data)`
Errors and exceptions.

```javascript
logger.error('DATABASE', 'Connection failed');
logger.error('LOOT', 'Failed to update character');
```

#### `logger.debug(category, message, data)`
Detailed debugging info (only shows in development).

```javascript
logger.debug('BOOST', `Checking boost for ${character.name}`);
logger.debug('GATHER', `Found ${items.length} available items`);
```

### Optional Data Parameter

You can pass additional data as a third parameter:

```javascript
logger.info('QUEST', 'Quest completed', { questId: 'Q12345', participants: 3 });
logger.error('DATABASE', 'Query failed', { query: 'findOne', collection: 'users' });
```

---

## ⚡ Specialized Helpers

Pre-built helpers for common logging patterns.

### Minigame Logging

```javascript
// Round start
logger.minigame.round(7);
// Output: 🎮 [GAME] 13:46:37 Round 7 started

// Player roll
logger.minigame.roll(playerName, targetId, rollResult, requiredRoll);
// Output: 🎮 [GAME] 13:46:37 🎯 Twix → 3D | Roll: 4/3 [HIT]
// or:     🎮 [GAME] 13:46:37 💥 Twix → 3D | Roll: 2/3 [MISS]

// Alien spawn
logger.minigame.spawn(count, positions);
// Output: 🎮 [GAME] 13:46:37 Spawned 3 aliens

// Victory
logger.minigame.victory(round, savedAnimals, totalAnimals);
// Output: 🎮 [GAME] 13:46:37 Victory! Round 8 | Saved: 24/25
```

### Leveling Logging

```javascript
logger.leveling.xp(username, xpGained, currentLevel);
// Output: ⭐ [LVL] 13:46:35 egg7129 +25XP (Lv.38)
```

### Loot Logging

```javascript
logger.loot.found(characterName, itemName, quantity);
// Output: 💎 [LOOT] 13:46:40 Comet found Wood x3

logger.loot.encounter(characterName, monsterName, outcome);
// Output: 💎 [LOOT] 13:46:40 Comet vs Bokoblin → victory
```

### Quest Logging

```javascript
logger.quest.posted(count, village);
// Output: 📜 [QUEST] 14:00:00 Posted 5 quests to Rudania

logger.quest.completed(questId, participantCount);
// Output: 📜 [QUEST] 15:30:00 Q708037 completed by 4 players
```

### Scheduler Logging

```javascript
logger.scheduler.job(jobName);
// Output: ⏰ [SCHD] 16:00:00 Running: Weather Update

logger.scheduler.complete(jobName, details);
// Output: ⏰ [SCHD] 16:00:05 Weather Update complete: Posted to 3 villages
```

---

## 🔄 Examples & Patterns

### Common Migration Patterns

#### Pattern 1: Simple Info Log
**Before:**
```javascript
console.log(`[loot.js]: 🚀 Starting loot command for user ${interaction.user.tag}`);
```
**After:**
```javascript
logger.info('LOOT', `Starting for ${interaction.user.tag}`);
```

#### Pattern 2: Error Logging
**Before:**
```javascript
console.error(`[gather.js]: ❌ Failed to update daily roll for ${character.name}:`, error);
```
**After:**
```javascript
logger.error('GATHER', `Failed to update daily roll for ${character.name}`);
```

#### Pattern 3: Success Messages
**Before:**
```javascript
console.log(`[scheduler.js]: ✅ Weather posted to ${postedCount}/${villages.length} villages`);
```
**After:**
```javascript
logger.success('WEATHER', `Posted to ${postedCount}/${villages.length} villages`);
```

#### Pattern 4: Debug Information
**Before:**
```javascript
console.log(`[gather.js]: 🔍 Boost Check - character.boostedBy: "${character.boostedBy}"`);
```
**After:**
```javascript
logger.debug('BOOST', `Checking boost for ${character.name}`);
```

#### Pattern 5: Warnings
**Before:**
```javascript
console.warn(`[autocompleteHandler.js]: ⚠️ Interaction expired or timed out`);
```
**After:**
```javascript
logger.warn('INTERACTION', 'Autocomplete expired/timeout');
```

### Context-Specific Examples

#### Database Operations
```javascript
// Connection
logger.info('DATABASE', 'Connecting to MongoDB...');
logger.success('DATABASE', 'Connected successfully');
logger.error('DATABASE', 'Connection timeout');

// Queries
logger.debug('DATABASE', `Querying: ${collection}.findOne(${JSON.stringify(query)})`);
logger.success('DATABASE', `Found ${results.length} results`);
```

#### Character Operations
```javascript
// Character validation
logger.debug('CHARACTER', `Validating ${characterName} for ${userId}`);
logger.success('CHARACTER', `${characterName} validated successfully`);
logger.warn('CHARACTER', `${characterName} not found for user`);

// Character updates
logger.info('CHARACTER', `Updating ${character.name} stats`);
logger.success('CHARACTER', `${character.name} saved`);
```

#### Quest Operations
```javascript
// Quest creation
logger.info('QUEST', `Creating quest in ${village}`);
logger.success('QUEST', `Quest ${questId} created`);

// Quest tracking
logger.debug('QUEST', `Tracking RP post in ${channelName}`);
logger.info('QUEST', `${participantName} progress: ${rpPostCount}/${requirement}`);
```

#### Boost Operations
```javascript
// Boost checking
logger.debug('BOOST', `Checking boost for ${character.name}`);
logger.info('BOOST', `${character.name} boosted by ${booster.name}`);
logger.debug('BOOST', `Clearing boost for ${character.name}`);
```

---

## 📖 Migration Guide

### Step-by-Step Process

1. **Add Import**
   ```javascript
   const logger = require('../utils/logger');
   ```

2. **Find All Console Statements**
   - Search for `console.log`
   - Search for `console.error`
   - Search for `console.warn`

3. **Replace Each Statement**
   - Identify the appropriate category
   - Choose the right logging level (info/success/warn/error/debug)
   - Simplify the message (remove emoji/brackets)
   - Remove redundant data

4. **Test**
   - Run linter: No errors should appear
   - Test the feature to see logs in action

### Before & After File Example

**Before (commands/jobs/example.js):**
```javascript
const { SlashCommandBuilder } = require('discord.js');
const Character = require('../models/CharacterModel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('example')
    .setDescription('Example command'),
  
  async execute(interaction) {
    console.log(`[example.js]: 🚀 Command started for ${interaction.user.tag}`);
    
    try {
      const character = await Character.findOne({ userId: interaction.user.id });
      
      if (!character) {
        console.error(`[example.js]: ❌ Character not found for ${interaction.user.id}`);
        return await interaction.reply('Character not found!');
      }
      
      console.log(`[example.js]: ✅ Character ${character.name} found`);
      
      // Do something
      character.gold += 100;
      await character.save();
      
      console.log(`[example.js]: ✅ Updated ${character.name} gold`);
      
      await interaction.reply(`Success! ${character.name} gained 100 gold.`);
      
    } catch (error) {
      console.error(`[example.js]: ❌ Error in example command:`, error);
      await interaction.reply('An error occurred!');
    }
  }
};
```

**After (commands/jobs/example.js):**
```javascript
const { SlashCommandBuilder } = require('discord.js');
const Character = require('../models/CharacterModel');
const logger = require('../../utils/logger');  // ← ADDED

module.exports = {
  data: new SlashCommandBuilder()
    .setName('example')
    .setDescription('Example command'),
  
  async execute(interaction) {
    logger.info('COMMAND', `Example started for ${interaction.user.tag}`);  // ← UPDATED
    
    try {
      const character = await Character.findOne({ userId: interaction.user.id });
      
      if (!character) {
        logger.warn('CHARACTER', `Not found for ${interaction.user.id}`);  // ← UPDATED
        return await interaction.reply('Character not found!');
      }
      
      logger.debug('CHARACTER', `${character.name} found`);  // ← UPDATED
      
      // Do something
      character.gold += 100;
      await character.save();
      
      logger.success('ECONOMY', `${character.name} gained 100 gold`);  // ← UPDATED
      
      await interaction.reply(`Success! ${character.name} gained 100 gold.`);
      
    } catch (error) {
      logger.error('COMMAND', 'Error in example command');  // ← UPDATED
      await interaction.reply('An error occurred!');
    }
  }
};
```

---

## ✨ Best Practices

### DO ✅

1. **Use appropriate categories**
   ```javascript
   logger.info('QUEST', 'Quest created');      // ✅ Good
   ```

2. **Keep messages concise**
   ```javascript
   logger.success('RAID', 'Monster defeated');  // ✅ Good
   ```

3. **Include relevant context**
   ```javascript
   logger.error('DATABASE', `Failed to save ${character.name}`);  // ✅ Good
   ```

4. **Use specialized helpers when available**
   ```javascript
   logger.leveling.xp(username, xp, level);  // ✅ Good
   ```

5. **Use debug for verbose info**
   ```javascript
   logger.debug('BOOST', `Detailed boost data: ${JSON.stringify(boostData)}`);  // ✅ Good
   ```

### DON'T ❌

1. **Don't include emoji in messages** (they're auto-added)
   ```javascript
   logger.info('QUEST', '📜 Quest created');  // ❌ Bad
   logger.info('QUEST', 'Quest created');     // ✅ Good
   ```

2. **Don't include file names** (category is enough)
   ```javascript
   logger.info('QUEST', '[quest.js]: Quest created');  // ❌ Bad
   logger.info('QUEST', 'Quest created');              // ✅ Good
   ```

3. **Don't use wrong categories**
   ```javascript
   logger.info('DATABASE', 'Quest created');  // ❌ Bad category
   logger.info('QUEST', 'Quest created');     // ✅ Good
   ```

4. **Don't log sensitive data**
   ```javascript
   logger.info('SYSTEM', `Password: ${password}`);  // ❌ Bad
   logger.debug('SYSTEM', 'User authenticated');    // ✅ Good
   ```

5. **Don't over-log**
   ```javascript
   // Inside a loop processing 1000 items
   items.forEach(item => {
     logger.debug('SYSTEM', `Processing ${item.name}`);  // ❌ Bad (too verbose)
   });
   
   // Better:
   logger.info('SYSTEM', `Processing ${items.length} items`);  // ✅ Good
   ```

---

## 🎨 Log Output Format

All logs follow this format:

```
[emoji] [CATEGORY] [timestamp] message
```

**Examples:**
```
🎮 [GAME] 13:46:37 Round 7 started
⭐ [LVL]  13:46:35 egg7129 +25XP (Lv.38)
💎 [LOOT] 13:46:40 Comet found Wood x3
📜 [QUEST] 14:00:00 Posted 5 quests to Rudania
⚠️  [WARN] 14:05:12 Interaction expired
❌ [ERR]  14:10:30 Database connection failed
✅ [OK]   14:15:00 Cleanup complete
```

Colors are automatically applied based on category!

---

## 🔍 Troubleshooting

### Logger not working?

1. Check import path is correct:
   ```javascript
   const logger = require('../../utils/logger');  // Adjust ../.. based on file location
   ```

2. Make sure utils/logger.js exists

3. Check for typos in category names (use CAPS):
   ```javascript
   logger.info('quest', '...');   // ❌ Wrong (lowercase)
   logger.info('QUEST', '...');   // ✅ Correct (UPPERCASE)
   ```

### Colors not showing?

Colors use ANSI codes and should work in most terminals. If you don't see colors:
- Check your terminal supports ANSI colors
- Colors are built-in, no external packages needed

---

## 📞 Need Help?

If you're unsure which category to use:
1. Look at similar files that have been updated
2. Choose the most specific category that fits
3. When in doubt, use `SYSTEM` for general operations

**Happy Logging! 🎉**

