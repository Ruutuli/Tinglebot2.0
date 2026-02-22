// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { ChannelType } = require('discord.js');
const { handleError } = require('@/utils/globalErrorHandler');
const logger = require('@/utils/logger');
const { generateUniqueId } = require('@/utils/uniqueIdUtils');
const { calculateRaidFinalValue } = require('./rngModule');
const { processRaidBattle } = require('./raidModule');
const { getVillageRegionByName } = require('./locationsModule');
const { capitalizeVillageName } = require('@/utils/stringUtils');
const { monsterMapping } = require('@/models/MonsterModel');
const Wave = require('@/models/WaveModel');
const Monster = require('@/models/MonsterModel');
const { getMonstersByRegion } = require('./rngModule');

// ============================================================================
// ---- Constants ----
// ============================================================================

// Difficulty group definitions
const WAVE_DIFFICULTY_GROUPS = {
  'beginner': {
    name: 'Beginner',
    description: 'Tiers 1-4, perfect for newcomers',
    tierDistribution: {
      1: 0.30,  // 30% tier 1
      2: 0.35,  // 35% tier 2
      3: 0.25,  // 25% tier 3
      4: 0.10   // 10% tier 4
    }
  },
  'beginner+': {
    name: 'Beginner+',
    description: 'Tiers 1-5, beginner with occasional challenge',
    tierDistribution: {
      1: 0.28,  // 28% tier 1
      2: 0.32,  // 32% tier 2
      3: 0.23,  // 23% tier 3
      4: 0.09,  // 9% tier 4
      5: 0.08   // 8% tier 5
    }
  },
  'easy': {
    name: 'Easy',
    description: 'Tiers 2-5, a gentle challenge',
    tierDistribution: {
      2: 0.35,  // 35% tier 2
      3: 0.40,  // 40% tier 3
      4: 0.20,  // 20% tier 4
      5: 0.05   // 5% tier 5
    }
  },
  'easy+': {
    name: 'Easy+',
    description: 'Tiers 2-6, easy with occasional higher tiers',
    tierDistribution: {
      2: 0.32,  // 32% tier 2
      3: 0.36,  // 36% tier 3
      4: 0.18,  // 18% tier 4
      5: 0.10,  // 10% tier 5
      6: 0.04   // 4% tier 6
    }
  },
  'mixed-low': {
    name: 'Mixed (Low)',
    description: 'Tiers 2-7, wide range weighted toward lower tiers',
    tierDistribution: {
      2: 0.30,  // 30% tier 2
      3: 0.25,  // 25% tier 3
      4: 0.20,  // 20% tier 4
      5: 0.12,  // 12% tier 5
      6: 0.08,  // 8% tier 6
      7: 0.05   // 5% tier 7
    }
  },
  'mixed-medium': {
    name: 'Mixed (Medium)',
    description: 'Tiers 2-10, very wide range with heavy lower weighting',
    tierDistribution: {
      2: 0.25,  // 25% tier 2
      3: 0.20,  // 20% tier 3
      4: 0.18,  // 18% tier 4
      5: 0.12,  // 12% tier 5
      6: 0.10,  // 10% tier 6
      7: 0.07,  // 7% tier 7
      8: 0.04,  // 4% tier 8
      9: 0.03,  // 3% tier 9
      10: 0.01  // 1% tier 10
    }
  },
  'intermediate': {
    name: 'Intermediate',
    description: 'Tiers 3-6, moderate difficulty',
    tierDistribution: {
      3: 0.25,  // 25% tier 3
      4: 0.45,  // 45% tier 4
      5: 0.20,  // 20% tier 5
      6: 0.10   // 10% tier 6
    }
  },
  'intermediate+': {
    name: 'Intermediate+',
    description: 'Tiers 3-8, intermediate with occasional high tiers',
    tierDistribution: {
      3: 0.22,  // 22% tier 3
      4: 0.40,  // 40% tier 4
      5: 0.18,  // 18% tier 5
      6: 0.12,  // 12% tier 6
      7: 0.06,  // 6% tier 7
      8: 0.02   // 2% tier 8
    }
  },
  'advanced': {
    name: 'Advanced',
    description: 'Tiers 4-7, challenging waves',
    tierDistribution: {
      4: 0.30,  // 30% tier 4
      5: 0.35,  // 35% tier 5
      6: 0.25,  // 25% tier 6
      7: 0.10   // 10% tier 7
    }
  },
  'advanced+': {
    name: 'Advanced+',
    description: 'Tiers 4-9, advanced with occasional very high tiers',
    tierDistribution: {
      4: 0.27,  // 27% tier 4
      5: 0.32,  // 32% tier 5
      6: 0.22,  // 22% tier 6
      7: 0.12,  // 12% tier 7
      8: 0.05,  // 5% tier 8
      9: 0.02   // 2% tier 9
    }
  },
  'tier5-boss': {
    name: 'Tier 5 Boss Wave',
    description: '1 Tier 5 boss + rest Tier 1-4',
    isBossWave: true,
    bossTier: 5,
    supportTierDistribution: {
      1: 0.30,  // 30% tier 1
      2: 0.35,  // 35% tier 2
      3: 0.25,  // 25% tier 3
      4: 0.10   // 10% tier 4
    }
  },
  'tier6-boss': {
    name: 'Tier 6 Boss Wave',
    description: '1 Tier 6 boss + rest Tier 1-4',
    isBossWave: true,
    bossTier: 6,
    supportTierDistribution: {
      1: 0.30,  // 30% tier 1
      2: 0.35,  // 35% tier 2
      3: 0.25,  // 25% tier 3
      4: 0.10   // 10% tier 4
    }
  },
  'tier7-boss': {
    name: 'Tier 7 Boss Wave',
    description: '1 Tier 7 boss + rest Tier 1-4',
    isBossWave: true,
    bossTier: 7,
    supportTierDistribution: {
      1: 0.30,  // 30% tier 1
      2: 0.35,  // 35% tier 2
      3: 0.25,  // 25% tier 3
      4: 0.10   // 10% tier 4
    }
  },
  'tier8-boss': {
    name: 'Tier 8 Boss Wave',
    description: '1 Tier 8 boss + rest Tier 1-4',
    isBossWave: true,
    bossTier: 8,
    supportTierDistribution: {
      1: 0.30,  // 30% tier 1
      2: 0.35,  // 35% tier 2
      3: 0.25,  // 25% tier 3
      4: 0.10   // 10% tier 4
    }
  },
  'tier9-boss': {
    name: 'Tier 9 Boss Wave',
    description: '1 Tier 9 boss + rest Tier 1-4',
    isBossWave: true,
    bossTier: 9,
    supportTierDistribution: {
      1: 0.30,  // 30% tier 1
      2: 0.35,  // 35% tier 2
      3: 0.25,  // 25% tier 3
      4: 0.10   // 10% tier 4
    }
  },
  'tier10-boss': {
    name: 'Tier 10 Boss Wave',
    description: '1 Tier 10 boss + rest Tier 1-4',
    isBossWave: true,
    bossTier: 10,
    supportTierDistribution: {
      1: 0.30,  // 30% tier 1
      2: 0.35,  // 35% tier 2
      3: 0.25,  // 25% tier 3
      4: 0.10   // 10% tier 4
    }
  },
  'yiga': {
    name: 'Yiga',
    description: 'Yiga clan members only',
    isYigaOnly: true // Special flag for Yiga-only waves
  }
};

const THREAD_AUTO_ARCHIVE_DURATION = 60; // 60 minutes

// ============================================================================
// ---- Thread Creation ----
// ============================================================================

// ---- Function: createWaveThread ----
// Creates a Discord thread for wave communication
async function createWaveThread(message, wave) {
  try {
    const { capitalizeVillageName } = require('@/utils/stringUtils');
    const villageName = capitalizeVillageName(wave.village);
    const threadName = `${villageName} - ${wave.waveId}`;

    console.log(`[waveModule.js]: 🧵 Creating thread for wave ${wave.waveId}`);
    console.log(`[waveModule.js]: 🧵 Message ID: ${message.id}, Message type: ${message.constructor.name}`);
    console.log(`[waveModule.js]: 🧵 Message has startThread method: ${typeof message.startThread === 'function'}`);
    console.log(`[waveModule.js]: 🧵 Channel ID: ${message.channel?.id}, Channel type: ${message.channel?.type}`);
    
    // Ensure message is a proper Message object with startThread method and channel context
    if (!message.startThread || typeof message.startThread !== 'function' || !message.channel) {
      // Try to fetch the message if it doesn't have startThread or channel context
      console.log(`[waveModule.js]: ⚠️ Message object needs to be fetched for proper thread creation...`);
      try {
        const channel = message.channel || (message.guild?.channels?.cache?.get(message.channelId));
        if (channel && channel.messages) {
          // Small delay to ensure Discord has fully processed the message
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const fetchedMessage = await channel.messages.fetch(message.id);
          if (fetchedMessage && fetchedMessage.startThread && fetchedMessage.channel) {
            console.log(`[waveModule.js]: ✅ Successfully fetched message with startThread method and channel context`);
            message = fetchedMessage;
          } else {
            throw new Error('Fetched message still does not have required properties for thread creation');
          }
        } else {
          throw new Error('Cannot fetch message - channel or messages not available');
        }
      } catch (fetchError) {
        console.error(`[waveModule.js]: ❌ Error fetching message: ${fetchError.message}`);
        throw new Error(`Message does not support thread creation: ${fetchError.message}`);
      }
    }

    // Ensure message has channel context before creating thread
    if (!message.channel) {
      throw new Error('Message does not have channel context required for thread creation');
    }

    // Threads are only allowed in guild text or announcement (news) channels
    const channelType = message.channel.type;
    const supportsThreads = channelType === ChannelType.GuildText || channelType === ChannelType.GuildAnnouncement;
    if (!supportsThreads) {
      console.log(`[waveModule.js]: ⚠️ Skipping thread creation - channel type ${channelType} does not support threads (need GuildText or GuildAnnouncement)`);
      return null;
    }

    // Create the thread from the message
    // Note: The original message (with embed) automatically becomes the first message in the thread
    // Adding a small delay to ensure Discord has fully processed the message before thread creation
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log(`[waveModule.js]: 🧵 Starting thread creation with name: "${threadName}"`);
    const thread = await message.startThread({
      name: threadName,
      autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
      reason: `Wave initiated with ${wave.analytics.totalMonsters} monsters`
    });
    console.log(`[waveModule.js]: ✅ Thread created successfully: ${thread.id} (${thread.name})`);

    // Send an additional informational message to the thread (the original message with embed is already there)
    const difficultyGroup = WAVE_DIFFICULTY_GROUPS[wave.analytics.difficultyGroup];
    const difficultyName = difficultyGroup ? difficultyGroup.name : wave.analytics.difficultyGroup;
    
    const threadMessage = [
      `🌊 A wave of **${wave.analytics.totalMonsters} monsters** approaches ${villageName}!`,
      `\n⭐ **Difficulty:** ${difficultyName}`,
      `\nUse </wave:${require('../embeds/embeds.js').getWaveCommandId()}> to join the fight!`,
      `\n\n**Wave ID:** \`\`\`${wave.waveId}\`\`\``,
      `\n\n🌊 **Fight through all ${wave.analytics.totalMonsters} monsters to claim victory!**`
    ].join('');

    await thread.send(threadMessage);

    // Update wave with thread information
    wave.threadId = thread.id;
    wave.messageId = message.id;
    await wave.save();

    console.log(`[waveModule.js]: 💬 Created wave thread: ${thread.name} (${thread.id})`);
    
    return thread;
  } catch (error) {
    console.error(`[waveModule.js]: ❌ Error creating wave thread: ${error.message}`);
    handleError(error, 'waveModule.js', {
      functionName: 'createWaveThread',
      waveId: wave?.waveId
    });
    return null;
  }
}

// ============================================================================
// ---- Monster Generation Functions ----
// ============================================================================

// ---- Function: generateWaveMonsters ----
// Generates a list of monsters for a wave with grouping logic
async function generateWaveMonsters(village, monsterCount, difficultyGroup, region) {
  try {
    // Get difficulty group config
    const difficulty = WAVE_DIFFICULTY_GROUPS[difficultyGroup];
    if (!difficulty) {
      throw new Error(`Invalid difficulty group: ${difficultyGroup}`);
    }

    // Fetch all monsters from the region (region name must be lowercase for database query)
    const normalizedRegion = region.toLowerCase();
    const allMonsters = await getMonstersByRegion(normalizedRegion);
    if (!allMonsters || allMonsters.length === 0) {
      throw new Error(`No monsters found for region: ${region}`);
    }

    // Special handling for Boss waves - 1 high tier boss (Tier 5+) + rest tier 1-4
    if (difficulty.isBossWave) {
      const bossTier = difficulty.bossTier;
      const supportTierDistribution = difficulty.supportTierDistribution;
      
      // Find boss monster (tier 5-10, raid monsters) - exclude Yiga (Yiga Blademaster is Tier 6)
      const bossMonsters = allMonsters.filter(monster => 
        monster.tier === bossTier && 
        (!monster.species || monster.species.toLowerCase() !== 'yiga') &&
        monster.name !== 'Yiga Blademaster' &&
        monster.name !== 'Yiga Footsoldier'
      );
      if (bossMonsters.length === 0) {
        throw new Error(`No Tier ${bossTier} monsters found in region ${region}`);
      }
      
      // Select random boss monster
      const bossMonster = bossMonsters[Math.floor(Math.random() * bossMonsters.length)];
      
      // Find support monsters (tier 1-4) - exclude Yiga (Yiga Footsoldier is Tier 3)
      const supportTiers = Object.keys(supportTierDistribution).map(Number);
      const supportMonsters = allMonsters.filter(monster => 
        supportTiers.includes(monster.tier) &&
        (!monster.species || monster.species.toLowerCase() !== 'yiga') &&
        monster.name !== 'Yiga Blademaster' &&
        monster.name !== 'Yiga Footsoldier'
      );
      
      if (supportMonsters.length === 0) {
        throw new Error(`No Tier 1-4 monsters found in region ${region} for boss wave support`);
      }
      
      // Generate support monsters (monsterCount - 1, since 1 is the boss)
      const supportCount = monsterCount - 1;
      const selectedMonsters = [];
      
      // Generate support monsters using tier distribution
      for (let i = 0; i < supportCount; i++) {
        const supportMonster = selectMonsterByTierDistribution(supportMonsters, supportTierDistribution);
        if (supportMonster) {
          selectedMonsters.push({
            name: supportMonster.name,
            nameMapping: supportMonster.nameMapping,
            image: supportMonster.image || 'No Image',
            tier: supportMonster.tier,
            hearts: supportMonster.hearts,
            maxHearts: supportMonster.hearts
          });
        }
      }
      
      // Add boss monster at random position (or at the end)
      const bossPosition = Math.floor(Math.random() * (selectedMonsters.length + 1));
      selectedMonsters.splice(bossPosition, 0, {
        name: bossMonster.name,
        nameMapping: bossMonster.nameMapping,
        image: bossMonster.image || 'No Image',
        tier: bossMonster.tier,
        hearts: bossMonster.hearts,
        maxHearts: bossMonster.hearts
      });
      
      console.log(`[waveModule.js]: 👹 Boss wave generated - 1 Tier ${bossTier} boss + ${supportCount} support monsters (Tier 1-4)`);
      return selectedMonsters;
    }

    // Special handling for Yiga difficulty - filter by species
    let filteredMonsters;
    if (difficulty.isYigaOnly) {
      // Filter to only Yiga monsters
      filteredMonsters = allMonsters.filter(monster => 
        monster.species && monster.species.toLowerCase() === 'yiga'
      );
      
      if (filteredMonsters.length === 0) {
        throw new Error(`No Yiga monsters found in region ${region}`);
      }
    } else {
      // Check if this difficulty includes Tier 5+ monsters (raid monsters)
      const availableTiers = Object.keys(difficulty.tierDistribution).map(Number).sort((a, b) => b - a);
      const highTiers = availableTiers.filter(tier => tier >= 5);
      
      // If difficulty includes Tier 5+, use boss wave logic: 1 high tier + rest Tier 1-4
      if (highTiers.length > 0) {
        const highestTier = highTiers[0]; // Get the highest tier (5+)
        
        // Find boss monster (highest tier available) - exclude Yiga
        const bossMonsters = allMonsters.filter(monster => 
          monster.tier === highestTier &&
          (!monster.species || monster.species.toLowerCase() !== 'yiga') &&
          monster.name !== 'Yiga Blademaster' &&
          monster.name !== 'Yiga Footsoldier'
        );
        if (bossMonsters.length === 0) {
          // Fallback: try to find any Tier 5+ monster (excluding Yiga)
          const fallbackTier = highTiers.find(tier => {
            return allMonsters.some(m => 
              m.tier === tier && 
              (!m.species || m.species.toLowerCase() !== 'yiga') &&
              m.name !== 'Yiga Blademaster' &&
              m.name !== 'Yiga Footsoldier'
            );
          });
          if (!fallbackTier) {
            throw new Error(`No Tier ${highestTier} or higher monsters found in region ${region}`);
          }
          const fallbackBossMonsters = allMonsters.filter(monster => 
            monster.tier === fallbackTier &&
            (!monster.species || monster.species.toLowerCase() !== 'yiga') &&
            monster.name !== 'Yiga Blademaster' &&
            monster.name !== 'Yiga Footsoldier'
          );
          if (fallbackBossMonsters.length === 0) {
            throw new Error(`No Tier 5+ monsters found in region ${region}`);
          }
          const bossMonster = fallbackBossMonsters[Math.floor(Math.random() * fallbackBossMonsters.length)];
          
          // Support monsters from Tier 1-4 - exclude Yiga
          const supportTiers = [1, 2, 3, 4];
          const supportMonsters = allMonsters.filter(monster => 
            supportTiers.includes(monster.tier) &&
            (!monster.species || monster.species.toLowerCase() !== 'yiga') &&
            monster.name !== 'Yiga Blademaster' &&
            monster.name !== 'Yiga Footsoldier'
          );
          
          if (supportMonsters.length === 0) {
            throw new Error(`No Tier 1-4 monsters found in region ${region} for support`);
          }
          
          // Generate support monsters (monsterCount - 1)
          const supportCount = monsterCount - 1;
          const selectedMonsters = [];
          
          // Use tier distribution for support (only Tier 1-4)
          const supportTierDistribution = {};
          let totalSupportWeight = 0;
          for (const tier of supportTiers) {
            if (difficulty.tierDistribution[tier]) {
              supportTierDistribution[tier] = difficulty.tierDistribution[tier];
              totalSupportWeight += difficulty.tierDistribution[tier];
            }
          }
          
          // Normalize weights if needed
          if (totalSupportWeight > 0) {
            for (const tier in supportTierDistribution) {
              supportTierDistribution[tier] = supportTierDistribution[tier] / totalSupportWeight;
            }
          } else {
            // Default distribution if no Tier 1-4 in original
            supportTierDistribution[1] = 0.30;
            supportTierDistribution[2] = 0.35;
            supportTierDistribution[3] = 0.25;
            supportTierDistribution[4] = 0.10;
          }
          
          for (let i = 0; i < supportCount; i++) {
            const supportMonster = selectMonsterByTierDistribution(supportMonsters, supportTierDistribution);
            if (supportMonster) {
              selectedMonsters.push({
                name: supportMonster.name,
                nameMapping: supportMonster.nameMapping,
                image: supportMonster.image || 'No Image',
                tier: supportMonster.tier,
                hearts: supportMonster.hearts,
                maxHearts: supportMonster.hearts
              });
            }
          }
          
          // Add boss monster at random position
          const bossPosition = Math.floor(Math.random() * (selectedMonsters.length + 1));
          selectedMonsters.splice(bossPosition, 0, {
            name: bossMonster.name,
            nameMapping: bossMonster.nameMapping,
            image: bossMonster.image || 'No Image',
            tier: bossMonster.tier,
            hearts: bossMonster.hearts,
            maxHearts: bossMonster.hearts
          });
          
          console.log(`[waveModule.js]: 👹 Regular difficulty with Tier 5+ - 1 Tier ${bossMonster.tier} boss + ${supportCount} support monsters (Tier 1-4)`);
          return selectedMonsters;
        }
        
        // Select random boss monster
        const bossMonster = bossMonsters[Math.floor(Math.random() * bossMonsters.length)];
        
        // Support monsters from Tier 1-4 - exclude Yiga
        const supportTiers = [1, 2, 3, 4];
        const supportMonsters = allMonsters.filter(monster => 
          supportTiers.includes(monster.tier) &&
          (!monster.species || monster.species.toLowerCase() !== 'yiga') &&
          monster.name !== 'Yiga Blademaster' &&
          monster.name !== 'Yiga Footsoldier'
        );
        
        if (supportMonsters.length === 0) {
          throw new Error(`No Tier 1-4 monsters found in region ${region} for support`);
        }
        
        // Generate support monsters (monsterCount - 1)
        const supportCount = monsterCount - 1;
        const selectedMonsters = [];
        
        // Use tier distribution for support (only Tier 1-4)
        const supportTierDistribution = {};
        let totalSupportWeight = 0;
        for (const tier of supportTiers) {
          if (difficulty.tierDistribution[tier]) {
            supportTierDistribution[tier] = difficulty.tierDistribution[tier];
            totalSupportWeight += difficulty.tierDistribution[tier];
          }
        }
        
        // Normalize weights if needed
        if (totalSupportWeight > 0) {
          for (const tier in supportTierDistribution) {
            supportTierDistribution[tier] = supportTierDistribution[tier] / totalSupportWeight;
          }
        } else {
          // Default distribution if no Tier 1-4 in original
          supportTierDistribution[1] = 0.30;
          supportTierDistribution[2] = 0.35;
          supportTierDistribution[3] = 0.25;
          supportTierDistribution[4] = 0.10;
        }
        
        for (let i = 0; i < supportCount; i++) {
          const supportMonster = selectMonsterByTierDistribution(supportMonsters, supportTierDistribution);
          if (supportMonster) {
            selectedMonsters.push({
              name: supportMonster.name,
              nameMapping: supportMonster.nameMapping,
              image: supportMonster.image || 'No Image',
              tier: supportMonster.tier,
              hearts: supportMonster.hearts,
              maxHearts: supportMonster.hearts
            });
          }
        }
        
        // Add boss monster at random position
        const bossPosition = Math.floor(Math.random() * (selectedMonsters.length + 1));
        selectedMonsters.splice(bossPosition, 0, {
          name: bossMonster.name,
          nameMapping: bossMonster.nameMapping,
          image: bossMonster.image || 'No Image',
          tier: bossMonster.tier,
          hearts: bossMonster.hearts,
          maxHearts: bossMonster.hearts
        });
        
        console.log(`[waveModule.js]: 👹 Regular difficulty with Tier 5+ - 1 Tier ${bossMonster.tier} boss + ${supportCount} support monsters (Tier 1-4)`);
        return selectedMonsters;
      }
      
      // Normal difficulty logic - no Tier 5+ monsters, exclude Yiga (Yiga Footsoldier is Tier 3)
      filteredMonsters = allMonsters.filter(monster => 
        availableTiers.includes(monster.tier) &&
        (!monster.species || monster.species.toLowerCase() !== 'yiga') &&
        monster.name !== 'Yiga Blademaster' &&
        monster.name !== 'Yiga Footsoldier'
      );

      if (filteredMonsters.length === 0) {
        throw new Error(`No monsters found matching difficulty group ${difficultyGroup} tiers in region ${region}`);
      }
    }

    // Group monsters by species for grouping logic
    const monstersBySpecies = {};
    filteredMonsters.forEach(monster => {
      const species = monster.species || 'Unknown';
      if (!monstersBySpecies[species]) {
        monstersBySpecies[species] = [];
      }
      monstersBySpecies[species].push(monster);
    });

    // Generate monster list with grouping
    const selectedMonsters = [];
    let currentSpeciesGroup = null;
    let speciesGroupCount = 0;
    const maxSameSpeciesInRow = 3; // Maximum consecutive monsters of same species
    const minSpeciesGroupSize = 2; // Minimum group size
    const maxSpeciesGroupSize = 3; // Maximum group size

    // Special tracking for Yiga difficulty
    let footsoldierCount = 0;
    let blademasterCount = 0;
    let blademasterAdded = false; // Track if we've added the one Blademaster

    for (let i = 0; i < monsterCount; i++) {
      let selectedMonster = null;

      // Special handling for Yiga difficulty - exactly 1 Blademaster, rest Footsoldiers
      if (difficulty.isYigaOnly) {
        // Determine if this position should be the Blademaster
        // Randomly pick one position (not first if more than 1 monster) for the Blademaster
        let shouldAddBlademaster = false;
        
        if (!blademasterAdded && monsterCount > 1) {
          // If we're at the last position and haven't added Blademaster, add it now
          if (i === monsterCount - 1) {
            shouldAddBlademaster = true;
          } else if (i > 0) {
            // Random chance for positions after the first (higher chance as we get closer to the end)
            const remainingPositions = monsterCount - i;
            const chance = 1.0 / remainingPositions; // Higher chance as fewer positions remain
            shouldAddBlademaster = Math.random() < chance;
          }
        } else if (!blademasterAdded && monsterCount === 1) {
          // Only 1 monster - must be Footsoldier (can't have just a Blademaster)
          shouldAddBlademaster = false;
        }
        
        if (shouldAddBlademaster && !blademasterAdded) {
          // Add the one Blademaster
          const blademaster = filteredMonsters.find(m => m.name === 'Yiga Blademaster');
          if (blademaster) {
            selectedMonster = blademaster;
            blademasterCount++;
            blademasterAdded = true;
          } else {
            // Fallback to Footsoldier if Blademaster not found
            const footsoldier = filteredMonsters.find(m => m.name === 'Yiga Footsoldier');
            if (footsoldier) {
              selectedMonster = footsoldier;
              footsoldierCount++;
            } else {
              // Last resort - random monster
              selectedMonster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
              if (selectedMonster.name === 'Yiga Footsoldier') {
                footsoldierCount++;
              } else {
                blademasterCount++;
                blademasterAdded = true;
              }
            }
          }
        } else {
          // Add Footsoldier
          const footsoldier = filteredMonsters.find(m => m.name === 'Yiga Footsoldier');
          if (footsoldier) {
            selectedMonster = footsoldier;
            footsoldierCount++;
          } else {
            // Fallback - only use Blademaster if we haven't added one yet
            if (!blademasterAdded) {
              const blademaster = filteredMonsters.find(m => m.name === 'Yiga Blademaster');
              if (blademaster) {
                selectedMonster = blademaster;
                blademasterCount++;
                blademasterAdded = true;
              } else {
                // Last resort - random monster
                selectedMonster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
                if (selectedMonster.name === 'Yiga Blademaster') {
                  blademasterCount++;
                  blademasterAdded = true;
                } else {
                  footsoldierCount++;
                }
              }
            } else {
              // Already have Blademaster, must use Footsoldier
              selectedMonster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
              if (selectedMonster.name === 'Yiga Footsoldier') {
                footsoldierCount++;
              } else {
                // This shouldn't happen if we have both types, but handle it
                footsoldierCount++;
              }
            }
          }
        }
      } else {
        // Normal difficulty logic
        // Decide if we should continue with current species group or start new one
        const shouldContinueGroup = currentSpeciesGroup && 
                                     speciesGroupCount < maxSpeciesGroupSize &&
                                     speciesGroupCount >= minSpeciesGroupSize &&
                                     Math.random() > 0.4; // 60% chance to continue group if conditions met

        if (shouldContinueGroup && monstersBySpecies[currentSpeciesGroup]?.length > 0) {
          // Continue with current species group
          const speciesMonsters = monstersBySpecies[currentSpeciesGroup];
          // Select based on tier distribution
          selectedMonster = selectMonsterByTierDistribution(speciesMonsters, difficulty.tierDistribution);
          if (selectedMonster) {
            speciesGroupCount++;
          }
        }

        // If we didn't select from current group, start/switch to a new species
        if (!selectedMonster) {
          // Reset group tracking
          currentSpeciesGroup = null;
          speciesGroupCount = 0;

          // Select a random species (weighted by available monsters)
          const speciesList = Object.keys(monstersBySpecies).filter(species => 
            monstersBySpecies[species].length > 0
          );

          if (speciesList.length === 0) {
            // Fallback: select from all filtered monsters
            selectedMonster = selectMonsterByTierDistribution(filteredMonsters, difficulty.tierDistribution);
          } else {
            // Randomly select a species
            const selectedSpecies = speciesList[Math.floor(Math.random() * speciesList.length)];
            currentSpeciesGroup = selectedSpecies;
            
            // Select monster from this species based on tier distribution
            const speciesMonsters = monstersBySpecies[selectedSpecies];
            selectedMonster = selectMonsterByTierDistribution(speciesMonsters, difficulty.tierDistribution);
            speciesGroupCount = 1;
          }
        }
      }

      // Fallback if still no monster selected
      if (!selectedMonster) {
        selectedMonster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
      }

      // Add monster to selected list
      selectedMonsters.push({
        name: selectedMonster.name,
        nameMapping: selectedMonster.nameMapping,
        image: selectedMonster.image || 'No Image',
        tier: selectedMonster.tier,
        hearts: selectedMonster.hearts,
        maxHearts: selectedMonster.hearts
      });
    }

    return selectedMonsters;

  } catch (error) {
    handleError(error, 'waveModule.js', {
      functionName: 'generateWaveMonsters',
      village: village,
      monsterCount: monsterCount,
      difficultyGroup: difficultyGroup
    });
    console.error(`[waveModule.js]: ❌ Error generating wave monsters:`, error);
    throw error;
  }
}

// ---- Function: selectMonsterByTierDistribution ----
// Helper function to select a monster based on tier distribution probabilities
function selectMonsterByTierDistribution(monsters, tierDistribution) {
  if (!monsters || monsters.length === 0) return null;

  // Calculate cumulative probabilities
  const cumulative = [];
  let cumulativeProb = 0;
  const tiers = Object.keys(tierDistribution).map(Number).sort((a, b) => a - b);
  
  tiers.forEach(tier => {
    cumulativeProb += tierDistribution[tier];
    cumulative.push({ tier, cumulativeProb });
  });

  // Roll for tier
  const roll = Math.random();
  let selectedTier = tiers[0]; // Default to first tier
  
  for (const cum of cumulative) {
    if (roll <= cum.cumulativeProb) {
      selectedTier = cum.tier;
      break;
    }
  }

  // Filter monsters by selected tier
  const tierMonsters = monsters.filter(m => m.tier === selectedTier);
  
  if (tierMonsters.length === 0) {
    // Fallback: return random monster from available
    return monsters[Math.floor(Math.random() * monsters.length)];
  }

  // Return random monster from selected tier
  return tierMonsters[Math.floor(Math.random() * tierMonsters.length)];
}

// ============================================================================
// ---- Wave Functions ----
// ============================================================================

// ---- Function: startWave ----
// Creates a new wave instance with the given parameters
async function startWave(village, monsterCount, difficultyGroup, interaction = null) {
  try {
    // Generate unique wave ID with 'W' prefix for Wave
    const waveId = generateUniqueId('W');
    
    // Get village region
    const region = getVillageRegionByName(village);
    if (!region) {
      throw new Error(`Invalid village: ${village}`);
    }

    // Generate monster list
    const monsters = await generateWaveMonsters(village, monsterCount, difficultyGroup, region);
    
    if (!monsters || monsters.length === 0) {
      throw new Error('Failed to generate monsters for wave');
    }

    // Initialize current monster (first in the list)
    const currentMonster = {
      name: monsters[0].name,
      nameMapping: monsters[0].nameMapping,
      image: monsters[0].image,
      tier: monsters[0].tier,
      currentHearts: monsters[0].hearts,
      maxHearts: monsters[0].maxHearts
    };
    
    // Create wave document
    const wave = new Wave({
      waveId: waveId,
      village: village,
      channelId: interaction?.channel?.id || null,
      monsters: monsters,
      currentMonsterIndex: 0,
      defeatedMonsters: [],
      currentMonster: currentMonster,
      participants: [],
      currentTurn: 0,
      status: 'active',
      startTime: new Date(),
      analytics: {
        totalMonsters: monsterCount,
        difficultyGroup: difficultyGroup,
        totalDamage: 0,
        participantCount: 0,
        success: false
      }
    });

    // Save wave to database
    await wave.save();

    console.log(`[waveModule.js]: 🌊 Started new wave ${waveId} - ${monsterCount} monsters (${difficultyGroup}) in ${village}`);

    return {
      waveId,
      waveData: wave,
      thread: null // Thread will be created in triggerWave function
    };
  } catch (error) {
    handleError(error, 'waveModule.js', {
      functionName: 'startWave',
      village: village,
      monsterCount: monsterCount,
      difficultyGroup: difficultyGroup
    });
    console.error(`[waveModule.js]: ❌ Error starting wave:`, error);
    throw error;
  }
}

// ---- Function: joinWave ----
// Allows a character to join an active wave after validation checks
async function joinWave(character, waveId) {
  try {
    // Retrieve wave from database
    const wave = await Wave.findOne({ waveId: waveId });
    if (!wave) {
      const allWaves = await Wave.find({ status: 'active' }).select('waveId village currentMonster.name createdAt').limit(10);
      const activeWaveIds = allWaves.map(w => w.waveId).join(', ');
      
      throw new Error(`Wave not found. Wave ID: "${waveId}". Available active waves: ${activeWaveIds || 'None'}`);
    }

    // Check if wave is active
    if (wave.status !== 'active') {
      throw new Error('Wave is not active');
    }

    // Check if character is in the same village
    if (character.currentVillage.toLowerCase() !== wave.village.toLowerCase()) {
      throw new Error('Character must be in the same village as the wave');
    }

    // Check if character has blight stage 3 or higher (monsters don't attack them)
    if (character.blighted && character.blightStage >= 3) {
      throw new Error(`Character ${character.name} cannot participate in waves at Blight Stage ${character.blightStage} - monsters no longer attack them`);
    }

    // Determine if joined at start (before first monster is defeated)
    const joinedAtStart = (!wave.defeatedMonsters || wave.defeatedMonsters.length === 0) && wave.currentMonsterIndex === 0;

    // Create participant data (isModCharacter: mod characters don't participate in turn order, can roll anytime)
    const participant = {
      userId: character.userId,
      characterId: character._id,
      name: character.name,
      damage: 0,
      joinedAtStart: joinedAtStart,
      joinedAt: new Date(),
      isModCharacter: !!character.isModCharacter,
      characterState: {
        currentHearts: character.currentHearts,
        maxHearts: character.maxHearts,
        currentStamina: character.currentStamina,
        maxStamina: character.maxStamina,
        attack: character.attack,
        defense: character.defense,
        gearArmor: character.gearArmor,
        gearWeapon: character.gearWeapon,
        gearShield: character.gearShield,
        ko: character.ko
      }
    };

    // Add participant to wave using the model method
    try {
      await wave.addParticipant(participant);
    } catch (error) {
      if (error.message === 'User already has a character in this wave') {
        throw new Error('You already have a character participating in this wave');
      }
      throw error;
    }

    console.log(`[waveModule.js]: 👤 ${character.name} joined wave ${waveId} (joinedAtStart: ${joinedAtStart})`);
    
    return {
      waveId,
      waveData: wave,
      participant
    };
  } catch (error) {
    handleError(error, 'waveModule.js', {
      functionName: 'joinWave',
      characterName: character?.name,
      waveId: waveId,
      userId: character?.userId,
      characterId: character?._id,
      currentVillage: character?.currentVillage
    });
    console.error(`[waveModule.js]: ❌ Error joining wave ${waveId} for ${character?.name || 'unknown'} (${character?.userId || 'unknown user'}):`, error);
    
    // Enhance error message with context
    if (error.message && !error.message.includes('Wave ID')) {
      const enhancedError = new Error(`${error.message} (Wave ID: ${waveId}, Character: ${character?.name || 'unknown'}, Village: ${character?.currentVillage || 'unknown'})`);
      enhancedError.stack = error.stack;
      throw enhancedError;
    }
    throw error;
  }
}

// ---- Function: checkAllParticipantsKO ----
// Checks if all participants in a wave are KO'd
async function checkAllParticipantsKO(wave) {
  try {
    // Expedition waves: use party hearts only — "all KO" when party pool is 0
    if (wave.expeditionId) {
      const Party = require('@/models/PartyModel');
      const party = await Party.findActiveByPartyId(wave.expeditionId);
      if (party) {
        return (party.totalHearts ?? 0) <= 0;
      }
      return false;
    }

    // Ensure participants array exists
    if (!wave.participants || wave.participants.length === 0) {
      return false; // No participants, so not all KO'd
    }

    // Get current character states from database to check KO status
    const Character = require('@/models/CharacterModel');
    
    // Check all participants
    for (const participant of wave.participants) {
      try {
        const character = await Character.findById(participant.characterId);
        if (character && !character.ko) {
          // Found at least one non-KO'd participant
          return false;
        }
      } catch (error) {
        console.error(`[waveModule.js]: ❌ Error checking KO status for ${participant.name}:`, error);
        // If we can't check the character, assume they're KO'd to be safe
      }
    }
    
    // All participants are KO'd (or errors occurred for all)
    return true;
  } catch (error) {
    console.error(`[waveModule.js]: ❌ Error in checkAllParticipantsKO:`, error);
    // On error, return false to avoid incorrectly failing waves
    return false;
  }
}

// ---- Function: processWaveTurn ----
// Processes a single turn in a wave for a character
async function processWaveTurn(character, waveId, interaction, waveData = null) {
  try {
    // Use provided waveData or fetch from database
    let wave = waveData;
    if (!wave) {
      wave = await Wave.findOne({ waveId: waveId });
    }
    if (!wave) {
      const allWaves = await Wave.find({ status: 'active' }).select('waveId village currentMonster.name createdAt').limit(10);
      const activeWaveIds = allWaves.map(w => w.waveId).join(', ');
      
      throw new Error(`Wave not found. Wave ID: "${waveId}". Available active waves: ${activeWaveIds || 'None'}`);
    }

    // Check if wave is active
    if (wave.status !== 'active') {
      throw new Error('Wave is not active');
    }

    // Validate currentMonster exists and has required properties
    if (!wave.currentMonster) {
      throw new Error(`Wave ${waveId} has no current monster. The wave may be in an invalid state.`);
    }
    if (!wave.currentMonster.name || !wave.currentMonster.tier || typeof wave.currentMonster.currentHearts !== 'number' || typeof wave.currentMonster.maxHearts !== 'number') {
      throw new Error(`Wave ${waveId} has an invalid current monster. Missing required properties (name, tier, currentHearts, or maxHearts).`);
    }

    // Validate participants array is not empty
    const participants = wave.participants || [];
    if (participants.length === 0) {
      // No participants - fail the wave
      if (wave.status === 'active') {
        await wave.failWave();
      }
      throw new Error(`Wave ${waveId} has no participants. The wave has been failed.`);
    }

    // Check if there are any valid (non-KO'd) participants before processing turn
    const Character = require('@/models/CharacterModel');
    let hasValidParticipant = false;
    for (const p of participants) {
      try {
        const char = await Character.findById(p.characterId);
        if (char && !char.ko) {
          hasValidParticipant = true;
          break;
        }
      } catch (error) {
        // Error checking character - assume invalid
        console.warn(`[waveModule.js]: ⚠️ Error checking participant ${p.name}:`, error);
      }
    }
    
    if (!hasValidParticipant) {
      // All participants are KO'd - fail the wave
      console.log(`[waveModule.js]: 💀 No valid participants found in wave ${waveId}, failing wave`);
      if (wave.status === 'active') {
        await wave.failWave();
        // Reload wave after failWave
        const failedWave = await Wave.findOne({ waveId: waveId });
        if (failedWave) {
          wave = failedWave;
        }
      }
      throw new Error(`Wave ${waveId} has no valid (non-KO'd) participants. The wave has been failed.`);
    }

    // Find participant
    const participant = participants.find(p => p.characterId.toString() === character._id.toString());
    if (!participant) {
      throw new Error('Character is not in this wave');
    }

    // Validate character still exists and refresh current gear stats (attack/defense) so waves use same gear logic as raids
    const { fetchCharacterById, fetchModCharacterById } = require('@/database/db');
    const characterExists = character.isModCharacter
      ? await fetchModCharacterById(character._id)
      : await fetchCharacterById(character._id);
    if (!characterExists) {
      // Character was deleted, remove from wave and fail gracefully
      console.warn(`[waveModule.js]: ⚠️ Character ${character.name} (${character._id}) no longer exists, removing from wave ${waveId}`);
      
      // Remove participant from wave
      wave.participants = wave.participants.filter(p => p.characterId.toString() !== character._id.toString());
      wave.analytics.participantCount = wave.participants.length;
      await wave.save();
      
      // Check if wave should fail due to no participants
      if (wave.participants.length === 0) {
        await wave.failWave();
        throw new Error(`Character ${character.name} was deleted and was the last participant. Wave ${waveId} has been failed.`);
      }
      
      // Check if any valid participants remain after removal
      let hasRemainingValidParticipant = false;
      for (const p of wave.participants) {
        try {
          const char = await Character.findById(p.characterId);
          if (char && !char.ko) {
            hasRemainingValidParticipant = true;
            break;
          }
        } catch (error) {
          // Error checking - skip
        }
      }
      
      if (!hasRemainingValidParticipant) {
        await wave.failWave();
        throw new Error(`Character ${character.name} was deleted. No valid participants remain. Wave ${waveId} has been failed.`);
      }
      
      throw new Error(`Character ${character.name} was deleted and has been removed from the wave.`);
    }

    // Use current gear stats for this turn (same as raids: weapon/armor/shield affect roll and damage)
    const freshChar = characterExists.toObject ? characterExists.toObject() : characterExists;
    character.attack = Math.max(0, Number(freshChar.attack) || 0);
    character.defense = Math.max(0, Number(freshChar.defense) || 0);

    // Generate random roll and apply penalty (similar to raids)
    let diceRoll = Math.floor(Math.random() * 100) + 1;
    const partySize = participants.length;
    const partyPenalty = Math.max(0, (partySize - 1) * 1);
    const tierPenalty = Math.max(0, ((wave.currentMonster?.tier || 5) - 5) * 0.5);
    const totalPenalty = Math.min(15, partyPenalty + tierPenalty);
    diceRoll = Math.max(1, Math.floor(diceRoll - totalPenalty));
    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateRaidFinalValue(character, diceRoll);

    // Expedition (monster camp) waves: use party hearts only — never read or write individual character hearts.
    // We pass a temp character with currentHearts = party.totalHearts and skipPersist so no DB writes.
    const { EXPLORATION_TESTING_MODE } = require('@/utils/explorationTestingConfig');
    const skipPersist = !!(wave.expeditionId && EXPLORATION_TESTING_MODE);
    let characterHeartsBefore = character.currentHearts;
    let battleCharacter = character;

    if (wave.expeditionId) {
      const Party = require('@/models/PartyModel');
      const party = await Party.findActiveByPartyId(wave.expeditionId);
      if (party) {
        characterHeartsBefore = Math.max(0, party.totalHearts ?? 0);
        const plainChar = character.toObject ? character.toObject() : { ...character };
        battleCharacter = { ...plainChar, currentHearts: characterHeartsBefore, maxHearts: characterHeartsBefore };
      }
    }

    // Process the battle turn (expedition: damage applied to party pool only, never to character DB)
    const battleResult = await processRaidBattle(
      battleCharacter,
      wave.currentMonster,
      diceRoll,
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess,
      characterHeartsBefore,
      { skipPersist: skipPersist || !!wave.expeditionId }
    );

    if (!battleResult) {
      throw new Error('Failed to process wave battle turn');
    }

    // Update participant's damage using the model method
    await wave.updateParticipantDamage(character._id, battleResult.hearts);
    
    // Reload wave to ensure we have the latest state (updateParticipantDamage may have reloaded due to version conflicts)
    const freshWave = await Wave.findOne({ waveId: waveId });
    if (freshWave) {
      wave = freshWave;
    }

    // Check if current monster is defeated BEFORE updating (use battleResult which has the correct updated value)
    const updatedMonsterHearts = battleResult.monsterHearts.current;
    const isMonsterDefeated = updatedMonsterHearts <= 0;
    
    console.log(`[waveModule.js]: 🔍 Monster hearts check: ${updatedMonsterHearts}/${battleResult.monsterHearts.max} (was: ${wave.currentMonster.currentHearts}/${wave.currentMonster.maxHearts}, defeated: ${isMonsterDefeated})`);

    // Update current monster hearts (must mark as modified for Mongoose to detect nested object changes)
    wave.currentMonster.currentHearts = updatedMonsterHearts;
    wave.markModified('currentMonster');

    // Check if current monster is defeated (use the value from battleResult, not the wave object)
    if (isMonsterDefeated) {
      // Advance to next monster, tracking who defeated it
      const defeatedByParticipant = {
        userId: participant.userId,
        characterId: participant.characterId,
        name: participant.name
      };
      await wave.advanceToNextMonster(defeatedByParticipant);
      
      // Reload wave after advanceToNextMonster to get latest state
      const reloadedWave = await Wave.findOne({ waveId: waveId });
      if (reloadedWave) {
        wave = reloadedWave;
      }
      
      // Check if all monsters are defeated
      if (wave.currentMonsterIndex >= wave.monsters.length) {
        // All monsters defeated - will complete in completeWave
        await wave.completeWave();
        // Reload wave after completeWave
        const completedWave = await Wave.findOne({ waveId: waveId });
        if (completedWave) {
          wave = completedWave;
        }
      }
    } else {
      // Reload character from database to get the latest state (skip for expedition — we use party hearts only, never touch character)
      if (!wave.expeditionId) {
        const { fetchCharacterById } = require('@/database/db');
        const updatedCharacter = await fetchCharacterById(character._id, character.isModCharacter);
        if (updatedCharacter) {
          Object.assign(character, updatedCharacter.toObject ? updatedCharacter.toObject() : updatedCharacter);
        }
      }

      // Clear boost after turn (similar to raids)
      if (character.boostedBy) {
        const { clearBoostAfterUse } = require('../commands/jobs/boosting.js');
        await clearBoostAfterUse(character, {
          client: interaction?.client,
          context: 'wave turn'
        });
        console.log(`[waveModule.js]: 🎭 Boost cleared for ${character.name} after wave turn`);
      }
      
      // Advance to next turn if monster is not defeated
      await wave.advanceTurn();
    }

    // Reload wave after advanceToNextMonster or advanceTurn to ensure latest state
    const finalWave = await Wave.findOne({ waveId: waveId });
    if (finalWave) {
      wave = finalWave;
    }

    // For expedition waves: apply damage to party pool FIRST, THEN check for KO.
    // This ensures the KO check uses the updated party hearts value.
    if (wave.expeditionId && battleResult) {
      try {
        const Party = require('@/models/PartyModel');
        const party = await Party.findActiveByPartyId(wave.expeditionId);
        if (party) {
          // Calculate damage taken this turn from battleResult
          const heartsBefore = battleResult.characterHeartsBefore ?? characterHeartsBefore ?? party.totalHearts ?? 0;
          const heartsAfter = battleResult.playerHearts?.current ?? heartsBefore;
          const damageTaken = Math.max(0, heartsBefore - heartsAfter);
          
          // Apply damage to current party pool
          const newPartyHearts = Math.max(0, (party.totalHearts ?? 0) - damageTaken);
          party.totalHearts = newPartyHearts;
          party.markModified('totalHearts');
          await party.save();
          console.log(`[waveModule.js]: 🗺️ Expedition wave turn — party hearts: ${party.totalHearts} ❤ (damage this turn: ${damageTaken})`);
        }
      } catch (syncErr) {
        logger.warn('WAVE', `Failed to update expedition party hearts after wave turn: ${syncErr?.message || syncErr}`);
      }
    }

    // Check if all participants are KO'd after this turn (now uses updated party pool value)
    const allKO = await checkAllParticipantsKO(wave);
    if (allKO && wave.status === 'active') {
      console.log(`[waveModule.js]: 💀 All participants KO'd in wave ${waveId}, failing wave`);
      await wave.failWave();
      // Reload wave after failWave
      const failedWave = await Wave.findOne({ waveId: waveId });
      if (failedWave) {
        wave = failedWave;
      }
      // When monster camp wave fails: set party hearts to 0 (we use party pool only; failWave skips KO'ing individuals)
      if (wave.expeditionId) {
        try {
          const Party = require('@/models/PartyModel');
          const party = await Party.findActiveByPartyId(wave.expeditionId);
          if (party) {
            party.totalHearts = 0;
            party.markModified('totalHearts');
            await party.save();
            console.log(`[waveModule.js]: 🗺️ Expedition wave failed — party hearts set to 0`);
          }
        } catch (syncErr) {
          logger.warn('WAVE', `Failed to update expedition party after wave failure: ${syncErr?.message || syncErr}`);
        }
      }
    }

    // Save updated wave data (if not already saved by failWave)
    if (wave.status === 'active') {
      await wave.save();
    }

    return {
      waveId,
      waveData: wave,
      battleResult,
      participant
    };
  } catch (error) {
    handleError(error, 'waveModule.js', {
      functionName: 'processWaveTurn',
      characterName: character?.name,
      waveId: waveId
    });
    console.error(`[waveModule.js]: ❌ Error processing wave turn:`, error);
    throw error;
  }
}

// ---- Function: completeWave ----
// Completes a wave and handles loot distribution
async function completeWave(waveId) {
  try {
    const wave = await Wave.findOne({ waveId: waveId });
    if (!wave) {
      throw new Error(`Wave not found: ${waveId}`);
    }

    // Wave should already be marked as completed by advanceToNextMonster
    // But ensure it's marked correctly
    if (wave.status !== 'completed') {
      await wave.completeWave();
    }

    return wave;
  } catch (error) {
    handleError(error, 'waveModule.js', {
      functionName: 'completeWave',
      waveId: waveId
    });
    console.error(`[waveModule.js]: ❌ Error completing wave ${waveId}:`, error);
    
    // Enhance error message with context
    const enhancedError = new Error(`Failed to complete wave: ${error.message} (Wave ID: ${waveId})`);
    enhancedError.stack = error.stack;
    throw enhancedError;
  }
}

// ---- Function: failWave ----
// Fails a wave and KO's all participants
async function failWave(waveId) {
  try {
    const wave = await Wave.findOne({ waveId: waveId });
    if (!wave) {
      throw new Error(`Wave not found: ${waveId}`);
    }

    await wave.failWave();

    return wave;
  } catch (error) {
    handleError(error, 'waveModule.js', {
      functionName: 'failWave',
      waveId: waveId
    });
    console.error(`[waveModule.js]: ❌ Error failing wave ${waveId}:`, error);
    
    // Enhance error message with context
    const enhancedError = new Error(`Failed to fail wave: ${error.message} (Wave ID: ${waveId})`);
    enhancedError.stack = error.stack;
    throw enhancedError;
  }
}

// ---- Function: advanceWaveTurnOnItemUse ----
// When a character uses a healing item during their expedition wave turn, advance the wave turn.
// Called from /explore item command after successful healing so items count as a turn.
async function advanceWaveTurnOnItemUse(characterId) {
  if (!characterId) return;
  const charIdStr = characterId.toString();
  const waves = await Wave.find({ status: 'active', 'participants.characterId': characterId });
  for (const wave of waves) {
    // Only apply to expedition waves (have expeditionId set)
    if (!wave.expeditionId) continue;
    
    const currentParticipant = wave.participants[wave.currentTurn];
    if (currentParticipant && currentParticipant.characterId && currentParticipant.characterId.toString() === charIdStr) {
      await wave.advanceTurn();
      console.log(`[waveModule.js]: 🧪 Item use by ${currentParticipant.name} advanced wave ${wave.waveId} turn`);
      break;
    }
  }
}

// ============================================================================
// ---- Export ----
// ============================================================================
module.exports = {
  startWave,
  joinWave,
  processWaveTurn,
  completeWave,
  failWave,
  generateWaveMonsters,
  createWaveThread,
  checkAllParticipantsKO,
  advanceWaveTurnOnItemUse,
  WAVE_DIFFICULTY_GROUPS
};

