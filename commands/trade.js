const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  fetchCharacterByNameAndUserId,
  fetchCharacterByName,
  getCharacterInventoryCollection,
} = require('../database/characterService');
const {
  authorizeSheets,
  appendSheetData,
  isValidGoogleSheetsUrl,
  extractSpreadsheetId,
} = require('../utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');
const ItemModel = require('../models/ItemModel');
const { addItemInventoryDatabase, removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { createTradeEmbed } = require('../embeds/mechanicEmbeds');
const { handleTradeAutocomplete } = require('../handlers/autocompleteHandler');

const DEFAULT_EMOJI = '🔹';
const tradeSessions = {};

/**
 * Retrieves the emoji for a given item name.
 * @param {string} itemName - The name of the item.
 * @returns {string} The emoji for the item.
 */
async function getItemEmoji(itemName) {
  const item = await ItemModel.findOne({ itemName }).select('emoji').exec();
  return item && item.emoji ? item.emoji : DEFAULT_EMOJI;
}

/**
 * Removes circular references from an object.
 * @param {object} obj - The object to process.
 * @param {WeakSet} [seen=new WeakSet()] - A set of seen objects to avoid circular references.
 * @returns {object} The object with circular references removed.
 */
function removeCircularReferences(obj, seen = new WeakSet()) {
  if (obj && typeof obj === 'object') {
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        obj[key] = removeCircularReferences(obj[key], seen);
      }
    }
  }
  return obj;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Trade items between two characters')
    .addStringOption(option =>
      option.setName('fromcharacter')
        .setDescription('Your character name')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('tocharacter')
        .setDescription('Character name you are trading with')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('item1')
        .setDescription('First item to trade')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity1')
        .setDescription('Quantity of the first item')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('item2')
        .setDescription('Second item to trade')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity2')
        .setDescription('Quantity of the second item')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('item3')
        .setDescription('Third item to trade')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity3')
        .setDescription('Quantity of the third item')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('tradeid')
        .setDescription('Trade ID for completing a trade')
        .setRequired(false)
    ),

  async execute(interaction) {
    const characterName = interaction.options.getString('fromcharacter');
    const item1 = interaction.options.getString('item1');
    const quantity1 = interaction.options.getInteger('quantity1');
    const item2 = interaction.options.getString('item2');
    const quantity2 = interaction.options.getInteger('quantity2') || 0;
    const item3 = interaction.options.getString('item3');
    const quantity3 = interaction.options.getInteger('quantity3') || 0;
    const tradingWithName = interaction.options.getString('tocharacter');
    const tradeId = interaction.options.getString('tradeid');
    const userId = interaction.user.id;

    try {
      await interaction.deferReply({ ephemeral: false });

      const fromCharacter = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!fromCharacter) {
        await interaction.editReply({ content: `❌ Character \`${characterName}\` not found or does not belong to you.` });
        return;
      }

      const toCharacter = await fetchCharacterByName(tradingWithName);
      if (!toCharacter || toCharacter.userId === userId) {
        await interaction.editReply({ content: `❌ Character \`${tradingWithName}\` not found or belongs to you.` });
        return;
      }

      // Check if the fromCharacter's inventory has been synced
if (!fromCharacter.inventorySynced) {
  return interaction.editReply({
      content: `❌ **You cannot trade items from \`${characterName}\` because their inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
      ephemeral: true,
  });
}

// Check if the toCharacter's inventory has been synced
if (!toCharacter.inventorySynced) {
  return interaction.editReply({
      content: `❌ **You cannot trade items to \`${tradingWithName}\` because their inventory is not set up yet.**`,
      ephemeral: true,
  });
}


      if (tradeId) {
        // Complete the trade
        const tradeSession = tradeSessions[tradeId];
        if (!tradeSession) {
          await interaction.editReply({ content: `❌ Invalid Trade ID.` });
          return;
        }

        // Verify the trade
        if (tradeSession.tradingWithCharacterName !== characterName) {
          await interaction.editReply({ content: `❌ Character mismatch. Trade ID was initiated with ${tradeSession.tradingWithCharacterName}.` });
          return;
        }

        // Validate items
        const itemArray = [
          { name: item1, quantity: quantity1 },
          { name: item2, quantity: quantity2 },
          { name: item3, quantity: quantity3 },
        ].filter(item => item.name);

        for (let item of itemArray) {
          const equippedItems = [
            fromCharacter.gearWeapon?.name,
            fromCharacter.gearShield?.name,
            fromCharacter.gearArmor?.head?.name,
            fromCharacter.gearArmor?.chest?.name,
            fromCharacter.gearArmor?.legs?.name,
          ];
          if (equippedItems.includes(item.name)) {
            await interaction.editReply({ content: `❌ You cannot trade an item that is currently equipped. Unequip \`${item.name}\` first.` });
            return;
          }
        }

        const characterInventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);
        for (let item of itemArray) {
          const itemInventory = await characterInventoryCollection.findOne({ itemName: { $regex: new RegExp(`^${item.name}$`, 'i') } });
          if (!itemInventory || itemInventory.quantity < item.quantity) {
            await interaction.editReply({ content: `❌ \`${characterName}\` does not have enough \`${item.name} - QTY:${itemInventory ? itemInventory.quantity : 0}\` to trade.` });
            return;
          }
        }

// Adding/removing items to/from inventories
for (let item of itemArray) {
  await removeItemInventoryDatabase(fromCharacter._id, item.name, item.quantity, interaction);  // Pass interaction
  await addItemInventoryDatabase(toCharacter._id, item.name, item.quantity, interaction);  // Pass interaction
}
        const fromItems = await Promise.all(tradeSession.items.map(async item => ({
          name: item.name,
          quantity: item.quantity,
          emoji: await getItemEmoji(item.name)
        })));
        const toItems = await Promise.all(itemArray.map(async item => ({
          name: item.name,
          quantity: item.quantity,
          emoji: await getItemEmoji(item.name)
        })));

        const fromCharacterIcon = fromCharacter.gearWeapon?.iconURL || '';
        const toCharacterIcon = tradeSession.character.gearWeapon?.iconURL || '';

        const updatedEmbedData = await createTradeEmbed(
          tradeSession.character,
          fromCharacter,
          fromItems,
          toItems,
          interaction.url,
          fromCharacterIcon,
          toCharacterIcon
        );

        // Update the embed description to the trade complete message
        updatedEmbedData.setDescription(`✅ Trade between **${fromCharacter.name}** and **${toCharacter.name}** has been complete!`);

        try {
          await tradeSession.tradeMessage.edit({
            content: `.`,
            embeds: [updatedEmbedData],
            components: []
          });
        } catch (error) {
          console.error('❌ Error editing trade message:', error);
        }

        const fromInventoryLink = fromCharacter.inventory || fromCharacter.inventoryLink;
        const toInventoryLink = tradeSession.character.inventory || tradeSession.character.inventoryLink;

        if (!isValidGoogleSheetsUrl(fromInventoryLink) || !isValidGoogleSheetsUrl(toInventoryLink)) {
          await interaction.editReply({ content: `❌ Invalid or missing Google Sheets URL for character inventory.` });
          return;
        }

        const fromSpreadsheetId = extractSpreadsheetId(fromInventoryLink);
        const toSpreadsheetId = extractSpreadsheetId(toInventoryLink);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const uniqueSyncId = uuidv4();
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

        const appendData = async (character, itemName, quantity, action, spreadsheetId) => {
          const itemInventory = await characterInventoryCollection.findOne({ itemName: { $regex: new RegExp(`^${itemName}$`, 'i') } });
          const category = itemInventory && itemInventory.category ? (Array.isArray(itemInventory.category) ? itemInventory.category.join(', ') : itemInventory.category) : '';
          const type = itemInventory && itemInventory.type ? (Array.isArray(itemInventory.type) ? itemInventory.type.join(', ') : itemInventory.type) : '';
          const subtype = itemInventory && itemInventory.subtype ? (Array.isArray(itemInventory.subtype) ? itemInventory.subtype.join(', ') : itemInventory.subtype) : '';

          const values = [
            [
              character.name,
              itemName,
              quantity.toString(),
              category,
              type,
              subtype,
              action,
              character.job,
              '',
              character.currentVillage,
              interactionUrl,
              formattedDateTime,
              uniqueSyncId,
            ],
          ];
          await appendSheetData(auth, spreadsheetId, range, values);
        };

        for (let item of tradeSession.items) {
          await appendData(tradeSession.character, item.name, -item.quantity, `Trade to ${fromCharacter.name}`, toSpreadsheetId);
          await appendData(fromCharacter, item.name, item.quantity, `Trade with ${tradeSession.character.name}`, fromSpreadsheetId);
        }

        for (let item of itemArray) {
          await appendData(fromCharacter, item.name, -item.quantity, `Trade to ${tradeSession.character.name}`, fromSpreadsheetId);
          await appendData(tradeSession.character, item.name, item.quantity, `Trade with ${fromCharacter.name}`, toSpreadsheetId);
        }

        delete tradeSessions[tradeId];

        await interaction.editReply({ content: `✅ Trade Complete ✅` });

      } else {
        // Initiate a new trade
        const itemArray = [
          { name: item1, quantity: quantity1 },
          { name: item2, quantity: quantity2 },
          { name: item3, quantity: quantity3 },
        ].filter(item => item.name);

        for (let item of itemArray) {
          const equippedItems = [
            fromCharacter.gearWeapon?.name,
            fromCharacter.gearShield?.name,
            fromCharacter.gearArmor?.head?.name,
            fromCharacter.gearArmor?.chest?.name,
            fromCharacter.gearArmor?.legs?.name,
          ];
          if (equippedItems.includes(item.name)) {
            await interaction.editReply({ content: `❌ You cannot trade an item that is currently equipped. Unequip \`${item.name}\` first.` });
            return;
          }
        }

        if (fromCharacter.currentVillage.trim().toLowerCase() !== toCharacter.currentVillage.trim().toLowerCase()) {
          await interaction.editReply({ content: `❌ Both characters must be in the same village to perform the trade. ${fromCharacter.name} is currently in ${fromCharacter.currentVillage} and ${toCharacter.name} is currently in ${toCharacter.currentVillage}.` });
          return;
        }

        const characterInventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);
        for (let item of itemArray) {
          const itemInventory = await characterInventoryCollection.findOne({
            itemName: { $regex: new RegExp(`^${item.name}$`, 'i') },
          });
          if (!itemInventory || itemInventory.quantity < item.quantity) {
            await interaction.editReply({
              content: `❌ \`${characterName}\` does not have enough \`${item.name} - QTY:${itemInventory ? itemInventory.quantity : 0}\` to trade.`,
            });
            return;
          }
        }

        const shortTradeId = uuidv4().split('-')[0]; // Generate short trade ID
        const fromItems = await Promise.all(itemArray.map(async item => ({
          name: item.name,
          quantity: item.quantity,
          emoji: await getItemEmoji(item.name)
        })));

        const tradeEmbedData = await createTradeEmbed(
          fromCharacter,
          toCharacter,
          fromItems,
          [],
          interaction.url,
          fromCharacter.gearWeapon?.iconURL || '',
          toCharacter.gearWeapon?.iconURL || ''
        );

        await interaction.editReply({
          content: `🔃 <@${toCharacter.userId}>, use the \`/trade\` command to copy and paste the below trade ID into the \`tradeid\` field of the command to complete the trade\n\n\`\`\`${shortTradeId}\`\`\``,
          embeds: [tradeEmbedData]
        });

        const tradeMessage = await interaction.fetchReply();

        tradeSessions[shortTradeId] = {
          character: fromCharacter,
          tradingWithCharacterName: toCharacter.name,
          items: itemArray,
          tradeMessage,
        };

        // Set a timeout for the trade session
        setTimeout(async () => {
          const tradeSession = tradeSessions[shortTradeId];
          if (tradeSession) {
            try {
              await tradeSession.tradeMessage.edit({
                content: `⏳ 15 minutes have passed, and the trade between ${tradeSession.character.name} and ${toCharacter.name} has expired. It has been canceled. <@${interaction.user.id}>, please use the command again if you want to continue the trade with <@${toCharacter.userId}>.`,
                embeds: [],
                components: []
              });
            } catch (error) {
              console.error('❌ Error editing trade message:', error);
            }
            delete tradeSessions[shortTradeId];
          }
        }, 900000); // 15 minutes
      }

    } catch (error) {
      console.error('❌ Error executing trade command:', error);
      try {
        await interaction.editReply({ content: '❌ An error occurred while trying to execute the trade.' });
      } catch (replyError) {
        console.error('❌ Error sending follow-up message:', replyError);
      }
    }
  },

  async autocomplete(interaction) {
    await handleTradeAutocomplete(interaction);
  },
};

// Handler for button interactions
module.exports.buttonHandler = async (interaction) => {
  if (interaction.customId.startsWith('completeTrade-')) {
    const tradeSessionId = interaction.customId.split('-')[1];
    const tradeSession = tradeSessions[tradeSessionId];

    if (!tradeSession) {
      await interaction.reply({ content: `❌ Invalid or expired trade session.`, ephemeral: true });
      return;
    }

    const { character, tradingWithCharacterName, items } = tradeSession;
    const userId = interaction.user.id;
    const userCharacter = await fetchCharacterByNameAndUserId(tradingWithCharacterName, userId);

    if (!userCharacter) {
      await interaction.reply({ content: `❌ Character not found or does not belong to you.`, ephemeral: true });
      return;
    }

    const characterInventoryCollection = await getCharacterInventoryCollection(userCharacter.name);
    for (let item of items) {
      const itemInventory = await characterInventoryCollection.findOne({ itemName: { $regex: new RegExp(`^${item.name}$`, 'i') } });
      if (!itemInventory || itemInventory.quantity < item.quantity) {
        await interaction.reply({ content: `❌ \`${userCharacter.name}\` does not have enough \`${item.name} - QTY:${itemInventory ? itemInventory.quantity : 0}\` to trade.`, ephemeral: true });
        return;
      }
    }

    // Remove items from both users' inventories and add to respective other
    for (let item of items) {
      await removeItemInventoryDatabase(character._id, item.name, item.quantity, interaction);
      await addItemInventoryDatabase(userCharacter._id, item.name, item.quantity, '', '', removeCircularReferences(interaction), 'trade');
    }

    for (let item of items) {
      await removeItemInventoryDatabase(userCharacter._id, item.name, item.quantity, interaction);
      await addItemInventoryDatabase(character._id, item.name, item.quantity, '', '', removeCircularReferences(interaction), 'trade');
    }

    const fromItems = await Promise.all(items.map(async item => ({
      name: item.name,
      quantity: item.quantity,
      emoji: await getItemEmoji(item.name)
    })));
    const toItems = await Promise.all(items.map(async item => ({
      name: item.name,
      quantity: item.quantity,
      emoji: await getItemEmoji(item.name)
    })));

    const fromCharacterIcon = character.gearWeapon?.iconURL || '';
    const toCharacterIcon = userCharacter.gearWeapon?.iconURL || '';

    const updatedEmbedData = await createTradeEmbed(
      character,
      userCharacter,
      fromItems,
      toItems,
      interaction.url,
      fromCharacterIcon,
      toCharacterIcon
    );

    // Update the embed description to the trade complete message
    updatedEmbedData.setDescription(`✅ Trade between **${character.name}** and **${userCharacter.name}** has been complete!`);

    try {
      await tradeSession.tradeMessage.edit({
        content: `.`,
        embeds: [updatedEmbedData],
        components: []
      });
    } catch (error) {
      console.error('❌ Error editing trade message:', error);
    }

    delete tradeSessions[tradeSessionId];
    await interaction.followUp({ content: `✅ Trade completed successfully!` });
  }
};

/* 
Notes:
1. Fixed error related to setting the description to an empty string.
2. Added the message "Trade between fromcharacter and tocharacter has been complete!" upon trade completion.
3. Updated the embed message to reflect the same.
4. Organized imports and functions for better readability.
5. Improved error handling and logging messages.
*/
