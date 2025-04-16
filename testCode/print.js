const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');

/**
 * Logs the directory structure in a tree format.
 * @param {string} dir - The directory to log.
 * @param {string} prefix - The prefix for the directory structure.
 */
function logDirectoryStructure(dir, prefix = '') {
  const files = fs.readdirSync(dir);
  files.forEach((file, index) => {
    const filePath = path.join(dir, file);

    // Skip directories to exclude
    if (['.git', 'objects', 'hooks'].includes(file)) {
      return;
    }

    // Skip the node_modules directory
    if (file === 'node_modules') {
      return;
    }

    const isLast = index === files.length - 1;
    const newPrefix = prefix + (isLast ? '└── ' : '├── ');

    console.log(newPrefix + file);

    // Recursively log the structure of directories
    if (fs.statSync(filePath).isDirectory()) {
      logDirectoryStructure(filePath, prefix + (isLast ? '    ' : '│   '));
    }
  });
}

let rootDir;
if (fs.existsSync('C:\\Users\\Ruu\\Desktop\\Tinglebot 2.0')) {
  rootDir = 'C:\\Users\\Ruu\\Desktop\\Tinglebot 2.0';
} else {
  console.error('Directory not found: C:\\Users\\Ruu\\Desktop\\Tinglebot 2.0');
  // Handle the error accordingly, such as exiting the script or setting a default directory
}

if (rootDir) {
  console.log('Tinglebot 2.0/');
  logDirectoryStructure(rootDir, '│');
}

/*
Notes:
- 
- 
*/