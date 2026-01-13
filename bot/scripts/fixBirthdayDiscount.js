// ------------------- Fix Birthday Discount for User -------------------
// This script fixes the birthday discount expiration date for a specific user
// by recalculating it using EST timezone

const path = require('path');
const dotenv = require('dotenv');
const envPath = path.resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

const { connectToTinglebot } = require('../../shared/database/db');
const User = require('../../shared/models/UserModel');
const mongoose = require('mongoose');

// ------------------- Function: calculateExpirationDateEST -------------------
// Calculates the expiration date for birthday discount using EST timezone
function calculateExpirationDateEST(year, month, day) {
  // Create expiration date: 11:59:59.999 PM EST
  // Method: Create a date representing end of day EST by using UTC calculation
  // EST is UTC-5, EDT is UTC-4. We'll determine the offset dynamically.
  // Create a date at the start of the day in EST, then add 23:59:59.999 hours
  const startOfDayUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  // Get what this UTC time is in EST to calculate offset
  const startESTString = startOfDayUTC.toLocaleString("en-US", { 
    timeZone: "America/New_York", 
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  // Parse the date parts from EST string (format: "MM/DD/YYYY, HH:MM:SS")
  const estParts = startESTString.match(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/);
  if (estParts) {
    const estMonth = parseInt(estParts[1]) - 1;
    const estDay = parseInt(estParts[2]);
    const estYear = parseInt(estParts[3]);
    const estHour = parseInt(estParts[4]);
    // Calculate offset: difference between UTC and EST for this date
    const estDate = new Date(estYear, estMonth, estDay, estHour, 0, 0, 0);
    const offsetMs = startOfDayUTC.getTime() - estDate.getTime();
    // Create expiration: start of day UTC + offset + 23:59:59.999 hours
    const expirationDate = new Date(startOfDayUTC.getTime() + offsetMs + (23 * 60 * 60 * 1000) + (59 * 60 * 1000) + (59 * 1000) + 999);
    return expirationDate;
  } else {
    // Fallback: use EST offset of 5 hours (UTC-5)
    const expirationDate = new Date(Date.UTC(year, month, day, 23 + 5, 59, 59, 999));
    return expirationDate;
  }
}

// ------------------- Function: fixUserBirthdayDiscount -------------------
async function fixUserBirthdayDiscount(userId) {
  try {
    console.log(`\n🔍 Looking up user ${userId}...`);
    const user = await User.findOne({ discordId: userId });
    
    if (!user) {
      console.log(`❌ User ${userId} not found in database.`);
      return { success: false, message: 'User not found' };
    }
    
    if (!user.birthday || !user.birthday.month || !user.birthday.day) {
      console.log(`❌ User ${userId} does not have a birthday set.`);
      return { success: false, message: 'No birthday set' };
    }
    
    if (!user.birthday.birthdayDiscountExpiresAt) {
      console.log(`❌ User ${userId} does not have a birthday discount expiration date.`);
      return { success: false, message: 'No discount expiration date' };
    }
    
    console.log(`\n📅 User birthday: ${user.birthday.month}/${user.birthday.day}`);
    console.log(`📆 Current expiration: ${user.birthday.birthdayDiscountExpiresAt}`);
    console.log(`⏰ Current expiration (EST): ${user.birthday.birthdayDiscountExpiresAt.toLocaleString("en-US", { timeZone: "America/New_York" })}`);
    
    // Get current EST time
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const isBirthdayToday = (estNow.getMonth() + 1 === user.birthday.month && estNow.getDate() === user.birthday.day);
    
    console.log(`\n📅 Current EST date: ${estNow.getMonth() + 1}/${estNow.getDate()}/${estNow.getFullYear()}`);
    console.log(`🎂 User birthday: ${user.birthday.month}/${user.birthday.day}`);
    console.log(`🎉 Is birthday today: ${isBirthdayToday ? 'YES' : 'NO'}`);
    
    if (!isBirthdayToday) {
      console.log(`⚠️  Warning: Today is not the user's birthday in EST.`);
      console.log(`   The discount should only be active on their birthday.`);
      console.log(`   Will set expiration to end of today EST anyway to fix the timezone issue.`);
    }
    
    // Use today's EST date for expiration (end of today EST)
    const expirationYear = estNow.getFullYear();
    const expirationMonth = estNow.getMonth(); // JavaScript months are 0-indexed
    const expirationDay = estNow.getDate();
    
    // Calculate new expiration date using EST timezone (end of today EST)
    const newExpirationDate = calculateExpirationDateEST(expirationYear, expirationMonth, expirationDay);
    
    console.log(`\n🔄 Recalculating expiration date...`);
    console.log(`📆 New expiration: ${newExpirationDate}`);
    console.log(`⏰ New expiration (EST): ${newExpirationDate.toLocaleString("en-US", { timeZone: "America/New_York" })}`);
    
    // Store old expiration before updating
    const oldExpiration = user.birthday.birthdayDiscountExpiresAt;
    
    // Update the expiration date
    user.birthday.birthdayDiscountExpiresAt = newExpirationDate;
    await user.save();
    
    // Reload user to get fresh data
    await user.save();
    
    // Verify the discount is now active
    const hasDiscount = user.hasBirthdayDiscount();
    console.log(`\n✅ Updated birthday discount expiration date.`);
    console.log(`🎂 Discount active: ${hasDiscount ? 'YES' : 'NO'}`);
    
    if (hasDiscount) {
      const discountAmount = user.getBirthdayDiscountAmount();
      console.log(`💰 Discount amount: ${discountAmount}%`);
    }
    
    return { 
      success: true, 
      oldExpiration: oldExpiration,
      newExpiration: newExpirationDate,
      hasDiscount: hasDiscount
    };
    
  } catch (error) {
    console.error(`❌ Error fixing birthday discount:`, error);
    return { success: false, error: error.message };
  }
}

// ------------------- Entry Point -------------------
async function run() {
  try {
    const userId = '274706500767711234';
    
    console.log('🔌 Connecting to Tinglebot database...');
    await connectToTinglebot();
    console.log('✅ Database connection ready\n');
    
    const result = await fixUserBirthdayDiscount(userId);
    
    if (result.success) {
      console.log('\n✅ Successfully fixed birthday discount!');
    } else {
      console.log(`\n❌ Failed to fix birthday discount: ${result.message || result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed.');
    process.exit(0);
  }
}

// Run the script
run();
