const path = require('path');
const dotenv = require('dotenv');
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

const dbConfig = {
  development: {
    tinglebot: process.env.MONGODB_TINGLEBOT_URI_DEV,
    inventories: process.env.MONGODB_INVENTORIES_URI_DEV,
    vending: process.env.MONGODB_VENDING_URI_DEV
  },
  production: {
    tinglebot: process.env.MONGODB_TINGLEBOT_URI_PROD,
    inventories: process.env.MONGODB_INVENTORIES_URI_PROD,
    vending: process.env.MONGODB_VENDING_URI_PROD
  }
};

module.exports = dbConfig[process.env.NODE_ENV || 'development']; 