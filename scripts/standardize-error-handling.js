#!/usr/bin/env node

/**
 * Error Handling Standardization Script
 * 
 * This script standardizes error handling across the Tinglebot codebase by:
 * 1. Updating all imports from handleError to handleInteractionError
 * 2. Replacing all handleError calls with handleInteractionError
 * 3. Removing scattered require statements in catch blocks
 * 4. Ensuring imports are at the top of files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  // Directories to process
  directories: [
    'commands',
    'database',
    'handlers',
    'modules',
    'utils'
  ],
  
  // File extensions to process
  extensions: ['.js'],
  
  // Files to skip
  skipFiles: [
    'node_modules',
    '.git',
    'package-lock.json',
    'package.json'
  ],
  
  // Patterns to replace
  replacements: [
    // Import statements
    {
      pattern: /const\s*{\s*handleError\s*}\s*=\s*require\(['"`][^'"`]*globalErrorHandler[^'"`]*['"`]\);?/g,
      replacement: 'const { handleInteractionError } = require("../../utils/globalErrorHandler");'
    },
    {
      pattern: /const\s*{\s*handleError\s*}\s*=\s*require\(['"`]\.\.\/utils\/globalErrorHandler[^'"`]*['"`]\);?/g,
      replacement: 'const { handleInteractionError } = require("../utils/globalErrorHandler");'
    },
    {
      pattern: /const\s*{\s*handleError\s*}\s*=\s*require\(['"`]\.\.\/\.\.\/utils\/globalErrorHandler[^'"`]*['"`]\);?/g,
      replacement: 'const { handleInteractionError } = require("../../utils/globalErrorHandler");'
    },
    
    // Function calls
    {
      pattern: /handleError\(/g,
      replacement: 'handleInteractionError('
    },
    
    // Scattered require statements in catch blocks
    {
      pattern: /\s*const\s*{\s*handleInteractionError\s*}\s*=\s*require\(['"`][^'"`]*globalErrorHandler[^'"`]*['"`]\);?\s*(?=\s*await\s*handleInteractionError)/g,
      replacement: ''
    }
  ]
};

// Utility functions
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!CONFIG.skipFiles.includes(file)) {
        getAllFiles(filePath, fileList);
      }
    } else if (CONFIG.extensions.includes(path.extname(file))) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Apply all replacements
    CONFIG.replacements.forEach(({ pattern, replacement }) => {
      const newContent = content.replace(pattern, replacement);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    });
    
    // Additional cleanup: Remove duplicate imports
    const importLines = content.split('\n').filter(line => 
      line.includes('handleInteractionError') && line.includes('require')
    );
    
    if (importLines.length > 1) {
      // Keep only the first import
      const firstImport = importLines[0];
      const otherImports = importLines.slice(1);
      
      otherImports.forEach(importLine => {
        content = content.replace(importLine + '\n', '');
        modified = true;
      });
    }
    
    // Write back if modified
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function updateDatabaseFile() {
  const dbPath = 'database/db.js';
  if (fs.existsSync(dbPath)) {
    let content = fs.readFileSync(dbPath, 'utf8');
    
    // Update import
    content = content.replace(
      /const\s*{\s*handleInteractionError\s*}\s*=\s*require\(['"`][^'"`]*globalErrorHandler[^'"`]*['"`]\);?/,
      'const { handleError } = require("../utils/globalErrorHandler");'
    );
    
    // Update function calls back to handleError for db.js
    content = content.replace(/handleInteractionError\(/g, 'handleError(');
    
    fs.writeFileSync(dbPath, content, 'utf8');
    console.log(`✅ Updated database file: ${dbPath}`);
  }
}

function main() {
  console.log('🚀 Starting error handling standardization...\n');
  
  let totalFiles = 0;
  let modifiedFiles = 0;
  
  // Process all directories
  CONFIG.directories.forEach(dir => {
    if (fs.existsSync(dir)) {
      console.log(`📁 Processing directory: ${dir}`);
      const files = getAllFiles(dir);
      
      files.forEach(file => {
        totalFiles++;
        if (processFile(file)) {
          modifiedFiles++;
        }
      });
    } else {
      console.log(`⚠️  Directory not found: ${dir}`);
    }
  });
  
  // Special handling for database file
  updateDatabaseFile();
  
  console.log('\n📊 Summary:');
  console.log(`   Total files processed: ${totalFiles}`);
  console.log(`   Files modified: ${modifiedFiles}`);
  console.log(`   Files unchanged: ${totalFiles - modifiedFiles}`);
  
  console.log('\n✅ Error handling standardization complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Review the changes');
  console.log('   2. Test the application');
  console.log('   3. Run linting to check for any issues');
  console.log('   4. Commit the changes');
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { processFile, getAllFiles, updateDatabaseFile };
