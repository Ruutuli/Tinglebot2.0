const { handleError } = require('../utils/globalErrorHandler');

class BaseService {
    constructor(model, serviceName) {
    this.model = model;
    this.serviceName = serviceName;
  }

    async findOne(query, options = {}) {
    try {
      const result = await this.model.findOne(query, options.projection || {})
        .lean(options.lean !== false)
        .exec();
      
      if (!result && options.throwIfNotFound) {
        throw new Error(`${options.entityName || 'Document'} not found`);
      }
      
      return result;
    } catch (error) {
      handleError(error, this.serviceName);
      console.error(`[${this.serviceName}]: Error in findOne:`, error.message);
      throw error;
    }
  }

    async find(query = {}, options = {}) {
    try {
      let queryBuilder = this.model.find(query, options.projection || {});
      
      if (options.sort) {
        queryBuilder = queryBuilder.sort(options.sort);
      }
      
      if (options.limit) {
        queryBuilder = queryBuilder.limit(options.limit);
      }
      
      if (options.skip) {
        queryBuilder = queryBuilder.skip(options.skip);
      }
      
      if (options.populate) {
        queryBuilder = queryBuilder.populate(options.populate);
      }
      
      return await queryBuilder.lean(options.lean !== false).exec();
    } catch (error) {
      handleError(error, this.serviceName);
      console.error(`[${this.serviceName}]: Error in find:`, error.message);
      throw error;
    }
  }

    async create(data) {
    try {
      const newDocument = new this.model(data);
      await newDocument.save();
      return newDocument;
    } catch (error) {
      handleError(error, this.serviceName);
      console.error(`[${this.serviceName}]: Error in create:`, error.message);
      throw error;
    }
  }

    async updateById(id, updateData, options = {}) {
    try {
      return await this.model.findByIdAndUpdate(
        id, 
        updateData, 
        { new: true, ...options }
      ).lean(options.lean !== false).exec();
    } catch (error) {
      handleError(error, this.serviceName);
      console.error(`[${this.serviceName}]: Error in updateById:`, error.message);
      throw error;
    }
  }

    async updateMany(query, updateData, options = {}) {
    try {
      return await this.model.updateMany(query, updateData, options).exec();
    } catch (error) {
      handleError(error, this.serviceName);
      console.error(`[${this.serviceName}]: Error in updateMany:`, error.message);
      throw error;
    }
  }

   async deleteById(id) {
    try {
      return await this.model.findByIdAndDelete(id).lean().exec();
    } catch (error) {
      handleError(error, this.serviceName);
      console.error(`[${this.serviceName}]: Error in deleteById:`, error.message);
      throw error;
    }
  }

    async deleteMany(query) {
    try {
      return await this.model.deleteMany(query).exec();
    } catch (error) {
      handleError(error, this.serviceName);
      console.error(`[${this.serviceName}]: Error in deleteMany:`, error.message);
      throw error;
    }
  }

    async count(query = {}) {
    try {
      return await this.model.countDocuments(query).exec();
    } catch (error) {
      handleError(error, this.serviceName);
      console.error(`[${this.serviceName}]: Error in count:`, error.message);
      throw error;
    }
  }
}

module.exports = BaseService;
