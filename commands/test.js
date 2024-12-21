// ------------------- Import necessary modules -------------------
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

// ------------------- Command Configuration -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('🔍 Select up to 3 test items and specify their quantities'),

  // ------------------- Command Execution -------------------
  async execute(interaction) {
    if (!interaction.isCommand()) return;

    // Step 1: Create and show the dropdown menu for item selection
    const testItems = ['Item1', 'Item2', 'Item3', 'Item4', 'Item5']; // Sample items

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('test-item-select')
      .setPlaceholder('Select up to 3 test items')
      .setMinValues(1)
      .setMaxValues(3)
      .addOptions(
        testItems.map(item => ({
          label: item,
          value: item,
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: '🔍 Please select up to 3 test items:',
      components: [row],
      ephemeral: true,
    });
  },

  // ------------------- Interaction Handling -------------------
  async handleInteraction(interaction) {
    if (interaction.customId === 'test-item-select') {
      // Step 2: Capture selected items
      const selectedItems = interaction.values;

      // Update interaction with confirmation button
      await interaction.update({
        content: `✅ You selected: ${selectedItems.join(', ')}. Press "Confirm" to specify quantities.`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('confirm-test-items')
              .setLabel('Confirm')
              .setStyle(ButtonStyle.Primary)
          ),
        ],
      });

      interaction.client.selectedItems = selectedItems; // Store selections temporarily
    } else if (interaction.customId === 'confirm-test-items') {
      // Step 3: Trigger modals for each selected item
      const selectedItems = interaction.client.selectedItems || [];
      for (const item of selectedItems) {
        const modal = new ModalBuilder()
          .setCustomId(`quantity-modal-${item}`)
          .setTitle(`Quantity for ${item}`);

        const input = new TextInputBuilder()
          .setCustomId('quantity-input')
          .setLabel(`How many ${item}s?`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const modalRow = new ActionRowBuilder().addComponents(input);
        modal.addComponents(modalRow);

        await interaction.showModal(modal); // Show modal for each item
      }
    } else if (interaction.isModalSubmit()) {
      // Handle modal submission
      const quantity = interaction.fields.getTextInputValue('quantity-input');
      await interaction.reply({
        content: `You entered ${quantity} for ${interaction.customId.replace('quantity-modal-', '')}.`,
        ephemeral: true,
      });
    }
  },
};
