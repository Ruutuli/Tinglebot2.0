const path = require('path');
require('dotenv').config({
  path: path.resolve(process.cwd(), `.env.${process.env.NODE_ENV || 'development'}`)
});

const dbConfig = {
  development: {
    tinglebot: process.env.MONGODB_TINGLEBOT_URI,
    inventories: process.env.MONGODB_INVENTORIES_URI,
    vending: process.env.MONGODB_VENDING_URI
  },
  production: {
    tinglebot: process.env.MONGODB_TINGLEBOT_URI,
    inventories: process.env.MONGODB_INVENTORIES_URI,
    vending: process.env.MONGODB_VENDING_URI
  }
};

module.exports = dbConfig[process.env.NODE_ENV || 'development']; 