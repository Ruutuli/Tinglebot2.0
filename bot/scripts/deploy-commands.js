const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

async function getCommandFiles() {
    const commandFiles = [];
    const commandDirs = ['commands', 'embeds'];

    function scanDirectory(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                // Recursively scan subdirectories
                scanDirectory(filePath);
            } else if (file.endsWith('.js')) {
                // Store relative path from workspace root
                const relativePath = path.relative(process.cwd(), filePath);
                commandFiles.push(relativePath);
            }
        }
    }

    for (const dir of commandDirs) {
        const dirPath = path.join(process.cwd(), dir);
        if (fs.existsSync(dirPath)) {
            scanDirectory(dirPath);
        }
    }

    return commandFiles;
}

async function loadCommands() {
    const commands = [];
    const commandFiles = await getCommandFiles();
    console.log(`[deploy-commands.js]: Found ${commandFiles.length} potential command files`);

    for (const file of commandFiles) {
        try {
            const filePath = path.join(process.cwd(), file);
            console.log(`[deploy-commands.js]: Processing file: ${file}`);
            
            // Skip files that don't end with .js
            if (!file.endsWith('.js')) {
                console.log(`[deploy-commands.js]: Skipping non-js file: ${file}`);
                continue;
            }

            // Try to require the command file
            try {
                const command = require(filePath);
                
                if (command && command.data) {
                    const commandData = command.data.toJSON();
                    
                    if (commandData && commandData.name) {
                        commands.push(commandData);
                        console.log(`✅ Loaded command: ${commandData.name} from ${file}`);
                    } else {
                        console.warn(`⚠️ The command at ${file} is missing a required "name" property.`);
                    }
                } else {
                    console.warn(`⚠️ The command at ${file} is missing a required "data" property.`);
                }
            } catch (requireError) {
                console.error(`❌ Error requiring command file ${file}:`, {
                    message: requireError.message,
                    stack: requireError.stack
                });
            }
        } catch (error) {
            console.error(`❌ Error loading command from ${file}:`, {
                message: error.message,
                stack: error.stack
            });
        }
    }

    console.log(`[deploy-commands.js]: Successfully loaded ${commands.length} commands`);
    return commands;
}

async function deployCommands() {
    try {
        console.log('[deploy-commands.js]: Deploying commands...');
        
        // Load commands first
        const commands = await loadCommands();
        
        if (commands.length === 0) {
            console.error('❌ No commands found to deploy');
            return;
        }

        console.log(`🔄 Started refreshing ${commands.length} commands.`);
        
        // Check required environment variables
        if (!process.env.DISCORD_TOKEN) {
            console.error('❌ DISCORD_TOKEN is not set in environment variables');
            return;
        }
        
        if (!process.env.CLIENT_ID) {
            console.error('❌ CLIENT_ID is not set in environment variables');
            return;
        }

        if (!process.env.GUILD_ID) {
            console.error('❌ GUILD_ID is not set in environment variables');
            return;
        }

        const rest = new REST().setToken(process.env.DISCORD_TOKEN);

        // Deploy to guild
        console.log(`[deploy-commands.js]: Deploying to guild: ${process.env.GUILD_ID}`);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log(`✅ Successfully registered ${commands.length} commands to guild.`);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
}

// Execute the deployment
deployCommands().catch(console.error);