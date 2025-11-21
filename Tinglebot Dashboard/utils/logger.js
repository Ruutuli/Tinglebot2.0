/**
 * Pretty Logger Utility
 * Provides beautiful, colorful console logging with emojis and formatting
 */

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    // Text colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    
    // Background colors
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m',
};

// Box drawing characters
const box = {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
    leftT: '╠',
    rightT: '╣',
};

// Get timestamp
const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
};

// Format context (like [server.js])
const formatContext = (context) => {
    return `${colors.dim}${colors.cyan}[${context}]${colors.reset}`;
};

// Create a box message
const createBox = (message, color = colors.cyan, emoji = '') => {
    const lines = message.split('\n');
    
    // Calculate actual display length (accounting for emojis taking 2 spaces)
    const getDisplayLength = (str) => {
        // Count emojis (they typically take 2 character spaces in console)
        const emojiCount = (str.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
        return str.length + emojiCount;
    };
    
    const maxLength = Math.max(...lines.map(l => getDisplayLength(l)));
    const width = Math.max(maxLength + 4, 50);
    
    const top = `${color}${box.topLeft}${box.horizontal.repeat(width)}${box.topRight}${colors.reset}`;
    const bottom = `${color}${box.bottomLeft}${box.horizontal.repeat(width)}${box.bottomRight}${colors.reset}`;
    
    console.log(top);
    lines.forEach(line => {
        const displayLen = getDisplayLength(line);
        const padding = ' '.repeat(Math.max(0, width - displayLen));
        console.log(`${color}${box.vertical}${colors.reset} ${line}${padding} ${color}${box.vertical}${colors.reset}`);
    });
    console.log(bottom);
};

// Logger functions
const logger = {
    // Success message
    success: (message, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.green}✓${colors.reset} ` +
            `${colors.bright}${colors.green}${message}${colors.reset}`
        );
    },

    // Error message
    error: (message, error = null, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.red}✗${colors.reset} ` +
            `${colors.bright}${colors.red}${message}${colors.reset}`
        );
        if (error) {
            console.log(`${colors.dim}${colors.red}  ↳ ${error.message || error}${colors.reset}`);
        }
    },

    // Warning message
    warn: (message, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.yellow}⚠${colors.reset} ` +
            `${colors.bright}${colors.yellow}${message}${colors.reset}`
        );
    },

    // Info message
    info: (message, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.cyan}ℹ${colors.reset} ` +
            `${colors.cyan}${message}${colors.reset}`
        );
    },

    // Database message
    database: (message, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.magenta}🗄️${colors.reset}  ` +
            `${colors.magenta}${message}${colors.reset}`
        );
    },

    // API message
    api: (message, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.blue}🌐${colors.reset} ` +
            `${colors.blue}${message}${colors.reset}`
        );
    },

    // Scheduler/Timer message
    schedule: (message, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.yellow}⏰${colors.reset} ` +
            `${colors.yellow}${message}${colors.reset}`
        );
    },

    // Character/User message
    character: (message, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.magenta}👤${colors.reset} ` +
            `${colors.magenta}${message}${colors.reset}`
        );
    },

    // Event message
    event: (message, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.green}🎯${colors.reset} ` +
            `${colors.green}${message}${colors.reset}`
        );
    },

    // Debug message
    debug: (message, data = null, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${colors.dim}🔍${colors.reset} ` +
            `${colors.dim}${message}${colors.reset}`
        );
        if (data) {
            console.log(`${colors.dim}  ↳`, data, colors.reset);
        }
    },

    // Server startup banner
    banner: (title, subtitle = '') => {
        console.log('\n');
        const titleText = `✨ ${title} ✨`;
        createBox(titleText, colors.cyan);
        if (subtitle) {
            const centerPadding = ' '.repeat(Math.max(0, Math.floor((60 - subtitle.length) / 2)));
            console.log(`${colors.dim}${colors.cyan}${centerPadding}${subtitle}${colors.reset}\n`);
        }
    },

    // Server ready message
    ready: (port, env = 'development') => {
        console.log('\n');
        createBox(
            `🚀 Server is Ready!\n` +
            `📍 Port: ${port}\n` +
            `🌍 Environment: ${env}\n` +
            `🔗 URL: http://localhost:${port}`,
            colors.green,
            ''
        );
        console.log('\n');
    },

    // Section divider
    divider: (label = '') => {
        if (label) {
            const totalWidth = 60;
            const labelWithSpaces = ` ${label} `;
            const dashCount = Math.floor((totalWidth - labelWithSpaces.length) / 2);
            const line = '─'.repeat(dashCount) + labelWithSpaces + '─'.repeat(dashCount);
            // Adjust if odd number
            const finalLine = line.length < totalWidth ? line + '─' : line;
            console.log(`\n${colors.dim}${colors.cyan}${finalLine}${colors.reset}\n`);
        } else {
            const line = '─'.repeat(60);
            console.log(`${colors.dim}${colors.cyan}${line}${colors.reset}`);
        }
    },

    // Group of related messages
    group: {
        start: (label, context = 'server.js') => {
            console.log(
                `\n${colors.dim}${getTimestamp()}${colors.reset} ` +
                `${formatContext(context)} ` +
                `${colors.cyan}▼ ${label}${colors.reset}`
            );
        },
        end: (label = '', context = 'server.js') => {
            console.log(
                `${colors.dim}${getTimestamp()}${colors.reset} ` +
                `${formatContext(context)} ` +
                `${colors.cyan}▲ ${label ? 'End ' + label : 'End'}${colors.reset}\n`
            );
        }
    },

    // Custom emoji message
    custom: (emoji, message, color = colors.white, context = 'server.js') => {
        console.log(
            `${colors.dim}${getTimestamp()}${colors.reset} ` +
            `${formatContext(context)} ` +
            `${emoji} ` +
            `${color}${message}${colors.reset}`
        );
    },

    // Startup summary (shows what was initialized)
    startupSummary: (items = []) => {
        console.log(`\n${colors.bright}${colors.green}✓ Startup Complete!${colors.reset}\n`);
        items.forEach(item => {
            console.log(`  ${colors.green}✓${colors.reset} ${colors.dim}${item}${colors.reset}`);
        });
    },

    // Blank line for spacing
    space: () => {
        console.log('');
    }
};

module.exports = logger;

