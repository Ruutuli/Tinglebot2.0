const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

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

module.exports = (client) => {
  client.commands = new Collection();
  
  const commandDir = path.join(__dirname, '../commands');
  const commandFiles = getCommandFiles(commandDir);
  
  let successCount = 0;
  let errorCount = 0;
  let errorMessages = [];

  for (const file of commandFiles) {
    try {
      const command = require(file);

      if (!('data' in command) || !('execute' in command)) {
        errorCount++;
        errorMessages.push(`Command at ${file} is missing required "data" or "execute" property.`);
        continue;
      }

      client.commands.set(command.data.name, command);
      successCount++;
    } catch (error) {
      errorCount++;
      errorMessages.push(`Error loading command from ${file}: ${error.message}`);
    }
  }

  return errorCount === 0;
};

// Load commands
const loadCommands = async (client) => {
  const commands = [];
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      
      if (command.data && command.execute) {
        commands.push(command.data.toJSON());
      }
    } catch (error) {
      // Silently skip invalid commands
      continue;
    }
  }

  try {
    await client.application.commands.set(commands);
  } catch (error) {
    // Silent fail on command setting error
  }
};