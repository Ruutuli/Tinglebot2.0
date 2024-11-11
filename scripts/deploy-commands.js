// ------------------- Import required modules and configurations -------------------
require('dotenv').config(); // load environment variables
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getGuildIds } = require('../utils/getGuildIds');

// ------------------- Prepare command data for deployment -------------------
const commands = [];
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));
const commandNames = new Set();

// ------------------- Load and validate commands -------------------
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  if ('data' in command && 'execute' in command) {
    if (commandNames.has(command.data.name)) {
      console.warn(`⚠️ Duplicate command name found: ${command.data.name}. Skipping file: ${file}`);
    } else {
      commands.push(command.data.toJSON());
      commandNames.add(command.data.name);
    }
  } else {
    console.warn(`⚠️ The command at ../commands/${file} is missing a required "data" or "execute" property.`);
  }
}

// ------------------- Initialize REST client for Discord -------------------
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// ------------------- Deploy global commands -------------------
async function deployGlobalCommands() {
  console.log('🔄 Started refreshing global (/) commands.');
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
    console.log(`🔄 Started refreshing guild (/) commands for guild ID: ${guildId}`);
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
  const args = process.argv.slice(2);
  if (args.includes('global')) {
    await deployGlobalCommands();
  } else if (args.includes('guild')) {
    await deployGuildCommands();
  } else {
    console.error('❌ Please specify "global" or "guild" as an argument to the script.');
  }
})();

