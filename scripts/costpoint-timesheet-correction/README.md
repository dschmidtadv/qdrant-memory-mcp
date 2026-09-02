# Costpoint Timesheet Correction

Shifts 50% of hours from `AHRQ01.0002.04.4001` → `AHRQ01.0004.03.3002`
across all biweekly pay periods June 2025 – February 2026.

## Prerequisites

Node.js 18+ and Playwright (already installed globally).

## Run

```bash
cd scripts/costpoint-timesheet-correction
node correct_timesheets.js
```

The script will:
1. Prompt for your Costpoint password (not stored anywhere)
2. Open a visible Chrome window so you can watch and intervene
3. Log in as `51843.DIETRICH.GOTTF`
4. Work through each pay period, reading current hours and rebalancing
5. Print a summary table at the end

## What it does per pay period

- Finds the `AHRQ01.0002.04.4001` charge line
- Reads the hours for each day in the pay period
- Splits each day's hours 50/50
- Updates `AHRQ01.0002.04.4001` to 50% of original
- Adds (or updates) `AHRQ01.0004.03.3002` with the other 50%
- Saves the timesheet

## If a period fails

The script pauses and asks whether to continue. It never silently skips
a period that had hours — it either succeeds or reports an error.

## Important notes

- **Run in a test period first** if you want to verify the behavior before
  applying to all 20 periods.
- Costpoint may require a "Timesheet Amendment" workflow for locked periods.
  If the Save button is disabled, the script will warn you and stop that period.
- The script runs in headed (visible) mode — do not close the browser window
  while it is running.
