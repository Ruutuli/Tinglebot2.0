// ============================================================================
// ------------------- Logger Utility -------------------
// Provides colorful console logging with emojis and formatting for Tinglebot
// ============================================================================

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

// ------------------- ANSI Color Codes ------------------
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// ------------------- Box Drawing Characters ------------------
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

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- getTimestamp ------------------
// Returns formatted timestamp string
const getTimestamp = () => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// ------------------- getContextColor ------------------
// Returns color code for context tag based on context type
const getContextColor = (context) => {
  const ctx = String(context || '').toUpperCase();
  if (ctx.includes('DB') || ctx.includes('DATABASE')) return colors.cyan;
  if (ctx.includes('SYS') || ctx.includes('SYSTEM')) return colors.blue;
  if (ctx.includes('CLEN') || ctx.includes('CLEANUP')) return colors.dim;
  if (ctx.includes('MOON') || ctx.includes('BLOODMOON')) return colors.red;
  if (ctx.includes('WTHR') || ctx.includes('WEATHER')) return colors.cyan;
  if (ctx.includes('QUST') || ctx.includes('QUEST')) return colors.green;
  if (ctx.includes('LOOT')) return colors.yellow;
  if (ctx.includes('CMBT') || ctx.includes('COMBAT')) return colors.red;
  if (ctx.includes('TRVL') || ctx.includes('TRAVEL')) return colors.blue;
  if (ctx.includes('LVL') || ctx.includes('LEVEL')) return colors.yellow;
  if (ctx.includes('EXPLORE')) return colors.green;
  return colors.cyan;
};

// ------------------- getMessageColor ------------------
// Returns color code for message text based on context type
const getMessageColor = (context) => {
  const ctx = String(context || '').toUpperCase();
  if (ctx.includes('DB') || ctx.includes('DATABASE')) return colors.cyan;
  if (ctx.includes('CLEN') || ctx.includes('CLEANUP')) return colors.dim;
  if (ctx.includes('SYS') || ctx.includes('SYSTEM')) return colors.blue;
  if (ctx.includes('MOON') || ctx.includes('BLOODMOON')) return colors.red;
  if (ctx.includes('WTHR') || ctx.includes('WEATHER')) return colors.cyan;
  if (ctx.includes('QUST') || ctx.includes('QUEST')) return colors.green;
  if (ctx.includes('LOOT')) return colors.yellow;
  if (ctx.includes('CMBT') || ctx.includes('COMBAT')) return colors.red;
  if (ctx.includes('TRVL') || ctx.includes('TRAVEL')) return colors.blue;
  if (ctx.includes('LVL') || ctx.includes('LEVEL')) return colors.yellow;
  if (ctx.includes('EXPLORE')) return colors.green;
  return colors.cyan;
};

// ------------------- getContextEmoji ------------------
// Returns default emoji for context type
const getContextEmoji = (context) => {
  const ctx = String(context || '').toUpperCase();
  if (ctx.includes('DB') || ctx.includes('DATABASE')) return '💾 ';
  if (ctx.includes('CLEN') || ctx.includes('CLEANUP')) return '🧹 ';
  if (ctx.includes('SYS') || ctx.includes('SYSTEM')) return '⚙️ ';
  if (ctx.includes('EXPLORE')) return '🗺️ ';
  return 'ℹ️ ';
};

// ------------------- formatContext ------------------
// Formats context tag with appropriate color
const formatContext = (context) => {
  const color = getContextColor(context);
  return `${color}[${context}]${colors.reset}`;
};

// ------------------- getDisplayLength ------------------
// Calculates display length accounting for emoji width
const getDisplayLength = (str) => {
  const emojiCount = (str.match(/\p{Emoji}/gu) || []).length;
  return str.length + emojiCount;
};

// ------------------- createBox ------------------
// Creates a boxed message with borders
const createBox = (message, color = colors.cyan) => {
  const lines = message.split('\n');
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

// ============================================================================
// ------------------- Logger Functions -------------------
// ============================================================================

const logger = {
  // ------------------- success ------------------
  // Logs success message with green checkmark
  success: (context, message) => {
    console.log(
      `${colors.green}✅${colors.reset} ` +
      `${formatContext(context)} ` +
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${colors.green}${message}${colors.reset}`
    );
  },

  // ------------------- error ------------------
  // Logs error message with red X
  error: (context, message, error = null) => {
    console.log(
      `${colors.red}✗${colors.reset} ` +
      `${formatContext(context)} ` +
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${colors.red}${message}${colors.reset}`
    );
    if (error) {
      console.log(`${colors.dim}${colors.red}  ↳ ${error.message || error}${colors.reset}`);
    }
  },

  // ------------------- warn ------------------
  // Logs warning message with yellow warning symbol
  warn: (context, message) => {
    console.log(
      `${colors.yellow}⚠${colors.reset} ` +
      `${formatContext(context)} ` +
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${colors.yellow}${message}${colors.reset}`
    );
  },

  // ------------------- info ------------------
  // Logs info message with context-appropriate emoji and color
  info: (context, message) => {
    const emojiMatch = message.match(/^(\p{Emoji}+)\s/u);
    let emoji = '';
    let cleanMessage = message;

    if (emojiMatch) {
      emoji = emojiMatch[1] + ' ';
      cleanMessage = message.substring(emojiMatch[0].length);
    } else {
      emoji = getContextEmoji(context);
    }

    const messageColor = getMessageColor(context);
    console.log(
      `${emoji}${formatContext(context)} ` +
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${messageColor}${cleanMessage}${colors.reset}`
    );
  },

  // ------------------- database ------------------
  // Logs database-related message
  database: (message, context = 'DB') => {
    console.log(
      `💾 ${formatContext(context)} ` +
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${colors.cyan}${message}${colors.reset}`
    );
  },

  // ------------------- api ------------------
  // Logs API-related message
  api: (message, context = 'server.js') => {
    console.log(
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${formatContext(context)} ` +
      `${colors.blue}🌐${colors.reset} ` +
      `${colors.blue}${message}${colors.reset}`
    );
  },

  // ------------------- schedule ------------------
  schedule: (message, context = 'SCHD') => {
    console.log(
      `⏰ ${formatContext(context)} ` +
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${colors.blue}${message}${colors.reset}`
    );
  },

  // ------------------- character ------------------
  // Logs character/user-related message
  character: (message, context = 'server.js') => {
    console.log(
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${formatContext(context)} ` +
      `${colors.magenta}👤${colors.reset} ` +
      `${colors.magenta}${message}${colors.reset}`
    );
  },

  // ------------------- event ------------------
  // Logs event message
  event: (message, context = 'server.js') => {
    console.log(
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${formatContext(context)} ` +
      `${colors.green}🎯${colors.reset} ` +
      `${colors.green}${message}${colors.reset}`
    );
  },

  // ------------------- debug ------------------
  // Logs debug message
  debug: (message, data = null, context = 'server.js') => {
    console.log(
      `🔍 ${formatContext(context)} ` +
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${colors.dim}${message}${colors.reset}`
    );
    if (data) {
      console.log(`${colors.dim}  ↳`, data, colors.reset);
    }
  },

  // ------------------- banner ------------------
  // Displays server startup banner (compact)
  banner: (title, subtitle = '') => {
    const titleText = `✨ ${title} ✨`;
    createBox(titleText, colors.cyan);
    if (subtitle) {
      const centerPadding = ' '.repeat(Math.max(0, Math.floor((60 - subtitle.length) / 2)));
      console.log(`${colors.dim}${colors.cyan}${centerPadding}${subtitle}${colors.reset}`);
    }
  },

  // ------------------- ready ------------------
  // Displays server ready message (compact)
  ready: (port, env = 'development') => {
    createBox(
      `🚀 Server is Ready!\n` +
      `📍 Port: ${port}\n` +
      `🌍 Environment: ${env}\n` +
      `🔗 URL: http://localhost:${port}`,
      colors.green
    );
  },

  // ------------------- divider ------------------
  // Creates section divider with optional label (compact)
  divider: (label = '') => {
    if (label) {
      const totalWidth = 60;
      const labelWithSpaces = ` ${label} `;
      const dashCount = Math.floor((totalWidth - labelWithSpaces.length) / 2);
      const line = '─'.repeat(dashCount) + labelWithSpaces + '─'.repeat(dashCount);
      const finalLine = line.length < totalWidth ? line + '─' : line;
      console.log(`${colors.dim}${finalLine}${colors.reset}`);
    } else {
      const line = '─'.repeat(60);
      console.log(`${colors.dim}${line}${colors.reset}`);
    }
  },

  // ------------------- group ------------------
  // Group message functions for related log entries
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
    },
  },

  // ------------------- custom ------------------
  // Logs custom emoji message
  custom: (emoji, message, color = colors.white, context = 'server.js') => {
    console.log(
      `${colors.dim}${getTimestamp()}${colors.reset} ` +
      `${formatContext(context)} ` +
      `${emoji} ` +
      `${color}${message}${colors.reset}`
    );
  },

  // ------------------- startupSummary ------------------
  // Displays startup summary with initialized items
  startupSummary: (items = []) => {
    console.log(`\n${colors.bright}${colors.green}✓ Startup Complete!${colors.reset}\n`);
    items.forEach(item => {
      console.log(`  ${colors.green}✓${colors.reset} ${colors.dim}${item}${colors.reset}`);
    });
  },

  // ------------------- space ------------------
  // Outputs blank line for spacing
  space: () => {
    console.log('');
  },

  // ------------------- separator ------------------
  // Creates separator line with specified character and length
  separator: (char = '─', length = 60) => {
    const line = char.repeat(length);
    console.log(`${colors.dim}${line}${colors.reset}`);
  },

  // ------------------- section ------------------
  // Creates centered section header (compact, no extra spacing)
  section: (title) => {
    const totalWidth = 60;
    const titleWithSpaces = ` ${title} `;
    const padding = Math.floor((totalWidth - titleWithSpaces.length) / 2);
    const leftPadding = ' '.repeat(Math.max(0, padding));
    const rightPadding = ' '.repeat(Math.max(0, totalWidth - titleWithSpaces.length - padding));
    console.log(`${colors.bright}${colors.cyan}${leftPadding}${titleWithSpaces}${rightPadding}${colors.reset}`);
  },
};

module.exports = logger;
