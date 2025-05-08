const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Party = require('../../models/PartyModel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('updateparties')
        .setDescription('Updates all parties in the database with missing fields')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ You need Administrator permissions to use this command.', ephemeral: true });
        }
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const result = await Party.updateMany(
                {}, 
                { $set: { 
                    currentTurn: 0, 
                    totalHearts: 0, 
                    totalStamina: 0, 
                    quadrantState: 'unexplored' 
                }}
            );
            
            await interaction.editReply({
                content: `✅ Database update completed! Updated ${result.modifiedCount} parties out of ${result.matchedCount} total.`,
                ephemeral: true
            });
            
        } catch (error) {
            console.error('[ERROR] Error updating parties:', error);
            await interaction.editReply({ 
                content: '❌ An error occurred while updating parties.',
                ephemeral: true 
            });
        }
    },
};