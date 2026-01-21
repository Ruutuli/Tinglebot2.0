# Memory Leak Fix - Migration from node-cron to croner

## Problem Summary

**Issue:** `node-cron` package has a known memory leak when using timezone support. Internal timers created for timezone calculations are not properly cleaned up, causing:

- Continuous timer accumulation (19,974 → 512,681+ timers observed in bot)
- Memory growth over time (272 MB → 1.22 GB+ observed in bot)
- Potential crashes when memory is exhausted
- Performance degradation as timer count increases

**Root Cause:** `node-cron` version 3.0.3 (and earlier versions) does not properly clean up internal timers when using the `timezone` option. Even calling `.destroy()` on cron tasks doesn't fully clean up all internal resources.

**Affected Services:**
- ✅ **Bot** (`bot/scheduler.js`) - ~67 cron jobs, severe leak (500k+ timers)
- ✅ **Dashboard** (`dashboard/scheduler.js`) - ~40 cron jobs, moderate leak (165+ timers)
- ⚠️ Both services use `node-cron` independently, so both need migration
- ⚠️ Both share the same `memoryMonitor` utility (which correctly detects leaks in both)

**Current Status:** 
- ✅ Bot: Monitoring added (alerts at 100k+ and 200k+ timers)
- ✅ Dashboard: Monitoring added (alerts at 20k+ and 50k+ timers)
- ✅ Memory monitor updated to exclude node-cron timers from leak detection
- ⚠️ Workaround in place (monitoring only, doesn't fix the leak)
- ❌ Proper fix pending (migration to croner for BOTH services)

---

## Current Workarounds

### 1. Monitoring System

A monitoring system has been added in both `bot/scheduler.js` and `dashboard/scheduler.js` that:
- Checks every 30 minutes for excessive node-cron timer accumulation
- Warns at 100,000+ timers (bot) / 20,000+ timers (dashboard)
- Alerts critically at 200,000+ timers (bot) / 50,000+ timers (dashboard)
- Attempts garbage collection if `--expose-gc` flag is enabled

**This does NOT fix the leak** - it only helps you monitor it.

### 2. Railway Auto-Restart (Temporary Fix)

A healthcheck endpoint has been added to automatically restart the bot when memory gets too high.

**How it works:**
- Healthcheck endpoint at `/health` or `/healthcheck` checks memory every time Railway calls it
- Returns `503 (unhealthy)` when:
  - Memory exceeds 1 GB, OR
  - Node-cron timers exceed 300,000
- Railway will automatically restart the service when healthcheck fails

**Railway Configuration:**

1. **Set Healthcheck Path:**
   - Go to your Railway service settings
   - Under "Deploy" section, find "Healthcheck Path"
   - Set it to: `/health` or `/healthcheck`
   - Railway will call this endpoint periodically
   - If it returns 503, Railway will restart the service

2. **Optional: Set Memory Limit:**
   - Under "Resource Limits", set Memory to a reasonable limit (e.g., 1.5 GB)
   - Railway will kill the process if it exceeds this limit (hard kill)
   - The healthcheck provides a gentler restart before hitting the limit

3. **Restart Policy:**
   - Ensure "Restart Policy" is set to "On Failure" (default)
   - This ensures Railway restarts when healthcheck fails

**Note:** This is a temporary workaround. The bot will restart periodically, which:
- ✅ Prevents memory from growing indefinitely
- ✅ Clears accumulated timers
- ⚠️ Causes brief downtime during restart (~10-30 seconds)
- ⚠️ Doesn't fix the root cause

**The leak will continue until migration to croner is complete.**

---

## Proper Fix: Migrate to `croner` Package

### Why croner?

- ✅ **No memory leaks** - Proper cleanup of all timers and resources
- ✅ **Better timezone support** - More reliable DST handling
- ✅ **Similar API** - Easy migration path
- ✅ **Active maintenance** - Regularly updated
- ✅ **Better performance** - More efficient timer management

### Migration Steps

#### 1. Install croner (for BOTH services)

**Bot:**
```bash
cd bot
npm install croner
npm uninstall node-cron
```

**Dashboard:**
```bash
cd dashboard
npm install croner
npm uninstall node-cron
```

**Root package.json:**
```bash
# Also update root package.json if node-cron is listed there
npm uninstall node-cron
```

#### 2. Update scheduler.js imports (BOTH files)

**Files to update:**
- `bot/scheduler.js`
- `dashboard/scheduler.js`

**Find:**
```javascript
const cron = require("node-cron");
```

**Replace with:**
```javascript
const { Cron } = require("croner");
```

#### 3. Update createCronJob function (BOTH files)

**Files to update:**
- `bot/scheduler.js` (lines ~140-163)
- `dashboard/scheduler.js` (lines ~122-140)

**Current code:**
```javascript
function createCronJob(
 schedule,
 jobName,
 jobFunction,
 timezone = "America/New_York"
) {
 const task = cron.schedule(
  schedule,
  async () => {
   try {
    await jobFunction();
   } catch (error) {
    handleError(error, "scheduler.js");
    logger.error('SCHEDULER', `[scheduler.js]❌ ${jobName} failed:`, error.message);
   }
  },
  { timezone }
 );
 
 // Track the cron job instance
 activeCronJobs.add(task);
 
 return task;
}
```

**Replace with:**
```javascript
function createCronJob(
 schedule,
 jobName,
 jobFunction,
 timezone = "America/New_York"
) {
 const task = new Cron(
  schedule,
  {
    timezone: timezone,
    catch: true, // Automatically catch errors
  },
  async () => {
   try {
    await jobFunction();
   } catch (error) {
    handleError(error, "scheduler.js");
    logger.error('SCHEDULER', `[scheduler.js]❌ ${jobName} failed:`, error.message);
   }
  }
 );
 
 // Track the cron job instance
 activeCronJobs.add(task);
 
 return task;
}
```

#### 4. Update destroyAllCronJobs function (bot only)

**Note:** Dashboard scheduler doesn't have `destroyAllCronJobs`, but if you add it, use the same pattern.

**File to update:**
- `bot/scheduler.js` (lines ~166-179)

**Current code:**
```javascript
function destroyAllCronJobs() {
 let destroyedCount = 0;
 for (const task of activeCronJobs) {
  try {
   task.destroy();
   destroyedCount++;
  } catch (error) {
   logger.error('SCHEDULER', 'Error destroying cron job', error.message);
  }
 }
 activeCronJobs.clear();
 logger.info('SCHEDULER', `Destroyed ${destroyedCount} cron jobs`);
 return destroyedCount;
}
```

**Replace with:**
```javascript
function destroyAllCronJobs() {
 let destroyedCount = 0;
 for (const task of activeCronJobs) {
  try {
   task.stop(); // croner uses stop() instead of destroy()
   destroyedCount++;
  } catch (error) {
   logger.error('SCHEDULER', 'Error destroying cron job', error.message);
  }
 }
 activeCronJobs.clear();
 logger.info('SCHEDULER', `Destroyed ${destroyedCount} cron jobs`);
 return destroyedCount;
}
```

#### 5. Remove node-cron leak monitoring

**Remove or comment out:**
- The `setupNodeCronLeakMonitoring()` function (lines ~2800-2840)
- The call to `setupNodeCronLeakMonitoring()` in `initializeScheduler()` (line ~2835)

**Or update it to monitor croner instead:**
```javascript
function setupCronLeakMonitoring() {
 // Monitor for any timer leaks (shouldn't happen with croner, but good to verify)
 createCronJob("*/30 * * * *", "cron leak monitoring", async () => {
  try {
   const { getMemoryMonitor } = require('../shared/utils/memoryMonitor');
   const memoryMonitor = getMemoryMonitor();
   if (!memoryMonitor) return;
   
   const stats = memoryMonitor.getMemoryStats();
   const allTimers = Array.from(memoryMonitor.activeTimers?.values() || []);
   const cronTimers = allTimers.filter(t => t.source?.includes('cron'));
   const cronCount = cronTimers.length;
   
   // With croner, we should see stable timer counts
   if (cronCount > 1000) {
    logger.warn('SCHEDULER', `Warning: High cron timer count - ${cronCount.toLocaleString()} active timers`);
    logger.warn('SCHEDULER', 'This may indicate an issue with croner or another scheduler.');
   }
  } catch (error) {
   logger.error('SCHEDULER', 'Error monitoring cron leak', error.message);
  }
 }, "America/New_York");
}
```

#### 6. Update package.json

Remove `node-cron` from dependencies in `package.json` (root and bot/package.json if separate).

---

## Testing Checklist

After migration, verify:

- [ ] All cron jobs are still running at correct times
- [ ] Timezone handling works correctly (EST/EDT transitions)
- [ ] Memory usage stabilizes (no continuous growth)
- [ ] Timer count remains stable (should be much lower than before)
- [ ] No errors in logs related to cron scheduling
- [ ] All scheduled tasks execute properly:
  - [ ] Daily tasks (midnight, 5 AM, 8 AM)
  - [ ] Hourly tasks
  - [ ] Weekly tasks
  - [ ] Monthly tasks
  - [ ] Help Wanted scheduler (24 time slots)
  - [ ] Blight scheduler
  - [ ] Weather scheduler
  - [ ] Boost scheduler
  - [ ] Secret Santa scheduler
  - [ ] Blood Moon scheduler
  - [ ] Google Sheets retry scheduler

---

## Monitoring After Migration

Watch for:
1. **Stable memory usage** - Should not continuously grow
2. **Stable timer count** - Should remain relatively constant
3. **No timer leak warnings** - Memory monitor should not detect leaks
4. **Proper task execution** - All scheduled tasks should run on time

If you see issues:
- Check logs for croner-specific errors
- Verify timezone strings are correct
- Ensure all cron expressions are valid
- Check that `task.stop()` is being called properly

---

## Rollback Plan

If migration causes issues:

1. Revert `scheduler.js` changes
2. Reinstall node-cron: `npm install node-cron@3.0.3`
3. Remove croner: `npm uninstall croner`
4. Re-enable monitoring: Uncomment `setupNodeCronLeakMonitoring()`

---

## Additional Notes

- **Croner API differences:**
  - Uses `new Cron()` constructor instead of `cron.schedule()`
  - Uses `task.stop()` instead of `task.destroy()`
  - Error handling via `catch: true` option
  - Similar timezone support

- **Performance benefits:**
  - Lower memory footprint
  - Faster timer calculations
  - Better DST handling

- **Documentation:**
  - Croner docs: https://github.com/hexagon/croner
  - Migration guide: https://github.com/hexagon/croner#migration-from-node-cron

---

## Timeline Recommendation

**Priority: High** - Memory leak will continue to worsen over time

**Suggested timeline:**
1. **Week 1:** Test migration in development environment
2. **Week 2:** Deploy to staging/test bot instance
3. **Week 3:** Monitor for 1 week, verify stability
4. **Week 4:** Deploy to production

**Or:** If memory usage becomes critical, migrate immediately.

---

## Questions or Issues?

If you encounter problems during migration:
1. Check croner GitHub issues: https://github.com/hexagon/croner/issues
2. Verify cron expression syntax matches croner requirements
3. Test individual cron jobs in isolation
4. Check timezone string format (should be IANA timezone like "America/New_York")

---

**Last Updated:** 2026-01-21  
**Status:** Workaround in place, proper fix pending
