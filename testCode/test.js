const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');

const testFilePath = path.join(__dirname, 'data', 'healingRequests.json');
const testData = {
  test: 'This is a test entry',
};

try {
  fs.writeFileSync(testFilePath, JSON.stringify(testData, null, 2), 'utf-8');
  console.log('Test write successful:', testFilePath);
} catch (error) {
    handleError(error, 'test.js');

  console.error('Test write failed:', error.message);
}
