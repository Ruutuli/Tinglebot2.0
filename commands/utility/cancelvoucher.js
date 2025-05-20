// ------------------- Standard Libraries -------------------
const { SlashCommandBuilder } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');

// ------------------- Database Services -------------------
const { fetchCharacterByNameAndUserId } = require('../../database/db');

// ------------------- Utility Functions -------------------
const { deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { capitalizeWords } = require('../../modules/formattingModule');

// ------------------- Command Definition -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('cancelvoucher')
        .setDescription('🎫 Cancel your active job voucher')
        .addStringOption(option =>
            option.setName('charactername')
                .setDescription('The name of your character')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const characterName = interaction.options.getString('charactername');
            
            // Fetch character
            const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
            if (!character) {
                return interaction.editReply({
                    content: `❌ **Character "${characterName}" not found or you don't own this character.**`,
                    ephemeral: true
                });
            }

            // Check if character has an active job voucher
            if (!character.jobVoucher) {
                return interaction.editReply({
                    content: `❌ **${character.name}** doesn't have an active job voucher to cancel.`,
                    ephemeral: true
                });
            }

            // Log the cancellation attempt
            console.log(`[cancelvoucher.js]: 🎫 Attempting to cancel job voucher for ${character.name}`);
            console.log(`[cancelvoucher.js]: 👤 User: ${interaction.user.tag}`);
            console.log(`[cancelvoucher.js]: 💼 Current Job: ${character.jobVoucherJob}`);

            // Deactivate the job voucher
            const result = await deactivateJobVoucher(character._id);
            if (!result.success) {
                console.error(`[cancelvoucher.js]: ❌ Failed to cancel job voucher for ${character.name}`);
                return interaction.editReply({
                    content: result.message || '❌ Failed to cancel job voucher.',
                    ephemeral: true
                });
            }

            // Success message
            console.log(`[cancelvoucher.js]: ✅ Successfully cancelled job voucher for ${character.name}`);
            return interaction.editReply({
                content: `✅ **${character.name}**'s job voucher for **${capitalizeWords(character.jobVoucherJob)}** has been cancelled.`,
                ephemeral: true
            });

        } catch (error) {
            handleError(error, 'cancelvoucher.js');
            console.error(`[cancelvoucher.js]: ❌ Error cancelling job voucher:`, error);
            return interaction.editReply({
                content: '❌ An error occurred while trying to cancel the job voucher.',
                ephemeral: true
            });
        }
    }
}; 