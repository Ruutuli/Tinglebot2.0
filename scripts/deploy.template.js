const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting Railway deployment process...');

try {
    // Check if Railway CLI is installed
    try {
        execSync('railway --version', { stdio: 'ignore' });
    } catch (error) {
        console.log('❌ Railway CLI not found. Installing...');
        execSync('npm install -g @railway/cli', { stdio: 'inherit' });
    }

    // Check if user is logged in
    try {
        execSync('railway status', { stdio: 'ignore' });
    } catch (error) {
        console.log('🔑 Please login to Railway...');
        execSync('railway login', { stdio: 'inherit' });
    }

    // Link project if not already linked
    try {
        execSync('railway link', { stdio: 'inherit' });
    } catch (error) {
        console.log('⚠️ Project already linked or error occurred');
    }

    // Deploy to Railway
    console.log('📦 Deploying to Railway...');
    execSync('railway up', { stdio: 'inherit' });

    console.log('✅ Deployment completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Check the deployment status in Railway dashboard');
    console.log('2. Monitor logs using: railway logs');
    console.log('3. View your app at the URL provided in Railway dashboard');

} catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
} 