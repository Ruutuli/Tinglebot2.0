// utils/objectUtils.js

// Function to handle circular references during JSON stringification
function getCircularReplacer() {
  const seen = new WeakSet();
  return (key, value) => {
      if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
              return '[Circular]';
          }
          seen.add(value);
      }
      return value;
  };
}

// Function to handle BigInt values during JSON stringification
function replacer(key, value) {
  if (typeof value === 'bigint') {
      return value.toString();
  }
  return value;
}

// Function to safely stringify an object with custom replacers
function safeStringify(obj) {
  return JSON.stringify(obj, replacer, 2);
}

// Exporting the utility functions
module.exports = {
  safeStringify,
};

/*
Notes:
- Added detailed comments explaining the purpose of each function.
- Improved the structure of the code for better readability.
*/
