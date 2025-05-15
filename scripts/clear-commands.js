require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { getGuildIds } = require('../utils/getGuildIds');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function clearAllCommands() {
    try {
        // Clear global commands
        console.log('🔄 Clearing global commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );
        console.log('✅ Cleared global commands');

        // Clear guild commands
        const guildIds = getGuildIds();
        for (const guildId of guildIds) {
            console.log(`🔄 Clearing commands for guild ID: ${guildId}`);
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: [] }
            );
            console.log(`✅ Cleared commands for guild ID: ${guildId}`);
        }
        
        console.log('✅ All commands cleared successfully');
    } catch (error) {
        console.error('❌ Error clearing commands:', error);
    }
}

clearAllCommands(); 