// ============================================================================
// ------------------- Transfer All Items Command -------------------
// Allows a user to transfer all items from one character to another
// ============================================================================

const { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType } = require('discord.js');
const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId, getCharacterInventoryCollection } = require('@/database/db');
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const { syncToInventoryDatabase } = require('@/utils/inventoryUtils');
const { checkInventorySync } = require('@/utils/characterUtils');
const logger = require('@/utils/logger');

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

      let fromChar = await fetchCharacterByNameAndUserId(fromName, userId);
      let toChar = await fetchCharacterByNameAndUserId(toName, userId);
      
      // If not found as regular characters, try as mod characters
      if (!fromChar) {
        fromChar = await fetchModCharacterByNameAndUserId(fromName, userId);
      }
      if (!toChar) {
        toChar = await fetchModCharacterByNameAndUserId(toName, userId);
      }
      if (!fromChar || !toChar) {
        return await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Character Not Found')
              .setDescription('Either the source or destination character does not exist or does not belong to you.')
              .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
              .setFooter({ text: 'Character Validation' })
              .setTimestamp()
          ],
          ephemeral: true
        });
      }

      // Check inventory sync for both characters (no longer required, but kept for compatibility)
      await checkInventorySync(fromChar);
      await checkInventorySync(toChar);

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

      // Confirmation embed and buttons
      const confirmEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('Confirm Transfer')
        .setDescription(`This will remove **all items** from **${fromChar.name}** and give them to **${toChar.name}**.\n\nAre you sure you want to proceed?`)
        .setFooter({ text: 'This action cannot be undone.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`transferall_confirm_${interaction.id}`)
          .setLabel('✅ Yes, proceed')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`transferall_cancel_${interaction.id}`)
          .setLabel('❌ No, cancel')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({
        embeds: [confirmEmbed],
        components: [row],
        ephemeral: true
      });

      // Set up a collector for the button interaction
      const filter = i => i.user.id === userId && i.message.interaction && i.message.interaction.id === interaction.id;
      const collector = interaction.channel.createMessageComponentCollector({
        filter,
        time: 30_000,
        max: 1
      });

      collector.on('collect', async (i) => {
        if (i.customId === `transferall_cancel_${interaction.id}`) {
          await i.update({
            content: '❌ Transfer cancelled.',
            embeds: [],
            components: [],
            ephemeral: true
          });
          return;
        }
        if (i.customId === `transferall_confirm_${interaction.id}`) {
          // Immediately update to show processing and remove buttons
          await i.update({
            content: '⏳ Processing transfer...',
            embeds: [],
            components: [],
            ephemeral: true
          });
          try {
            // Transfer each item: add to recipient first so we never remove without recipient having the item
            for (const item of inventoryItems) {
              // Ensure quantity is a number
              const itemQuantity = parseInt(item.quantity) || 0;

              // Add to toChar first
              await syncToInventoryDatabase(toChar, {
                itemName: item.itemName,
                quantity: itemQuantity,
                obtain: `Transfer from ${fromChar.name}`
              }, interaction);
              // Remove from fromChar; on failure, roll back by removing from toChar
              try {
                await syncToInventoryDatabase(fromChar, {
                  itemName: item.itemName,
                  quantity: -itemQuantity,
                  obtain: `Transfer to ${toChar.name}`
                }, interaction);
              } catch (removeError) {
                try {
                  await syncToInventoryDatabase(toChar, {
                    itemName: item.itemName,
                    quantity: -itemQuantity,
                    obtain: 'Rollback: transfer remove failed'
                  }, interaction);
                  logger.warn('INVENTORY', `Transfer-all remove failed for ${item.itemName}, rolled back add to ${toChar.name}`);
                } catch (rollbackErr) {
                  logger.error('INVENTORY', `Transfer-all remove failed and rollback failed for ${item.itemName}: ${rollbackErr.message}`);
                }
                throw removeError;
              }
            }
            // Edit the reply to show success
            await i.followUp({
              content: `✅ All items have been transferred from **${fromChar.name}** to **${toChar.name}**.`,
              ephemeral: true
            });
          } catch (error) {
            handleInteractionError(error, 'transferAll.js', {
              commandName: 'transfer-all',
              userTag: interaction.user.tag,
              userId: interaction.user.id,
              options: interaction.options.data
            });
            await i.followUp({
              content: '❌ An error occurred during the transfer. Please try again later.',
              ephemeral: true
            });
          }
        }
      });

      collector.on('end', async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: '⌛ Transfer timed out. No action was taken.',
            embeds: [],
            components: [],
            ephemeral: true
          });
        }
      });
    } catch (error) {
      handleInteractionError(error, 'transferAll.js', {
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