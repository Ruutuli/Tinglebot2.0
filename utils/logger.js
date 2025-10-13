// ============================================================================
// ------------------- Enhanced Logging Utility -------------------
// Provides consistent, colorized, and categorized logging throughout the bot
// ============================================================================

// ============================================================================
// ------------------- ANSI Color Codes -------------------
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// Helper functions to apply colors
const color = {
  blue: (text) => `${colors.blue}${text}${colors.reset}`,
  cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
  green: (text) => `${colors.green}${text}${colors.reset}`,
  yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
  red: (text) => `${colors.red}${text}${colors.reset}`,
  magenta: (text) => `${colors.magenta}${text}${colors.reset}`,
  white: (text) => `${colors.white}${text}${colors.reset}`,
  gray: (text) => `${colors.gray}${text}${colors.reset}`,
  bold: (text) => `${colors.bright}${text}${colors.reset}`
};

// ============================================================================
// ------------------- Log Categories & Colors -------------------
// ============================================================================

const CATEGORIES = {
  // Core Systems
  SYSTEM: { emoji: '⚙️', color: color.blue, label: 'SYS' },
  DATABASE: { emoji: '💾', color: color.cyan, label: 'DB' },
  API: { emoji: '🌐', color: color.magenta, label: 'API' },
  STORAGE: { emoji: '📦', color: color.cyan, label: 'STOR' },
  VALIDATION: { emoji: '✔️', color: color.green, label: 'VALD' },
  SYNC: { emoji: '🔄', color: color.blue, label: 'SYNC' },
  
  // Game Features - Combat & Encounters
  MINIGAME: { emoji: '🎮', color: color.yellow, label: 'GAME' },
  QUEST: { emoji: '📜', color: color.green, label: 'QUST' },
  RAID: { emoji: '⚔️', color: color.red, label: 'RAID' },
  PVP: { emoji: '⚔️', color: color.red, label: 'PVP' },
  COMBAT: { emoji: '💥', color: color.red, label: 'CMBT' },
  ENCOUNTER: { emoji: '👹', color: color.red, label: 'ENCTR' },
  MONSTER: { emoji: '👾', color: color.magenta, label: 'MNSTR' },
  
  // Game Features - Special Systems
  BLIGHT: { emoji: '🦠', color: color.magenta, label: 'BLGHT' },
  RELIC: { emoji: '💠', color: color.cyan, label: 'RELC' },
  SUBMISSION: { emoji: '📋', color: color.blue, label: 'SUBM' },
  
  // Jobs & Economy
  JOB: { emoji: '💼', color: color.cyan, label: 'JOB' },
  HEAL: { emoji: '💚', color: color.green, label: 'HEAL' },
  LOOT: { emoji: '💎', color: color.yellow, label: 'LOOT' },
  GATHER: { emoji: '🌿', color: color.green, label: 'GTHR' },
  CRAFT: { emoji: '🔨', color: color.yellow, label: 'CRFT' },
  ECONOMY: { emoji: '💰', color: color.yellow, label: 'ECON' },
  TRADE: { emoji: '🤝', color: color.yellow, label: 'TRDE' },
  VENDING: { emoji: '🏪', color: color.yellow, label: 'VEND' },
  
  // Character & Progression
  CHARACTER: { emoji: '👤', color: color.cyan, label: 'CHAR' },
  LEVEL: { emoji: '⭐', color: color.yellow, label: 'LVL' },
  BOOST: { emoji: '🚀', color: color.magenta, label: 'BOST' },
  GEAR: { emoji: '🛡️', color: color.blue, label: 'GEAR' },
  INVENTORY: { emoji: '🎒', color: color.cyan, label: 'INVT' },
  BUFF: { emoji: '✨', color: color.green, label: 'BUFF' },
  ELIXIR: { emoji: '🧪', color: color.magenta, label: 'ELXR' },
  
  // Companions & NPCs
  MOUNT: { emoji: '🐴', color: color.yellow, label: 'MNT' },
  PET: { emoji: '🐾', color: color.yellow, label: 'PET' },
  NPC: { emoji: '🧙', color: color.blue, label: 'NPC' },
  PARTY: { emoji: '👥', color: color.cyan, label: 'PRTY' },
  
  // World & Environment
  VILLAGE: { emoji: '🏘️', color: color.green, label: 'VLGE' },
  WEATHER: { emoji: '🌤️', color: color.cyan, label: 'WTHR' },
  TRAVEL: { emoji: '🗺️', color: color.blue, label: 'TRVL' },
  MAP: { emoji: '🗾', color: color.blue, label: 'MAP' },
  EXPLORE: { emoji: '🧭', color: color.green, label: 'EXPL' },
  BLOODMOON: { emoji: '🌕', color: color.red, label: 'MOON' },
  SEASON: { emoji: '🍂', color: color.yellow, label: 'SESN' },
  
  // Automation & Maintenance
  SCHEDULER: { emoji: '⏰', color: color.blue, label: 'SCHD' },
  CLEANUP: { emoji: '🧹', color: color.gray, label: 'CLEN' },
  MIGRATION: { emoji: '🔀', color: color.blue, label: 'MIGR' },
  
  // User Interaction
  COMMAND: { emoji: '📝', color: color.white, label: 'CMD' },
  INTERACTION: { emoji: '🔄', color: color.white, label: 'INTR' },
  AUTOCOMPLETE: { emoji: '💬', color: color.magenta, label: 'AUTO' },
  BUTTON: { emoji: '🔘', color: color.white, label: 'BTN' },
  MODAL: { emoji: '📄', color: color.white, label: 'MODL' },
  MENU: { emoji: '📋', color: color.white, label: 'MENU' },
  
  // Moderation & Security
  MODERATION: { emoji: '🛡️', color: color.red, label: 'MOD' },
  SECURITY: { emoji: '🔒', color: color.red, label: 'SEC' },
  PERMISSION: { emoji: '🔑', color: color.yellow, label: 'PERM' },
  
  // Debugging & Errors
  DEBUG: { emoji: '🔍', color: color.gray, label: 'DEBG' },
  WARNING: { emoji: '⚠️', color: color.yellow, label: 'WARN' },
  ERROR: { emoji: '❌', color: color.red, label: 'ERR' },
  SUCCESS: { emoji: '✅', color: color.green, label: 'OK' }
};

// ============================================================================
// ------------------- Core Logging Functions -------------------
// ============================================================================

/**
 * Main logging function with category support
 * @param {string} category - Category key from CATEGORIES
 * @param {string} message - Log message
 * @param {object} data - Optional data to display (will be formatted)
 */
function log(category, message, data = null) {
  const cat = CATEGORIES[category] || CATEGORIES.SYSTEM;
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
  
  const prefix = `${cat.emoji} ${cat.color(`[${cat.label}]`)} ${color.gray(timestamp)}`;
  const formattedMessage = cat.color(message);
  
  if (data) {
    const formattedData = formatData(data);
    console.log(`${prefix} ${formattedMessage}`, formattedData);
  } else {
    console.log(`${prefix} ${formattedMessage}`);
  }
}

/**
 * Info log - neutral information
 */
function info(category, message, data = null) {
  log(category, message, data);
}

/**
 * Success log - positive outcome
 */
function success(category, message, data = null) {
  const cat = CATEGORIES[category] || CATEGORIES.SYSTEM;
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = `✅ ${cat.color(`[${cat.label}]`)} ${color.gray(timestamp)}`;
  
  if (data) {
    console.log(`${prefix} ${color.green(message)}`, formatData(data));
  } else {
    console.log(`${prefix} ${color.green(message)}`);
  }
}

/**
 * Warning log - potential issues
 */
function warn(category, message, data = null) {
  const cat = CATEGORIES[category] || CATEGORIES.SYSTEM;
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = `⚠️  ${cat.color(`[${cat.label}]`)} ${color.gray(timestamp)}`;
  
  if (data) {
    console.log(`${prefix} ${color.yellow(message)}`, formatData(data));
  } else {
    console.log(`${prefix} ${color.yellow(message)}`);
  }
}

/**
 * Error log - failures and exceptions
 */
function error(category, message, data = null) {
  const cat = CATEGORIES[category] || CATEGORIES.SYSTEM;
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = `❌ ${cat.color(`[${cat.label}]`)} ${color.gray(timestamp)}`;
  
  if (data) {
    console.error(`${prefix} ${color.red(message)}`, formatData(data));
  } else {
    console.error(`${prefix} ${color.red(message)}`);
  }
}

/**
 * Debug log - detailed information for debugging
 */
function debug(category, message, data = null) {
  // Only log debug in development or if DEBUG env var is set
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
    const cat = CATEGORIES[category] || CATEGORIES.SYSTEM;
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = `🔍 ${color.gray(`[${cat.label}]`)} ${color.gray(timestamp)}`;
    
    if (data) {
      console.log(`${prefix} ${color.gray(message)}`, formatData(data));
    } else {
      console.log(`${prefix} ${color.gray(message)}`);
    }
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

/**
 * Format data for clean display
 */
function formatData(data) {
  if (typeof data === 'string') return data;
  if (typeof data === 'number') return data.toString();
  if (Array.isArray(data) && data.length < 5) {
    return color.gray(`[${data.join(', ')}]`);
  }
  if (Array.isArray(data)) {
    return color.gray(`[${data.length} items]`);
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length <= 3) {
      return color.gray(JSON.stringify(data, null, 0));
    }
    return color.gray(`{${keys.length} properties}`);
  }
  return String(data);
}

/**
 * Log a separator line for visual organization
 */
function separator(char = '─', length = 60) {
  console.log(color.gray(char.repeat(length)));
}

/**
 * Log a section header
 */
function section(title) {
  console.log('');
  separator('═');
  console.log(color.bold(color.cyan(`  ${title}`)));
  separator('═');
}

// ============================================================================
// ------------------- Specialized Logging Functions -------------------
// ============================================================================

/**
 * Log minigame actions with consistent formatting
 */
const minigame = {
  round: (round) => info('MINIGAME', `Round ${round} started`),
  roll: (player, target, result, required) => {
    const outcome = result >= required ? 'HIT' : 'MISS';
    const symbol = result >= required ? '🎯' : '💥';
    info('MINIGAME', `${symbol} ${player} → ${target} | Roll: ${result}/${required} [${outcome}]`);
  },
  spawn: (count, positions) => info('MINIGAME', `Spawned ${count} alien${count !== 1 ? 's' : ''}`, positions),
  victory: (round, saved, total) => success('MINIGAME', `Victory! Round ${round} | Saved: ${saved}/${total}`)
};

/**
 * Log leveling with consistent formatting
 */
const leveling = {
  xp: (username, xp, level) => info('LEVEL', `${username} +${xp}XP (Lv.${level})`)
};

/**
 * Log loot/gather with consistent formatting
 */
const loot = {
  found: (character, item, quantity = 1) => {
    const qty = quantity > 1 ? ` x${quantity}` : '';
    success('LOOT', `${character} found ${item}${qty}`);
  },
  encounter: (character, monster, outcome) => {
    info('LOOT', `${character} vs ${monster} → ${outcome}`);
  }
};

/**
 * Log quest activities
 */
const quest = {
  posted: (count, village) => success('QUEST', `Posted ${count} quest${count !== 1 ? 's' : ''} to ${village}`),
  completed: (questId, participants) => success('QUEST', `${questId} completed by ${participants} player${participants !== 1 ? 's' : ''}`)
};

/**
 * Log scheduler activities
 */
const scheduler = {
  job: (name) => info('SCHEDULER', `Running: ${name}`),
  complete: (name, details = '') => success('SCHEDULER', `${name} complete${details ? `: ${details}` : ''}`)
};

// ============================================================================
// ------------------- Exports -------------------
// ============================================================================

module.exports = {
  log,
  info,
  success,
  warn,
  error,
  debug,
  separator,
  section,
  // Specialized loggers
  minigame,
  leveling,
  loot,
  quest,
  scheduler,
  // Export categories for custom use
  CATEGORIES
};

