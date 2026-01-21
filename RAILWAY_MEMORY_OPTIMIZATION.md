# Railway Memory Optimization Guide

This document outlines memory optimizations and best practices for deploying to Railway.

## 🎯 Why Memory Issues Happen on Railway

1. **Longer Uptime**: Production runs 24/7, so memory leaks accumulate over time
2. **Resource Constraints**: Railway has memory limits (typically 512MB-1GB)
3. **Different Workload**: Production handles more concurrent requests
4. **Restart Behavior**: Railway restarts might not clean up resources properly

## ✅ What We've Fixed

### 1. **Cron Job Cleanup**
- Added guard to prevent duplicate scheduler initialization
- Cron jobs are now destroyed on shutdown
- Prevents timer leaks from accumulating

### 2. **Graceful Shutdown**
- Added comprehensive cleanup on SIGTERM/SIGINT
- Cleans up: cron jobs, Discord client, database connections, caches, memory monitor
- Ensures Railway restarts start with a clean slate

### 3. **Memory Monitoring**
- Better detection of `node-cron` timers (expected behavior)
- Tracks database connection pools
- Monitors cache sizes
- Alerts when approaching memory limits

## 🔧 Railway Environment Variables

Add these to your Railway service environment variables:

```bash
# Node.js Memory Management
NODE_OPTIONS=--max-old-space-size=768

# Production Mode
NODE_ENV=production
RAILWAY_ENVIRONMENT=true
```

**Note**: For a 1GB Railway plan, `--max-old-space-size=768` uses ~75% of available memory, leaving headroom for the system.

## 📊 Monitoring Memory Usage

The memory monitor will automatically:
- Log memory stats every 5 minutes
- Warn when memory usage exceeds 80% of estimated limit
- Track active timers, intervals, and database connections
- Report cache sizes

## 🚨 Signs of Memory Leaks

Watch for these in your Railway logs:

1. **Growing Timer Count**: `High timeout count detected: X active timers`
   - Should stabilize after initialization
   - If it keeps growing, there's a leak

2. **Memory Growth**: `Memory growth detected: X MB over Y seconds`
   - Memory should stabilize after startup
   - Continuous growth indicates a leak

3. **High RSS**: `Memory usage exceeds 500MB`
   - Normal: 200-400MB after startup
   - Concerning: >600MB consistently

## 🛠️ Troubleshooting

### If Memory Keeps Growing:

1. **Check for Duplicate Initialization**
   ```
   Look for: "Scheduler already initialized - destroyed X existing jobs"
   ```
   If you see this repeatedly, something is calling `initializeScheduler()` multiple times.

2. **Check Timer Sources**
   ```
   Look for: "Top timer sources: scheduler.js:line36: X"
   ```
   If X keeps growing, there's a timer leak.

3. **Check Database Connections**
   ```
   Look for: "Database Connections - X connection(s)"
   ```
   Should be stable (1-3 connections typically).

4. **Check Cache Sizes**
   ```
   Look for: "Cache Sizes - inventoryCache: X"
   ```
   Should stay within maxSize limits.

### Manual Cleanup (if needed):

If memory gets too high, Railway will restart the service automatically. The graceful shutdown handlers will clean up everything.

## 📝 Best Practices

1. **Monitor Regularly**: Check Railway logs weekly for memory warnings
2. **Set Alerts**: Configure Railway alerts for memory usage
3. **Review Code**: When adding new features, ensure:
   - Timers/intervals are cleaned up
   - Database connections are closed
   - Caches have maxSize limits
   - Event listeners are removed

4. **Test Locally**: Memory issues often appear in production first, but you can test locally by:
   - Running for extended periods
   - Simulating production load
   - Monitoring with the memory monitor

## 🔍 Code Locations

- **Scheduler Cleanup**: `bot/scheduler.js` - `destroyAllCronJobs()`
- **Graceful Shutdown**: `bot/index.js` - `performGracefulShutdown()`
- **Memory Monitor**: `shared/utils/memoryMonitor.js`
- **Railway Optimizations**: `shared/utils/railwayOptimizations.js`

## 📈 Expected Memory Usage

After startup and stabilization:
- **Base Memory**: ~150-200MB RSS
- **With Caches**: ~200-300MB RSS
- **Under Load**: ~300-400MB RSS
- **Warning Threshold**: 500MB RSS
- **Critical Threshold**: 1GB RSS

If you consistently see >600MB RSS, investigate for leaks.


Error log cache (minor)
Location: shared/utils/globalErrorHandler.js
Issue: errorLogCache Map has no size limit
Impact: Low (errors are usually repetitive)
Fix: Add size limit (I can add this)
Database connections
Need to verify connection pools are closed properly
Check for connection leaks
Event listeners
Need to audit that all listeners are cleaned up
Other shared code
Caches: bounded with maxSize limits
Throttle detector: bounded to 20 entries
Memory monitor history: bounded to 100 entries
Recommendation
✅ node-cron → croner migration completed
Add errorLogCache size limit (quick fix)
Verify database connection cleanup
Audit event listeners