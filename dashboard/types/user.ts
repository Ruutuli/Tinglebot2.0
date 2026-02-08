/**
 * TypeScript types for UserModel data structure
 * Based on models/UserModel.js schema
 */

export type HelpWantedCompletion = {
  date: string; // YYYY-MM-DD
  village: string;
  questType: string;
  questId: string;
  timestamp: Date | string;
};

export type HelpWanted = {
  lastCompletion: string | null; // YYYY-MM-DD
  cooldownUntil: Date | string | null;
  totalCompletions: number;
  currentCompletions: number;
  lastExchangeAmount: number;
  lastExchangeAt: Date | string | null;
  completions: HelpWantedCompletion[];
};

export type XPHistoryEntry = {
  amount: number;
  source: string;
  timestamp: Date | string;
};

export type ExchangeHistoryEntry = {
  levelsExchanged: number;
  tokensReceived: number;
  timestamp: Date | string;
};

export type Leveling = {
  xp: number;
  level: number;
  lastMessageTime: Date | string | null;
  totalMessages: number;
  xpHistory: XPHistoryEntry[];
  lastExchangedLevel: number;
  totalLevelsExchanged: number;
  exchangeHistory: ExchangeHistoryEntry[];
  hasImportedFromMee6: boolean;
  mee6ImportDate: Date | string | null;
  importedMee6Level: number | null;
};

export type BirthdayReward = {
  year: string; // YYYY format
  rewardType: string; // 'tokens' or 'discount'
  amount: number;
  timestamp: Date | string;
};

export type Birthday = {
  month: number | null; // 1-12
  day: number | null; // 1-31
  lastBirthdayReward: string | null; // YYYY format
  birthdayDiscountExpiresAt: Date | string | null;
  birthdayRewards: BirthdayReward[];
};

export type BoostRewardHistory = {
  month: string; // YYYY-MM format
  boostCount: number;
  tokensReceived: number;
  timestamp: Date | string;
};

export type BoostRewards = {
  lastRewardMonth: string | null; // YYYY-MM format
  totalRewards: number;
  rewardHistory: BoostRewardHistory[];
};

export type QuestCompletion = {
  questId: string;
  questType: string;
  questTitle: string;
  completedAt: Date | string;
  rewardedAt: Date | string | null;
  tokensEarned: number;
  itemsEarned: Array<{ name: string; quantity: number }>;
  rewardSource: string;
};

export type QuestTypeTotals = {
  art: number;
  writing: number;
  interactive: number;
  rp: number;
  artWriting: number;
  other: number;
};

export type QuestLegacy = {
  totalTransferred: number;
  pendingTurnIns: number;
  transferredAt: Date | string | null;
  transferUsed: boolean;
};

export type QuestListEntry = {
  name: string;
  year: string;
  category?: string;
};

export type Quests = {
  totalCompleted: number;
  lastCompletionAt: Date | string | null;
  typeTotals: QuestTypeTotals;
  completions: QuestCompletion[];
  legacy: QuestLegacy;
  pendingTurnIns?: number;
};

export type BlupeeClaimHistory = {
  tokensReceived: number;
  timestamp: Date | string;
};

export type BlupeeHunt = {
  lastClaimed: Date | string | null;
  totalClaimed: number;
  dailyCount: number;
  dailyResetDate: Date | string | null;
  claimHistory: BlupeeClaimHistory[];
};

export type UserProfile = {
  _id: string;
  discordId: string;
  googleSheetsUrl: string;
  timezone: string;
  tokens: number;
  tokenTracker: string;
  tokensSynced: boolean;
  blightedcharacter: boolean;
  characterSlot: number;
  status: "active" | "inactive";
  statusChangedAt: Date | string;
  lastMessageContent: string;
  lastMessageTimestamp: Date | string | null;
  introPostedAt: Date | string | null;
  helpWanted: HelpWanted;
  leveling: Leveling;
  birthday: Birthday;
  boostRewards: BoostRewards;
  quests: Quests;
  blupeeHunt: BlupeeHunt;
};

export type CharacterActivity = {
  _id: string;
  name: string;
  lastRollDate: Date | string | null;
  dailyRoll: Record<string, unknown>; // Map converted to object
};

export type PetActivity = {
  _id: string;
  name: string;
  lastRollDate: Date | string | null;
};

export type MountActivity = {
  _id: string;
  name: string;
  lastMountTravel: Date | string | null;
};

export type MessageActivity = {
  dayKey: string; // YYYY-MM-DD
  count: number;
};

export type ActivityData = {
  characters: CharacterActivity[];
  pets: PetActivity[];
  mounts: MountActivity[];
  messages: MessageActivity[];
};

export type UserProfileResponse = {
  user: UserProfile;
  activity?: ActivityData;
};
