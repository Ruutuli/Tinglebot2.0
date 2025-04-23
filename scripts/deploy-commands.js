// ------------------- Import required modules and configurations -------------------
require('dotenv').config(); // load environment variables
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getGuildIds } = require('../utils/getGuildIds');

// ------------------- Recursive function to get all command files -------------------
function getCommandFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat.isDirectory()) {
            results = results.concat(getCommandFiles(file));
        } else if (file.endsWith('.js')) {
            results.push(file);
        }
    });
    return results;
}

// ------------------- Prepare command data for deployment -------------------
const commands = [];
const commandDir = path.join(__dirname, '../commands');
const commandFiles = getCommandFiles(commandDir);
const commandNames = new Set();

// ------------------- Load and validate commands -------------------
for (const file of commandFiles) {
    try {
        const command = require(file);
        if ('data' in command && 'execute' in command) {
            if (commandNames.has(command.data.name)) {
                console.warn(`⚠️ Duplicate command name found: ${command.data.name}. Skipping file: ${file}`);
            } else {
                commands.push(command.data.toJSON());
                commandNames.add(command.data.name);
                console.log(`✅ Loaded command: ${command.data.name} from ${file}`);
            }
        } else {
            console.warn(`⚠️ The command at ${file} is missing a required "data" or "execute" property.`);
        }
    } catch (error) {
        console.error(`❌ Error loading command from ${file}:`, error);
    }
}

// ------------------- Initialize REST client for Discord -------------------
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// ------------------- Deploy global commands -------------------
async function deployGlobalCommands() {
    console.log(`🔄 Started refreshing ${commands.length} global (/) commands.`);
    await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
    );
    console.log('✅ Successfully reloaded global (/) commands.');
}

// ------------------- Deploy guild commands -------------------
async function deployGuildCommands() {
    const guildIds = getGuildIds();
    for (const guildId of guildIds) {
        console.log(`🔄 Started refreshing ${commands.length} guild (/) commands for guild ID: ${guildId}`);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            { body: commands }
        );
        console.log(`✅ Successfully reloaded application (/) commands for guild ID: ${guildId}.`);
    }
    console.log('✅ Successfully reloaded all guild (/) commands.');
}

// ------------------- Execute deployment based on provided arguments -------------------
(async () => {
    try {
        const args = process.argv.slice(2);
        if (args.includes('global')) {
            await deployGlobalCommands();
        } else if (args.includes('guild')) {
            await deployGuildCommands();
        } else {
            console.error('❌ Please specify "global" or "guild" as an argument to the script.');
        }
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();