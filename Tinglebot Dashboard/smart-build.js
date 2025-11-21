// Smart build script that only runs npm install if dashboard files changed
// This prevents unnecessary builds when only bot code changes

const { execSync } = require('child_process');
const path = require('path');

// Get the dashboard directory path relative to repo root
const dashboardDir = path.relative(process.cwd(), __dirname).replace(/\\/g, '/');
const dashboardPath = dashboardDir || 'Tinglebot Dashboard';

let shouldBuild = true; // Default to building if we can't determine

// Check if we're in a git repository
try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore' });
  
  // Get the last commit hash
  let lastCommit;
  try {
    lastCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch (e) {
    console.log('⚠️  Could not determine last commit, proceeding with build...');
    shouldBuild = true;
  }

  if (lastCommit) {
    // Check if any dashboard files changed in the last commit
    try {
      const changedFiles = execSync(
        `git diff-tree --no-commit-id --name-only -r ${lastCommit}`,
        { encoding: 'utf-8' }
      ).trim().split('\n').filter(Boolean);

      // Check if any changed file is in the dashboard directory
      const dashboardFilesChanged = changedFiles.some(file => {
        const normalizedFile = file.replace(/\\/g, '/');
        return normalizedFile.startsWith(`${dashboardPath}/`) || 
               normalizedFile.startsWith('Tinglebot Dashboard/');
      });

      // Also check if shared files that dashboard depends on changed
      const sharedFilesChanged = changedFiles.some(file => {
        const normalizedFile = file.replace(/\\/g, '/');
        return normalizedFile.startsWith('models/') ||
               normalizedFile.startsWith('database/') ||
               normalizedFile.startsWith('config/') ||
               normalizedFile.startsWith('utils/');
      });

      shouldBuild = dashboardFilesChanged || sharedFilesChanged;

      if (shouldBuild) {
        console.log('✅ Dashboard or shared files changed, proceeding with build...');
        if (dashboardFilesChanged) {
          console.log('   Dashboard files changed');
        }
        if (sharedFilesChanged) {
          console.log('   Shared files (models/database/config/utils) changed');
        }
      } else {
        console.log('⏭️  No dashboard or shared files changed, skipping build...');
        console.log('   Changed files:', changedFiles.join(', '));
      }
    } catch (e) {
      console.log('⚠️  Error checking file changes, proceeding with build...');
      console.error(e.message);
      shouldBuild = true;
    }
  }
} catch (e) {
  // Not a git repo or git not available - proceed with build
  console.log('⚠️  Not a git repository or git not available, proceeding with build...');
  shouldBuild = true;
}

// Run npm install if we should build
if (shouldBuild) {
  console.log('📦 Running npm install...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Build completed successfully');
    process.exit(0);
  } catch (e) {
    console.error('❌ Build failed');
    process.exit(1);
  }
} else {
  console.log('✅ Build skipped - no changes detected');
  process.exit(0);
}

