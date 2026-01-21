# Future Plans

This document tracks features and functionality that have been temporarily removed or are planned for future implementation.

## Expiration Handler / Request Expiration Notifications

**Status:** Temporarily removed  
**Date Removed:** 2024  
**Reason:** Made the code too complicated, needs simplification before reimplementation

### What It Did

The expiration handler system would:
- Check for expired TempData entries (healing, vending, boosting, battle, encounter, blight, travel, gather, delivery requests)
- Send DM notifications to users when their requests expired after 48 hours
- Delete expired entries (this part was redundant since MongoDB TTL index already handles deletion)

### Why It Was Removed

The feature made the codebase more complicated with:
- Timer management complexity
- Cron job scheduling overhead
- Duplicate cleanup logic (TTL index already handles deletion)
- Additional error handling paths

### Planned Reimplementation

When reimplementing, consider:

1. **Simplification**: Only handle user notifications, not deletion (MongoDB TTL handles that)
2. **Better Scheduling**: Use existing croner infrastructure more effectively
3. **Cleaner Architecture**: Separate notification logic from cleanup logic
4. **Testing**: Add proper tests for expiration notification edge cases

### Related Files

- `shared/utils/expirationHandler.js` - Main handler file (kept for reference)
- `bot/index.js` - Previously called `startExpirationChecks()` and `stopExpirationChecks()`
- `bot/scheduler.js` - Previously called `checkExpiredRequests()` in scheduled cleanup
- `dashboard/scheduler.js` - Previously called `checkExpiredRequests()` in scheduled cleanup
- `shared/models/TempDataModel.js` - Has TTL index that automatically deletes expired entries

### Notes

- MongoDB TTL index at line 171 of `TempDataModel.js` already handles automatic deletion of expired entries
- The notification functionality is the only part that would be useful to reimplement
- Current expiration types: healing, vending, boosting, battle, encounter, blight, travel, gather, delivery
