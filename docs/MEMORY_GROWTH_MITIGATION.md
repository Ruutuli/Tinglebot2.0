# Memory Growth Mitigation

## Current Memory Growth Pattern

Based on logs:
- **RSS Growth**: ~190MB → ~199MB (+9MB in ~12 minutes)
- **Heap Growth**: ~131MB → ~138MB (+7MB in ~12 minutes)
- **Growth Rate**: ~0.75 MB/min RSS, ~0.58 MB/min Heap

## Root Causes

### 1. Orphaned Croner Timers (Primary Issue)

**Problem**: 243 croner timers remain active even after jobs are stopped
- Each timer holds references in memory
- Timers accumulate over time (96 → 192 → 243)
- Croner doesn't clean up timers properly after `stop()`

**Impact**: 
- Each timer: ~few KB of memory
- 243 timers: ~1-2 MB of memory
- Timers hold closures and references, preventing GC

### 2. Memory Not Being Freed

**Problem**: Even after cleanup, memory doesn't decrease
- Node.js GC is conservative
- References held by timers prevent cleanup
- Memory may not be freed until process restart

## Mitigation Strategies

### Immediate Actions (Implemented)

1. **Automatic Job Recreation**
   - Jobs are automatically recreated after cleanup
   - Prevents system from being non-functional
   - Reduces timer accumulation

2. **Aggressive Cleanup**
   - Force cleanup of croner internal timers
   - Wait for async cleanup to complete
   - Monitor timer count after cleanup

3. **Memory Growth Monitoring**
   - Alert if growth > 5 MB/min
   - Alert if total growth > 50 MB
   - Track memory before/after cleanup

### Long-term Solutions

#### Option 1: Switch Scheduler Library (Recommended)

**Candidates:**
- `node-cron`: More stable, better timer cleanup
- `agenda`: Already used for one-time jobs, could handle all scheduling
- Custom timer management: Full control over cleanup

**Pros:**
- Better memory management
- More predictable behavior
- Better cleanup guarantees

**Cons:**
- Migration effort
- Need to test all scheduled jobs
- Potential feature differences

#### Option 2: Periodic Process Restart

**Strategy:**
- Restart bot every 24 hours
- Clears all memory and timers
- Simple but disruptive

**Implementation:**
```javascript
// Restart after 24 hours
setTimeout(() => {
  process.exit(0); // Let process manager restart
}, 24 * 60 * 60 * 1000);
```

#### Option 3: Force Garbage Collection (Development Only)

**Warning**: Only use in development, not production!

```javascript
if (process.env.NODE_ENV !== 'production' && global.gc) {
  global.gc(); // Requires --expose-gc flag
}
```

#### Option 4: Lower Cleanup Threshold

**Current**: Cleanup when timer ratio > 5
**Proposed**: Cleanup when timer ratio > 3

**Trade-off**: More frequent cleanups (every ~1-2 minutes) but prevents accumulation

## Monitoring

### Key Metrics to Watch

1. **RSS Memory**: Should stay < 300 MB
2. **Heap Memory**: Should stay < 200 MB  
3. **Timer Count**: Should be ~48-96 (1-2 per job)
4. **Memory Growth Rate**: Should be < 1 MB/min

### Alerts

- **Warning**: RSS > 250 MB or growth > 5 MB/min
- **Critical**: RSS > 300 MB or growth > 10 MB/min
- **Action Required**: Orphaned timers > 100

## Current Status

- ✅ Automatic cleanup when timer ratio > 5
- ✅ Job recreation after cleanup
- ✅ Memory growth monitoring
- ✅ Aggressive timer cleanup
- ⚠️ Orphaned timers still accumulate (croner bug)
- ⚠️ Memory growth continues (~0.75 MB/min)

## Recommendations

1. **Short-term**: Monitor for 24-48 hours to see if growth stabilizes
2. **Medium-term**: Consider lowering cleanup threshold to 3
3. **Long-term**: Evaluate switching to `node-cron` or `agenda` for scheduling

## Expected Behavior

**Normal**:
- Memory grows slowly (~0.1-0.5 MB/min) during normal operation
- Memory stabilizes after initial startup
- Cleanup reduces timer count

**Concerning**:
- Memory grows > 1 MB/min consistently
- Timer count > 200 even after cleanup
- Memory doesn't stabilize after 1 hour

**Critical**:
- Memory grows > 5 MB/min
- Timer count > 500
- Memory > 500 MB

## Next Steps

1. Monitor memory growth over next 24 hours
2. If growth continues, lower cleanup threshold
3. If growth exceeds 1 MB/min, consider process restart or library switch
4. Document memory usage patterns for future reference
