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
- ✅ **MIGRATION COMPLETE** - Both bot and dashboard migrated to `croner`
- ✅ Memory monitor updated to detect croner timers (no longer tracks node-cron)
- ✅ Old node-cron leak monitoring code removed
- ✅ Memory usage stable (226 MB vs 2.26 GB before)
- ✅ Timer count stable (679 timers vs 815k+ before)

---

## Migration Complete ✅

The migration from `node-cron` to `croner` has been completed for both the bot and dashboard services.

**Results:**
- Memory usage: **226 MB** (down from 2.26 GB - 90% reduction)
- Timer count: **679 timers** (down from 815k+ - 99.9% reduction)
- Memory growth: **Stable** (no continuous growth observed)
- All scheduled tasks: **Working correctly**

**Cleanup completed:**
- ✅ Removed all node-cron detection logic from `memoryMonitor.js`
- ✅ Updated logging to show croner timers instead of node-cron
- ✅ Simplified timer leak detection (croner doesn't leak)
- ✅ Removed old monitoring workarounds

### Railway Healthcheck (Still Active)

The healthcheck endpoint at `/health` or `/healthcheck` remains active for general memory monitoring:
- Returns `503 (unhealthy)` when memory exceeds 1 GB
- Railway will automatically restart the service if healthcheck fails
- This provides a safety net for any future memory issues

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

#### 5. Clean up old node-cron detection code ✅ COMPLETE

**Already removed:**
- ✅ All node-cron detection logic from `memoryMonitor.js`
- ✅ Old monitoring workarounds
- ✅ Node-cron specific logging and warnings

The memory monitor now only tracks croner timers, which don't leak.

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

**Note:** Migration is complete and stable. Rollback should not be necessary.

If issues arise (unlikely):

1. Revert `scheduler.js` changes in both bot and dashboard
2. Reinstall node-cron: `npm install node-cron@3.0.3`
3. Remove croner: `npm uninstall croner`
4. Re-add node-cron detection to `memoryMonitor.js` (see git history)

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
**Status:** ✅ Migration complete - Memory leak fixed
