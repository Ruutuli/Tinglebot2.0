function generateUniqueId(prefix) {
    if (!prefix || typeof prefix !== 'string' || prefix.length !== 1) {
      throw new Error('Prefix must be a single character string.');
    }
    const randomNumber = Math.floor(100000 + Math.random() * 900000);
    return `${prefix.toUpperCase()}${randomNumber}`;
  }
  
  module.exports = { generateUniqueId };
  