// ------------------- Gear Command Module -------------------
// This module handles displaying, equipping, or unequipping gear for a character.


// ------------------- Discord.js Components -------------------
// Import Discord.js classes for building slash commands.
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');


const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { escapeRegExp } = require('@/utils/inventoryUtils.js');
// ------------------- Database Services -------------------
// Import character-related database services for fetching and updating character data.
const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId, getCharacterInventoryCollection, updateCharacterById, updateModCharacterById } = require('@/database/db.js');


// ------------------- Database Models -------------------
// Import the Item model for fetching item details.
const ItemModel = require('@/models/ItemModel.js');


// ------------------- Embeds -------------------
// Import the embed utility for displaying character gear.
const { createCharacterGearEmbed } = require('../../embeds/embeds.js');


// ------------------- Modules -------------------
// Import character stats modules for updating defense and attack.
const { updateCharacterDefense, updateCharacterAttack } = require('../../modules/characterStatsModule.js');
const { checkInventorySync } = require('@/utils/characterUtils.js');
const { addItemInventoryDatabase } = require('@/utils/inventoryUtils.js');
const logger = require('@/utils/logger');


// ------------------- Command Definition -------------------
// Defines the slash command for managing character gear.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('gear')
    .setDescription('Displays current gear, equips, or unequips gear of a character.')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('The type of gear to display, equip, or unequip')
        .setRequired(true)
        .addChoices(
          { name: 'Head', value: 'head' },
          { name: 'Chest', value: 'chest' },
          { name: 'Legs', value: 'legs' },
          { name: 'Weapon', value: 'weapon' },
          { name: 'Shield', value: 'shield' }
        ))
    .addStringOption(option =>
      option.setName('itemname')
        .setDescription('The name of the item to equip (leave empty to view current gear)')
        .setRequired(false)
        .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('status')
            .setDescription('Choose to equip or unequip the item (leave empty to view current gear)')
            .setRequired(false)
            .addChoices(
              { name: 'Equip', value: 'equip' },
              { name: 'Unequip', value: 'unequip' }
            )),
        

  // ------------------- Command Execution Logic -------------------
  // This function handles equipping and unequipping gear for a character.
  async execute(interaction) {
    try {
      // ------------------- Extract Command Options -------------------
      // Retrieve options provided by the user.
      const characterName = interaction.options.getString('charactername');
      const type = interaction.options.getString('type');
      const itemNameRaw = interaction.options.getString('itemname');
      const status = interaction.options.getString('status');

      // Debug: Log what we received from Discord
      logger.debug('GEAR', `Raw interaction data - itemNameRaw: "${itemNameRaw}"`);
      logger.debug('GEAR', `itemNameRaw type: ${typeof itemNameRaw}`);
      logger.debug('GEAR', `itemNameRaw length: ${itemNameRaw ? itemNameRaw.length : 0}`);
      logger.debug('GEAR', `itemNameRaw char codes: ${itemNameRaw ? Array.from(itemNameRaw).map(c => c.charCodeAt(0)).join(', ') : 'null'}`);

      // ------------------- Clean Item Name from Copy-Paste -------------------
      // Remove quantity information from item names if users copy-paste autocomplete text
      const itemName = itemNameRaw ? itemNameRaw.replace(/\s*\(Qty:\s*\d+\)/i, '').trim() : null;

      logger.debug('GEAR', `After processing - itemName: "${itemName}"`);
      logger.debug('GEAR', `itemName type: ${typeof itemName}`);
      logger.debug('GEAR', `itemName length: ${itemName ? itemName.length : 0}`);
      logger.debug('GEAR', `itemName char codes: ${itemName ? Array.from(itemName).map(c => c.charCodeAt(0)).join(', ') : 'null'}`);
      logger.debug('GEAR', `itemName includes '+': ${itemName ? itemName.includes('+') : 'null'}`);

      // Validate status
      if (status && status !== 'equip' && status !== 'unequip') {
        await interaction.editReply({
          content: `❌ **Invalid status selected. Please choose either "Equip" or "Unequip".**`,
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const userId = interaction.user.id;

      // ------------------- Acknowledge Interaction -------------------
      // Defer reply to avoid timeout.
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      // ------------------- Fetch Character Details -------------------
      let character = await fetchCharacterByNameAndUserId(characterName, userId);
      
      // If not found as regular character, try as mod character
      if (!character) {
        character = await fetchModCharacterByNameAndUserId(characterName, userId);
      }
      
      if (!character) {
        await interaction.editReply({ content: `❌ **Character ${characterName} not found or does not belong to you.**`, flags: [MessageFlags.Ephemeral] });
        return;
      }

      // ------------------- Check Inventory Sync -------------------
      try {
        await checkInventorySync(character);
      } catch (error) {
        await interaction.editReply({
          content: error.message,
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      // ------------------- Handle Unequipping Gear -------------------
      if (status === 'unequip') {
        let unequippedItemName = null;
        const update = {};
        if (['head', 'chest', 'legs'].includes(type)) {
          unequippedItemName = character.gearArmor?.[type]?.name ?? null;
          update[`gearArmor.${type}`] = 1;
        } else if (type === 'weapon') {
          unequippedItemName = character.gearWeapon?.name ?? null;
          update['gearWeapon'] = 1;
        } else if (type === 'shield') {
          unequippedItemName = character.gearShield?.name ?? null;
          update['gearShield'] = 1;
        }

        const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
        await updateFunction(character._id, { $unset: update });
        await updateCharacterDefense(character._id);
        await updateCharacterAttack(character._id);

        if (unequippedItemName) {
          const unequipInvCollection = await getCharacterInventoryCollection(character.name);
          const unequipCharFilter = {
            $or: [
              { characterId: character._id },
              { characterId: null },
              { characterId: { $exists: false } }
            ]
          };
          const existingAfterUnequip = await unequipInvCollection.findOne({
            $and: [
              unequipCharFilter,
              unequippedItemName.includes('+')
                ? { itemName: unequippedItemName }
                : { itemName: { $regex: new RegExp(`^${escapeRegExp(unequippedItemName)}$`, 'i') } },
              { quantity: { $gt: 0 } }
            ]
          });
          if (!existingAfterUnequip) {
            try {
              await addItemInventoryDatabase(character._id, unequippedItemName, 1, interaction, 'Unequipped (restored)');
            } catch (addErr) {
              logger.warn('GEAR', `Could not restore unequipped item ${unequippedItemName} to inventory: ${addErr.message}`);
            }
          }
        }

        // Fetch the updated character details.
        let updatedCharacter = await fetchCharacterByNameAndUserId(characterName, userId);
        
        // If not found as regular character, try as mod character
        if (!updatedCharacter) {
          updatedCharacter = await fetchModCharacterByNameAndUserId(characterName, userId);
        }

        // Retrieve updated item details from the item database.
        const updatedItemDetails = await ItemModel.find({
          itemName: {
            $in: [
              updatedCharacter.gearWeapon?.name,
              updatedCharacter.gearShield?.name,
              updatedCharacter.gearArmor?.head?.name,
              updatedCharacter.gearArmor?.chest?.name,
              updatedCharacter.gearArmor?.legs?.name
            ].filter(Boolean)
          }
        });

        // Map gear to display in the embed.
        const updatedGearMap = {
          head: updatedCharacter.gearArmor?.head
            ? `> ${updatedCharacter.gearArmor.head.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.head.name)?.modifierHearts || 0}]`
            : '> N/A',
          chest: updatedCharacter.gearArmor?.chest
            ? `> ${updatedCharacter.gearArmor.chest.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.chest.name)?.modifierHearts || 0}]`
            : '> N/A',
          legs: updatedCharacter.gearArmor?.legs
            ? `> ${updatedCharacter.gearArmor.legs.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.legs.name)?.modifierHearts || 0}]`
            : '> N/A',
          weapon: updatedCharacter.gearWeapon
            ? `> ${updatedCharacter.gearWeapon.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearWeapon.name)?.modifierHearts || 0}]`
            : '> N/A',
          shield: updatedCharacter.gearShield
            ? `> ${updatedCharacter.gearShield.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearShield.name)?.modifierHearts || 0}]`
            : '> N/A',
        };

        // Create and send the updated gear embed.
        const gearEmbed = createCharacterGearEmbed(updatedCharacter, updatedGearMap, type);
        await interaction.editReply({ content: `✅ **${type.charAt(0).toUpperCase() + type.slice(1)} has been unequipped from ${characterName}.**`, embeds: [gearEmbed], flags: [MessageFlags.Ephemeral] });
        return;
      }

      // ------------------- Handle Equipping Gear -------------------
      // If equipping, ensure the character's equipped weapon has the correct type.
      if (character.gearWeapon && typeof character.gearWeapon.type === 'undefined') {
        const weaponDetail = await ItemModel.findOne({ itemName: character.gearWeapon.name });
        if (weaponDetail) {
          character.gearWeapon.type = weaponDetail.type;
        }
      }

      // ------------------- Handle Lookup Only (No Item Name Provided) -------------------
      // If no item name is provided, just show current gear
      if (!itemName) {
        // Retrieve current gear details from the item database
        const currentItemDetails = await ItemModel.find({
          itemName: {
            $in: [
              character.gearWeapon?.name,
              character.gearShield?.name,
              character.gearArmor?.head?.name,
              character.gearArmor?.chest?.name,
              character.gearArmor?.legs?.name
            ].filter(Boolean)
          }
        });

        // Map current gear to display in the embed
        const currentGearMap = {
          head: character.gearArmor?.head
            ? `> ${character.gearArmor.head.name} [+${currentItemDetails.find(i => i.itemName === character.gearArmor.head.name)?.modifierHearts || 0}]`
            : '> N/A',
          chest: character.gearArmor?.chest
            ? `> ${character.gearArmor.chest.name} [+${currentItemDetails.find(i => i.itemName === character.gearArmor.chest.name)?.modifierHearts || 0}]`
            : '> N/A',
          legs: character.gearArmor?.legs
            ? `> ${character.gearArmor.legs.name} [+${currentItemDetails.find(i => i.itemName === character.gearArmor.legs.name)?.modifierHearts || 0}]`
            : '> N/A',
          weapon: character.gearWeapon
            ? `> ${character.gearWeapon.name} [+${currentItemDetails.find(i => i.itemName === character.gearWeapon.name)?.modifierHearts || 0}]`
            : '> N/A',
          shield: character.gearShield
            ? `> ${character.gearShield.name} [+${currentItemDetails.find(i => i.itemName === character.gearShield.name)?.modifierHearts || 0}]`
            : '> N/A',
        };

        // Create and send the gear lookup embed
        const gearEmbed = createCharacterGearEmbed(character, currentGearMap, type);
        await interaction.editReply({ 
          content: `📋 **Current gear for ${characterName}:**`, 
          embeds: [gearEmbed], 
          flags: [MessageFlags.Ephemeral] 
        });
        return;
      }

      // ------------------- Validate Item in Inventory -------------------
      // Debug: Log the itemName at this point
      logger.debug('GEAR', `About to validate inventory - itemName: "${itemName}"`);
      logger.debug('GEAR', `itemName includes '+': ${itemName ? itemName.includes('+') : 'null'}`);
      logger.debug('GEAR', `itemName type: ${typeof itemName}`);
      logger.debug('GEAR', `itemName length: ${itemName ? itemName.length : 0}`);
      logger.debug('GEAR', `itemName char codes: ${itemName ? Array.from(itemName).map(c => c.charCodeAt(0)).join(', ') : 'null'}`);
      
      // Retrieve character inventory and ensure the item exists.
      // Include items without characterId (legacy items - collection is per-character so all items belong to this char)
      const charInventoryFilter = {
        $or: [
          { characterId: character._id },
          { characterId: null },
          { characterId: { $exists: false } }
        ]
      };
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      let inventoryItems;
      if (itemName.includes('+')) {
        logger.debug('INVENTORY', `Using exact match for itemName with +: "${itemName}"`);
        inventoryItems = await inventoryCollection.find({
          $and: [charInventoryFilter, { itemName: itemName }]
        }).toArray();
      } else {
        logger.debug('INVENTORY', `Using regex match for itemName without +: "${itemName}"`);
        inventoryItems = await inventoryCollection.find({
          $and: [
            charInventoryFilter,
            { itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } }
          ]
        }).toArray();
      }
      if (!inventoryItems.length) {
        await interaction.editReply({ 
          embeds: [new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Item Not Found')
            .setDescription(`The item "${itemName}" was not found in ${characterName}'s inventory.`)
            .addFields(
              { name: '🔍 What Happened', value: 'The system could not find the specified item in your character\'s inventory.' },
              { name: '💡 How to Fix', value: '• Check if the item name is spelled correctly\n• Make sure you have the item in your inventory\n• Use `/inventory view` to check your current inventory' }
            )
            .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
            .setFooter({ text: 'Inventory Validation' })
            .setTimestamp()],
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }

      // ------------------- Fetch Item Details -------------------
      // Get item details from the item database.
      let itemDetail;
      if (itemName.includes('+')) {
        itemDetail = await ItemModel.findOne({ itemName: itemName });
      } else {
        itemDetail = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } });
      }
      if (!itemDetail) {
        await interaction.editReply({ content: `❌ **Item ${itemName} not found in the item database.**`, flags: [MessageFlags.Ephemeral] });
        return;
      }

      let unequippedMessage = ''; // To track any gear that was automatically unequipped due to conflicts.

      // ------------------- Determine Update Function Based on Character Type -------------------
      // Use the appropriate update function based on whether this is a mod character
      const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;

      // ------------------- Validate Equipment Type and Slot -------------------
      // Check if the item can be equipped in the selected slot.
      logger.debug('VALIDATION', `Validating item - ${itemName}, Category: ${JSON.stringify(itemDetail.category)}, Type: ${JSON.stringify(itemDetail.type)}, Slot: ${type}`);

      const categories = Array.isArray(itemDetail.category) ? itemDetail.category.map(c => c.toLowerCase()) : [];
      const types = Array.isArray(itemDetail.type) ? itemDetail.type.map(t => t.toLowerCase()) : [];

      if (['head', 'chest', 'legs'].includes(type)) {
        if (!categories.includes('armor') || !types.includes(type)) {
          logger.debug('VALIDATION', `Item mismatch - Expected Armor with ${type}, got: Category: ${categories}, Type: ${types}`);
          await interaction.editReply({ content: `❌ **${itemName} is an ${types.join(', ') || 'unknown'} item and cannot be equipped to the ${type} slot!**`, flags: [MessageFlags.Ephemeral] });
          return;
        }
      } else if (type === 'weapon') {
        if (!categories.includes('weapon')) {
          logger.debug('VALIDATION', `Item mismatch - Expected Weapon, got: ${categories}`);
          await interaction.editReply({ content: `❌ **${itemName} is not a weapon and cannot be equipped to the weapon slot.**`, flags: [MessageFlags.Ephemeral] });
          return;
        }
      } else if (type === 'shield') {
        const categories = Array.isArray(itemDetail.category) ? itemDetail.category.map(c => c.toLowerCase()) : [];
        const subtypes = Array.isArray(itemDetail.subtype) ? itemDetail.subtype.map(s => s.toLowerCase()) : [itemDetail.subtype?.toLowerCase()];
        const isShield = categories.includes('shield') || subtypes.includes('shield');
      
        if (!isShield) {
          logger.debug('VALIDATION', `Item mismatch - Expected Shield, got Category: ${categories}, Subtype: ${subtypes}`);
          await interaction.editReply({ content: `❌ **${itemName} is not recognized as a shield and cannot be equipped to the shield slot.**`, flags: [MessageFlags.Ephemeral] });
          return;
        }      
      } else {
        logger.debug('VALIDATION', `Invalid slot type detected - ${type}`);
        await interaction.editReply({ content: `❌ **Invalid slot type selected for equipping ${itemName}.**`, flags: [MessageFlags.Ephemeral] });
        return;
      }

      // ------------------- Handle Conflicting Gear Logic -------------------
      // If equipping a 2h weapon or shield, ensure conflicting gear is unequipped.
      if (type === 'weapon' || type === 'shield') {
        if (itemDetail.type.includes('2h')) {
          if (character.gearWeapon) {
            await updateFunction(character._id, { $unset: { gearWeapon: 1 } });
            unequippedMessage += 'Your existing weapon has been unequipped because you cannot have a 2h weapon and another weapon equipped. ';
          }
          if (character.gearShield) {
            await updateFunction(character._id, { $unset: { gearShield: 1 } });
            unequippedMessage += 'Your shield has been unequipped because you cannot have a 2h weapon and a shield equipped. ';
          }
        } else if (itemDetail.subtype?.includes('shield')) {
          if (character.gearWeapon?.type?.includes('2h')) {
            await updateFunction(character._id, { $unset: { gearWeapon: 1 } });
            unequippedMessage += 'Your 2h weapon has been unequipped because you cannot have a shield and a 2h weapon equipped. ';
          }
        } else if (itemDetail.type.includes('1h')) {
          if (character.gearWeapon?.type?.includes('2h')) {
            await updateFunction(character._id, { $unset: { gearWeapon: 1 } });
            unequippedMessage += 'Your 2h weapon has been unequipped because you cannot have a 1h weapon and a 2h weapon equipped. ';
          }
        }
      }

      // ------------------- Equip Item Logic -------------------
      // Update the character's gear based on the selected slot.
      // Use the appropriate update function based on character type
      if (['head', 'chest', 'legs'].includes(type)) {
        const modifierHearts = Number(itemDetail.modifierHearts) || 0;
        // Explicitly preserve other slots (Mongoose subdocs may not spread correctly)
        const ga = character.gearArmor || {};
        const updatedGearArmor = {
          head: type === 'head' ? { name: itemName, stats: { modifierHearts } } : (ga.head ? { name: ga.head.name, stats: ga.head.stats || {} } : null),
          chest: type === 'chest' ? { name: itemName, stats: { modifierHearts } } : (ga.chest ? { name: ga.chest.name, stats: ga.chest.stats || {} } : null),
          legs: type === 'legs' ? { name: itemName, stats: { modifierHearts } } : (ga.legs ? { name: ga.legs.name, stats: ga.legs.stats || {} } : null),
        };

        // Ensure all equipped armor exists in inventory (fixes "armor equipped but not in inventory")
        const charInvFilter = {
          $or: [
            { characterId: character._id },
            { characterId: null },
            { characterId: { $exists: false } }
          ]
        };
        for (const slot of ['head', 'chest', 'legs']) {
          const armorItem = updatedGearArmor[slot];
          if (armorItem?.name) {
            const existingInInventory = await inventoryCollection.findOne({
              $and: [
                charInvFilter,
                { itemName: { $regex: new RegExp(`^${escapeRegExp(armorItem.name)}$`, 'i') } },
                { quantity: { $gt: 0 } }
              ]
            });
            if (!existingInInventory) {
              try {
                await addItemInventoryDatabase(character._id, armorItem.name, 1, interaction, 'Starting gear (restored)');
              } catch (addErr) {
                logger.warn('GEAR', `Could not ensure armor ${armorItem.name} in inventory: ${addErr.message}`);
              }
            }
          }
        }

        logger.debug('CHARACTER', `Updating gearArmor - Slot: ${type}, Item: ${itemName}`);
        await updateFunction(character._id, { gearArmor: updatedGearArmor });
      } else if (type === 'weapon') {
        const modifierHearts = Number(itemDetail.modifierHearts) || 0;
        logger.debug('CHARACTER', `Updating gearWeapon - Item: ${itemName}`);
        await updateFunction(character._id, { gearWeapon: { name: itemName, stats: { modifierHearts }, type: itemDetail.type } });
        const charInvFilterWeapon = {
          $or: [
            { characterId: character._id },
            { characterId: null },
            { characterId: { $exists: false } }
          ]
        };
        const existingWeapon = await inventoryCollection.findOne({
          $and: [
            charInvFilterWeapon,
            itemName.includes('+') ? { itemName } : { itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } },
            { quantity: { $gt: 0 } }
          ]
        });
        if (!existingWeapon) {
          try {
            await addItemInventoryDatabase(character._id, itemName, 1, interaction, 'Starting gear (restored)');
          } catch (addErr) {
            logger.warn('GEAR', `Could not ensure weapon ${itemName} in inventory: ${addErr.message}`);
          }
        }
      } else if (type === 'shield') {
        const modifierHearts = Number(itemDetail.modifierHearts) || 0;
        logger.debug('CHARACTER', `Updating gearShield - Item: ${itemName}`);
        await updateFunction(character._id, { gearShield: { name: itemName, stats: { modifierHearts }, subtype: itemDetail.subtype } });
        const charInvFilterShield = {
          $or: [
            { characterId: character._id },
            { characterId: null },
            { characterId: { $exists: false } }
          ]
        };
        const existingShield = await inventoryCollection.findOne({
          $and: [
            charInvFilterShield,
            itemName.includes('+') ? { itemName } : { itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } },
            { quantity: { $gt: 0 } }
          ]
        });
        if (!existingShield) {
          try {
            await addItemInventoryDatabase(character._id, itemName, 1, interaction, 'Starting gear (restored)');
          } catch (addErr) {
            logger.warn('GEAR', `Could not ensure shield ${itemName} in inventory: ${addErr.message}`);
          }
        }
      }

      // ------------------- Recalculate Character Stats -------------------
      // Update defense and attack values after equipping the gear.
      logger.debug('CHARACTER', `Recalculating stats for character: ${character.name}`);
      await updateCharacterDefense(character._id);
      await updateCharacterAttack(character._id);

      // ------------------- Fetch Updated Character and Gear Details -------------------
      let updatedCharacter = await fetchCharacterByNameAndUserId(characterName, userId);
      
      // If not found as regular character, try as mod character
      if (!updatedCharacter) {
        updatedCharacter = await fetchModCharacterByNameAndUserId(characterName, userId);
      }
      
      if (!updatedCharacter) {
        await interaction.editReply({ content: `❌ **Character ${characterName} not found after update.**`, flags: [MessageFlags.Ephemeral] });
        return;
      }
      
      const updatedItemDetails = await ItemModel.find({
        itemName: {
          $in: [
            updatedCharacter.gearWeapon?.name,
            updatedCharacter.gearShield?.name,
            updatedCharacter.gearArmor?.head?.name,
            updatedCharacter.gearArmor?.chest?.name,
            updatedCharacter.gearArmor?.legs?.name
          ].filter(Boolean)
        }
      });

      // Map the updated gear for embed display.
      const updatedGearMap = {
        head: updatedCharacter.gearArmor?.head
          ? `> ${updatedCharacter.gearArmor.head.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.head.name)?.modifierHearts || 0}]`
          : '> N/A',
        chest: updatedCharacter.gearArmor?.chest
          ? `> ${updatedCharacter.gearArmor.chest.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.chest.name)?.modifierHearts || 0}]`
          : '> N/A',
        legs: updatedCharacter.gearArmor?.legs
          ? `> ${updatedCharacter.gearArmor.legs.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.legs.name)?.modifierHearts || 0}]`
          : '> N/A',
        weapon: updatedCharacter.gearWeapon
          ? `> ${updatedCharacter.gearWeapon.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearWeapon.name)?.modifierHearts || 0}]`
          : '> N/A',
        shield: updatedCharacter.gearShield
          ? `> ${updatedCharacter.gearShield.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearShield.name)?.modifierHearts || 0}]`
          : '> N/A',
      };

      // ------------------- Create and Send Gear Embed -------------------
      logger.debug('CHARACTER', `Generating gear embed for ${character.name}`);
      const gearEmbed = createCharacterGearEmbed(updatedCharacter, updatedGearMap, type);
      await interaction.editReply({ content: `✅ **${itemName} has been equipped to the ${type} slot for ${characterName}.** ${unequippedMessage}`, embeds: [gearEmbed], flags: [MessageFlags.Ephemeral] });
    } catch (error) {
      await handleInteractionError(error, interaction, {
        source: 'gear.js',
        characterName: interaction.options?.getString('charactername'),
        itemName: interaction.options?.getString('itemname'),
        type: interaction.options?.getString('type'),
        status: interaction.options?.getString('status')
      });
    }
  }
};
