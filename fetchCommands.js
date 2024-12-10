require('dotenv').config(); // Load environment variables from .env

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// Load variables from .env
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildIds = process.env.GUILD_IDS.split(','); // Ensure this is properly formatted as a comma-separated string in your .env file

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
    try {
        console.log('Fetching commands...\n');

        // Fetch Guild-Specific Commands
        for (const guildId of guildIds) {
            console.log(`Guild Commands for Guild ID: ${guildId}`);
            const guildCommands = await rest.get(
                Routes.applicationGuildCommands(clientId, guildId)
            );

            guildCommands.forEach(command => {
                console.log(`Name: ${command.name}, ID: ${command.id}`);

                // Log subcommands if they exist
                if (command.options) {
                    command.options.forEach(option => {
                        if (option.type === 1) { // Type 1 = Subcommand
                            console.log(`  Subcommand: ${option.name}`);
                        } else if (option.type === 2) { // Type 2 = Subcommand Group
                            console.log(`  Subcommand Group: ${option.name}`);
                            option.options.forEach(subOption => {
                                console.log(`    Subcommand: ${subOption.name}`);
                            });
                        }
                    });
                }
            });
        }

        // Fetch Global Commands
        console.log('\nGlobal Commands:');
        const globalCommands = await rest.get(Routes.applicationCommands(clientId));
        globalCommands.forEach(command => {
            console.log(`Name: ${command.name}, ID: ${command.id}`);

            // Log subcommands if they exist
            if (command.options) {
                command.options.forEach(option => {
                    if (option.type === 1) {
                        console.log(`  Subcommand: ${option.name}`);
                    } else if (option.type === 2) {
                        console.log(`  Subcommand Group: ${option.name}`);
                        option.options.forEach(subOption => {
                            console.log(`    Subcommand: ${subOption.name}`);
                        });
                    }
                }); // Corrected missing closing parenthesis and semicolon here
            }
        });

    } catch (error) {
        console.error('Error fetching commands:', error);
    }
})();
