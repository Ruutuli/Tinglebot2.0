// ============================================================================
// ------------------- Shared Package Barrel Exports -------------------
// Re-exports commonly used modules for convenience
// You can still use direct imports: @app/shared/models/CharacterModel
// ============================================================================

// ------------------- Models -------------------
// Re-export commonly used models
module.exports.CharacterModel = require('./models/CharacterModel');
module.exports.ItemModel = require('./models/ItemModel');
module.exports.UserModel = require('./models/UserModel');
module.exports.TempDataModel = require('./models/TempDataModel');
module.exports.PetModel = require('./models/PetModel');
module.exports.MountModel = require('./models/MountModel');
module.exports.QuestModel = require('./models/QuestModel');
module.exports.ModCharacterModel = require('./models/ModCharacterModel');
module.exports.MonsterModel = require('./models/MonsterModel');
module.exports.VillageModel = require('./models/VillageModel');
module.exports.VendingModel = require('./models/VendingModel');
module.exports.WeatherModel = require('./models/WeatherModel');

// ------------------- Utils -------------------
// Re-export commonly used utilities
module.exports.logger = require('./utils/logger');
module.exports.globalErrorHandler = require('./utils/globalErrorHandler');
module.exports.expirationHandler = require('./utils/expirationHandler');
module.exports.messageUtils = require('./utils/messageUtils');
module.exports.googleSheetsUtils = require('./utils/googleSheetsUtils');
module.exports.validation = require('./utils/validation');
module.exports.cache = require('./utils/cache');
module.exports.memoryMonitor = require('./utils/memoryMonitor');
module.exports.railwayOptimizations = require('./utils/railwayOptimizations');

// ------------------- Database -------------------
// Re-export database utilities
module.exports.db = require('./database/db');
module.exports.connectionManager = require('./database/connectionManager');

// ------------------- Config -------------------
// Re-export configuration
module.exports.databaseConfig = require('./config/database');
module.exports.gcsService = require('./config/gcsService');

// ------------------- Services -------------------
// Re-export services
module.exports.weatherService = require('./services/weatherService');
