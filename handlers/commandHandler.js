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

  for (const file of commandFiles) {
    try {
      const command = require(file);

      if (!('data' in command) || !('execute' in command)) {
        console.warn(`[commandHandler.js]: Command at ${file} is missing required "data" or "execute" property. Skipping.`);
        continue;
      }

      console.log(`[commandHandler.js]: Registering command: ${command.data.name} from ${file}`);
      client.commands.set(command.data.name, command);
      
      if (typeof command.autocomplete === 'function') {
        console.log(`[commandHandler.js]: Command ${command.data.name} has autocomplete handler.`);
      }
    } catch (error) {
      console.error(`[commandHandler.js]: Error loading command from ${file}:`, error);
    }
  }

  console.log(`[commandHandler.js]: Registered ${client.commands.size} commands.`);
};