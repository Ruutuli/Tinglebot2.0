const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
console.log(`[deploy-commands.js]: Deploying commands in ${env} mode`);

// Force production mode if specified in command line
if (process.argv.includes('--env') && process.argv.includes('NODE_ENV=production')) {
    process.env.NODE_ENV = 'production';
    console.log('[deploy-commands.js]: Forcing production mode from command line');
}

// Try to load .env files in order of priority
const possiblePaths = [
    path.resolve(process.cwd(), `.env.${process.env.NODE_ENV}`),
    path.resolve(process.cwd(), '..', `.env.${process.env.NODE_ENV}`),
    path.resolve('/app', `.env.${process.env.NODE_ENV}`),
    `.env.${process.env.NODE_ENV}`,
    // Also try loading the other environment file as fallback
    path.resolve(process.cwd(), `.env.${process.env.NODE_ENV === 'development' ? 'production' : 'development'}`),
    path.resolve(process.cwd(), '..', `.env.${process.env.NODE_ENV === 'development' ? 'production' : 'development'}`),
    path.resolve('/app', `.env.${process.env.NODE_ENV === 'development' ? 'production' : 'development'}`),
    `.env.${process.env.NODE_ENV === 'development' ? 'production' : 'development'}`
];

let loaded = false;
for (const envPath of possiblePaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
        console.log(`[deploy-commands.js]: Loaded environment from ${envPath}`);
        loaded = true;
        break;
    }
}

if (!loaded) {
    console.log('[deploy-commands.js]: No .env file found, using environment variables from system');
}

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

    // Mock the database module to prevent connection attempts
    const originalRequire = require;
    console.log('[deploy-commands.js]: Setting up database mocks');
    
    // Create a mock database config
    const mockDbConfig = {
        tinglebot: 'mongodb://mock',
        inventories: 'mongodb://mock',
        vending: 'mongodb://mock'
    };

    // Mock require to intercept database-related imports
    require = function(path) {
        console.log(`[deploy-commands.js]: Requiring module: ${path}`);
        if (path.includes('database') || path.includes('config/database')) {
            console.log('[deploy-commands.js]: Mocking database module');
            return mockDbConfig;
        }
        if (path.includes('dotenv')) {
            console.log('[deploy-commands.js]: Mocking dotenv');
            return {
                config: () => {
                    console.log('[deploy-commands.js]: Mock dotenv.config called');
                    return {};
                }
            };
        }
        return originalRequire(path);
    };

    // Mock process.env to ensure NODE_ENV is set
    const originalEnv = process.env;
    process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        MONGODB_TINGLEBOT_URI_PROD: 'mongodb://mock',
        MONGODB_INVENTORIES_URI_PROD: 'mongodb://mock',
        MONGODB_VENDING_URI_PROD: 'mongodb://mock'
    };

    for (const file of commandFiles) {
        try {
            const filePath = path.join(process.cwd(), file);
            console.log(`\n[deploy-commands.js]: Processing file: ${file}`);
            
            // Skip files that don't end with .js
            if (!file.endsWith('.js')) {
                console.log(`[deploy-commands.js]: Skipping non-js file: ${file}`);
                continue;
            }

            // Try to require the command file
            try {
                console.log(`[deploy-commands.js]: Attempting to require: ${file}`);
                const command = require(filePath);
                console.log(`[deploy-commands.js]: Successfully required ${file}`);
                
                if (command && command.data) {
                    console.log(`[deploy-commands.js]: Found command data in ${file}`);
                    const commandData = command.data.toJSON();
                    console.log(`[deploy-commands.js]: Command data:`, {
                        name: commandData.name,
                        description: commandData.description,
                        options: commandData.options?.length || 0
                    });
                    
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

    // Restore original require and environment
    console.log('[deploy-commands.js]: Restoring original require and environment');
    require = originalRequire;
    process.env = originalEnv;

    console.log(`[deploy-commands.js]: Successfully loaded ${commands.length} commands`);
    return commands;
}

async function deployCommands() {
    try {
        const currentEnv = process.env.NODE_ENV || 'development';
        console.log(`[deploy-commands.js]: Deploying commands in ${currentEnv} mode`);
        
        // Load commands first
        const commands = await loadCommands();
        
        if (commands.length === 0) {
            console.error('❌ No commands found to deploy');
            return;
        }

        console.log(`🔄 Started refreshing ${commands.length} commands in ${currentEnv} mode.`);

        const rest = new REST().setToken(process.env.DISCORD_TOKEN);

        if (currentEnv === 'production') {
            // Deploy to production server
            const guildId = '603960955839447050';
            console.log(`[deploy-commands.js]: Deploying to production guild: ${guildId}`);
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands }
            );
            console.log(`✅ Successfully registered ${commands.length} commands to production server.`);
        } else {
            // Deploy to test server
            const guildId = process.env.TEST_GUILD_ID;
            console.log(`[deploy-commands.js]: Deploying to test guild: ${guildId}`);
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands }
            );
            console.log(`✅ Successfully registered ${commands.length} commands to test server.`);
        }
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
}

// Execute the deployment
deployCommands().catch(console.error);