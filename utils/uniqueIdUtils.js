// ------------------- Unique ID Utility -------------------
// Generates a short unique ID with a prefix and a 6-digit number

function generateUniqueId(prefix) {
    if (!prefix || typeof prefix !== 'string' || prefix.length !== 1) {
      throw new Error('Prefix must be a single character string.');
    }
    const randomNumber = Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit number
    return `${prefix.toUpperCase()}${randomNumber}`;
  }
  
  module.exports = { generateUniqueId };
  