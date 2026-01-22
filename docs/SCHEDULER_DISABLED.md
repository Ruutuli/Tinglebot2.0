# Scheduler Disabled for Testing

## Status: ✅ FULLY DISABLED

All croner-based scheduler code and scheduler function calls have been commented out to diagnose memory growth and timer leak issues.

## What's Disabled

### Main Scheduler
- ✅ `initializeScheduler()` - Main scheduler initialization
- ✅ All cron job creation (daily tasks, weather, blight, etc.)
- ✅ Croner shutdown on process exit
- ✅ Scheduler imports (`initializeScheduler`, `setupWeatherScheduler`, `setupBlightScheduler`)

### Scheduler Function Calls
- ✅ `scheduleDebuffExpiry()` - Called from mod.js when applying debuffs

## What's Still Active

- ✅ **Agenda** - One-time scheduled jobs (uses MongoDB, separate from croner)
  - Jail releases
  - One-time scheduled tasks
  - Uses MongoDB, not timers
- ✅ All bot commands and functionality
- ✅ Database operations
- ✅ Random encounters system

## Files Modified

### 1. `bot/index.js` (Bot):
   - **Lines 53-58**: Commented out scheduler imports
     ```javascript
     // SCHEDULER DISABLED FOR TESTING
     // const {
     //   initializeScheduler,
     //   setupWeatherScheduler,
     //   setupBlightScheduler
     // } = require('./scheduler/scheduler');
     ```
   
   - **Line 450**: Commented out `initializeScheduler(client)` call
     ```javascript
     // initializeScheduler(client);
     ```
     Added warning log: "⚠️ SCHEDULER DISABLED"
   
   - **Lines 208-216**: Commented out croner shutdown
     ```javascript
     // SCHEDULER DISABLED FOR TESTING
     // try {
     //   const { shutdownCroner } = require('./scheduler/croner');
     //   shutdownCroner();
     //   ...
     // }
     ```

### 2. `bot/commands/moderation/mod.js` (Bot):
   - **Lines 3910-3917**: Commented out `scheduleDebuffExpiry()` call
     ```javascript
     // SCHEDULER DISABLED FOR TESTING
     // try {
     //   const { scheduleDebuffExpiry } = require('../../scheduler/scheduler');
     //   await scheduleDebuffExpiry(character);
     // } catch (agendaError) {
     //   ...
     // }
     ```

### 3. `dashboard/server.js` (Dashboard):
   - **Line 90**: Commented out croner import
     ```javascript
     // SCHEDULER DISABLED FOR TESTING
     // const { Cron } = require('croner');
     ```
   
   - **Line 4182**: Commented out `setupWeeklyCharacterRotationScheduler()` call
     ```javascript
     // setupWeeklyCharacterRotationScheduler();
     logger.warn('⚠️ SCHEDULER DISABLED: Weekly character rotation scheduler is commented out for testing.');
     ```
   
   - **Lines 4222-4239**: Commented out `setupWeeklyCharacterRotationScheduler` function
     ```javascript
     // const setupWeeklyCharacterRotationScheduler = () => {
     //   new Cron(...)
     // };
     ```
   
   - **Lines 10114-10176**: Commented out security audit cron job
     ```javascript
     // SCHEDULER DISABLED FOR TESTING
     // new Cron('0 5 * * *', {...}, async () => {
     //   // Security audit code
     // });
     ```

## Testing Plan

1. **Monitor Memory**: Watch RSS and heap memory over 24-48 hours
2. **Monitor Timers**: Check if timer count stays stable without scheduler
3. **Compare**: Compare memory growth with scheduler vs without

## Expected Results

### If scheduler was the issue:
- ✅ Memory growth should stop or slow significantly
- ✅ Timer count should stay low and stable (~1-2 timers, just undici/other)
- ✅ No croner timers should be created
- ✅ No timer accumulation

### If scheduler was NOT the issue:
- ❌ Memory growth continues
- ❌ Timer leaks persist from other sources
- ⚠️ Need to investigate other causes (database connections, caches, etc.)

## Re-enabling

To re-enable the scheduler:

### Bot (`bot/index.js`):
1. **Uncomment imports** (lines 53-58)
2. **Uncomment initialization** (line 450)
3. **Uncomment shutdown** (lines 208-216)
4. **Remove warning log** message

### Bot Commands (`bot/commands/moderation/mod.js`):
5. **Uncomment scheduleDebuffExpiry** (lines 3910-3917)

### Dashboard (`dashboard/server.js`):
6. **Uncomment croner import** (line 90)
7. **Uncomment setupWeeklyCharacterRotationScheduler function** (lines 4222-4239)
8. **Uncomment setupWeeklyCharacterRotationScheduler call** (line 4182)
9. **Uncomment security audit cron job** (lines 10114-10176)
10. **Remove warning log** message

## Notes

- Agenda (one-time jobs) is still active and uses MongoDB
- This only disables recurring cron jobs
- Bot functionality remains intact
- Scheduled tasks (weather, daily resets, etc.) will not run while disabled
- Debuff expiry will not be automatically scheduled (but can still be checked manually)

## Impact

**What won't work:**
- Daily quest generation (bot)
- Daily roll resets (bot)
- Stamina recovery (bot)
- Weather updates (bot)
- Blight roll calls (bot)
- Boost cleanup (bot)
- Village raid quota checks (bot)
- Quest completion checks (bot)
- Blood moon announcements (bot)
- Monthly rewards (bot)
- Automatic debuff/buff expiry scheduling (bot)
- Weekly character rotation (dashboard)
- Daily security audit (dashboard)

**What still works:**
- All bot commands
- Manual operations
- One-time scheduled jobs (via Agenda)
- Database operations
- Random encounters
