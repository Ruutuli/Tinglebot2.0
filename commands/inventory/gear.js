// ------------------- Gear Command Module -------------------
// This module handles displaying, equipping, or unequipping gear for a character.


// ------------------- Discord.js Components -------------------
// Import Discord.js classes for building slash commands.
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');


const { handleError } = require('../../utils/globalErrorHandler.js');
// ------------------- Database Services -------------------
// Import character-related database services for fetching and updating character data.
const { fetchCharacterByNameAndUserId, getCharacterInventoryCollection, updateCharacterById } = require('../../database/db.js');


// ------------------- Database Models -------------------
// Import the Item model for fetching item details.
const ItemModel = require('../../models/ItemModel.js');


// ------------------- Embeds -------------------
// Import the embed utility for displaying character gear.
const { createCharacterGearEmbed } = require('../../embeds/embeds.js');


// ------------------- Modules -------------------
// Import character stats modules for updating defense and attack.
const { updateCharacterDefense, updateCharacterAttack } = require('../../modules/characterStatsModule.js');
const { checkInventorySync } = require('../../utils/characterUtils.js');


// ------------------- Command Definition -------------------
// Defines the slash command for managing character gear.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('gear')
    .setDescription('Displays, equips, or unequips gear of a character.')
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
        .setDescription('The name of the item to equip')
        .setRequired(false)
        .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('status')
            .setDescription('Choose to equip or unequip the item')
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
      const itemName = interaction.options.getString('itemname');
      const status = interaction.options.getString('status');

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
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
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
        // Build the update object based on the gear slot.
        const update = {};
        if (['head', 'chest', 'legs'].includes(type)) {
          update[`gearArmor.${type}`] = null;
        } else if (type === 'weapon') {
          update['gearWeapon'] = null;
        } else if (type === 'shield') {
          update['gearShield'] = null;
        }

        // Update the character by unequipping the selected gear.
        await updateCharacterById(character._id, { $unset: update });
        // Recalculate character stats after gear removal.
        await updateCharacterDefense(character._id);
        await updateCharacterAttack(character._id);

        // Fetch the updated character details.
        const updatedCharacter = await fetchCharacterByNameAndUserId(characterName, userId);

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

      // ------------------- Validate Item in Inventory -------------------
      // Retrieve character inventory and ensure the item exists.
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventoryItems = await inventoryCollection.find({ characterId: character._id, itemName }).toArray();
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
      const itemDetail = await ItemModel.findOne({ itemName });
      if (!itemDetail) {
        await interaction.editReply({ content: `❌ **Item ${itemName} not found in the item database.**`, flags: [MessageFlags.Ephemeral] });
        return;
      }

      let unequippedMessage = ''; // To track any gear that was automatically unequipped due to conflicts.

      // ------------------- Validate Equipment Type and Slot -------------------
      // Check if the item can be equipped in the selected slot.
      console.log(`[gear.js]: Validating item - ${itemName}, Category: ${JSON.stringify(itemDetail.category)}, Type: ${JSON.stringify(itemDetail.type)}, Slot: ${type}`);

      const categories = Array.isArray(itemDetail.category) ? itemDetail.category.map(c => c.toLowerCase()) : [];
      const types = Array.isArray(itemDetail.type) ? itemDetail.type.map(t => t.toLowerCase()) : [];

      if (['head', 'chest', 'legs'].includes(type)) {
        if (!categories.includes('armor') || !types.includes(type)) {
          console.log(`[gear.js]: Item mismatch - Expected Armor with ${type}, got: Category: ${categories}, Type: ${types}`);
          await interaction.editReply({ content: `❌ **${itemName} is an ${types.join(', ') || 'unknown'} item and cannot be equipped to the ${type} slot!**`, flags: [MessageFlags.Ephemeral] });
          return;
        }
      } else if (type === 'weapon') {
        if (!categories.includes('weapon')) {
          console.log(`[gear.js]: Item mismatch - Expected Weapon, got: ${categories}`);
          await interaction.editReply({ content: `❌ **${itemName} is not a weapon and cannot be equipped to the weapon slot.**`, flags: [MessageFlags.Ephemeral] });
          return;
        }
      } else if (type === 'shield') {
        const categories = Array.isArray(itemDetail.category) ? itemDetail.category.map(c => c.toLowerCase()) : [];
        const subtypes = Array.isArray(itemDetail.subtype) ? itemDetail.subtype.map(s => s.toLowerCase()) : [itemDetail.subtype?.toLowerCase()];
        const isShield = categories.includes('shield') || subtypes.includes('shield');
      
        if (!isShield) {
          console.log(`[gear.js]: Item mismatch - Expected Shield, got Category: ${categories}, Subtype: ${subtypes}`);
          await interaction.editReply({ content: `❌ **${itemName} is not recognized as a shield and cannot be equipped to the shield slot.**`, flags: [MessageFlags.Ephemeral] });
          return;
        }      
      } else {
        console.log(`[gear.js]: Invalid slot type detected - ${type}`);
        await interaction.editReply({ content: `❌ **Invalid slot type selected for equipping ${itemName}.**`, flags: [MessageFlags.Ephemeral] });
        return;
      }

      // ------------------- Handle Conflicting Gear Logic -------------------
      // If equipping a 2h weapon or shield, ensure conflicting gear is unequipped.
      if (type === 'weapon' || type === 'shield') {
        if (itemDetail.type.includes('2h')) {
          if (character.gearWeapon) {
            await updateCharacterById(character._id, { $unset: { gearWeapon: 1 } });
            unequippedMessage += 'Your existing weapon has been unequipped because you cannot have a 2h weapon and another weapon equipped. ';
          }
          if (character.gearShield) {
            await updateCharacterById(character._id, { $unset: { gearShield: 1 } });
            unequippedMessage += 'Your shield has been unequipped because you cannot have a 2h weapon and a shield equipped. ';
          }
        } else if (itemDetail.subtype?.includes('shield')) {
          if (character.gearWeapon?.type?.includes('2h')) {
            await updateCharacterById(character._id, { $unset: { gearWeapon: 1 } });
            unequippedMessage += 'Your 2h weapon has been unequipped because you cannot have a shield and a 2h weapon equipped. ';
          }
        } else if (itemDetail.type.includes('1h')) {
          if (character.gearWeapon?.type?.includes('2h')) {
            await updateCharacterById(character._id, { $unset: { gearWeapon: 1 } });
            unequippedMessage += 'Your 2h weapon has been unequipped because you cannot have a 1h weapon and a 2h weapon equipped. ';
          }
        }
      }

      // ------------------- Equip Item Logic -------------------
      // Update the character's gear based on the selected slot.
      if (['head', 'chest', 'legs'].includes(type)) {
        const modifierHearts = Number(itemDetail.modifierHearts) || 0;
        const updatedGearArmor = { ...character.gearArmor, [type]: { name: itemName, stats: { modifierHearts } } };
        console.log(`[gear.js]: Updating gearArmor - Slot: ${type}, Item: ${itemName}`);
        await updateCharacterById(character._id, { gearArmor: updatedGearArmor });
      } else if (type === 'weapon') {
        const modifierHearts = Number(itemDetail.modifierHearts) || 0;
        console.log(`[gear.js]: Updating gearWeapon - Item: ${itemName}`);
        await updateCharacterById(character._id, { gearWeapon: { name: itemName, stats: { modifierHearts }, type: itemDetail.type } });
      } else if (type === 'shield') {
        const modifierHearts = Number(itemDetail.modifierHearts) || 0;
        console.log(`[gear.js]: Updating gearShield - Item: ${itemName}`);
        await updateCharacterById(character._id, { gearShield: { name: itemName, stats: { modifierHearts }, subtype: itemDetail.subtype } });
      }

      // ------------------- Recalculate Character Stats -------------------
      // Update defense and attack values after equipping the gear.
      console.log(`[gear.js]: Recalculating stats for character: ${character.name}`);
      await updateCharacterDefense(character._id);
      await updateCharacterAttack(character._id);

      // ------------------- Fetch Updated Character and Gear Details -------------------
      const updatedCharacter = await fetchCharacterByNameAndUserId(characterName, userId);
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
      console.log(`[gear.js]: Generating gear embed for ${character.name}`);
      const gearEmbed = createCharacterGearEmbed(updatedCharacter, updatedGearMap, type);
      await interaction.editReply({ content: `✅ **${itemName} has been equipped to the ${type} slot for ${characterName}.** ${unequippedMessage}`, embeds: [gearEmbed], flags: [MessageFlags.Ephemeral] });
    } catch (error) {
    handleError(error, 'gear.js');

      console.error(`[gear.js]: Error executing gear command: ${error.message}`);
      await interaction.editReply({ content: `❌ **An error occurred while executing the gear command. Please try again later.**`, flags: [MessageFlags.Ephemeral] });
    }
  }
};
