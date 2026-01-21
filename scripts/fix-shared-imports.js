// ============================================================================
// Fix Shared Imports Script
// Replaces all relative imports to shared/ with @app/shared package imports
// ============================================================================

const fs = require('fs');
const path = require('path');

// Directories to process
const directories = ['bot', 'dashboard', 'scripts'];

// Patterns to replace
const replacements = [
  // Double quotes
  {
    pattern: /require\("\.\.\/shared\//g,
    replacement: 'require("@app/shared/'
  },
  {
    pattern: /require\("\.\.\/\.\.\/shared\//g,
    replacement: 'require("@app/shared/'
  },
  {
    pattern: /require\("\.\.\/\.\.\/\.\.\/shared\//g,
    replacement: 'require("@app/shared/'
  },
  // Single quotes
  {
    pattern: /require\('\.\.\/shared\//g,
    replacement: "require('@app/shared/"
  },
  {
    pattern: /require\('\.\.\/\.\.\/shared\//g,
    replacement: "require('@app/shared/"
  },
  {
    pattern: /require\('\.\.\/\.\.\/\.\.\/shared\//g,
    replacement: "require('@app/shared/"
  },
  // path.resolve patterns
  {
    pattern: /require\(path\.resolve\(__dirname,\s*['"]\.\.\/shared\//g,
    replacement: "require('@app/shared/"
  },
  {
    pattern: /require\(path\.resolve\(__dirname,\s*['"]\.\.\/\.\.\/shared\//g,
    replacement: "require('@app/shared/"
  }
];

// Recursively get all JS files
function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules
      if (file !== 'node_modules') {
        getAllJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Process a single file
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let originalContent = content;
    
    // Apply all replacements
    replacements.forEach(({ pattern, replacement }) => {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        modified = true;
      }
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✓ Updated: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Main execution
console.log('🔧 Fixing shared imports...\n');

let totalFiles = 0;
let updatedFiles = 0;

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`⚠ Directory ${dir} not found, skipping...`);
    return;
  }
  
  console.log(`📁 Processing ${dir}/...`);
  const files = getAllJsFiles(dir);
  totalFiles += files.length;
  
  files.forEach(file => {
    if (processFile(file)) {
      updatedFiles++;
    }
  });
});

console.log(`\n✅ Done!`);
console.log(`   Total files processed: ${totalFiles}`);
console.log(`   Files updated: ${updatedFiles}`);
