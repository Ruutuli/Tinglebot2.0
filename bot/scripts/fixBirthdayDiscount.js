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
// Returns a Date object (stored as UTC) that represents 11:59:59.999 PM EST
function calculateExpirationDateEST(year, month, day) {
  // Create expiration date: 11:59:59.999 PM EST
  // Method: Calculate what UTC time equals 11:59:59.999 PM EST
  // Use a test date at noon to determine DST offset
  const testUTC = Date.UTC(year, month, day, 12, 0, 0);
  const testDate = new Date(testUTC);
  
  // Get EST and UTC hours for the test date to determine offset
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false
  });
  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    hour12: false
  });
  
  const estParts = estFormatter.formatToParts(testDate);
  const utcParts = utcFormatter.formatToParts(testDate);
  
  const estHour = parseInt(estParts.find(p => p.type === 'hour').value);
  const utcHour = parseInt(utcParts.find(p => p.type === 'hour').value);
  
  // Calculate offset: EST is behind UTC, so offset is negative
  // EST: UTC-5 (when estHour=12, utcHour=17, offset = -5)
  // EDT: UTC-4 (when estHour=12, utcHour=16, offset = -4)
  const offsetHours = estHour - utcHour;
  
  // 11:59:59.999 PM EST = 23:59:59.999 EST
  // In UTC: 23 + |offsetHours| = 23 + 5 = 28 = 4 AM next day (EST)
  // or 23 + 4 = 27 = 3 AM next day (EDT)
  const utcHourFor11PM = 23 + Math.abs(offsetHours);
  
  // Handle day rollover
  let utcDay = day;
  let utcMonth = month;
  let utcYear = year;
  let finalHour = utcHourFor11PM;
  
  if (utcHourFor11PM >= 24) {
    finalHour = utcHourFor11PM % 24;
    utcDay += 1;
    // Handle month/year rollover
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    if (utcDay > daysInMonth) {
      utcDay = 1;
      utcMonth += 1;
      if (utcMonth >= 12) {
        utcMonth = 0;
        utcYear += 1;
      }
    }
  }
  
  // Create UTC date for 11:59:59.999 PM EST
  const expirationDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, finalHour, 59, 59, 999));
  return expirationDate;
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
