const { handleError } = require('../utils/globalErrorHandler');

class BaseService {
  constructor(model, svc_name) {
    this.model = model;
    this.svc_name = svc_name;
  }

  async one(qry, opt = {}) {
    try {
      const res = await this.model.findOne(qry, opt.projection || {})
        .lean(opt.lean !== false)
        .exec();
      
      if (!res && opt.throwIfNotFound) {
        throw new Error(`${opt.entityName || 'Document'} not found`);
      }
      
      return res;
    } catch (err) {
      handleError(err, this.svc_name);
      console.error(`[${this.svc_name}]: Error in one:`, err.message);
      throw err;
    }
  }

  async all(qry = {}, opt = {}) {
    try {
      let qb = this.model.find(qry, opt.projection || {});
      
      if (opt.sort) qb = qb.sort(opt.sort);
      if (opt.limit) qb = qb.limit(opt.limit);
      if (opt.skip) qb = qb.skip(opt.skip);
      if (opt.populate) qb = qb.populate(opt.populate);
      
      return await qb.lean(opt.lean !== false).exec();
    } catch (err) {
      handleError(err, this.svc_name);
      console.error(`[${this.svc_name}]: Error in all:`, err.message);
      throw err;
    }
  }

  async add(dat) {
    try {
      const doc = new this.model(dat);
      await doc.save();
      return doc;
    } catch (err) {
      handleError(err, this.svc_name);
      console.error(`[${this.svc_name}]: Error in add:`, err.message);
      throw err;
    }
  }

  async mod(id, dat, opt = {}) {
    try {
      return await this.model.findByIdAndUpdate(
        id, 
        dat, 
        { new: true, ...opt }
      ).lean(opt.lean !== false).exec();
    } catch (err) {
      handleError(err, this.svc_name);
      console.error(`[${this.svc_name}]: Error in mod:`, err.message);
      throw err;
    }
  }

  async mny(qry, dat, opt = {}) {
    try {
      return await this.model.updateMany(qry, dat, opt).exec();
    } catch (err) {
      handleError(err, this.svc_name);
      console.error(`[${this.svc_name}]: Error in mny:`, err.message);
      throw err;
    }
  }

  async del(id) {
    try {
      return await this.model.findByIdAndDelete(id).lean().exec();
    } catch (err) {
      handleError(err, this.svc_name);
      console.error(`[${this.svc_name}]: Error in del:`, err.message);
      throw err;
    }
  }

  async rem(qry) {
    try {
      return await this.model.deleteMany(qry).exec();
    } catch (err) {
      handleError(err, this.svc_name);
      console.error(`[${this.svc_name}]: Error in rem:`, err.message);
      throw err;
    }
  }

  async cnt(qry = {}) {
    try {
      return await this.model.countDocuments(qry).exec();
    } catch (err) {
      handleError(err, this.svc_name);
      console.error(`[${this.svc_name}]: Error in cnt:`, err.message);
      throw err;
    }
  }
}

module.exports = BaseService;
