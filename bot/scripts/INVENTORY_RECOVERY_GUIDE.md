# Inventory Recovery & Backup Guide

## Overview

Since moving away from Google Sheets, we now rely on **InventoryLog** (transaction history) and **snapshots** for inventory recovery. This guide explains how to recover inventory if the bot bugs out and deletes quantities (like the bird eggs incident).

## How It Works

### 1. InventoryLog (Transaction History)
- **What it is**: Every inventory addition and removal is logged to `InventoryLog`
- **Like Google Sheets**: Just like you could check the sheet to see "Beck had 16 bird eggs", you can now reconstruct inventory from logs
- **Location**: MongoDB `InventoryLog` collection
- **Contains**: Item name, quantity (positive for additions, negative for removals), date, character, source (obtain method)

### 2. Snapshots (Point-in-Time Backups)
- **What it is**: Periodic snapshots of current inventory state
- **Purpose**: Faster recovery without processing all logs
- **Location**: MongoDB `inventory_snapshots` collection
- **Recommended**: Run daily snapshots (can be automated)

## Recovery Tools

### 1. Recover Specific Character Inventory
**Script**: `bot/scripts/recoverInventory.js`

Reconstructs a character's inventory from InventoryLog and can restore it.

```bash
# Check what's wrong (dry run)
node bot/scripts/recoverInventory.js "Beck" --dry-run

# Restore inventory to current state (from logs)
node bot/scripts/recoverInventory.js "Beck"

# Restore inventory to a specific date
node bot/scripts/recoverInventory.js "Beck" --before-date "2024-01-15T00:00:00Z"
```

**What it does**:
1. Reconstructs expected inventory by summing all InventoryLog transactions
2. Compares with current database inventory
3. Shows discrepancies (like "bird eggs: current 0, expected 16")
4. Optionally restores inventory to match logs

### 2. Verify All Inventories
**Script**: `bot/scripts/verifyInventoryIntegrity.js`

Checks all characters for inventory discrepancies (like the bird eggs bug).

```bash
# Check all characters
node bot/scripts/verifyInventoryIntegrity.js

# Check specific character
node bot/scripts/verifyInventoryIntegrity.js --character-name "Beck"

# Auto-fix all discrepancies (dry run first!)
node bot/scripts/verifyInventoryIntegrity.js --fix --dry-run
node bot/scripts/verifyInventoryIntegrity.js --fix
```

**What it does**:
1. Verifies every character's inventory against their logs
2. Reports any discrepancies
3. Can automatically fix all issues

### 3. Create Snapshots
**Script**: `bot/scripts/createInventorySnapshot.js`

Creates point-in-time backups of inventory.

```bash
# Snapshot one character
node bot/scripts/createInventorySnapshot.js "Beck"

# Snapshot all characters
node bot/scripts/createInventorySnapshot.js --auto

# List snapshots for a character
node bot/scripts/createInventorySnapshot.js "Beck" --list

# Get a specific snapshot
node bot/scripts/createInventorySnapshot.js "Beck" --get "2024-01-15T00:00:00Z"
```

**Recommended**: Set up a daily cron job or scheduled task to run `--auto`

## Recovery Scenarios

### Scenario 1: Bot Bug Deletes Items (Like Bird Eggs)
**Problem**: Bot bug causes items to disappear (e.g., "Beck had 16 bird eggs, now has 0")

**Solution**:
```bash
# 1. Verify the issue
node bot/scripts/recoverInventory.js "Beck" --dry-run

# 2. Restore from logs
node bot/scripts/recoverInventory.js "Beck"
```

This reconstructs inventory from all InventoryLog entries, finds the discrepancy, and restores the correct quantity.

### Scenario 2: Multiple Characters Affected
**Problem**: Bug affects multiple characters

**Solution**:
```bash
# 1. Check all characters
node bot/scripts/verifyInventoryIntegrity.js

# 2. Fix all automatically
node bot/scripts/verifyInventoryIntegrity.js --fix
```

### Scenario 3: Need to Restore to Specific Date
**Problem**: Need to restore inventory to how it was before a specific date

**Solution**:
```bash
# Restore to date before the bug
node bot/scripts/recoverInventory.js "Beck" --before-date "2024-01-15T00:00:00Z"
```

### Scenario 4: No Logs Available
**Problem**: InventoryLog is missing or corrupted

**Solution**: Use snapshots if available:
1. List snapshots: `node bot/scripts/createInventorySnapshot.js "Beck" --list`
2. Restore from snapshot (manual process - snapshot contains full inventory state)

## Best Practices

### 1. Regular Snapshots
Set up automated daily snapshots:
```bash
# Add to cron (runs daily at 2 AM)
0 2 * * * cd /path/to/project && node bot/scripts/createInventorySnapshot.js --auto
```

### 2. Regular Verification
Run weekly verification to catch issues early:
```bash
# Weekly check
node bot/scripts/verifyInventoryIntegrity.js
```

### 3. Database Backups
- **MongoDB Atlas**: Automatic backups (if using Atlas)
- **Railway**: Set up database backups in Railway dashboard
- **Manual**: Use `mongodump` to backup databases regularly

### 4. Before Major Changes
Create snapshots before:
- Deploying bot updates
- Running migration scripts
- Making bulk inventory changes

## Database Backups

### MongoDB Atlas
- Automatic daily backups (if using Atlas)
- Point-in-time recovery available
- Retention: 2-7 days (depending on plan)

### Railway MongoDB
- Check Railway dashboard for backup options
- Consider exporting data regularly

### Manual Backup
```bash
# Backup inventories database
mongodump --uri="mongodb://..." --db=inventories --out=./backups/inventories-$(date +%Y%m%d)

# Backup tinglebot database (contains InventoryLog)
mongodump --uri="mongodb://..." --db=tinglebot --out=./backups/tinglebot-$(date +%Y%m%d)
```

## How InventoryLog Works

Every inventory change creates a log entry:
- **Additions**: Positive quantity (e.g., `+5` bird eggs)
- **Removals**: Negative quantity (e.g., `-3` bird eggs)

To reconstruct inventory:
1. Start with 0 for each item
2. Sum all log entries chronologically
3. Final quantity = sum of all transactions

Example:
```
Log entries for "bird eggs":
- 2024-01-01: +10 (gathered)
- 2024-01-05: +6 (gathered)
- 2024-01-10: -3 (used in crafting)
- 2024-01-15: -2 (traded)

Reconstructed quantity: 10 + 6 - 3 - 2 = 11 bird eggs
```

If current inventory shows 0 but logs show 11, there's a bug - use recovery tools to fix it.

## Troubleshooting

### "No logs found for character"
- Character might be new or never had inventory changes
- Check if character name is correct (case-sensitive matching)

### "Discrepancies found but restoration failed"
- Check database connection
- Verify character exists
- Check logs for specific error messages

### "Snapshot not found"
- Snapshots might not have been created yet
- Use InventoryLog recovery instead
- Check snapshot date is correct

## Summary

**You now have better recovery than Google Sheets:**
- ✅ **InventoryLog**: Complete transaction history (like Google Sheets)
- ✅ **Snapshots**: Point-in-time backups
- ✅ **Recovery Tools**: Automated restoration
- ✅ **Verification**: Proactive issue detection

**If the bot bugs out:**
1. Run `verifyInventoryIntegrity.js` to find issues
2. Run `recoverInventory.js` to fix specific character
3. Or use `verifyInventoryIntegrity.js --fix` to fix all

**This is actually better than Google Sheets** because:
- Automated recovery (no manual spreadsheet checking)
- Can restore to any point in time
- Can verify all characters at once
- Can catch issues before users report them
