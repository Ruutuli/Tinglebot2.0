# Village Raid Quotas, Level 2 Period, Day-of-Week Chance, and Posting Logic

## Current behavior

- **Quotas** ([randomMonsterEncounters.js](bot/scripts/randomMonsterEncounters.js) `getVillageQuota`): level 1 → 1/week, level 2 → 2/month, level 3 → 1/month.
- **Periods**: level 1 uses week (Sunday–Saturday EST); level 2 and 3 both use month.
- **Selection**: checkVillageRaidQuotas runs hourly; for each village it checks period, eligibility, then time-based probability; eligible villages are pooled and one is chosen at random.
- **Day-of-week**: Not used.

---

## 1. Increase quotas and fix level 2 period

- **Quotas**: Level 1 → **3**/week, Level 2 → **3**/biweek, Level 3 → **3**/month.
- **Level 2 = biweekly**: Add `getCurrentBiweekStart()`, extend `getVillagePeriodStart`/`getPeriodEnd` for level 2, add `'biweek'` to VillageModel `raidQuotaPeriodType` enum, and use `'biweek'` everywhere for level 2 (checkAndResetPeriod, setVillagePeriodData, tryReserveQuotaSlot, resetAllVillageRaidQuotas).

---

## 2. Day-based raid chance (EST) — per level

**Level 1 and 2: day-of-week**

- 10% Sunday, 20% Monday, …, 100% Saturday (EST).
- `dayChance = (weekday + 1) * 0.1` with weekday 0 = Sunday … 6 = Saturday.

**Level 3: day-of-month**

- First day of the month = 1% chance; last day of the month = 100% chance; linear progression in between (EST).
- Formula: get current date in EST → dayOfMonth (1-based), lastDay = days in that month (28–31).  
  `dayChance = 0.01 + 0.99 * (dayOfMonth - 1) / (lastDay - 1)` (so day 1 → 1%, last day → 100%).

**Implementation**

- Apply **per village** when building the eligible list in `checkVillageRaidQuotas`: after a village passes period + eligibility + time-based probability, compute day chance by level (week for 1/2, month for 3), roll once; only add to `eligibleVillages` if `Math.random() < dayChance`.
- Helpers: e.g. `getDayOfWeekRaidChance()` (EST weekday → 0.1–1.0), `getDayOfMonthRaidChance()` (EST date → 0.01–1.0 using day-of-month and last day of month).

**File**: [bot/scripts/randomMonsterEncounters.js](bot/scripts/randomMonsterEncounters.js) — inside the village loop in `checkVillageRaidQuotas`, plus small helper functions.

---

## 3. Posting logic improved

- **Order**: (1) Per-village: period, eligibility, time-based probability, then **level-specific day chance** (week for L1/L2, month for L3); (2) build eligible list; (3) random selection among eligible villages; (4) double-check and triggerQuotaBasedRaid.
- Optional: comment block at top of `checkVillageRaidQuotas` describing this flow.

---

## 4. Biweek reset rules

- checkAndResetPeriod: level 2 uses `periodType = 'biweek'`, reset when stored period is from a previous biweek (e.g. ≥14 days ago).
- resetAllVillageRaidQuotas / tryReserveQuotaSlot: level 2 uses `getCurrentBiweekStart()` and `'biweek'`.

---

## Summary

| Area | Change |
|------|--------|
| Quotas | L1: 3/week, L2: 3/biweek, L3: 3/month |
| Period | L2 biweekly: getCurrentBiweekStart, getPeriodEnd(L2), enum 'biweek' |
| Day chance | L1/L2: day-of-week EST (10% Sun … 100% Sat). L3: day-of-month EST (1% first day … 100% last day). Applied per village when building eligible list. |
