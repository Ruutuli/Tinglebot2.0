const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check')
        .setDescription('Test interactions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('type')
                .setDescription('Check a specific interaction type')
                .addStringOption(option =>
                    option.setName('interaction')
                        .setDescription('Interaction type to check')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Button', value: 'button' },
                            { name: 'Dropdown', value: 'dropdown' },
                        )
                )
        ),
    async execute(interaction) {
        const interactionType = interaction.options.getString('interaction');

        if (interactionType === 'button') {
            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('test_button')
                    .setLabel('Test Button')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({
                content: 'Click the button below to test button interaction:',
                components: [buttonRow],
                ephemeral: true
            });
        } else if (interactionType === 'dropdown') {
            const dropdownRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('test_dropdown') // Custom ID must match handler
                    .setPlaceholder('Select an option')
                    .addOptions([
                        { label: 'Option 1', value: 'option1' },
                        { label: 'Option 2', value: 'option2' },
                    ])
            );

            await interaction.reply({
                content: 'Choose an option from the dropdown menu below to test:',
                components: [dropdownRow],
                ephemeral: true
            });
        }
    }
};
