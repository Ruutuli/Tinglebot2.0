# Croner Best Practices - Preventing Timer Leaks

Based on croner documentation and common timer leak issues.

## Key Principles

### 1. Always Stop Jobs Before Recreating

**The Problem:**
Most timer leaks happen because code calls `new Cron(...)` repeatedly without calling `.stop()` on the previous instance.

**The Solution:**
```javascript
// ❌ BAD - Creates timer leak
function setupJob() {
  new Cron(pattern, fn); // Old job never stopped!
}

// ✅ GOOD - Stops old job first
function setupJob() {
  if (existingJob) {
    existingJob.stop(); // Clean up old job
  }
  existingJob = new Cron(pattern, fn);
}
```

**Our Implementation:**
- `createCronJob()` checks for existing jobs with the same name
- Automatically calls `.stop()` before creating a new job
- Removes job from tracking maps
- See: `bot/scheduler/croner.js` lines 105-118

### 2. Use Named Jobs for Management

Croner supports named jobs via `scheduledJobs`:
- Named jobs are automatically removed from `scheduledJobs` on `.stop()`
- Makes it easier to track and manage jobs
- Prevents duplicate jobs with same name

**Our Implementation:**
- All jobs are created with unique names
- Jobs are tracked in `activeCrons` Map (name → Cron instance)
- Jobs are automatically stopped if recreated with same name

### 3. For "Schedule-Next-Run" Loops, Use maxRuns: 1

**The Pattern:**
If your pattern is "compute next time → schedule one run → after it fires, compute next...", use `maxRuns: 1`:

```javascript
// ❌ BAD - Creates multiple timers
const job = new Cron(pattern, () => {
  // Do work
  // Job continues running with same pattern
});

// ✅ GOOD - Auto-stops after one run
const job = new Cron(pattern, {
  maxRuns: 1
}, () => {
  // Do work
  // Job stops automatically
  // You can create a new job with new pattern
});
```

**When to Use:**
- Jobs that need to recalculate their schedule after each run
- Jobs with dynamic timing based on runtime conditions
- Jobs that should only run once per creation

**Our Implementation:**
- Most of our jobs use fixed cron patterns (don't need `maxRuns: 1`)
- Jobs are meant to run repeatedly on a schedule
- If you need dynamic scheduling, consider using `maxRuns: 1` pattern

### 4. Proper Cleanup on Shutdown

Always stop all jobs when shutting down:

```javascript
// ✅ GOOD - Clean shutdown
function shutdown() {
  for (const [name, job] of activeCrons.entries()) {
    job.stop();
  }
  activeCrons.clear();
}
```

**Our Implementation:**
- `destroyAllCronJobs()` stops all jobs
- `shutdownCroner()` clears process-level guards
- Called on process exit and scheduler restart

## Common Timer Leak Scenarios

### Scenario 1: Recreating Jobs Without Stopping

```javascript
// ❌ BAD
setInterval(() => {
  new Cron('* * * * *', fn); // Creates new job every second!
}, 1000);

// ✅ GOOD
let job = null;
setInterval(() => {
  if (job) job.stop();
  job = new Cron('* * * * *', fn);
}, 1000);
```

### Scenario 2: Jobs Created in Frequently Called Functions

```javascript
// ❌ BAD
function handleRequest() {
  new Cron('0 0 * * *', fn); // Creates job on every request!
}

// ✅ GOOD
let job = null;
function handleRequest() {
  if (!job) {
    job = new Cron('0 0 * * *', fn);
  }
}
```

### Scenario 3: Not Stopping Jobs on Error

```javascript
// ❌ BAD
try {
  const job = new Cron(pattern, fn);
} catch (error) {
  // Job might still be running!
}

// ✅ GOOD
let job = null;
try {
  job = new Cron(pattern, fn);
} catch (error) {
  if (job) job.stop();
  throw error;
}
```

## Our Safeguards

1. **Job Deduplication**: `createCronJob()` automatically stops existing jobs with same name
2. **Job Tracking**: All jobs tracked in `activeCrons` Map
3. **Automatic Cleanup**: Timer leak detection restarts jobs when ratio > 5
4. **Shutdown Handling**: Proper cleanup on process exit
5. **Error Handling**: Jobs stopped even if errors occur

## Monitoring

Watch for these indicators of timer leaks:

- Timer count growing faster than job count
- Timer-to-job ratio > 2 (expected: 1-2)
- Multiple jobs with same name
- Jobs executing more frequently than expected

Our system automatically:
- Logs timer counts every minute
- Detects timer leaks (ratio > 5)
- Restarts jobs when leaks detected
- Logs detailed diagnostics

## References

- Croner Documentation: https://github.com/Hexagon/croner
- Croner API: `.stop()`, `.pause()`, `.resume()`, `maxRuns` option
- `scheduledJobs` array for named job management
