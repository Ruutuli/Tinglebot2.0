// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
// ------------------- Define the user schema -------------------
const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true }, // Unique Discord ID of the user
  googleSheetsUrl: { type: String, default: '' }, // URL to user's Google Sheets (if applicable)
  timezone: { type: String, default: 'UTC' }, // User's timezone (default to UTC)
  tokens: { type: Number, default: 0 }, // Number of tokens the user has
  tokenTracker: { type: String, default: '' }, // URL to token tracker
  tokensSynced: { type: Boolean, default: false }, // Track if tokens are synced
  blightedcharacter: { type: Boolean, default: false }, // Is the character blighted?
  characterSlot: { type: Number, default: 2 }, // Number of character slots available to the user

  // ------------------- Inactivity tracking fields -------------------
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }, // Activity status
  statusChangedAt: { type: Date, default: Date.now }, // When the status was last changed

  // ------------------- Message tracking fields -------------------
  lastMessageContent: { type: String, default: '' }, // Content of the last message sent
  lastMessageTimestamp: { type: Date }, // Timestamp of the last message

  // ------------------- Help Wanted Quest Tracking -------------------
  // Tracks Help Wanted quest completions, cooldowns, and history for this user
  helpWanted: {
    lastCompletion: { type: String, default: null }, // YYYY-MM-DD
    cooldownUntil: { type: Date, default: null },
    totalCompletions: { type: Number, default: 0 }, // Total number of Help Wanted quests completed
    completions: [
      {
        date: { type: String }, // YYYY-MM-DD
        village: { type: String },
        questType: { type: String },
        questId: { type: String },
        timestamp: { type: Date }
      }
    ]
  },

  // ------------------- Leveling System -------------------
  leveling: {
    xp: { type: Number, default: 0 }, // Total XP earned by the user
    level: { type: Number, default: 1 }, // Current level of the user
    lastMessageTime: { type: Date, default: null }, // Last time user sent a message (for cooldown)
    totalMessages: { type: Number, default: 0 }, // Total messages sent (for statistics)
    xpHistory: [{ // Track XP gains for analytics
      amount: { type: Number },
      source: { type: String }, // 'message', 'bonus', etc.
      timestamp: { type: Date, default: Date.now }
    }],
    lastExchangedLevel: { type: Number, default: 0 }, // Last level that was exchanged for tokens
    totalLevelsExchanged: { type: Number, default: 0 }, // Total levels exchanged for tokens
    exchangeHistory: [{ // Track level exchanges
      levelsExchanged: { type: Number },
      tokensReceived: { type: Number },
      timestamp: { type: Date, default: Date.now }
    }],
    hasImportedFromMee6: { type: Boolean, default: false }, // Track if user has imported from MEE6
    mee6ImportDate: { type: Date, default: null }, // When the import was performed
    importedMee6Level: { type: Number, default: null } // What level was imported from MEE6
  },

  // ------------------- Birthday System -------------------
  birthday: {
    month: { type: Number, min: 1, max: 12, default: null }, // Birthday month (1-12)
    day: { type: Number, min: 1, max: 31, default: null }, // Birthday day (1-31)
    lastBirthdayReward: { type: String, default: null }, // Last year they received birthday rewards (YYYY format)
    birthdayDiscountExpiresAt: { type: Date, default: null }, // When the birthday discount expires
    birthdayRewards: [{ // Track birthday rewards given
      year: { type: String }, // YYYY format
      rewardType: { type: String }, // 'tokens' or 'discount'
      amount: { type: Number }, // tokens received or discount percentage
      timestamp: { type: Date, default: Date.now }
    }]
  },

  // ------------------- Nitro Boost Rewards System -------------------
  boostRewards: {
    lastRewardMonth: { type: String, default: null }, // Last month rewards were given (YYYY-MM format)
    totalRewards: { type: Number, default: 0 }, // Total boost rewards received
    rewardHistory: [{ // Track boost reward history
      month: { type: String }, // YYYY-MM format
      boostCount: { type: Number }, // Number of boosts during that month
      tokensReceived: { type: Number }, // Tokens received (boostCount × 500)
      timestamp: { type: Date, default: Date.now }
    }]
  }
});

// ------------------- Static methods for leveling -------------------
userSchema.statics.getOrCreateUser = async function(discordId) {
  let user = await this.findOne({ discordId });
  if (!user) {
    user = new this({ discordId });
    await user.save();
  }
  return user;
};

userSchema.statics.getTopUsers = async function(limit = 10) {
  return this.find({}).sort({ 'leveling.level': -1, 'leveling.xp': -1 }).limit(limit);
};

// ------------------- Instance methods for leveling -------------------
userSchema.methods.addXP = async function(amount, source = 'message') {
  // Initialize leveling object if it doesn't exist
  if (!this.leveling) {
    this.leveling = {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0,
      xpHistory: []
    };
  }
  
  this.leveling.xp += amount;
  this.leveling.xpHistory.push({ amount, source, timestamp: new Date() });
  
  // Keep only last 50 XP gains for performance
  if (this.leveling.xpHistory.length > 50) {
    this.leveling.xpHistory = this.leveling.xpHistory.slice(-50);
  }
  
  // Check for level up
  const newLevel = this.calculateLevel();
  const leveledUp = newLevel > this.leveling.level;
  this.leveling.level = newLevel;
  
  await this.save();
  return { leveledUp, newLevel, oldLevel: this.leveling.level - (leveledUp ? 1 : 0) };
};

userSchema.methods.calculateLevel = function() {
  // MEE6-style exponential level calculation (DIRECT FORMULA)
  // Formula: XP = 5 × (level²) + 50 × level + 100
  // We solve for level using the quadratic formula
  // Level 1: 155 XP
  // Level 5: 475 XP
  // Level 10: 1,100 XP
  // Level 20: 3,100 XP
  // Level 50: 15,100 XP
  // Level 91: 46,055 XP
  if (!this.leveling || this.leveling.xp <= 0) return 1;
  
  const xp = this.leveling.xp;
  
  // Solve quadratic equation: 5*level² + 50*level + 100 = xp
  // Rearranged: 5*level² + 50*level + (100 - xp) = 0
  // Using quadratic formula: level = (-b + sqrt(b² - 4ac)) / 2a
  const a = 5;
  const b = 50;
  const c = 100 - xp;
  
  const discriminant = b * b - 4 * a * c;
  
  if (discriminant < 0) {
    return 1; // Not enough XP for level 1
  }
  
  const level = (-b + Math.sqrt(discriminant)) / (2 * a);
  return Math.max(1, Math.floor(level));
};

userSchema.methods.getXPRequiredForLevel = function(targetLevel) {
  // Calculate XP required to go from (targetLevel - 1) to targetLevel
  // Using MEE6-style formula: 5 × (level²) + 50 × level + 100
  if (targetLevel <= 1) return 0;
  return 5 * Math.pow(targetLevel, 2) + 50 * targetLevel + 100;
};

userSchema.methods.getXPForNextLevel = function() {
  // Get total XP required to reach the next level (MEE6 direct formula)
  if (!this.leveling) return this.getXPRequiredForLevel(2); // Default to level 2 requirement
  
  const nextLevel = this.leveling.level + 1;
  return this.getXPRequiredForLevel(nextLevel);
};

userSchema.methods.getProgressToNextLevel = function() {
  if (!this.leveling) {
    const xpNeeded = this.getXPRequiredForLevel(2);
    return { current: 0, needed: xpNeeded, percentage: 0 };
  }
  
  // MEE6 direct formula - XP represents the current level's XP
  const currentLevelXP = this.getXPRequiredForLevel(this.leveling.level);
  const nextLevelXP = this.getXPRequiredForLevel(this.leveling.level + 1);
  
  // Calculate progress: how much XP past current level threshold
  const progressXP = Math.max(0, this.leveling.xp - currentLevelXP);
  const xpNeededForNextLevel = nextLevelXP - currentLevelXP;
  
  const percentage = Math.min(100, Math.max(0, Math.round((progressXP / xpNeededForNextLevel) * 100)));
  
  return {
    current: progressXP,
    needed: xpNeededForNextLevel,
    percentage: percentage
  };
};

userSchema.methods.canGainXP = function() {
  if (!this.leveling || !this.leveling.lastMessageTime) return true;
  
  const cooldownMs = 60 * 1000; // 1 minute cooldown
  const timeSinceLastMessage = Date.now() - this.leveling.lastMessageTime.getTime();
  
  return timeSinceLastMessage >= cooldownMs;
};

userSchema.methods.updateMessageTime = async function() {
  // Initialize leveling object if it doesn't exist
  if (!this.leveling) {
    this.leveling = {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0,
      xpHistory: [],
      lastExchangedLevel: 0,
      totalLevelsExchanged: 0,
      exchangeHistory: [],
      hasImportedFromMee6: false,
      mee6ImportDate: null,
      importedMee6Level: null
    };
  }
  
  this.leveling.lastMessageTime = new Date();
  this.leveling.totalMessages++;
  await this.save();
};

userSchema.methods.exchangeLevelsForTokens = async function() {
  // Initialize leveling object if it doesn't exist
  if (!this.leveling) {
    this.leveling = {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0,
      xpHistory: [],
      lastExchangedLevel: 0,
      totalLevelsExchanged: 0,
      exchangeHistory: [],
      hasImportedFromMee6: false,
      mee6ImportDate: null,
      importedMee6Level: null
    };
  }
  
  const currentLevel = this.leveling.level;
  const lastExchangedLevel = this.leveling.lastExchangedLevel || 0;
  
  // Calculate how many levels can be exchanged
  const levelsToExchange = currentLevel - lastExchangedLevel;
  
  if (levelsToExchange <= 0) {
    return {
      success: false,
      message: 'No new levels to exchange! You need to level up more.',
      levelsExchanged: 0,
      tokensReceived: 0
    };
  }
  
  // Calculate tokens (1 level = 100 tokens)
  const tokensToReceive = levelsToExchange * 100;
  
  // Update exchange tracking
  this.leveling.lastExchangedLevel = currentLevel;
  this.leveling.totalLevelsExchanged += levelsToExchange;
  
  // Add to exchange history
  this.leveling.exchangeHistory.push({
    levelsExchanged: levelsToExchange,
    tokensReceived: tokensToReceive,
    timestamp: new Date()
  });
  
  // Keep only last 20 exchange records for performance
  if (this.leveling.exchangeHistory.length > 20) {
    this.leveling.exchangeHistory = this.leveling.exchangeHistory.slice(-20);
  }
  
  await this.save();
  
  return {
    success: true,
    message: `Successfully exchanged ${levelsToExchange} levels for ${tokensToReceive} tokens!`,
    levelsExchanged: levelsToExchange,
    tokensReceived: tokensToReceive,
    currentLevel: currentLevel,
    lastExchangedLevel: lastExchangedLevel,
    totalMessages: this.leveling.totalMessages
  };
};

userSchema.methods.getExchangeableLevels = function() {
  if (!this.leveling) {
    return {
      currentLevel: 1,
      lastExchangedLevel: 0,
      exchangeableLevels: 0,
      potentialTokens: 0
    };
  }
  
  const currentLevel = this.leveling.level;
  const lastExchangedLevel = this.leveling.lastExchangedLevel || 0;
  const exchangeableLevels = Math.max(0, currentLevel - lastExchangedLevel);
  const potentialTokens = exchangeableLevels * 100;
  
  return {
    currentLevel: currentLevel,
    lastExchangedLevel: lastExchangedLevel,
    exchangeableLevels: exchangeableLevels,
    potentialTokens: potentialTokens
  };
};

userSchema.methods.getTotalXPForLevel = function(targetLevel) {
  // Calculate XP for a specific level using MEE6's direct formula
  // Formula: XP = 5 × (level²) + 50 × level + 100
  return this.getXPRequiredForLevel(targetLevel);
};

userSchema.methods.importMee6Levels = async function(mee6Level, lastExchangedLevel = 0) {
  // Check if user has already imported from MEE6
  if (this.leveling?.hasImportedFromMee6) {
    return {
      success: false,
      message: 'You have already imported your levels from MEE6. Import can only be done once.',
      hasImported: true
    };
  }
  
  // Validate input
  if (!mee6Level || mee6Level < 1 || mee6Level > 1000) {
    return {
      success: false,
      message: 'Invalid MEE6 level. Please provide a level between 1 and 1000.',
      hasImported: false
    };
  }
  
  if (lastExchangedLevel < 0 || lastExchangedLevel >= mee6Level) {
    return {
      success: false,
      message: 'Invalid last exchanged level. Must be between 0 and your current MEE6 level.',
      hasImported: false
    };
  }
  
  // Initialize leveling object if it doesn't exist
  if (!this.leveling) {
    this.leveling = {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0,
      xpHistory: [],
      lastExchangedLevel: 0,
      totalLevelsExchanged: 0,
      exchangeHistory: [],
      hasImportedFromMee6: false,
      mee6ImportDate: null,
      importedMee6Level: null
    };
  }
  
  // Calculate XP for the MEE6 level using direct formula
  // MEE6 uses: XP = 5 × (level²) + 50 × level + 100 (direct, not cumulative)
  const xpRequired = this.getTotalXPForLevel(mee6Level);
  
  // Set the level and XP
  this.leveling.level = mee6Level;
  this.leveling.xp = xpRequired;
  
  // Set exchange tracking to prevent double rewards
  this.leveling.lastExchangedLevel = lastExchangedLevel;
  
  // Mark as imported
  this.leveling.hasImportedFromMee6 = true;
  this.leveling.mee6ImportDate = new Date();
  this.leveling.importedMee6Level = mee6Level;
  
  // Calculate exchangeable levels
  const exchangeableLevels = Math.max(0, mee6Level - lastExchangedLevel);
  const potentialTokens = exchangeableLevels * 100;
  
  await this.save();
  
  return {
    success: true,
    message: `Successfully imported Level ${mee6Level} from MEE6!`,
    importedLevel: mee6Level,
    lastExchangedLevel: lastExchangedLevel,
    exchangeableLevels: exchangeableLevels,
    potentialTokens: potentialTokens,
    hasImported: true
  };
};

// ------------------- Birthday Methods -------------------
userSchema.methods.setBirthday = async function(month, day) {
  // Initialize birthday object if it doesn't exist
  if (!this.birthday) {
    this.birthday = {
      month: null,
      day: null,
      lastBirthdayReward: null,
      birthdayRewards: []
    };
  }
  
  // Validate date
  if (!this.isValidBirthday(month, day)) {
    return {
      success: false,
      message: 'Invalid birthday date. Please check the month and day.'
    };
  }
  
  this.birthday.month = month;
  this.birthday.day = day;
  
  await this.save();
  
  return {
    success: true,
    message: `Birthday set to ${this.formatBirthday()}!`,
    birthday: this.formatBirthday()
  };
};

userSchema.methods.isValidBirthday = function(month, day) {
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  
  // Check if day is valid for the month
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) {
    return false;
  }
  
  // Allow February 29th (they'll get rewards on Feb 28 in non-leap years)
  return true;
};

userSchema.methods.formatBirthday = function() {
  if (!this.birthday || !this.birthday.month || !this.birthday.day) {
    return null;
  }
  
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  
  const monthName = months[this.birthday.month - 1];
  const day = this.birthday.day;
  
  return `${monthName} ${day}`;
};

userSchema.methods.isBirthdayToday = function() {
  if (!this.birthday || !this.birthday.month || !this.birthday.day) {
    return false;
  }
  
  const today = new Date();
  return today.getMonth() + 1 === this.birthday.month && today.getDate() === this.birthday.day;
};

userSchema.methods.giveBirthdayRewards = async function(rewardType = 'random') {
  if (!this.birthday || !this.birthday.month || !this.birthday.day) {
    return {
      success: false,
      message: 'No birthday set'
    };
  }
  
  const currentYear = new Date().getFullYear().toString();
  
  // Check if already received rewards this year
  if (this.birthday.lastBirthdayReward === currentYear) {
    return {
      success: false,
      message: 'Birthday rewards already given this year'
    };
  }
  
  // Determine reward type
  let finalRewardType = rewardType;
  if (rewardType === 'random') {
    finalRewardType = Math.random() < 0.5 ? 'tokens' : 'discount';
  }
  
  let rewardAmount = 0;
  let rewardDescription = '';
  
  if (finalRewardType === 'tokens') {
    rewardAmount = 1500;
    this.tokens = (this.tokens || 0) + rewardAmount;
    rewardDescription = `1500 tokens`;
  } else if (finalRewardType === 'discount') {
    rewardAmount = 75;
    rewardDescription = `75% discount in village shops (active until end of your birthday)`;
    
    // Set discount to expire at end of birthday (11:59:59 PM)
    const now = new Date();
    const expirationDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    this.birthday.birthdayDiscountExpiresAt = expirationDate;
  }
  
  // Update birthday tracking
  this.birthday.lastBirthdayReward = currentYear;
  this.birthday.birthdayRewards.push({
    year: currentYear,
    rewardType: finalRewardType,
    amount: rewardAmount,
    timestamp: new Date()
  });
  
  // Keep only last 10 birthday reward records
  if (this.birthday.birthdayRewards.length > 10) {
    this.birthday.birthdayRewards = this.birthday.birthdayRewards.slice(-10);
  }
  
  await this.save();
  
  return {
    success: true,
    message: 'Birthday rewards given!',
    rewardType: finalRewardType,
    rewardAmount: rewardAmount,
    rewardDescription: rewardDescription,
    newTokenBalance: this.tokens
  };
};

userSchema.methods.hasBirthdayDiscount = function() {
  if (!this.birthday || !this.birthday.birthdayDiscountExpiresAt) {
    return false;
  }
  
  const now = new Date();
  return now < this.birthday.birthdayDiscountExpiresAt;
};

userSchema.methods.getBirthdayDiscountAmount = function() {
  if (this.hasBirthdayDiscount()) {
    return 75; // 75% discount
  }
  return 0;
};

// ------------------- Boost Reward Methods -------------------
userSchema.methods.giveBoostRewards = async function() {
  // Initialize boostRewards object if it doesn't exist
  if (!this.boostRewards) {
    this.boostRewards = {
      lastRewardMonth: null,
      totalRewards: 0,
      rewardHistory: []
    };
  }
  
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Check if already received rewards this month
  if (this.boostRewards.lastRewardMonth === currentMonth) {
    return {
      success: false,
      message: 'Boost rewards already given this month',
      alreadyRewarded: true
    };
  }
  
  // Flat reward: 1000 tokens for boosting
  const tokensToReceive = 1000;
  
  // Add tokens
  this.tokens = (this.tokens || 0) + tokensToReceive;
  
  // Update boost reward tracking
  this.boostRewards.lastRewardMonth = currentMonth;
  this.boostRewards.totalRewards += tokensToReceive;
  
  // Add to reward history
  this.boostRewards.rewardHistory.push({
    month: currentMonth,
    boostCount: 1, // Track as 1 entry for history purposes
    tokensReceived: tokensToReceive,
    timestamp: now
  });
  
  // Keep only last 12 months of history
  if (this.boostRewards.rewardHistory.length > 12) {
    this.boostRewards.rewardHistory = this.boostRewards.rewardHistory.slice(-12);
  }
  
  await this.save();
  
  return {
    success: true,
    message: `Received ${tokensToReceive} tokens for boosting the server!`,
    tokensReceived: tokensToReceive,
    newTokenBalance: this.tokens,
    month: currentMonth
  };
};

// ------------------- Export the User model -------------------
const User = mongoose.model('User', userSchema);
module.exports = User;
