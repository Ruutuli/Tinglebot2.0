const math = require('mathjs');

/**
 * Evaluates a mathematical expression.
 * @param {string} expression - The mathematical expression to evaluate.
 * @returns {number} The result of the evaluation.
 */
function evaluate(expression) {
  try {
    return math.evaluate(expression);
  } catch (error) {
    console.error('Error evaluating expression:', error);
    throw new Error('Invalid mathematical expression');
  }
}

module.exports = { evaluate };

/*
Notes:
- Added comments to explain the purpose of each function.
- Improved error handling and user messages.
*/
