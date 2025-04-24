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

  if (errorCount === 0) {
    console.log(`[commandHandler.js]: ✅ Successfully loaded all ${successCount} commands.`);
    return true;
  } else {
    console.log(`[commandHandler.js]: ⚠️ Loaded ${successCount} commands with ${errorCount} errors:`);
    errorMessages.forEach(msg => console.log(`[commandHandler.js]: - ${msg}`));
    return false;
  }
};