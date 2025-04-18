const { getTinglebotConnection } = require('./connection');
const Monster = require('../models/MonsterModel');
const BaseService = require('./BaseService');
const { handleError } = require('../utils/globalErrorHandler');

class MonsterService extends BaseService {
  constructor() {
    super(Monster, 'MonsterService');
  }

   toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w|\s+|[-()/])/g, (match, index) => {
      if (match === '-' || match === '(' || match === ')' || match === '/') return '';
      return index === 0 ? match.toLowerCase() : match.toUpperCase();
    });
  }

    async getByNameMapping(nameMapping) {
    if (!nameMapping) {
      throw new Error('No nameMapping provided');
    }
    
    try {
      await getTinglebotConnection();
      const normalizedMapping = this.toCamelCase(nameMapping);
      return await this.findOne({ nameMapping: normalizedMapping });
    } catch (error) {
      handleError(error, 'MonsterService');
      console.error(`Error fetching monster by mapping "${nameMapping}":`, error.message);
      throw error;
    }
  }

    async getMonsterAboveTier(minTier = 5) {
    try {
      await getTinglebotConnection();
      const monsters = await this.find({ tier: { $gte: minTier } });
      
      if (!monsters || monsters.length === 0) {
        throw new Error(`No monsters found above tier ${minTier}`);
      }
      
      return monsters[Math.floor(Math.random() * monsters.length)];
    } catch (error) {
      handleError(error, 'MonsterService');
      console.error(`Error fetching monsters above tier ${minTier}:`, error.message);
      throw error;
    }
  }

    async getMonsterAboveTierByRegion(minTier = 5, region) {
    if (!region) {
      throw new Error('Region must be specified');
    }
    
    try {
      await getTinglebotConnection();
      const filter = {
        tier: { $gte: minTier },
        [region.toLowerCase()]: true
      };
      
      const monsters = await this.find(filter);
      
      if (!monsters || monsters.length === 0) {
        throw new Error(`No monsters found above tier ${minTier} in region ${region}`);
      }
      
      return monsters[Math.floor(Math.random() * monsters.length)];
    } catch (error) {
      handleError(error, 'MonsterService');
      console.error(`Error fetching monsters above tier ${minTier} in region ${region}:`, error.message);
      throw error;
    }
  }
}

const monsterService = new MonsterService();
module.exports = monsterService;
