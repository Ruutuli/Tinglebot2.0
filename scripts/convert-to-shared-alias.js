// Script to convert all relative shared imports to @/shared alias
const fs = require('fs');
const path = require('path');

function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, .git, .cursor, and the scripts directory itself
      if (file !== 'node_modules' && file !== '.git' && file !== '.cursor' && file !== 'scripts') {
        getAllJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function convertFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  const originalContent = content;
  
  // Patterns to match:
  // 1. require('../shared/...') or require("../../shared/...") etc. (any number of ../)
  // 2. require('./shared/...')
  // 3. require('../shared') or require("../../shared") (without trailing slash)
  // 4. require('./shared')
  
  const patterns = [
    // Match require('../shared/...') or require("../../shared/...") with path
    {
      pattern: /require\((['"])(\.\.\/)+shared\//g,
      replacement: (match, quote) => `require(${quote}@/shared/`
    },
    // Match require('./shared/...')
    {
      pattern: /require\((['"])\.\/shared\//g,
      replacement: (match, quote) => `require(${quote}@/shared/`
    },
    // Match require('../shared') or require("../../shared") without trailing path
    {
      pattern: /require\((['"])(\.\.\/)+shared(['"])\s*\)/g,
      replacement: (match, quote1, quote2) => `require(${quote1}@/shared${quote2})`
    },
    // Match require('./shared') without trailing path
    {
      pattern: /require\((['"])\.\/shared(['"])\s*\)/g,
      replacement: (match, quote1, quote2) => `require(${quote1}@/shared${quote2})`
    }
  ];
  
  patterns.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      changed = true;
    }
  });
  
  if (changed && content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath);
    console.log(`✓ Converted: ${relativePath}`);
    return true;
  }
  
  return false;
}

// Main execution
console.log('Converting relative shared imports to @/shared alias...\n');

const rootDir = path.resolve(__dirname, '..');
const files = getAllJsFiles(rootDir);

let convertedCount = 0;
let checkedCount = 0;

files.forEach(file => {
  // Skip this script itself
  if (file.includes('convert-to-shared-alias.js')) {
    return;
  }
  
  checkedCount++;
  if (convertFile(file)) {
    convertedCount++;
  }
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Checked: ${checkedCount} files`);
console.log(`Converted: ${convertedCount} files`);
console.log(`${'='.repeat(50)}`);
