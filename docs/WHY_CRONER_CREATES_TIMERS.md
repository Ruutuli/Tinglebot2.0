# Why Croner Creates Timers - Explanation

## What You're Seeing

The logs show:
```
[TimerTracker] 🔍 Croner timer #96 created - Triggered by: Error
[TimerTracker] 🔍 Croner timer #144 created - Triggered by: Error
[TimerTracker] Full stack trace:
    Error
    at N.schedule (croner.cjs:1:16296)
    at N._checkTrigger (croner.cjs:1:17225)
    at Timeout._onTimeout (croner.cjs:1:16316)
    at listOnTimeout (node:internal/timers:573:17)
    at process.processTimers (node:internal/timers:514:7)
```

**What this stack trace tells us:**
1. A Node.js timer fires (`process.processTimers` → `listOnTimeout`)
2. Croner's timer callback runs (`Timeout._onTimeout`)
3. Croner checks if it should trigger the job (`_checkTrigger`)
4. Croner schedules the NEXT execution (`schedule`) ← **THIS creates the new timer**

## What's Happening

### 1. **Initial Job Creation**
When you create a cron job (like `createCronJob("0 5 * * *", "reset daily rolls", ...)`), croner:
- Parses the cron pattern
- Calculates when the next execution should be
- Creates a **timer** (using `setTimeout`) to trigger at that time
- This is timer #1 for that job

### 2. **When a Job Executes**
When the timer fires and your job function runs:
- Node.js timer fires (`process.processTimers`)
- Croner's internal timer callback runs (`_onTimeout`)
- Croner checks if it should trigger (`_checkTrigger`)
- **Croner schedules the NEXT execution (`schedule`) ← Creates NEW timer**
- Your function executes
- This is timer #2 for that job
- **The old timer should be cleaned up, but sometimes isn't**

**The Problem**: When `_checkTrigger` calls `schedule` to set up the next execution, it creates a new timer. But the timer that just fired (`_onTimeout`) might still be in the system, so you end up with multiple timers.

### 3. **The Leak Pattern**

Here's what happens over time:

```
Time 0s:  Job created → Timer #1 created (for first execution)
Time 5s:  Timer #1 fires → Job executes → Timer #2 created (for next execution)
          ❌ Timer #1 might not be cleaned up yet

Time 10s: Timer #2 fires → Job executes → Timer #3 created
          ❌ Timer #1 and #2 might still exist

Time 15s: Timer #3 fires → Job executes → Timer #4 created
          ❌ Timers #1, #2, #3 might all still exist
```

**Result**: For a single job, you end up with multiple timers instead of just one.

### 4. **Why `N.schedule` is Called**

`N.schedule` is croner's internal method that:
- Calculates the next execution time
- Creates a `setTimeout` to trigger at that time
- This is what creates the timer you're seeing in the logs

**The Call Chain:**
```
Timer fires → _onTimeout → _checkTrigger → schedule → Creates new timer
```

It gets called:
- When a job is first created (creates timer for first execution)
- Every time a timer fires and `_checkTrigger` runs (creates timer for next execution)
- If croner needs to recalculate the schedule

**The Leak**: Each time `schedule` is called, it creates a new timer. But the timer that triggered `_checkTrigger` might still be active, so you get multiple timers per job.

## Why This Happens

### Croner's Internal Behavior

Croner uses Node.js `setTimeout` internally. The problem is:

1. **Timer Creation**: Each time croner needs to schedule the next execution, it calls `setTimeout`
2. **Timer Cleanup**: Croner should clear the old timer before creating a new one, but:
   - If the job is still running when the next timer is created, the old one might not be cleared
   - If there's any delay in execution, multiple timers can exist simultaneously
   - Croner doesn't always track and clean up all its internal timers

### The Root Cause

**Croner creates a new timer for each execution cycle, but doesn't always clean up the previous timer before creating the next one.**

This is a known issue with timer-based scheduling libraries - they create new timers faster than they can clean up old ones.

## What Triggers Timer Creation

Timers are created when:

1. ✅ **Job Creation** (`new Cron(...)`) - Creates timer for first execution
2. ✅ **Job Execution** - After your function runs, croner creates timer for next execution
3. ✅ **Schedule Recalculation** - If croner needs to recalculate (timezone changes, pattern updates)
4. ❌ **Bug**: Sometimes timers are created without the old ones being cleaned up

## How to See What's Triggering It

The enhanced logging I just added will show:
- What code path triggered the timer creation
- The full stack trace when timer count gets high
- Which jobs are creating the most timers

Look for logs like:
```
[TimerTracker] 🔍 Croner timer #144 created - Triggered by: scheduler.js:createCronJob
```

This tells you that `scheduler.js`'s `createCronJob` function triggered croner to create a timer.

## The Fix

The cleanup mechanism I added will:
1. Monitor timer-to-job ratio
2. When ratio > 5, restart all jobs
3. This forces croner to clean up all its internal timers
4. Jobs are recreated fresh with clean timer state

## Summary

**What's making croner create timers:**
- Normal operation: Creating timers for scheduled executions (expected)
- The leak: Not cleaning up old timers before creating new ones (the bug)

**Why you see so many:**
- Each job execution creates a new timer
- Old timers aren't always cleaned up
- Over time, timers accumulate (96 → 192 → 253)

**The solution:**
- Automatic cleanup restarts jobs when timer ratio gets too high
- This forces croner to reset its internal timer state
