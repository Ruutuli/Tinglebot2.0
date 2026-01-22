# Timer Leak Diagnosis - Croner Library

## Problem Summary

The bot is experiencing a timer leak where croner (the scheduling library) creates multiple timers per job, and these timers accumulate over time without being cleaned up.

## Symptoms

- **Timer Growth**: Timer count grows continuously (96 → 192 → 253) while job count stays constant (48)
- **Timer-to-Job Ratio**: Increases over time (2 → 4 → 5+ timers/job)
- **Growth Rate**: Approximately 1.3 timers/second
- **Expected Behavior**: 1-2 timers per job (one for next execution, one for internal management)

## Root Cause Analysis

### Primary Issue: Croner Internal Timer Management

The croner library creates timers internally for:
1. Scheduling the next execution
2. Internal validation/recalculation
3. Timezone calculations (if timezone is set)

**The Problem**: When jobs execute, croner creates new timers for the next execution cycle, but doesn't always clean up the old timers properly. This causes timers to accumulate over time.

### Contributing Factors

1. **No Explicit Timer Cleanup**: Croner doesn't provide a way to manually clean up internal timers
2. **Timer Reuse**: Croner may create new timers instead of reusing existing ones
3. **Overlapping Executions**: If jobs take time to execute, multiple timers can exist simultaneously

## Evidence from Logs

```
Initial: 48 jobs, 96 croner timers (2 timers/job) - Normal
After 60s: 48 jobs, 192 croner timers (4 timers/job) - Doubled!
After 120s: 48 jobs, 253 croner timers (5 timers/job) - Still growing
Growth rate: 1.31 timers/sec
```

## Fixes Applied

### 1. Fixed Import Paths
- **File**: `shared/utils/memoryMonitor.js`
- **Issue**: Incorrect relative paths to `bot/scheduler/croner.js`
- **Fix**: Changed from `../../bot/scheduler/croner` to `../../../bot/scheduler/croner`

### 2. Improved Cleanup Mechanism
- **File**: `bot/scheduler/croner.js`
- **Enhancement**: More aggressive cleanup that restarts all jobs when timer ratio exceeds threshold
- **Strategy**: 
  - If timer ratio > 10: Restart ALL jobs immediately
  - If timer ratio > 5: Restart problematic jobs or all jobs if none identified
  - Wait 2 seconds after stopping jobs to allow cleanup

### 3. Better Diagnostics
- Added detailed logging of timer growth rates
- Track timer creation per job
- Monitor timer-to-job ratios

## Recommended Solutions

### Short-term (Implemented)
1. ✅ **Automatic Cleanup**: Restart jobs when timer ratio > 5
2. ✅ **Monitoring**: Track timer growth and alert when threshold exceeded
3. ✅ **Diagnostics**: Log detailed timer statistics

### Medium-term (Consider)
1. **Periodic Job Restart**: Restart all jobs every 24 hours to prevent accumulation
2. **Timer Limit**: Set a hard limit on timer count and restart all jobs if exceeded
3. **Job Health Checks**: More frequent health checks (every 5 minutes instead of 2)

### Long-term (If Issue Persists)
1. **Switch Scheduling Library**: Consider alternatives like:
   - `node-cron` (more stable, but less features)
   - `agenda` (already used for one-time jobs)
   - Custom timer management
2. **Patch Croner**: Fork croner and add explicit timer cleanup
3. **Hybrid Approach**: Use agenda for all scheduled jobs instead of croner

## Configuration

Environment variables for controlling cleanup behavior:

- `TIMER_LEAK_RATIO_THRESHOLD`: Timer-to-job ratio threshold (default: 5)
- `TIMER_LEAK_GROWTH_THRESHOLD`: Timer growth rate threshold in timers/sec (default: 1.0)
- `ENABLE_TIMER_AUTO_CLEANUP`: Enable automatic cleanup (default: true)

## Monitoring

The system now logs:
- Timer count every minute
- Timer growth rate
- Timer-to-job ratios
- Automatic cleanup actions

Watch for these log messages:
- `🔍 Timer leak diagnostic`: Regular health check
- `📈 Timer growth`: Growth rate detected
- `🧹 Starting cleanup`: Cleanup triggered
- `🔄 Restarting job`: Individual job restart
- `✅ Cleaned up`: Cleanup completed

## Next Steps

1. **Monitor**: Watch logs for timer growth patterns
2. **Tune Thresholds**: Adjust `TIMER_LEAK_RATIO_THRESHOLD` if needed
3. **Evaluate**: If issue persists after 24-48 hours, consider long-term solutions

## Related Files

- `bot/scheduler/croner.js` - Croner wrapper with cleanup logic
- `bot/scheduler/scheduler.js` - Scheduler initialization
- `shared/utils/memoryMonitor.js` - Memory and timer monitoring
- `bot/index.js` - Bot initialization
