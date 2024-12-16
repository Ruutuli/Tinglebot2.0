// ------------------- Gear Command Module -------------------
// This module handles displaying, equipping, or unequipping gear for a character.

// ------------------- Import Section -------------------
// Grouped based on third-party and local module imports
const { SlashCommandBuilder } = require('discord.js'); // Discord.js for building slash commands
const {   fetchCharacterByNameAndUserId,   getCharacterInventoryCollection,   updateCharacterById } = require('../database/characterService'); // Character-related database services
const ItemModel = require('../models/ItemModel'); // Item model for fetching item details
const { createCharacterGearEmbed } = require('../embeds/characterEmbeds'); // Embed utility for displaying character gear
const {   updateCharacterDefense,   updateCharacterAttack } = require('../modules/characterStatsModule'); // Utilities for updating character stats

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

      // ------------------- Fetch Character Details -------------------
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


      let unequippedMessage = ''; // Initialize unequipped message to track unequipped gear

// ------------------- Validate Equipment Type and Slot -------------------
console.log(`[gear.js]: Validating item - ${itemName}, Category: ${JSON.stringify(itemDetail.category)}, Type: ${JSON.stringify(itemDetail.type)}, Slot: ${type}`);

// Ensure itemDetail.category and itemDetail.type are arrays
const categories = Array.isArray(itemDetail.category) ? itemDetail.category.map(c => c.toLowerCase()) : [];
const types = Array.isArray(itemDetail.type) ? itemDetail.type.map(t => t.toLowerCase()) : [];

// Check for Armor category with specific slot type
if (['head', 'chest', 'legs'].includes(type)) {
  if (!categories.includes('armor') || !types.includes(type)) {
    console.log(`[gear.js]: Item mismatch - Expected Armor with ${type}, got: Category: ${categories}, Type: ${types}`);
    await interaction.editReply({ 
      content: `❌ **${itemName} is an ${types.join(', ') || 'unknown'} item and cannot be equipped to the ${type} slot!**` 
    });
    return;
  }
} else if (type === 'weapon') {
  // Validate weapon items
  if (!categories.includes('weapon')) {
    console.log(`[gear.js]: Item mismatch - Expected Weapon, got: ${categories}`);
    await interaction.editReply({ 
      content: `❌ **${itemName} is not a weapon and cannot be equipped to the weapon slot.**` 
    });
    return;
  }
} else if (type === 'shield') {
  // Validate shield items
  if (!categories.includes('shield')) {
    console.log(`[gear.js]: Item mismatch - Expected Shield, got: ${categories}`);
    await interaction.editReply({ 
      content: `❌ **${itemName} is not a shield and cannot be equipped to the shield slot.**` 
    });
    return;
  }
} else {
  // Handle invalid slot types
  console.log(`[gear.js]: Invalid slot type detected - ${type}`);
  await interaction.editReply({ 
    content: `❌ **Invalid slot type selected for equipping ${itemName}.**` 
  });
  return;
}

// ------------------- Handle Conflicting Gear Logic -------------------
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
// Update the appropriate slot with the new item
if (['head', 'chest', 'legs'].includes(type)) {
  const modifierHearts = Number(itemDetail.modifierHearts) || 0;

  // Construct updated gearArmor object
  const updatedGearArmor = { 
    ...character.gearArmor, 
    [type]: { name: itemName, stats: { modifierHearts } } 
  };

  // Save updated gearArmor to the database
  console.log(`[gear.js]: Updating gearArmor - Slot: ${type}, Item: ${itemName}`);
  await updateCharacterById(character._id, { gearArmor: updatedGearArmor });
} else if (type === 'weapon') {
  const modifierHearts = Number(itemDetail.modifierHearts) || 0;

  // Save the equipped weapon
  console.log(`[gear.js]: Updating gearWeapon - Item: ${itemName}`);
  await updateCharacterById(character._id, { gearWeapon: { name: itemName, stats: { modifierHearts }, type: itemDetail.type } });
} else if (type === 'shield') {
  const modifierHearts = Number(itemDetail.modifierHearts) || 0;

  // Save the equipped shield
  console.log(`[gear.js]: Updating gearShield - Item: ${itemName}`);
  await updateCharacterById(character._id, { gearShield: { name: itemName, stats: { modifierHearts }, subtype: itemDetail.subtype } });
}

// Recalculate stats after equipping
console.log(`[gear.js]: Recalculating stats for character: ${character.name}`);
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
console.log(`[gear.js]: Generating gear embed for ${character.name}`);
const gearEmbed = createCharacterGearEmbed(updatedCharacter, updatedGearMap, type);
await interaction.editReply({ content: `✅ **${itemName} has been equipped to the ${type} slot for ${characterName}.** ${unequippedMessage}`, embeds: [gearEmbed] });
} catch (error) {
  console.error(`[gear.js]: Error executing gear command: ${error.message}`);
  await interaction.editReply({ content: `❌ **An error occurred while executing the gear command. Please try again later.**` });
}

  }
};