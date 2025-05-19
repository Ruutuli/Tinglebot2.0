// ------------------- Standard Libraries -------------------
// Core Node.js modules and third-party libraries.
const { v4: uuidv4 } = require('uuid');


const { handleError } = require('../utils/globalErrorHandler');
const { checkInventorySync } = require('../utils/characterUtils');
// ------------------- Discord.js Components -------------------
// Components from discord.js used for building UI elements.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');


// ------------------- Database Services -------------------
// Service modules for database interactions.
// Character Services
const { fetchCharacterByName, fetchCharacterByNameAndUserId, getCharacterInventoryCollection, getOrCreateToken } = require('../database/db');


// ------------------- Modules -------------------
// Custom modules for mount encounters and character stats.
const { 
  bearTraits, 
  bullboTraits, 
  customizationCosts, 
  deerTraits, 
  deleteEncounterById, 
  distractionItems, 
  dodongoTraits, 
  donkeyTraits, 
  generateBearTraits, 
  generateBullboTraits, 
  generateDeerTraits, 
  generateDodongoTraits, 
  generateDonkeyTraits, 
  generateHorseTraits, 
  generateMooseTraits, 
  generateMountainGoatTraits, 
  generateOstrichTraits, 
  generateWaterBuffaloTraits, 
  generateWolfosTraits, 
  getEncounterById, 
  getMountEmoji, 
  getMountRarity, 
  getMountStamina, 
  getMountThumbnail, 
  getRandomEnvironment, 
  getRandomMount, 
  horseTraits, 
  mooseTraits, 
  mountainGoatTraits, 
  ostrichTraits, 
  storeEncounter, 
  useDistractionItem, 
  waterBuffaloTraits, 
  wolfosTraits 
} = require('../modules/mountModule');

const { useStamina } = require('../modules/characterStatsModule');


// ------------------- Utility Functions -------------------
// Generic helper utilities not directly tied to Google Sheets.
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');


// ------------------- Google Sheets API -------------------
// Specific setup for Google Sheets API integration.
const { appendSheetData, authorizeSheets, extractSpreadsheetId, isValidGoogleSheetsUrl, safeAppendDataToSheet, } = require('../utils/googleSheetsUtils');


// ------------------- Database Models -------------------
// Schemas/models for database collections.
const Character = require('../models/CharacterModel');
const Mount = require('../models/MountModel');
const User = require('../models/UserModel');


// ------------------- Village Emojis -------------------
// Define emojis for villages used in mount encounters.
const villageEmojis = {
  inariko: '<:inariko:899493009073274920>',
  rudania: '<:rudania:899492917452890142>',
  vhintl: '<:vhintl:899492879205007450>',
};


// ------------------- Format Encounter Data -------------------
// Formats encounter data into an embedded message for mount details.
function formatEncounterData(encounter, characterName, characterStamina, characterIcon) {
  const mountLevel = encounter.mountLevel || 'To be determined';
  const mountType = encounter.mountType || 'To be determined';
  const environment = encounter.environment || 'To be determined';

  const villageEmoji = villageEmojis[encounter.village.toLowerCase()] || '';
  const village = `${villageEmoji} ${encounter.village || 'To be determined'}`;

  const mountStamina = encounter.mountStamina || 'To be determined';
  const rarity = encounter.rarity || 'To be determined';
  const mountThumbnail = getMountThumbnail(mountType);

  return {
    title: `🎉 ${characterName} Rolled a 20! 🎉`,
    description: '**Congratulations!** You have the opportunity to catch the mount!',
    author: { name: characterName, icon_url: characterIcon },
    fields: [
      {
        name: 'Mount Details',
        value: `> **Mount Species**: ${mountType}\n> **Rarity**: It's a **${rarity}** mount!\n> **Mount Level**: ${mountLevel}\n> **Mount Stamina**: ${mountStamina}\n> **Environment**: ${environment}\n> **Village**: ${village}`,
        inline: false,
      },
      {
        name: 'Stamina',
        value: `**${characterName}** currently has **${characterStamina}** stamina. What would ${characterName} like to do?`,
        inline: false,
      },
    ],
    color: 0xAA926A,
    image: {
      url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
    },
    thumbnail: { url: mountThumbnail },
  };
}


// ------------------- Create Action Buttons -------------------
// Creates action buttons for mount interaction options.
function createActionButtons(encounterId, village, glideUsed) {
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`sneak|${village}|${encounterId}`)
      .setLabel('🐾 Sneak')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`distract|${village}|${encounterId}`)
      .setLabel('🎯 Distract')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`corner|${village}|${encounterId}`)
      .setLabel('🦾 Corner')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rush|${village}|${encounterId}`)
      .setLabel('🏃‍♂️ Rush')
      .setStyle(ButtonStyle.Danger),
  ];

  if (!glideUsed) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`glide|${village}|${encounterId}`)
        .setLabel('🪂 Glide')
        .setStyle(ButtonStyle.Primary)
    );
  }

  return new ActionRowBuilder().addComponents(buttons);
}


// ------------------- Track Character in Encounter -------------------
// Tracks a character's participation in an encounter.
async function trackCharacterInEncounter(character, encounterId, encounter, userId) {
  const userInEncounter = encounter.users.find(user => user.characterName === character.name);
  if (!userInEncounter) {
    encounter.users.push({ characterName: character.name, userId });
    try {
      await storeEncounter(encounterId, encounter);
    } catch (error) {
    handleError(error, 'mountComponentHandler.js');

      console.error('[mountComponentHandler]: Failed to store updated encounter', error);
      throw new Error('An error occurred while updating the encounter. Please try again.');
    }
  }
}


// ------------------- Proceed with Roll Function -------------------
// Processes a mount encounter roll and displays appropriate embed messages.
async function proceedWithRoll(interaction, characterName, encounterId) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply();

  const character = await fetchCharacterByName(characterName.name || characterName);
  if (!character) {
    await interaction.editReply({
      embeds: [{ title: '❌ Character not found', description: 'Please try again.', color: 0xFF0000 }],
      ephemeral: true,
    });
    return;
  }

  // Check if the character's inventory has been synced
  try {
    await checkInventorySync(character);
  } catch (error) {
    await interaction.editReply({
      content: error.message,
      ephemeral: true
    });
    return;
  }

  // Check if the user's token tracker is set up
  const user = await User.findOne({ discordId: interaction.user.id });
  if (!user || !user.tokensSynced) {
    return interaction.reply({
      content: `❌ **You cannot use the mount command because your token tracker is not set up yet. Please use the </tokens tokentrackerlink:1306176790095728732> and then </tokens sync:1306176789894266898> commands to set up your token tracker.**`,
      ephemeral: true,
    });
  }

  // ============================================================================
  // ---- Mount Stamina Consumption and Travel Restriction ----
  // Block travel if currentStamina is 0, decrement by 1 and update lastMountTravel on use
  // ============================================================================
  const mount = await Mount.findOne({ characterId: character._id });
  if (!mount) {
    await interaction.editReply({
      embeds: [{ title: '❌ No Mount Registered', description: `The character **${character.name}** does not have a registered mount.`, color: 0xFF0000 }],
      ephemeral: true,
    });
    return;
  }
  if (mount.currentStamina === null || typeof mount.currentStamina !== 'number') {
    mount.currentStamina = mount.stamina;
    await mount.save();
  }
  if (mount.currentStamina <= 0) {
    await interaction.editReply({
      embeds: [{ title: '❌ Mount Too Tired', description: `**${mount.name}** is too exhausted to travel. Stamina must recover before traveling again.`, color: 0xFF0000 }],
      ephemeral: true,
    });
    return;
  }
  // Decrement stamina and update lastMountTravel
  mount.currentStamina = Math.max(0, mount.currentStamina - 1);
  mount.lastMountTravel = new Date();
  await mount.save();

  const roll = Math.floor(Math.random() * 20) + 1;
  const encounter = getEncounterById(encounterId);
  if (!encounter) {
    await interaction.editReply({
      embeds: [{ title: '❌ Encounter not found', description: 'Please try again.', color: 0xFF0000 }],
      ephemeral: true,
    });
    return;
  }

  const village = encounter.village;
  if (roll === 20) {
    if (encounter.rarity === 'To be determined') {
      const rarityData = getMountRarity();
      encounter.rarity = rarityData.isRare ? 'Rare' : 'Regular';
    }
    if (encounter.mountStamina === 'To be determined') {
      encounter.mountStamina = getMountStamina(encounter.mountLevel, encounter.rarity === 'Rare');
    }
    if (encounter.environment === 'To be determined') {
      encounter.environment = getRandomEnvironment(village);
    }
    if (encounter.mountType === 'To be determined') {
      const randomMount = getRandomMount(village);
      encounter.mountType = randomMount.mount;
      encounter.mountLevel = randomMount.level;
      encounter.village = randomMount.village;
    }

    await trackCharacterInEncounter(character, encounterId, encounter, interaction.user.id);
    encounter.rollerId = interaction.user.id;
    storeEncounter(encounterId, encounter);

    const embedMessage = formatEncounterData(encounter, character.name, character.currentStamina, character.icon);
    const actionButtons = createActionButtons(encounterId, village, encounter.glideUsed);

    await interaction.editReply({
      components: [actionButtons],
      embeds: [embedMessage],
      ephemeral: false,
    });
  } else {
    await interaction.editReply({
      embeds: [{
        title: `🎲 ${character.name} rolled a **${roll}**!`,
        description: `🚫 Keep trying for that **natural 20**!\n\nUse \`\`\`/mount encounterid:${encounterId} charactername:\`\`\` to participate!`,
        color: 0xFFFF00,
        author: { name: character.name, icon_url: character.icon },
        thumbnail: { url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
      }],
      components: [],
      ephemeral: false,
    });
  }
}


// ------------------- Handle Mount Component Interaction -------------------
// Processes actions triggered by mount interaction buttons.
async function handleMountComponentInteraction(interaction) {
  try {
    const [action, village, encounterId] = interaction.customId.split('|');
    const encounter = getEncounterById(encounterId);
    if (!encounter) {
      await interaction.reply({
        embeds: [{ title: '❌ Encounter not found', description: 'Please try again.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }

    if (action === 'glide' && encounter.glideUsed) {
      await interaction.reply({
        embeds: [{ title: '❌ Glide Unavailable', description: 'You can only use Glide on the first roll.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }

    if (action === 'glide') {
      encounter.glideUsed = true;
      storeEncounter(encounterId, encounter);
    }

    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();

    const userInEncounter = encounter.users.find(user => user.characterName);
    if (!userInEncounter || userInEncounter.userId !== interaction.user.id) {
      await interaction.editReply({
        embeds: [{ title: '❌ Access Denied', description: 'Only the owner of the character can interact.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }

    const character = await fetchCharacterByName(userInEncounter.characterName);
    if (!character) {
      await interaction.editReply({
        embeds: [{ title: '❌ Character not found', description: 'Please try again.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }

    if (action === 'distract') {
      try {
        if (!distractionItems || typeof distractionItems !== 'object') {
          console.error('[mountComponentHandler]: distractionItems is undefined or not an object.');
          await interaction.editReply({
            embeds: [{ title: '❌ Error', description: 'Distraction items data is not available. Please try again later.', color: 0xFF0000 }],
            components: [],
            ephemeral: true,
          });
          return;
        }
  
        const inventoryCollection = await getCharacterInventoryCollection(character.name);
        const inventoryItems = await inventoryCollection.find({}, { projection: { itemName: 1, quantity: 1, _id: 1 } }).toArray();
  
        const normalizedDistractionItems = Object.keys(distractionItems).reduce((acc, key) => {
          acc[key.toLowerCase().trim()] = distractionItems[key];
          return acc;
        }, {});
  
        const mountType = encounter.mountType;
        const availableItems = inventoryItems.filter(item => {
          if (!item.itemName) {
            console.warn('[mountComponentHandler]: Item with no name found in inventory:', item);
            return false;
          }
          const normalizedItemName = item.itemName.toLowerCase().trim();
          const distractionItem = normalizedDistractionItems[normalizedItemName];
          return distractionItem && (distractionItem.forAllMounts || distractionItem.mounts?.includes(mountType));
        });
  
        const deduplicatedItems = availableItems.reduce((acc, item) => {
          const normalizedItemName = item.itemName.toLowerCase().trim();
          if (!acc[normalizedItemName]) {
            acc[normalizedItemName] = { ...item, quantity: parseInt(item.quantity, 10) };
          } else {
            acc[normalizedItemName].quantity += parseInt(item.quantity, 10);
          }
          return acc;
        }, {});
  
        const uniqueItems = Object.values(deduplicatedItems);
        if (uniqueItems.length === 0) {
          await interaction.editReply({
            embeds: [{
              title: '❌ No Distraction Items Available',
              description: `You do not have any items in your inventory that can distract a **${mountType}**. Try a different strategy!`,
              color: 0xFF0000,
              thumbnail: { url: getMountThumbnail(encounter.mountType) },
              image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
            }],
            components: [],
            flags: 0,
          });
          return;
        }
  
        const distractionButtons = uniqueItems.map(item =>
          new ButtonBuilder()
            .setCustomId(`use-item|${item.itemName}|${encounterId}`)
            .setLabel(`${item.itemName} (${item.quantity})`)
            .setStyle(ButtonStyle.Primary)
        );
  
        const actionRows = createActionRows(distractionButtons);
  
        console.log('[mountComponentHandler]: Generated distraction buttons:', distractionButtons);
  
        await interaction.message.edit({ components: [] });
  
        await interaction.editReply({
          embeds: [{
            title: `🎯 Distract Attempt`,
            description: `🛠️ Choose an item from your inventory to distract the **${mountType}**.`,
            color: 0xAA926A,
            thumbnail: { url: getMountThumbnail(encounter.mountType) },
            image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
          }],
          components: actionRows,
          flags: 0,
        });
      } catch (error) {
    handleError(error, 'mountComponentHandler.js');

        console.error('[mountComponentHandler]: Error while filtering distraction items:', error);
        await interaction.editReply({
          embeds: [{ title: '❌ Error', description: 'An error occurred while processing distraction items. Please try again later.', color: 0xFF0000 }],
          components: [],
          ephemeral: true,
        });
      }
      return;
    }
  
    const staminaResult = await useStamina(character._id, 1);
    if (staminaResult.exhausted) {
      deleteEncounterById(encounterId);
      await interaction.editReply({
        embeds: [{
          title: 'Mount Escaped!',
          description: `**${staminaResult.message}**\n\nThe mount fled as your character became too exhausted to continue the chase.`,
          color: 0xFF0000,
          thumbnail: { url: getMountThumbnail(encounter.mountType) },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        }],
        components: []
      });
      return;
    }
  
    const roll = Math.floor(Math.random() * 20) + 1;
    let adjustedRoll = roll;
    let bonusMessage = '';
    let success = false;
  
    const environment = encounter.environment || 'Unknown';
    if (environment === 'Tall grass' && village === 'Rudania') {
      if (action === 'sneak') adjustedRoll += 1;
      if (action === 'rush') adjustedRoll -= 3;
    }
    if (environment === 'Mountainous' && village === 'Inariko') {
      if (action === 'corner') adjustedRoll += 4;
      if (action === 'glide') adjustedRoll += 2;
    }
    if (action === 'glide') adjustedRoll += 3;
  
    if (action === 'sneak' && adjustedRoll >= 5) success = true;
    if (action === 'corner' && adjustedRoll >= 7) success = true;
    if (action === 'rush' && adjustedRoll >= 17) success = true;
  
    let message = `**${character.name}** tried a **${action}** strategy and rolled a **${roll}**.`;
    if (bonusMessage) message += ` ${bonusMessage} applied, adjusted roll is **${adjustedRoll}**.`;
  
    if (success) {
      message += `\n\n🎉 Success! ${character.name} moves to the next phase.\n\n${character.name} has **${character.currentStamina}** 🟩 stamina remaining.`;
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tame|${village}|${encounterId}`)
          .setLabel('Tame the Mount!')
          .setStyle(ButtonStyle.Success)
      );
  
      await interaction.message.edit({ components: [] });
      await interaction.editReply({
        embeds: [{
          title: `${getMountEmoji(encounter.mountType)} ${action.charAt(0).toUpperCase() + action.slice(1)} Attempt!`,
          description: message,
          color: 0xAA926A,
          author: { name: character.name, icon_url: character.icon },
          thumbnail: { url: getMountThumbnail(encounter.mountType) },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
        }],
        components: [actionRow],
        flags: 0
      });
    } else {
      message += `\n\n🚫 The mount evaded! Would **${character.name}** like to try again for 1 🟩 stamina?\n\n**${character.name}** now has **${character.currentStamina}** 🟩 stamina remaining.`;
      const retryButtons = createActionButtons(encounterId, village, encounter.glideUsed);
  
      await interaction.message.edit({ components: [] });
      await interaction.editReply({
        embeds: [{
          title: 'Mount Evaded!',
          description: message,
          color: 0xFFFF00,
          author: { name: character.name, icon_url: character.icon },
          thumbnail: { url: getMountThumbnail(encounter.mountType) },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
        }],
        components: [retryButtons],
        ephemeral: false
      });
    }
  } catch (error) {
    handleError(error, 'mountComponentHandler.js');

    console.error('[mountComponentHandler]: Error occurred:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [{ title: '❌ Error', description: 'Something went wrong. Please try again later.', color: 0xFF0000 }],
        ephemeral: true,
      });
    }
  }
}


// ------------------- Handle Tame Interaction -------------------
// Processes taming attempts by rolling and applying stamina costs.
async function handleTameInteraction(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
  
    const [ , village, encounterId ] = interaction.customId.split('|');
    let encounter = getEncounterById(encounterId);
    if (!encounter) {
      await interaction.editReply({
        embeds: [{ title: '❌ Encounter Not Found', description: 'We couldn\'t find the encounter you are trying to interact with.', color: 0xFF0000 }],
        ephemeral: false,
      });
      return;
    }
  
    const userInEncounter = encounter.users.find(user => user.characterName);
    if (!userInEncounter || userInEncounter.userId !== interaction.user.id) {
      await interaction.editReply({
        embeds: [{ title: '❌ Access Denied', description: 'Only the owner of the character can continue.', color: 0xFF0000 }],
        ephemeral: false,
      });
      return;
    }
  
    const characterName = userInEncounter.characterName;
    const character = await fetchCharacterByName(characterName);
    if (!character) {
      await interaction.editReply({
        embeds: [{ title: `❌ Character Not Found: ${characterName}`, description: 'Please ensure the character is valid and try again.', color: 0xFF0000 }],
        ephemeral: false,
      });
      return;
    }
  
    const characterStamina = character.currentStamina;
    if (characterStamina === 0) {
      deleteEncounterById(encounterId);
      await interaction.editReply({
        embeds: [{
          title: '💔 Mount Escaped!',
          description: `**${character.name}** has become too exhausted to continue the chase!\n\n💡 **Tip:** Plan your actions carefully and ensure you have enough stamina for future encounters.`,
          color: 0xFF0000,
          thumbnail: { url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        }],
        components: []
      });
      return;
    }
  
    const rolls = Array.from({ length: characterStamina }, () => Math.floor(Math.random() * 20) + 1);
    const nat20 = rolls.includes(20);
    const successes = rolls.filter(roll => roll >= 5).length;
    const mountStamina = encounter.mountStamina;
  
    let message = `🎲 **${characterName} rolled ${characterStamina}d20**: \`${rolls.join(', ')}\`\n\n`;
    message += `${characterName} needed **${mountStamina}** successes of 5 or higher. ${characterName} got **${successes}**.\n\n`;
  
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pay-traits|yes|${encounterId}`)
        .setLabel('Yes')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`pay-traits|no|${encounterId}`)
        .setLabel('No')
        .setStyle(ButtonStyle.Danger)
    );
  
    if (nat20 || successes >= mountStamina) {
      message += `🎉 **Success!** ${characterName} has successfully tamed the mount! 🐴\n\n`;
      const mountDetails = `**Mount Details**\n> **Mount Species**: ${encounter.mountType}\n> **Rarity**: It's a **${encounter.rarity}** mount!\n> **Mount Level**: ${encounter.mountLevel}\n> **Mount Stamina**: ${encounter.mountStamina}\n`;
      message += mountDetails;
      message += `\nWould you like to customize any traits of the mount?`;
  
      encounter.tameStatus = true;
      storeEncounter(encounterId, encounter);
  
      await interaction.message.edit({ components: [] });
      await interaction.editReply({
        embeds: [{
          title: `${getMountEmoji(encounter.mountType)} Tamed ${encounter.mountType} Successfully!`,
          description: message,
          color: 0xAA926A,
          author: { name: character.name, icon_url: character.icon },
          thumbnail: { url: getMountThumbnail(encounter.mountType) },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
        }],
        components: [actionRow],
        flags: 0
      });
    } else {
      deleteEncounterById(encounterId); // ❗ Mount escaped, delete encounter
    
      message += `🚫 **Failed!** The mount escaped and fled! You can no longer attempt to tame this mount.`;
      
      await interaction.message.edit({ components: [] }); // ❗ Clear buttons
    
      await interaction.editReply({
        embeds: [{
          title: `${getMountEmoji(encounter.mountType)} Mount Escaped`,
          description: message,
          color: 0xFF0000,
          author: { name: character.name, icon_url: character.icon },
        }],
        ephemeral: false
      });
    }
    
  } catch (error) {
    handleError(error, 'mountComponentHandler.js');

    console.error('[mountComponentHandler]: Error handling tame interaction:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [{ title: '❌ Error', description: 'Something went wrong. Please try again later.', color: 0xFF0000 }],
        ephemeral: true,
      });
    }
  }
}


// ------------------- Handle Use Item Interaction -------------------
// Processes item usage to distract a mount.
async function handleUseItemInteraction(interaction) {
  try {
    const [ , itemName, encounterId ] = interaction.customId.split('|');
    console.log(`[mountComponentHandler]: Parsed encounterId: ${encounterId}, itemName: ${itemName}`);
  
    const encounter = getEncounterById(encounterId);
    console.log(`[mountComponentHandler]: Retrieved encounter:`, encounter);
  
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: false });
  
    if (!encounter) {
      console.error(`[mountComponentHandler]: Encounter not found for ID: ${encounterId}`);
      await interaction.editReply({
        embeds: [{ title: '❌ Encounter Not Found', description: 'Please try again.', color: 0xFF0000 }],
        ephemeral: false,
      });
      return;
    }
  
    const mountType = encounter.mountType;
    const bonus = useDistractionItem(itemName, mountType);
    if (bonus === 0) {
      await interaction.editReply({
        embeds: [{ title: '❌ Invalid Item', description: `The item **${itemName}** cannot be used to distract the current mount.`, color: 0xFF0000 }],
        components: [],
        ephemeral: false,
      });
      return;
    }
  
    const userInEncounter = encounter.users.find(user => user.userId === interaction.user.id);
    if (!userInEncounter) {
      await interaction.editReply({
        embeds: [{ title: '❌ Character Not Found', description: 'The character linked to this encounter could not be identified.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
    const characterName = userInEncounter.characterName;
    const character = await fetchCharacterByName(characterName);
    if (!character) {
      await interaction.editReply({
        embeds: [{ title: '❌ Character Not Found', description: 'The character does not exist in the system.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
  
    const roll = Math.floor(Math.random() * 20) + 1;
    const adjustedRoll = roll + bonus;
    const success = adjustedRoll >= 7;
  
    let message = `🎲 **Rolled a ${roll}**, with a distraction bonus of **+${bonus}**, for a total of **${adjustedRoll}**.\n\n`;
    if (success) {
      message += `🎉 **Success!** You distracted the mount effectively with **${itemName}**!\n\n🟢 **The mount is now vulnerable to your next action!**\n\n`;
      message += `**${character.name}** currently has **${character.currentStamina}** stamina remaining.`;
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tame|${encounter.village}|${encounterId}`)
          .setLabel('🐴 Tame the Mount!')
          .setStyle(ButtonStyle.Success)
      );
  
      await interaction.message.edit({ components: [] });
      await interaction.editReply({
        embeds: [{
          title: `${getMountEmoji(mountType)} 🎯 Distract Success!`,
          description: `${message}\n\n**Prepare to tame the mount!**`,
          color: 0xAA926A,
          thumbnail: { url: getMountThumbnail(mountType) },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        }],
        components: [actionRow],
        ephemeral: false,
      });
    } else {
      message += `🚫 **The mount evaded despite your efforts with **${itemName}**!**\n\n💡 **Tip:** Use distraction items or bonuses to improve your chances.\n\n`;
      message += `**${character.name}** currently has **${character.currentStamina}** stamina remaining.`;
      const retryButtons = createActionButtons(encounterId, encounter.village, encounter.glideUsed);
      await interaction.message.edit({ components: [] });
      await interaction.editReply({
        embeds: [{
          title: `${getMountEmoji(mountType)} ❌ Distract Failed`,
          description: message,
          color: 0xFF0000,
          thumbnail: { url: getMountThumbnail(mountType) },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        }],
        components: [retryButtons],
        ephemeral: false,
      });
    }
  
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    await removeItemInventoryDatabase(character._id, itemName, 1, inventoryCollection);
  
    if (isValidGoogleSheetsUrl(character.inventory || character.inventoryLink)) {
      const spreadsheetId = extractSpreadsheetId(character.inventory || character.inventoryLink);
      const auth = await authorizeSheets();
      const range = 'loggedInventory!A2:M';
      const uniqueSyncId = uuidv4();
      const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
  
      const values = [[
        character.name,
        itemName,
        '-1',
        (character.randomItem && character.randomItem.category && character.randomItem.category.join(', ')) || '',
        (character.randomItem && character.randomItem.type && character.randomItem.type.join(', ')) || '',
        (character.randomItem && character.randomItem.subtype && character.randomItem.subtype.join(', ')) || '',
        'Mount distraction',
        character.job,
        '',
        character.currentVillage,
        interactionUrl,
        formattedDateTime,
        uniqueSyncId
      ]];
  
      if (character?.name && character?.inventory && character?.userId) {
    await safeAppendDataToSheet(character.inventory, character, range, values, undefined, { skipValidation: true });
} else {
    console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
}

    }
  
    encounter.distractionResult = success;
    storeEncounter(encounterId, encounter);
  } catch (error) {
    handleError(error, 'mountComponentHandler.js');

    console.error('[mountComponentHandler]: Error handling item usage interaction:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [{ title: '❌ Error', description: 'Something went wrong. Please try again later.', color: 0xFF0000 }],
        ephemeral: true,
      });
    }
  }
}


// ------------------- Handle Post-Tame Interaction -------------------
// Provides feedback after a successful taming attempt.
async function handlePostTameInteraction(interaction, encounterId) {
  try {
    const encounter = getEncounterById(encounterId);
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: false });
    if (!encounter) {
      await interaction.editReply({
        embeds: [{ title: '❌ Encounter Not Found', description: 'The encounter could not be found. Please try again.', color: 0xFF0000 }],
        ephemeral: false,
      });
      return;
    }
  
    const rarity = encounter.rarity === 'Rare' ? 'Rare' : 'Regular';
    const mountType = encounter.mountType;
  
    const embedMessage = {
      title: `${getMountEmoji(mountType)} 🎉 Mount Tamed!`,
      description: `🎉 **Congratulations!** You have successfully tamed a **${rarity}** mount!\n\nDo you want to customize any of its traits?`,
      color: rarity === 'Rare' ? 0xFFD700 : 0xAA926A,
      thumbnail: { url: getMountThumbnail(mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
      image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
    };
  
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pay-traits|yes|${encounterId}`)
        .setLabel('✅ Yes, Customize')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`pay-traits|no|${encounterId}`)
        .setLabel('❌ No, Skip')
        .setStyle(ButtonStyle.Danger)
    );
  
    await interaction.editReply({
      embeds: [embedMessage],
      components: [actionRow],
      ephemeral: false,
    });
  } catch (error) {
    handleError(error, 'mountComponentHandler.js');

    console.error('[mountComponentHandler]: Error handling post-tame interaction:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [{ title: '❌ Error', description: 'Something went wrong. Please try again later.', color: 0xFF0000 }],
        ephemeral: true,
      });
    }
  }
}


// ------------------- Create Action Rows -------------------
// Splits an array of buttons into rows of 5 or fewer.
function createActionRows(buttons) {
  const actionRows = [];
  while (buttons.length) {
    actionRows.push(new ActionRowBuilder().addComponents(buttons.splice(0, 5)));
  }
  return actionRows;
}


// ------------------- Handle Trait Payment Interaction -------------------
// Processes token payment for mount customization.
async function handleTraitPaymentInteraction(interaction) {
  try {
    const [ , response, encounterId, customizationType ] = interaction.customId.split('|');
    const encounter = getEncounterById(encounterId);
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: false });
    if (!encounter) {
      await interaction.editReply({
        embeds: [{ title: '❌ Encounter Not Found', description: 'The encounter could not be found. Please try again.', color: 0xFF0000 }],
        ephemeral: false,
      });
      return;
    }
  
    const mountType = encounter.mountType;
  
    if (response === 'yes' && customizationType) {
      const cost = customizationCosts[mountType]?.[customizationType] || 0;
      console.log(`[mountComponentHandler]: Fetching cost for Trait Key: ${customizationType}, Mount Type: ${mountType}`);
      console.log(`[mountComponentHandler]: Customization Costs for ${mountType}:`, customizationCosts[mountType]);
      console.log(`[mountComponentHandler]: Resolved cost: ${cost}`);
      encounter.totalSpent += cost;
      storeEncounter(encounterId, encounter);
  
      if (!cost) {
        await interaction.editReply({
          embeds: [{ title: '❌ Invalid Customization', description: 'The customization type is not valid for this mount.', color: 0xFF0000 }],
          ephemeral: true,
        });
        return;
      }
  
      const userInEncounter = encounter.users.find(user => user.userId === interaction.user.id);
      const character = await fetchCharacterByName(userInEncounter.characterName);
      if (!character) {
        await interaction.editReply({
          embeds: [{ title: '❌ Character Not Found', description: 'Could not retrieve your character. Please try again later.', color: 0xFF0000 }],
          ephemeral: true,
        });
        return;
      }

      // ------------------- NEW: Validate Character Village Match -------------------
if (character.currentVillage?.toLowerCase() !== encounter.village?.toLowerCase()) {
  await interaction.editReply({
    embeds: [{
      title: '❌ Wrong Village',
      description: `**${character.name}** is in **${character.currentVillage || 'an unknown location'}**, but this mount encounter is happening in **${encounter.village}**.\n\nYou must be in the correct village to continue.`,
      color: 0xFF0000,
    }],
    ephemeral: true,
  });
  return;
}

  
      if (character.tokens < cost) {
        await interaction.editReply({
          embeds: [{ title: '❌ Insufficient Tokens', description: `You need **${cost} tokens** for this customization. You currently have **${character.tokens} tokens**.`, color: 0xFF0000 }],
          ephemeral: true,
        });
        return;
      }
  
      if (isNaN(character.tokens) || isNaN(cost)) {
        throw new Error(`Invalid token value or cost. Tokens: ${character.tokens}, Cost: ${cost}`);
      }
      character.tokens -= cost;
      await character.save();
      console.log(`[mountComponentHandler]: Deducted ${cost} tokens. Remaining: ${character.tokens}`);
  
      if (isValidGoogleSheetsUrl(character.inventory || character.inventoryLink)) {
        const spreadsheetId = extractSpreadsheetId(character.inventory || character.inventoryLink);
        const auth = await authorizeSheets();
        const range = 'customizationLog!A2:M';
  
        const values = [[
          `${mountType} Customization - ${customizationType}`,
          `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
          'Other',
          'spent',
          `-${cost}`
        ]];
        if (character?.name && character?.inventory && character?.userId) {
    await safeAppendDataToSheet(character.inventory, character, range, values, undefined, { skipValidation: true });
} else {
    console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
}

        console.log(`[mountComponentHandler]: Logged token usage to Google Sheets for user ${interaction.user.id}.`);
      }
  
      await interaction.editReply({
        embeds: [{
          title: '🎨 Customization Successful!',
          description: `You successfully customized your **${mountType}** with **${customizationType}** for **${cost} tokens**.\n\n💳 **Remaining Tokens:** ${character.tokens}`,
          color: 0xAA926A,
          thumbnail: { url: getMountThumbnail(mountType) },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        }],
        ephemeral: false,
      });
  
    } else if (response === 'yes') {
      const mountTraitsMap = {
        Bear: bearTraits,
        Bullbo: bullboTraits,
        Deer: deerTraits,
        Dodongo: dodongoTraits,
        Donkey: donkeyTraits,
        Horse: horseTraits,
        Moose: mooseTraits,
        MountainGoat: mountainGoatTraits,
        Ostrich: ostrichTraits,
        Wolfos: wolfosTraits,
        WaterBuffalo: waterBuffaloTraits,
      };
  
      const traitsData = mountTraitsMap[mountType];
      if (!traitsData) {
        await interaction.editReply({
          embeds: [{ title: '❌ Unsupported Mount Type', description: `Customization is not available for ${mountType}.`, color: 0xFF0000 }],
          ephemeral: false,
        });
        return;
      }
  
      const traitKeys = Object.keys(traitsData);
      const firstTrait = traitKeys[0];
      const traitOptions = traitsData[firstTrait]?.traits;
  
      if (!traitOptions) {
        console.error(`Traits for first trait '${firstTrait}' are undefined.`);
        await interaction.editReply({
          embeds: [{ title: '❌ Error', description: `Traits for the first customization option are not available.`, color: 0xFF0000 }],
          ephemeral: true,
        });
        return;
      }
  
      const buttons = Object.entries(traitOptions).map(([key, value]) =>
        new ButtonBuilder()
          .setCustomId(`trait-select|${encounterId}|${firstTrait}|${key}`)
          .setLabel(`${value} (${customizationCosts[mountType]?.[firstTrait] || 0}t)`)
          .setStyle(ButtonStyle.Primary)
      );
  
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`trait-select|${encounterId}|${firstTrait}|random`)
          .setLabel('Random (0t)')
          .setStyle(ButtonStyle.Secondary)
      );
  
      const actionRows = createActionRows(buttons);
  
      await interaction.message.edit({ components: [] });
      await interaction.editReply({
        embeds: [{
          title: `🎨 Customize Your ${mountType}`,
          description: `🛠️ **Select ${firstTrait.replace(/([A-Z])/g, ' $1')}** for your mount!\n\n💰 **Each option shows the token cost.**`,
          color: 0xAA926A,
          thumbnail: { url: getMountThumbnail(mountType) || 'https://example.com/default-thumbnail.png' },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        }],
        components: actionRows,
        ephemeral: false,
      });
  
    } else if (response === 'no') {
      await interaction.message.edit({ components: [] });
  
      let traits;
      switch (mountType) {
        case 'Horse':
          traits = generateHorseTraits(encounter.rarity === 'Rare');
          break;
        case 'Donkey':
          traits = generateDonkeyTraits(encounter.rarity === 'Rare');
          break;
        case 'Ostrich':
          traits = generateOstrichTraits(encounter.rarity === 'Rare');
          break;
        case 'Bullbo':
          traits = generateBullboTraits(encounter.rarity === 'Rare');
          break;
        case 'Dodongo':
          traits = generateDodongoTraits(encounter.rarity === 'Rare');
          break;
        case 'Mountain Goat':
          traits = generateMountainGoatTraits(encounter.rarity === 'Rare');
          break;
        case 'WaterBuffalo':
          traits = generateWaterBuffaloTraits(encounter.rarity === 'Rare');
          break;
        case 'Deer':
          traits = generateDeerTraits(encounter.rarity === 'Rare');
          break;
        case 'Wolfos':
          traits = generateWolfosTraits(encounter.rarity === 'Rare');
          break;
        case 'Moose':
          traits = generateMooseTraits(encounter.rarity === 'Rare');
          break;
        case 'Bear':
          traits = generateBearTraits(encounter.rarity === 'Rare');
          break;
        default:
          traits = { error: 'Unknown mount type.' };
          console.error(`Unknown mount type: ${mountType}`);
      }
  
      if (!traits || Object.keys(traits).length === 0) {
        console.error(`Trait generation failed for mount type: ${mountType}`);
        traits = { error: 'Failed to generate traits.' };
      }
  
      const traitDescriptions = Object.entries(traits)
        .map(([key, value]) => `**${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:** ${value}`)
        .join('\n');
  
      const mountEmoji = getMountEmoji(mountType);
  
      const embedMessage = {
        title: `${mountEmoji} 🎉 Traits for Your Tamed ${mountType}`,
        description: `👀 **Here's a detailed look at your mount's traits:**\n\n${traitDescriptions}\n\n🟢 **Ready to name and register your new companion?**`,
        color: 0xAA926A,
        thumbnail: { url: getMountThumbnail(mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        footer: { text: `Congratulations on your new ${mountType}!` },
      };
  
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`register-mount|${encounterId}`)
          .setLabel('🐴 Name and Register Your Mount!')
          .setStyle(ButtonStyle.Primary)
      );
  
      await interaction.editReply({
        embeds: [embedMessage],
        components: [actionRow],
        ephemeral: false,
      });
    }
  } catch (error) {
    handleError(error, 'mountComponentHandler.js');

    console.error('[mountComponentHandler]: Error during trait payment interaction:', error);
    if (!interaction.replied) {
      await interaction.reply({
        embeds: [{ title: '❌ Error', description: 'Something went wrong. Please try again later.', color: 0xFF0000 }],
        ephemeral: true,
      });
    }
  }
}


// ------------------- Handle Trait Selection -------------------
// Processes user selections for mount trait customization.
async function handleTraitSelection(interaction) {
  try {
    const [ , encounterId, traitKey, selection ] = interaction.customId.split('|');
    let encounter = getEncounterById(encounterId);
    if (!encounter) {
      console.error(`[mountComponentHandler]: Encounter not found. ID: ${encounterId}`);
      await interaction.reply({
        embeds: [{ title: '❌ Encounter Not Found', description: 'Please try again.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
  
    const mountType = encounter.mountType;
    console.log(`[mountComponentHandler]: Mount Type: ${mountType}, Encounter ID: ${encounterId}`);
  
    if (typeof encounter.totalSpent !== 'number' || isNaN(encounter.totalSpent)) {
      encounter.totalSpent = 0;
      console.log(`[mountComponentHandler]: Initialized totalSpent to 0.`);
    } else {
      console.log(`[mountComponentHandler]: Existing totalSpent: ${encounter.totalSpent}`);
    }
  
    const mountTraitsMap = {
      Bear: bearTraits,
      Bullbo: bullboTraits,
      Deer: deerTraits,
      Dodongo: dodongoTraits,
      Donkey: donkeyTraits,
      Horse: horseTraits,
      Moose: mooseTraits,
      MountainGoat: mountainGoatTraits,
      Ostrich: ostrichTraits,
      Wolfos: wolfosTraits,
      WaterBuffalo: waterBuffaloTraits,
    };
  
    const traitsData = mountTraitsMap[mountType];
    if (!traitsData) {
      console.error(`[mountComponentHandler]: Traits data not found for Mount Type: ${mountType}`);
      await interaction.reply({
        embeds: [{ title: '❌ Unsupported Mount Type', description: `Customization is not available for ${mountType}.`, color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
  
    const selectedValue = selection === 'random'
      ? Object.values(traitsData[traitKey].traits)[Math.floor(Math.random() * Object.values(traitsData[traitKey].traits).length)]
      : traitsData[traitKey].traits[selection];
  
    console.log(`[mountComponentHandler]: Trait Key: ${traitKey}, Selection: ${selection}, Selected Value: ${selectedValue}`);
  
    const cost = selection === 'random' ? 0 : customizationCosts[mountType]?.[traitKey] || 0;
    console.log(`[mountComponentHandler]: Resolved cost: ${cost}`);
    console.log(`[mountComponentHandler]: Fetching cost for Trait Key: ${traitKey}, Mount Type: ${mountType}`);
    console.log(`[mountComponentHandler]: Customization Costs for ${mountType}:`, customizationCosts[mountType]);
    console.log(`[mountComponentHandler]: Cost for ${traitKey}: ${cost}`);
  
    const user = await getOrCreateToken(interaction.user.id);
    if (typeof user.tokens !== 'number') {
      console.error('[mountComponentHandler]: User tokens are invalid or not a number.');
      throw new Error(`Invalid tokens for user ${interaction.user.id}. Value: ${user.tokens}`);
    }
  
    if (cost > 0) {
      if (user.tokens < cost) {
        console.warn(`[mountComponentHandler]: Insufficient tokens. Needed: ${cost}, Available: ${user.tokens}`);
        await interaction.reply({
          embeds: [{ title: '❌ Insufficient Tokens', description: `You need **${cost} tokens** for this customization. You currently have **${user.tokens} tokens**.`, color: 0xFF0000 }],
          ephemeral: true,
        });
        return;
      }
  
      user.tokens -= cost;
      await user.save();
      console.log(`[mountComponentHandler]: Deducted ${cost} tokens. Remaining: ${user.tokens}`);
  
      if (isValidGoogleSheetsUrl(user.tokenTracker)) {
        const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
        const auth = await authorizeSheets();
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const values = [[`${mountType} Customization - ${traitKey}`, interactionUrl, 'Other', 'spent', `-${cost}`]];
        await safeAppendDataToSheet(character.inventory, character, 'loggedTracker!B7:F', values, undefined, { skipValidation: true });
        console.log(`[mountComponentHandler]: Logged token usage to Google Sheets for user ${interaction.user.id}.`);
      }
    }
  
    encounter.totalSpent += cost;
    console.log(`[mountComponentHandler]: Updated totalSpent: ${encounter.totalSpent}`);
  
    encounter.traits = encounter.traits || {};
    encounter.traits[traitKey] = selectedValue;
  
    encounter.customizedTraits = encounter.customizedTraits || [];
    if (selection !== 'random' && !encounter.customizedTraits.includes(traitKey)) {
      encounter.customizedTraits.push(traitKey);
    }
    storeEncounter(encounterId, encounter);
  
    await interaction.update({
      embeds: [{
        title: `🎨 ${mountType} Customization`,
        description: `🛠️ **${traitKey.replace(/([A-Z])/g, ' $1')}** has been set to **${selectedValue}**!`,
        color: 0xAA926A,
        thumbnail: { url: getMountThumbnail(mountType) || 'https://example.com/default-thumbnail.png' },
        image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
      }],
      components: [],
    });
  
    const traitKeys = Object.keys(traitsData);
    const filteredTraitKeys = traitKeys.filter(key => key !== 'rareColors' || encounter.rarity === 'Rare');
    const currentIndex = filteredTraitKeys.indexOf(traitKey);
    const nextTrait = filteredTraitKeys[currentIndex + 1];
  
    console.log(`[mountComponentHandler]: Current Trait: ${traitKey}, Next Trait: ${nextTrait}`);
  
    if (nextTrait) {
      const nextOptions = traitsData[nextTrait]?.traits;
      if (!nextOptions) {
        console.error(`[mountComponentHandler]: Traits for next trait '${nextTrait}' are undefined.`);
        return;
      }
  
      const buttons = Object.entries(nextOptions).map(([key, value]) =>
        new ButtonBuilder()
          .setCustomId(`trait-select|${encounterId}|${nextTrait}|${key}`)
          .setLabel(`${value} (${customizationCosts[mountType]?.[nextTrait] || 0}t)`)
          .setStyle(ButtonStyle.Primary)
      );
  
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`trait-select|${encounterId}|${nextTrait}|random`)
          .setLabel('Random (0t)')
          .setStyle(ButtonStyle.Secondary)
      );
  
      const actionRows = createActionRows(buttons);
  
      await interaction.followUp({
        embeds: [{
          title: `🎨 Customize Your ${mountType}`,
          description: `🛠️ Select **${nextTrait.replace(/([A-Z])/g, ' $1')}** for your mount`,
          color: 0xAA926A,
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
        }],
        components: actionRows,
        ephemeral: false,
      });
  
    } else {
      const traitDescriptions = Object.entries(encounter.traits)
        .map(([key, value]) => `**${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:** ${value}`)
        .join('\n');
  
      const registerButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`register-mount|${encounterId}`)
          .setLabel('🐴 Name and Register Your Mount!')
          .setStyle(ButtonStyle.Primary)
      );
  
      await interaction.followUp({
        embeds: [{
          title: `${getMountEmoji(mountType)} 🎉 Customization Complete!`,
          description: `🎉 **Here's your ${mountType} mount!**\n\n${traitDescriptions}\n\n💰 **Total Tokens Spent:** ${encounter.totalSpent}\n### Mount Details\n> **Mount Species**: ${mountType}\n> **Rarity**: It's a **${encounter.rarity}** mount!\n> **Mount Level**: ${encounter.mountLevel}\n> **Mount Stamina**: ${encounter.mountStamina}\n> **Village**: ${villageEmojis[encounter.village.toLowerCase()] || ''} ${encounter.village}`,
          color: 0xAA926A,
          thumbnail: { url: getMountThumbnail(mountType) || 'https://example.com/default-thumbnail.png' },
          image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' }
        }],
        components: [registerButton],
      });
    }
  } catch (error) {
    handleError(error, 'mountComponentHandler.js');

    console.error('[mountComponentHandler]: Error during trait selection:', error);
    if (!interaction.replied) {
      await interaction.reply({
        embeds: [{ title: '❌ Error', description: 'Something went wrong. Please try again later.', color: 0xFF0000 }],
        ephemeral: true,
      });
    }
  }
}


// ------------------- Handle Register Mount Modal -------------------
// Displays a modal for naming the mount.
async function handleRegisterMountModal(interaction) {
  try {
    const [ , encounterId ] = interaction.customId.split('|');
    const encounter = getEncounterById(encounterId);
    if (!encounter) {
      console.error(`Encounter not found for ID: ${encounterId}`);
      await interaction.reply({
        embeds: [{ title: '❌ Encounter Not Found', description: 'The encounter could not be found.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
  
    const modal = new ModalBuilder()
      .setCustomId(`mount-name-modal|${encounterId}`)
      .setTitle('Name Your Mount');
  
    const nameInput = new TextInputBuilder()
      .setCustomId('mountName')
      .setLabel('Enter the name for your mount:')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
  
    const actionRow = new ActionRowBuilder().addComponents(nameInput);
    modal.addComponents(actionRow);
  
    await interaction.showModal(modal);
  } catch (error) {
    handleError(error, 'mountComponentHandler.js');

    console.error('[mountComponentHandler]: Error handling mount registration modal:', error);
    if (!interaction.replied) {
      await interaction.reply({
        embeds: [{ title: '❌ Error', description: 'An error occurred while trying to register your mount. Please try again later.', color: 0xFF0000 }],
        ephemeral: true,
      });
    }
  }
}


// ------------------- Handle Mount Name Submission -------------------
// Processes the modal submission for naming and registering a mount.
async function handleMountNameSubmission(interaction) {
  try {
    const [ , encounterId ] = interaction.customId.split('|');
    const mountName = interaction.fields.getTextInputValue('mountName');
    const encounter = getEncounterById(encounterId);
  
    if (!encounter) {
      console.error(`[mountComponentHandler]: Encounter not found for ID: ${encounterId}`);
      await interaction.reply({
        embeds: [{ title: '❌ Encounter Not Found', description: 'The encounter could not be found.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
  
    const userInEncounter = encounter.users.find(user => user.userId === interaction.user.id);
    if (!userInEncounter) {
      console.error(`[mountComponentHandler]: User ${interaction.user.id} is not part of the encounter.`);
      await interaction.reply({
        embeds: [{ title: '❌ Unauthorized', description: 'You are not part of this encounter.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
  
    const characterName = userInEncounter.characterName;
    if (!characterName) {
      console.error(`[mountComponentHandler]: Character name is missing in the encounter data.`);
      await interaction.reply({
        embeds: [{ title: '❌ Character Not Found', description: 'Could not find the character associated with this mount. Please ensure you are properly registered in the encounter.', color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
  
    const character = await Character.findOne({ name: characterName });
    if (!character) {
      console.error(`[mountComponentHandler]: Character not found for name: ${characterName}`);
      await interaction.reply({
        embeds: [{ title: '❌ Character Not Found', description: `Could not find the character "${characterName}" in the database.`, color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
  
    const user = await User.findOne({ discordId: interaction.user.id });
    const tokenCost = 20;
    if (user.tokens < tokenCost) {
      console.warn(`[mountComponentHandler]: Insufficient tokens. Available: ${user.tokens}, Required: ${tokenCost}`);
      await interaction.reply({
        embeds: [{ title: '❌ Insufficient Tokens', description: `You need **${tokenCost} tokens** to register a mount, but you only have **${user.tokens} tokens**.` , color: 0xFF0000 }],
        ephemeral: true,
      });
      return;
    }
  
    user.tokens -= tokenCost;
    await user.save();
    console.info(`[mountComponentHandler]: Tokens deducted successfully. Remaining tokens: ${user.tokens}`);
  
    let sheetLogged = false;
    if (isValidGoogleSheetsUrl(user.tokenTracker)) {
      const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
      const auth = await authorizeSheets();
      const range = 'loggedTracker!B7:F';
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
      const values = [[
        `${mountName} - Mount Registration`,
        interactionUrl,
        'Other',
        'spent',
        `- ${tokenCost}`
      ]];
  
      if (character?.name && character?.inventory && character?.userId) {
    await safeAppendDataToSheet(character.inventory, character, range, values, undefined, { skipValidation: true });
} else {
    console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
}

      sheetLogged = true;
      console.info(`[mountComponentHandler]: Token deduction logged to Google Sheets successfully.`);
    }
  
    const traits = encounter.traits ? Object.entries(encounter.traits).map(([key, value]) => `${key}: ${value}`) : [];
  
    const mountData = {
      discordId: interaction.user.id,
      characterId: character._id,
      species: encounter.mountType,
      level: encounter.mountLevel,
      name: mountName,
      stamina: encounter.mountStamina,
      owner: character.name,
      traits: traits,
      region: encounter.village,
    };
  
    const newMount = new Mount(mountData);
    await newMount.save();
    console.info(`[mountComponentHandler]: Mount "${mountName}" registered successfully for character: ${character.name}`);
  
    character.mount = true;
    await character.save();
    console.info(`[mountComponentHandler]: Mount status updated for character: ${character.name}`);
  
    await interaction.message.edit({ components: [] });
  
    await interaction.reply({
      embeds: [{
        title: `🎉 Mount Registered!`,
        description: `🐴 **Your mount "${mountName}" has been successfully registered to "${character.name}"!**\n\nEnjoy your adventures with your new companion!`,
        color: 0xAA926A,
        thumbnail: { url: getMountThumbnail(encounter.mountType) || 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
      }],
      ephemeral: false,
    });
  } catch (error) {
    handleError(error, 'mountComponentHandler.js');

    console.error('[mountComponentHandler]: Error registering mount:', error);
    await interaction.reply({
      embeds: [{ title: '❌ Registration Failed', description: 'An error occurred while saving the mount. Please try again later.', color: 0xFF0000 }],
      ephemeral: true,
    });
  }
}


// ------------------- Handle View Mount Subcommand -------------------
// Processes the subcommand to view a registered mount.
async function handleViewMount(interaction) {
  const characterName = interaction.options.getString('charactername');
  try {
    const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
    if (!character) {
      return interaction.reply({
        embeds: [{
          title: '❌ Character Not Found',
          description: `We couldn't find a character named **${characterName}** that belongs to you. Please check and try again.`,
          color: 0xFF0000,
        }],
        ephemeral: true,
      });
    }

    // Check if the character's inventory has been synced
    try {
      await checkInventorySync(character);
    } catch (error) {
      await interaction.reply({
        content: error.message,
        ephemeral: true
      });
      return;
    }

    // Check if the user's token tracker is set up
    const user = await User.findOne({ discordId: interaction.user.id });
    if (!user || !user.tokensSynced) {
      return interaction.reply({
        content: `❌ **You cannot use the mount command because your token tracker is not set up yet. Please use the </tokens tokentrackerlink:1306176790095728732> and then </tokens sync:1306176789894266898> commands to set up your token tracker.**`,
        ephemeral: true,
      });
    }
  
    const mount = await Mount.findOne({ characterId: character._id });
    if (!mount) {
      return interaction.reply({
        embeds: [{
          title: '❌ No Mount Registered',
          description: `The character **${character.name}** does not have a registered mount.`,
          color: 0xFF0000,
        }],
        ephemeral: true,
      });
    }

    // ============================================================================
    // ---- Mount Stamina Recovery Logic ----
    // Recovers 1 stamina per day if not used today (regardless of storage status)
    // ============================================================================
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let recovered = false;
    if (mount.currentStamina === null || typeof mount.currentStamina !== 'number') {
      mount.currentStamina = mount.stamina;
      recovered = true;
    } else if (!mount.lastMountTravel || new Date(mount.lastMountTravel).setHours(0,0,0,0) < today.getTime()) {
      // Not used today, recover 1 stamina (up to max)
      if (mount.currentStamina < mount.stamina) {
        mount.currentStamina = Math.min(mount.stamina, mount.currentStamina + 1);
        recovered = true;
      }
      // Update lastMountTravel to today to prevent multiple recoveries in one day
      mount.lastMountTravel = today;
    }
    if (recovered) await mount.save();

    // ============================================================================
    // ---- Mount Stamina Display and Warning ----
    // ============================================================================
    const speciesEmoji = getMountEmoji(mount.species);
    const formattedTraits = mount.traits && mount.traits.length
      ? mount.traits.map(trait => {
          const [key, value] = trait.split(': ');
          const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          return `> **${formattedKey}:** ${value}`;
        }).join('\n')
      : 'No traits available';
    let staminaField = `> ${mount.currentStamina} / ${mount.stamina}`;
    let staminaWarning = '';
    if (mount.currentStamina <= 1) {
      staminaWarning = '\n⚠️ **Warning:** Stamina is low! Mount will not be able to travel if stamina reaches 0.';
    }

    const mountEmbed = new EmbedBuilder()
      .setTitle(`${speciesEmoji} **${mount.name}** - Mount Details`)
      .setDescription(`✨ **Mount Stats for**: **${character.name}**${staminaWarning}`)
      .addFields(
        { name: '🌟 **__Species__**', value: `> ${mount.species || 'Unknown'}`, inline: true },
        { name: '#️⃣ **__Level__**', value: `> ${mount.level || 'Unknown'}`, inline: true },
        { name: '🥕 **__Stamina__**', value: staminaField, inline: true },
        { name: '👤 **__Owner__**', value: `> ${mount.owner || 'Unknown'}`, inline: true },
        { name: '🌍 **__Region__**', value: `> ${mount.region || 'Unknown'}`, inline: true },
        { name: '✨ **__Traits__**', value: formattedTraits, inline: false }
      )
      .setColor(0xAA926A)
      .setThumbnail(getMountThumbnail(mount.species))
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({ text: `${character.name}'s Mount Stats`, iconURL: character.icon })
      .setTimestamp();

    await interaction.reply({
      embeds: [mountEmbed],
      ephemeral: false,
    });
  } catch (error) {
    handleError(error, 'mountComponentHandler.js');

    console.error('[mountComponentHandler]: Error viewing mount:', error);
    await interaction.reply({
      embeds: [{ title: '❌ Error Viewing Mount', description: 'An error occurred while fetching the mount details. Please try again later.', color: 0xFF0000 }],
      ephemeral: true,
    });
  }
}


// ------------------- Export Functions -------------------
// Export core interaction and taming functions for external usage.
module.exports = {
  createActionRows,
  formatEncounterData,
  handleMountComponentInteraction,
  handleMountNameSubmission,
  handlePostTameInteraction,
  handleRegisterMountModal,
  handleTameInteraction,
  handleTraitPaymentInteraction,
  handleTraitSelection,
  handleUseItemInteraction,
  proceedWithRoll,
  trackCharacterInEncounter,
  handleViewMount
};
