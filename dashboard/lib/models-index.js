// ============================================================================
// ------------------- Models Index -------------------
// Import all mongoose models to ensure they're registered with mongoose.models
// This file is used by the database editor to discover all available models
// ============================================================================

// Note: We use require() for CommonJS compatibility since models are CommonJS
// Models are imported here so they register with mongoose.models

// Skip problematic models:
// - GeneralItemCategories: Not a mongoose model
// - Item.js: Appears to be an index file, not a model

// Import all models with individual try-catch blocks
// This allows Turbopack to statically analyze the require() calls
// while still handling errors gracefully

try { require("../models/ApprovedSubmissionModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] ApprovedSubmissionModel:", e.message); }
try { require("../models/AuditLogModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] AuditLogModel:", e.message); }
try { require("../models/BlightRollHistoryModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] BlightRollHistoryModel:", e.message); }
try { require("../models/BloodMoonTrackingModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] BloodMoonTrackingModel:", e.message); }
try { require("../models/CharacterModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] CharacterModel:", e.message); }
try { require("../models/CharacterModerationModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] CharacterModerationModel:", e.message); }
try { require("../models/CharacterOfWeekModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] CharacterOfWeekModel:", e.message); }
try { require("../models/GeneralItemModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] GeneralItemModel:", e.message); }
try { require("../models/GrottoModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] GrottoModel:", e.message); }
try { require("../models/HelpWantedQuestModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] HelpWantedQuestModel:", e.message); }
try { require("../models/InventoryLogModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] InventoryLogModel:", e.message); }
try { require("../models/InventoryModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] InventoryModel:", e.message); }
try { require("../models/ItemModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] ItemModel:", e.message); }
try { require("../models/mapModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] mapModel:", e.message); }
try { require("../models/MemberLoreModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] MemberLoreModel:", e.message); }
try { require("../models/MessageTrackingModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] MessageTrackingModel:", e.message); }
try { require("../models/MinigameModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] MinigameModel:", e.message); }
try { require("../models/ModCharacterModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] ModCharacterModel:", e.message); }
try { require("../models/MonsterCampModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] MonsterCampModel:", e.message); }
try { require("../models/OldMapFoundModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] OldMapFoundModel:", e.message); }
try { require("../models/MonsterModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] MonsterModel:", e.message); }
try { require("../models/MountModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] MountModel:", e.message); }
try { require("../models/NotificationModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] NotificationModel:", e.message); }
try { require("../models/NPCModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] NPCModel:", e.message); }
try { require("../models/PartyModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] PartyModel:", e.message); }
try { require("../models/PetModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] PetModel:", e.message); }
try { require("../models/PinModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] PinModel:", e.message); }
try { require("../models/QuestModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] QuestModel:", e.message); }
try { require("../models/RaidModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] RaidModel:", e.message); }
try { require("../models/RelationshipModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] RelationshipModel:", e.message); }
try { require("../models/RelicModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] RelicModel:", e.message); }
try { require("../models/RelicAppraisalRequestModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] RelicAppraisalRequestModel:", e.message); }
try { require("../models/MapAppraisalRequestModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] MapAppraisalRequestModel:", e.message); }
try { require("../models/RuuGameModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] RuuGameModel:", e.message); }
try { require("../models/SecretSantaModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] SecretSantaModel:", e.message); }
try { require("../models/StableModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] StableModel:", e.message); }
try { require("../models/StealStatsModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] StealStatsModel:", e.message); }
try { require("../models/TableModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] TableModel:", e.message); }
try { require("../models/TableRollModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] TableRollModel:", e.message); }
try { require("../models/TempDataModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] TempDataModel:", e.message); }
try { require("../models/TokenTransactionModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] TokenTransactionModel:", e.message); }
try { require("../models/UserModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] UserModel:", e.message); }
try { require("../models/VendingModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] VendingModel:", e.message); }
try { require("../models/VendingStockModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] VendingStockModel:", e.message); }
try { require("../models/VillageModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] VillageModel:", e.message); }
try { require("../models/VillageShopsModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] VillageShopsModel:", e.message); }
try { require("../models/WaveModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] WaveModel:", e.message); }
try { require("../models/WeatherModel"); } catch (e) { if (e.name !== 'OverwriteModelError' && !e.message?.includes('Cannot overwrite')) console.warn("[models-index] WeatherModel:", e.message); }

// Export nothing - this file is just for side effects (model registration)
module.exports = {};
