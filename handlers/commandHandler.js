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
  
  // Recursively load all command files from the 'commands' directory and its subdirectories
  const commandDir = path.join(__dirname, '../commands');
  const commandFiles = getCommandFiles(commandDir);

  for (const file of commandFiles) {
    const command = require(file);

    // Register each command, handling both single and multiple commands per file
    if (Array.isArray(command.data)) {
      command.data.forEach(cmd => client.commands.set(cmd.name, command));
    } else {
      client.commands.set(command.data.name, command);
    }
  }
};