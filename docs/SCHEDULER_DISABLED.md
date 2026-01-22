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

### 1. `bot/index.js`:
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

### 2. `bot/commands/moderation/mod.js`:
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

1. **Uncomment imports** in `bot/index.js` (lines 53-58)
2. **Uncomment initialization** in `bot/index.js` (line 450)
3. **Uncomment shutdown** in `bot/index.js` (lines 208-216)
4. **Uncomment scheduleDebuffExpiry** in `bot/commands/moderation/mod.js` (lines 3910-3917)
5. **Remove warning log** message

## Notes

- Agenda (one-time jobs) is still active and uses MongoDB
- This only disables recurring cron jobs
- Bot functionality remains intact
- Scheduled tasks (weather, daily resets, etc.) will not run while disabled
- Debuff expiry will not be automatically scheduled (but can still be checked manually)

## Impact

**What won't work:**
- Daily quest generation
- Daily roll resets
- Stamina recovery
- Weather updates
- Blight roll calls
- Boost cleanup
- Village raid quota checks
- Quest completion checks
- Blood moon announcements
- Monthly rewards
- Automatic debuff/buff expiry scheduling

**What still works:**
- All bot commands
- Manual operations
- One-time scheduled jobs (via Agenda)
- Database operations
- Random encounters
