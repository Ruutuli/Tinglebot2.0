// ============================================================================
// ------------------- Transfer All Items Command -------------------
// Allows a user to transfer all items from one character to another
// ============================================================================

const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { fetchCharacterByNameAndUserId, getCharacterInventoryCollection } = require('../../database/db');
const { handleError } = require('../../utils/globalErrorHandler');
const { removeItemInventoryDatabase, addItemInventoryDatabase } = require('../../utils/inventoryUtils');

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer-all')
    .setDescription('Transfer all items from one character to another (must both belong to you)')
    .addStringOption(option =>
      option.setName('from')
        .setDescription('The character to transfer items from')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('to')
        .setDescription('The character to transfer items to')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // ============================================================================
  // ------------------- Command Execution -------------------
  // ============================================================================
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    try {
      const fromName = interaction.options.getString('from');
      const toName = interaction.options.getString('to');
      const userId = interaction.user.id;

      // Validate characters
      if (fromName === toName) {
        return await interaction.editReply({
          content: '❌ You must select two different characters.',
          ephemeral: true
        });
      }

      const fromChar = await fetchCharacterByNameAndUserId(fromName, userId);
      const toChar = await fetchCharacterByNameAndUserId(toName, userId);
      if (!fromChar || !toChar) {
        return await interaction.editReply({
          content: '❌ One or both characters not found or do not belong to you.',
          ephemeral: true
        });
      }

      // Check for equipped gear
      const equipped = [];
      if (fromChar.gearArmor) {
        if (fromChar.gearArmor.head) equipped.push(`Head: ${fromChar.gearArmor.head.name}`);
        if (fromChar.gearArmor.chest) equipped.push(`Chest: ${fromChar.gearArmor.chest.name}`);
        if (fromChar.gearArmor.legs) equipped.push(`Legs: ${fromChar.gearArmor.legs.name}`);
      }
      if (fromChar.gearWeapon) equipped.push(`Weapon: ${fromChar.gearWeapon.name}`);
      if (fromChar.gearShield) equipped.push(`Shield: ${fromChar.gearShield.name}`);
      if (equipped.length > 0) {
        return await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Transfer Aborted: Equipped Items Found')
              .setDescription(`Please unequip the following items from **${fromChar.name}** before transferring:`)
              .addFields({ name: 'Equipped Items', value: equipped.join('\n') })
              .setFooter({ text: 'Unequip all gear to proceed.' })
          ],
          ephemeral: true
        });
      }

      // Fetch all inventory items for fromChar
      const inventoryCollection = await getCharacterInventoryCollection(fromChar.name);
      const inventoryItems = await inventoryCollection.find({ characterId: fromChar._id }).toArray();
      if (!inventoryItems.length) {
        return await interaction.editReply({
          content: `❌ No items found in ${fromChar.name}'s inventory to transfer.`,
          ephemeral: true
        });
      }

      // Transfer each item
      for (const item of inventoryItems) {
        // Remove from fromChar
        await removeItemInventoryDatabase(fromChar._id, item.itemName, item.quantity, interaction, `Transfer to ${toChar.name}`);
        // Add to toChar
        await addItemInventoryDatabase(toChar._id, item.itemName, item.quantity, interaction, `Transfer from ${fromChar.name}`);
      }

      await interaction.editReply({
        content: `✅ All items have been transferred from **${fromChar.name}** to **${toChar.name}**.`,
        ephemeral: true
      });
    } catch (error) {
      handleError(error, 'transferAll.js', {
        commandName: 'transfer-all',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        options: interaction.options.data
      });
      await interaction.editReply({
        content: '❌ An error occurred during the transfer. Please try again later.',
        ephemeral: true
      });
    }
  }
}; 