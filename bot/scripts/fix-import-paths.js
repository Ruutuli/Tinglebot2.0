// ============================================================================
// ------------------- Fix Import Paths Script -------------------
// Automatically fixes incorrect import paths in command files
// Changes ../../ to ../../../ for utils, database, models, and services
// ============================================================================

const fs = require('fs');
const path = require('path');

// ------------------- Configuration -------------------
const COMMANDS_DIR = path.join(__dirname, '..', 'commands');
const REPLACEMENTS = [
  // Utils imports
  { from: "require('./shared/utils/", to: "require('./shared/utils/" },
  { from: 'require('./shared/utils/', to: 'require('./shared/utils/' },
  // Database imports
  { from: "require('./shared/database/", to: "require('./shared/database/" },
  { from: 'require('./shared/database/', to: 'require('./shared/database/' },
  // Models imports
  { from: "require('./shared/models/", to: "require('./shared/models/" },
  { from: 'require('./shared/models/', to: 'require('./shared/models/' },
  // Services imports
  { from: "require('./shared/services/", to: "require('./shared/services/" },
  { from: 'require('./shared/services/', to: 'require('./shared/services/' },
];

// ------------------- Helper Functions -------------------
function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllJsFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const replacements = [];
  
  REPLACEMENTS.forEach(({ from, to }) => {
    const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    
    if (matches) {
      const count = matches.length;
      content = content.replace(regex, to);
      replacements.push(`${from} → ${to} (${count} replacements)`);
      modified = true;
    }
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return {
      modified: true,
      replacements,
      relativePath: path.relative(COMMANDS_DIR, filePath)
    };
  }
  
  return { modified: false };
}

// ------------------- Main Execution -------------------
console.log('🔧 Fix Import Paths Script');
console.log('='.repeat(50));
console.log(`📁 Scanning directory: ${COMMANDS_DIR}\n`);

const jsFiles = getAllJsFiles(COMMANDS_DIR);
console.log(`📋 Found ${jsFiles.length} JavaScript files\n`);

const results = [];
let totalFilesModified = 0;
let totalReplacements = 0;

jsFiles.forEach(filePath => {
  const result = fixFile(filePath);
  if (result.modified) {
    totalFilesModified++;
    const replacementCount = result.replacements.reduce((sum, r) => {
      const match = r.match(/\((\d+) replacements\)/);
      return sum + (match ? parseInt(match[1]) : 0);
    }, 0);
    totalReplacements += replacementCount;
    results.push({
      file: result.relativePath,
      replacements: result.replacements,
      count: replacementCount
    });
  }
});

// ------------------- Output Results -------------------
console.log('📊 Results:\n');

if (results.length === 0) {
  console.log('✅ No files needed fixing. All import paths are correct!');
} else {
  console.log(`✅ Fixed ${totalFilesModified} files with ${totalReplacements} total replacements:\n`);
  
  results.forEach(({ file, replacements, count }) => {
    console.log(`📝 ${file} (${count} replacements)`);
    replacements.forEach(replacement => {
      console.log(`   • ${replacement}`);
    });
    console.log('');
  });
  
  console.log('='.repeat(50));
  console.log(`✨ Successfully fixed ${totalFilesModified} files!`);
  console.log(`📈 Total replacements: ${totalReplacements}`);
}

