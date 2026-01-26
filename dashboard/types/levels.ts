/**
 * TypeScript types for Levels & Progression page
 */

export type LeaderboardEntry = {
  rank: number;
  username: string;
  nickname?: string;
  level: number;
  totalXP: number;
  messages: number;
  avatar?: string;
  discordId: string;
};

export type BlupeeHunterEntry = {
  rank: number;
  username: string;
  nickname?: string;
  totalClaimed: number;
  lastClaimed: Date | string | null;
  avatar?: string;
  discordId: string;
};

export type MyRankData = {
  level: number;
  rank: number;
  totalXP: number;
  messages: number;
  currentXP: number;
  nextLevelXP: number;
  progressPercentage: number;
  exchangeableLevels: number;
  potentialTokens: number;
  hasImportedFromMee6: boolean;
  importedMee6Level: number | null;
};

export type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[];
};

export type BlupeeHuntersResponse = {
  leaderboard: BlupeeHunterEntry[];
};

export type ExchangePreview = {
  exchangeableLevels: number;
  potentialTokens: number;
  currentLevel: number;
  lastExchangedLevel: number;
  totalLevelsExchanged: number;
  currentTokenBalance: number;
};

export type ExchangeResponse = {
  success: boolean;
  levelsExchanged: number;
  tokensReceived: number;
  newLevel: number;
  error?: string;
};
