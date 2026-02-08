/**
 * CommonJS logger for use by .js models (e.g. UserModel.js).
 * Node require() from .js files resolves to this file; the app uses utils/logger.ts via @/ alias.
 */
const formatTimestamp = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
};

const formatLog = (level, file, message) => {
  return `[${formatTimestamp()}] [${file}] ${level}: ${message}`;
};

const log = (level, file, message) => {
  console.log(formatLog(level, file, message));
};

const logger = {
  info: (file, message) => log('INFO', file, message),
  success: (file, message) => log('SUCCESS', file, message),
  warn: (file, message) => log('WARN', file, message),
  error: (file, message) => log('ERROR', file, message),
  debug: (file, message) => log('DEBUG', file, message),
};

// Support: import { logger }, require('...'), require('...').logger, require('...').default
module.exports = logger;
module.exports.logger = logger;
module.exports.default = logger;
