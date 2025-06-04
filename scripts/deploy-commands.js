const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

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

const commands = [];
const commandDir = path.join(__dirname, '../commands');
const commandFiles = getCommandFiles(commandDir);
const commandNames = new Set();

for (const file of commandFiles) {
    try {
        const command = require(file);
        if ('data' in command && 'execute' in command) {
            if (commandNames.has(command.data.name)) {
                console.warn(`⚠️ Duplicate command name found: ${command.data.name}. Skipping file: ${file}`);
            } else {
                const commandJson = command.data.toJSON();
                
                const hasAutocompleteOption = checkForAutocompleteOptions(commandJson);
                if (hasAutocompleteOption && typeof command.autocomplete !== 'function') {
                    console.warn(`⚠️ Command ${command.data.name} has autocomplete options but no autocomplete handler.`);
                }
                
                commands.push(commandJson);
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

function checkForAutocompleteOptions(commandJson) {
    if (!commandJson.options) return false;
    
    let hasAutocomplete = false;
    
    function checkOptions(options) {
        for (const option of options) {
            if (option.autocomplete === true) {
                console.log(`  - Option "${option.name}" has autocomplete enabled`);
                hasAutocomplete = true;
            }
            
            if (option.options) {
                checkOptions(option.options);
            }
        }
    }
    
    checkOptions(commandJson.options);
    return hasAutocomplete;
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
    try {
        console.log(`🔄 Started refreshing ${commands.length} commands in ${env} mode.`);

        if (env === 'development') {
            // In development, register commands to the test server
            const TEST_GUILD_ID = process.env.TEST_GUILD_ID;
            if (!TEST_GUILD_ID) {
                throw new Error('TEST_GUILD_ID is not defined in .env.development');
            }
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, TEST_GUILD_ID),
                { body: commands }
            );
            console.log(`✅ Successfully registered commands to test server (${TEST_GUILD_ID})`);
        } else {
            // In production, register commands to the specific server
            const PRODUCTION_GUILD_ID = '603960955839447050';
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, PRODUCTION_GUILD_ID),
                { body: commands }
            );
            console.log(`✅ Successfully registered commands to production server (${PRODUCTION_GUILD_ID})`);
        }
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
}

deployCommands();