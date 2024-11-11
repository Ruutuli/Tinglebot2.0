// ------------------- Import necessary modules -------------------
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

// ------------------- Load commands into the client's collection -------------------
module.exports = (client) => {
  client.commands = new Collection();
  
  // Load all command files from the 'commands' directory
  const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(`../commands/${file}`);

    // If there are multiple commands, register them
    if (Array.isArray(command.data)) {
      command.data.forEach(cmd => client.commands.set(cmd.name, command));
    } else {
      client.commands.set(command.data.name, command);
    }
  }
};

