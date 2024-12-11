// ------------------- Gear Command Module -------------------
// This module handles displaying, equipping, or unequipping gear for a character.

// ------------------- Import Section -------------------
// Grouped based on third-party and local module imports
const { SlashCommandBuilder } = require('discord.js'); // Discord.js for building slash commands
const { 
  fetchCharacterByNameAndUserId, 
  getCharacterInventoryCollection, 
  updateCharacterById 
} = require('../database/characterService'); // Character-related database services
const ItemModel = require('../models/ItemModel'); // Item model for fetching item details
const { createCharacterGearEmbed } = require('../embeds/characterEmbeds'); // Embed utility for displaying character gear
const { 
  updateCharacterDefense, 
  updateCharacterAttack 
} = require('../modules/characterStatsModule'); // Utilities for updating character stats

// ------------------- Command Definition -------------------
// Defines the slash command for managing character gear
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
        .setDescription('Set to unequip to remove the item')
        .setRequired(false)
        .addChoices(
          { name: 'Unequip', value: 'unequip' }
        )),

  // ------------------- Command Execution Logic -------------------
  // This function handles equipping and unequipping gear for a character
  async execute(interaction) {
    try {
      const characterName = interaction.options.getString('charactername'); // Get character name from interaction
      const type = interaction.options.getString('type'); // Get gear type (e.g., head, chest)
      const itemName = interaction.options.getString('itemname'); // Get item name if equipping
      const status = interaction.options.getString('status'); // Get status (equip or unequip)
      const userId = interaction.user.id; // Get user ID from interaction

      // Acknowledge the interaction to avoid timeout
      await interaction.deferReply({ ephemeral: true });

      // Fetch character details from the database
      const character = await fetchCharacterByNameAndUserId(characterName, userId);

      // If character is not found, return an error message
      if (!character) {
        await interaction.editReply({ content: `❌ **Character ${characterName} not found or does not belong to you.**` });
        return;
      }

      // Check if the character's inventory has been synced
        if (!character.inventorySynced) {
          return interaction.editReply({
              content: `❌ **You cannot use this command because your character does not have an inventory set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> command to initialize your inventory.**`,
              ephemeral: true,
          });
        }


      // ------------------- Handle Unequipping Gear -------------------
      if (status === 'unequip') {
        const update = {}; // Object to store the update operation
        if (['head', 'chest', 'legs'].includes(type)) {
          update[`gearArmor.${type}`] = null; // Set the armor slot to null for unequipping
        } else if (type === 'weapon') {
          update['gearWeapon'] = null; // Set weapon slot to null for unequipping
        } else if (type === 'shield') {
          update['gearShield'] = null; // Set shield slot to null for unequipping
        }

        // Apply the update to the character
        await updateCharacterById(character._id, { $unset: update });

        // Recalculate character's defense and attack after unequipping gear
        await updateCharacterDefense(character._id);
        await updateCharacterAttack(character._id);

        // Fetch the updated character details
        const updatedCharacter = await fetchCharacterByNameAndUserId(characterName, userId);

        // Fetch updated item details for the character's gear
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

        // Map the character's gear to display it in the embed
        const updatedGearMap = {
          head: updatedCharacter.gearArmor?.head ? `> ${updatedCharacter.gearArmor.head.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.head.name)?.modifierHearts || 0}]` : '> N/A',
          chest: updatedCharacter.gearArmor?.chest ? `> ${updatedCharacter.gearArmor.chest.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.chest.name)?.modifierHearts || 0}]` : '> N/A',
          legs: updatedCharacter.gearArmor?.legs ? `> ${updatedCharacter.gearArmor.legs.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.legs.name)?.modifierHearts || 0}]` : '> N/A',
          weapon: updatedCharacter.gearWeapon ? `> ${updatedCharacter.gearWeapon.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearWeapon.name)?.modifierHearts || 0}]` : '> N/A',
          shield: updatedCharacter.gearShield ? `> ${updatedCharacter.gearShield.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearShield.name)?.modifierHearts || 0}]` : '> N/A',
        };

        // Create the gear embed and send it as a reply
        const gearEmbed = createCharacterGearEmbed(updatedCharacter, updatedGearMap, type);
        await interaction.editReply({ content: `✅ **${type.charAt(0).toUpperCase() + type.slice(1)} has been unequipped from ${characterName}.**`, embeds: [gearEmbed] });
        return;
      }

      // ------------------- Handle Equipping Gear -------------------
      // Ensure character's weapon has correct type if equipping
      if (character.gearWeapon && typeof character.gearWeapon.type === 'undefined') {
        const weaponDetail = await ItemModel.findOne({ itemName: character.gearWeapon.name });
        if (weaponDetail) {
          character.gearWeapon.type = weaponDetail.type;
        }
      }

      // Fetch character's inventory to check for the item
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventoryItems = await inventoryCollection.find({ characterId: character._id, itemName }).toArray();

      // If the item is not found in the inventory, return an error
      if (!inventoryItems.length) {
        await interaction.editReply({ content: `❌ **Item ${itemName} not found in your inventory.**` });
        return;
      }

      // Fetch item details from the database
      const itemDetail = await ItemModel.findOne({ itemName });
      if (!itemDetail) {
        await interaction.editReply({ content: `❌ **Item ${itemName} not found in the item database.**` });
        return;
      }

      let unequippedMessage = ''; // Message to show if any gear gets unequipped due to conflicts
      const itemType = itemDetail.type.includes('2h') ? '2h' : (itemDetail.subtype && itemDetail.subtype.includes('Shield') ? 'shield' : '1h');

      // Handle conflicting gear logic
// Handle conflicting gear logic only for weapons or shields
if (type === 'weapon' || type === 'shield') {
  if (itemType === '2h') {
    if (character.gearWeapon) {
      await updateCharacterById(character._id, { $unset: { gearWeapon: 1 } });
      unequippedMessage += 'Your existing weapon has been unequipped because you cannot have a 2h weapon and another weapon equipped.';
    }
    if (character.gearShield) {
      await updateCharacterById(character._id, { $unset: { gearShield: 1 } });
      unequippedMessage += ' Your shield has been unequipped because you cannot have a 2h weapon and a shield equipped.';
    }
  } else if (itemType === 'shield') {
    if (character.gearWeapon?.type?.includes('2h')) {
      await updateCharacterById(character._id, { $unset: { gearWeapon: 1 } });
      unequippedMessage += 'Your 2h weapon has been unequipped because you cannot have a shield and a 2h weapon equipped.';
    }
  } else if (itemType === '1h') {
    if (character.gearWeapon?.type?.includes('2h')) {
      await updateCharacterById(character._id, { $unset: { gearWeapon: 1 } });
      unequippedMessage += 'Your 2h weapon has been unequipped because you cannot have a 1h weapon and a 2h weapon equipped.';
    }
  }
}


      // Create a map to organize the character's gear
      const gearMap = {
        head: character.gearArmor?.head ? `> ${character.gearArmor.head.name} [+${character.gearArmor.head.stats.modifierHearts}]` : '> N/A',
        chest: character.gearArmor?.chest ? `> ${character.gearArmor.chest.name} [+${character.gearArmor.chest.stats.modifierHearts}]` : '> N/A',
        legs: character.gearArmor?.legs ? `> ${character.gearArmor.legs.name} [+${character.gearArmor.legs.stats.modifierHearts}]` : '> N/A',
        weapon: character.gearWeapon ? `> ${character.gearWeapon.name} [+${character.gearWeapon.stats.modifierHearts}]` : '> N/A',
        shield: character.gearShield ? `> ${character.gearShield.name} [+${character.gearShield.stats.modifierHearts}]` : '> N/A',
      };

      // Update the gear map with the new item details
      const itemString = `> ${itemDetail.emoji} ${itemName} [+${itemDetail.modifierHearts}]`;
      if (type === 'head') gearMap.head = itemString;
      if (type === 'chest') gearMap.chest = itemString;
      if (type === 'legs') gearMap.legs = itemString;
      if (type === 'weapon') gearMap.weapon = itemString;
      if (type === 'shield') gearMap.shield = itemString;

      // Update the character's gear in the database
      if (['head', 'chest', 'legs'].includes(type)) {
        const modifierHearts = Number(itemDetail.modifierHearts) || 0;
        const updatedGear = { ...character.gearArmor, [type]: { name: itemName, stats: { modifierHearts } } };
        await updateCharacterById(character._id, { [`gearArmor.${type}`]: updatedGear[type] });
      } else if (type === 'weapon') {
        const modifierHearts = Number(itemDetail.modifierHearts) || 0;
        await updateCharacterById(character._id, { gearWeapon: { name: itemName, stats: { modifierHearts }, type: itemDetail.type } });
      } else if (type === 'shield') {
        const modifierHearts = Number(itemDetail.modifierHearts) || 0;
        await updateCharacterById(character._id, { gearShield: { name: itemName, stats: { modifierHearts }, subtype: itemDetail.subtype } });
      }

      // After updating the gear, recalculate defense and attack
      await updateCharacterDefense(character._id);
      await updateCharacterAttack(character._id);

      // Fetch the updated character details
      const updatedCharacter = await fetchCharacterByNameAndUserId(characterName, userId);

      // Fetch updated item details for the character's gear
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

      // Create updated gear map for the embed
      const updatedGearMap = {
        head: updatedCharacter.gearArmor?.head ? `> ${updatedCharacter.gearArmor.head.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.head.name)?.modifierHearts || 0}]` : '> N/A',
        chest: updatedCharacter.gearArmor?.chest ? `> ${updatedCharacter.gearArmor.chest.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.chest.name)?.modifierHearts || 0}]` : '> N/A',
        legs: updatedCharacter.gearArmor?.legs ? `> ${updatedCharacter.gearArmor.legs.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearArmor.legs.name)?.modifierHearts || 0}]` : '> N/A',
        weapon: updatedCharacter.gearWeapon ? `> ${updatedCharacter.gearWeapon.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearWeapon.name)?.modifierHearts || 0}]` : '> N/A',
        shield: updatedCharacter.gearShield ? `> ${updatedCharacter.gearShield.name} [+${updatedItemDetails.find(i => i.itemName === updatedCharacter.gearShield.name)?.modifierHearts || 0}]` : '> N/A',
      };

      // Create the gear embed and send it as a reply
      const gearEmbed = createCharacterGearEmbed(updatedCharacter, updatedGearMap, type, unequippedMessage);
      await interaction.editReply({ content: `✅ **${type.charAt(0).toUpperCase() + type.slice(1)} has been equipped to ${characterName}.**`, embeds: [gearEmbed] });
    } catch (error) {
      console.error(`Error executing gear command: ${error.message}`);
      await interaction.editReply({ content: `❌ **An error occurred while executing the gear command. Please try again later.**` });
    }
  }
};
