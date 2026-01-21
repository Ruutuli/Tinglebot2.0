// Script to fix relative paths for shared imports - converts to @/shared alias
const fs = require('fs');
const path = require('path');

function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.cursor') {
        getAllJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Replace all relative paths to shared with @/shared alias
  // Match patterns like '../shared', '../../shared', '../../../shared', etc.
  const patterns = [
    // Match require('./shared/...') or require("./shared/...") etc.
    /require\(['"]\.\.+\/shared\//g,
    // Match from './shared/...' (shouldn't exist but just in case)
    /require\(['"]\.\/shared\//g,
  ];
  
  let newContent = content;
  let changed = false;
  
  patterns.forEach(pattern => {
    const matches = newContent.match(pattern);
    if (matches) {
      // For each match, replace with @/shared alias
      newContent = newContent.replace(pattern, (match) => {
        // Extract the path after '../shared' or './shared'
        const afterShared = match.replace(/require\(['"]\.\.*\/shared/, '');
        changed = true;
        return `require('@/shared${afterShared}`;
      });
    }
  });
  
  if (changed) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Fixed: ${filePath} -> @/shared`);
    return true;
  }
  return false;
}

// Get all JS files
const rootDir = path.resolve(__dirname, '..');
const files = getAllJsFiles(rootDir);

let fixedCount = 0;
files.forEach(file => {
  // Skip this script
  if (file.includes('fix-relative-paths.js')) {
    return;
  }
  
  if (fixFile(file)) {
    fixedCount++;
  }
});

console.log(`\nFixed ${fixedCount} files.`);
