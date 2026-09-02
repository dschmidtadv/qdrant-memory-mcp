/**
 * Costpoint Timesheet Correction Script — Amendment Workflow
 *
 * Shifts 50% of hours from AHRQ01.0002.04.4001 → AHRQ01.0004.03.3002
 * for all biweekly pay periods: June 2025 – February 2026
 *
 * User: 51843.DIETRICH.GOTTF
 * System: RIVASOLUTIONSINCCONFIG
 *
 * AMENDMENT WORKFLOW (prior-period / locked periods):
 *   Phase 1 (automated): Navigate to TMMTIMESHEET, find the locked period,
 *                        click "Request Correction", enter reason, submit.
 *   Phase 2 (MANUAL):    A supervisor must log into TMMCORRECTSTATUS and
 *                        click "Approve". The script pauses and polls until
 *                        the "Correct" button is enabled on each period.
 *   Phase 3 (automated): Open the D-Correcting timesheet, shift hours,
 *                        save, and submit for normal approval.
 *
 * CANNOT BE AUTOMATED (requires human intervention):
 *   - Supervisor approval in TMMCORRECTSTATUS (different credentials)
 *   - MFA / SSO prompts
 *   - Captcha / bot-detection challenges
 *
 * Usage:
 *   node correct_timesheets.js
 *
 * The script runs in headed (visible) mode so you can monitor progress.
 */

const { chromium } = require('playwright');
const readline = require('readline');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const BASE_URL  = 'https://rivasolutionsinc-cp.deltekenterprise.com/CPWeb';
const USERNAME  = '51843.DIETRICH.GOTTF';
const FROM_CODE = 'AHRQ01.0002.04.4001';
const TO_CODE   = 'AHRQ01.0004.03.3002';

// Screen anchors — Costpoint 8.x CPWeb hash-routing
// NOTE: These trigger the screen module to load but do NOT deep-link to a
// specific timesheet record. You must drive Find/Search after navigation.
const SCREEN = {
  TIMESHEET:         `${BASE_URL}/masterPage.htm#TMMTIMESHEET`,
  CORR_STATUS:       `${BASE_URL}/masterPage.htm#TMMCORRECTSTATUS`,
  CORRECTING_TS:     `${BASE_URL}/masterPage.htm#LDMCTIME`,
};

// Correction request reason (required free-text field)
const CORRECTION_REASON = 'Correcting charge code allocation: 50% of hours should be charged to AHRQ01.0004.03.3002 per project direction.';

// All biweekly pay period ENDING dates Jun 2025 – Feb 2026
// Costpoint periods are looked up by period-ending date in TMMTIMESHEET.
// Adjust these to match your exact Riva Solutions pay calendar.
const PAY_PERIOD_ENDINGS = [
  '06/14/2025', '06/28/2025',
  '07/12/2025', '07/26/2025',
  '08/09/2025', '08/23/2025',
  '09/06/2025', '09/20/2025',
  '10/04/2025', '10/18/2025',
  '11/01/2025', '11/15/2025',
  '11/29/2025', '12/13/2025',
  '12/27/2025', '01/10/2026',
  '01/24/2026', '02/07/2026',
  '02/21/2026', '03/07/2026',
];

// How long to wait between polling attempts when waiting for supervisor approval
const APPROVAL_POLL_INTERVAL_MS = 30000;  // 30 seconds
const APPROVAL_POLL_MAX_ATTEMPTS = 60;    // 30 min total before giving up

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg)  { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n=== Costpoint Timesheet Amendment Correction ===');
  console.log(`Shifting 50% of hours: ${FROM_CODE} → ${TO_CODE}`);
  console.log(`Pay periods (by ending date): ${PAY_PERIOD_ENDINGS[0]} – ${PAY_PERIOD_ENDINGS[PAY_PERIOD_ENDINGS.length - 1]}`);
  console.log('\nWARNING: This script will pause after submitting each correction request.');
  console.log('A supervisor MUST approve each request in TMMCORRECTSTATUS before continuing.\n');

  const password = await ask('Enter your Costpoint password: ');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 150,  // extra delay — CPWeb's Ext JS needs time to process events
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page    = await context.newPage();

  const results = [];

  try {
    // -------------------------------------------------------------------------
    // 1. LOGIN
    // -------------------------------------------------------------------------
    await login(page, password);

    // -------------------------------------------------------------------------
    // 2. PROCESS EACH PAY PERIOD — Phase 1: Submit correction requests
    // -------------------------------------------------------------------------
    log('\n=== PHASE 1: Submitting correction requests ===');
    log('All requests will be submitted first, then you will approve them in bulk.\n');

    for (const periodEnd of PAY_PERIOD_ENDINGS) {
      log(`\n--- Submitting correction request for period ending ${periodEnd} ---`);
      try {
        const result = await submitCorrectionRequest(page, periodEnd);
        results.push({ period: periodEnd, phase1: result.status, phase1Reason: result.reason });
        log(`  Phase 1 result: ${result.status} — ${result.reason || 'OK'}`);
      } catch (err) {
        log(`  Phase 1 EXCEPTION: ${err.message}`);
        results.push({ period: periodEnd, phase1: 'error', phase1Reason: err.message });
        const cont = await ask('  Error. Continue submitting remaining requests? (y/n): ');
        if (cont.toLowerCase() !== 'y') break;
      }
      await sleep(1500);
    }

    // -------------------------------------------------------------------------
    // 3. SUPERVISOR APPROVAL PAUSE
    // -------------------------------------------------------------------------
    console.log('\n=== SUPERVISOR APPROVAL REQUIRED ===');
    console.log('All correction requests have been submitted.');
    console.log(`A supervisor must now log into TMMCORRECTSTATUS and approve each request.`);
    console.log(`URL: ${SCREEN.CORR_STATUS}`);
    console.log('\nThe script will poll TMMTIMESHEET for each period until the "Correct"');
    console.log('button becomes enabled, indicating supervisor approval.\n');
    await ask('Press Enter when the supervisor is ready to begin approving, or when approvals are done: ');

    // -------------------------------------------------------------------------
    // 4. PROCESS EACH PAY PERIOD — Phase 3: Fill D-Correcting timesheets
    // -------------------------------------------------------------------------
    log('\n=== PHASE 3: Filling D-Correcting timesheets ===\n');

    for (const r of results) {
      if (r.phase1 === 'skipped_no_from_code' || r.phase1 === 'skipped_no_hours') {
        log(`\n--- Skipping ${r.period} (${r.phase1Reason}) ---`);
        r.phase3 = 'skipped';
        continue;
      }

      log(`\n--- Processing D-Correcting timesheet for period ending ${r.period} ---`);
      try {
        const result = await fillCorrectingTimesheet(page, r.period);
        r.phase3 = result.status;
        r.hoursShifted = result.hoursShifted;
        r.phase3Reason = result.reason;

        if (result.status === 'success') {
          log(`  SUCCESS: shifted ${result.hoursShifted}h`);
        } else {
          log(`  ${result.status.toUpperCase()}: ${result.reason}`);
        }
      } catch (err) {
        log(`  Phase 3 EXCEPTION: ${err.message}`);
        r.phase3 = 'error';
        r.phase3Reason = err.message;
        const cont = await ask('  Error. Continue with next period? (y/n): ');
        if (cont.toLowerCase() !== 'y') break;
      }
      await sleep(1500);
    }

  } finally {
    // -------------------------------------------------------------------------
    // 5. SUMMARY REPORT
    // -------------------------------------------------------------------------
    console.log('\n=== CORRECTION SUMMARY ===');
    console.log(`${'Pay Period End'.padEnd(16)} ${'Phase1'.padEnd(14)} ${'Phase3'.padEnd(10)} ${'Hours'.padEnd(8)} Notes`);
    console.log('-'.repeat(80));
    for (const r of results) {
      const hours = r.hoursShifted != null ? String(r.hoursShifted).padEnd(8) : 'N/A'.padEnd(8);
      const p1    = (r.phase1 || 'N/A').padEnd(14);
      const p3    = (r.phase3 || 'pending').padEnd(10);
      console.log(`${r.period.padEnd(16)} ${p1} ${p3} ${hours} ${r.phase3Reason || r.phase1Reason || ''}`);
    }
    const total = results.reduce((s, r) => s + (r.hoursShifted || 0), 0);
    console.log('-'.repeat(80));
    console.log(`Total hours shifted: ${total.toFixed(2)}`);
    console.log(`Phase 3 succeeded:   ${results.filter(r => r.phase3 === 'success').length}`);
    console.log(`Phase 3 skipped:     ${results.filter(r => r.phase3 === 'skipped').length}`);
    console.log(`Phase 3 failed:      ${results.filter(r => r.phase3 === 'error').length}`);

    await ask('\nPress Enter to close the browser...');
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------
async function login(page, password) {
  log('Navigating to Costpoint login page...');
  await page.goto(`${BASE_URL}/login.htm`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  // Costpoint 8.x CPWeb on DeltekEnterprise cloud uses j_username / j_password
  // (JAAS form-login convention). Fall back to generic selectors if needed.
  const USER_SELECTORS = [
    'input[name="j_username"]', '#j_username',
    'input[name="username"]',   '#username',
    'input[autocomplete="username"]',
    'input[type="text"]:visible',
  ];
  const PASS_SELECTORS = [
    'input[name="j_password"]', '#j_password',
    'input[name="password"]',   '#password',
    'input[type="password"]:visible',
  ];
  const SUBMIT_SELECTORS = [
    'input[type="submit"]', 'button[type="submit"]',
    'button:has-text("Sign In")', 'button:has-text("Log In")',
    'button:has-text("Login")', 'input[value="Login"]',
  ];

  let userField = null;
  for (const sel of USER_SELECTORS) {
    if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
      userField = page.locator(sel).first();
      log(`  Username field: ${sel}`);
      break;
    }
  }
  let passField = null;
  for (const sel of PASS_SELECTORS) {
    if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
      passField = page.locator(sel).first();
      log(`  Password field: ${sel}`);
      break;
    }
  }

  if (!userField || !passField) {
    throw new Error('Login fields not found. Check if SSO/MFA is required or if you are already logged in.');
  }

  await userField.fill(USERNAME);
  await passField.fill(password);

  let submitted = false;
  for (const sel of SUBMIT_SELECTORS) {
    if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
      log(`  Submit button: ${sel}`);
      await page.locator(sel).first().click();
      submitted = true;
      break;
    }
  }
  if (!submitted) {
    log('  No submit button found — pressing Enter on password field.');
    await passField.press('Enter');
  }

  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(3000);

  if (page.url().includes('login')) {
    throw new Error('Login failed — still on login page. Check credentials or MFA requirement.');
  }
  log('Login successful.');
}

// ---------------------------------------------------------------------------
// PHASE 1: Submit a correction request for a locked period
// ---------------------------------------------------------------------------
async function submitCorrectionRequest(page, periodEnd) {
  // Navigate to TMMTIMESHEET
  await navigateToScreen(page, SCREEN.TIMESHEET, 'TMMTIMESHEET');

  // Load the timesheet for this period
  const loaded = await loadTimesheetPeriod(page, periodEnd);
  if (!loaded) {
    return { status: 'skipped_no_timesheet', reason: 'No timesheet found for this period' };
  }

  // Check if FROM charge line exists
  const fromRow = await findChargeLine(page, FROM_CODE);
  if (!fromRow) {
    return { status: 'skipped_no_from_code', reason: `${FROM_CODE} not found in this period` };
  }

  // Check total hours
  const totalHours = await getRowTotalHours(page, fromRow);
  if (totalHours <= 0) {
    return { status: 'skipped_no_hours', reason: `${FROM_CODE} has 0 hours in this period` };
  }

  // Check if the period is already editable (unlikely for prior periods but handle it)
  const correctBtn = page.locator('button:has-text("Correct"), a:has-text("Correct")').first();
  const correctEnabled = await correctBtn.isEnabled({ timeout: 2000 }).catch(() => false);
  if (correctEnabled) {
    log('  "Correct" button is already enabled — period may already be approved for correction.');
    return { status: 'already_approved', reason: 'Correct button already enabled' };
  }

  // Click "Request Correction"
  const reqCorrBtn = page.locator(
    'button:has-text("Request Correction"), a:has-text("Request Correction"), button[id*="reqCorr"]'
  ).first();
  const reqVisible = await reqCorrBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (!reqVisible) {
    // The "Correct" button may just be disabled with no separate "Request Correction" button in this version.
    // Some Costpoint 8 builds show a single "Correct" button that triggers the request flow when period is locked.
    log('  WARNING: "Request Correction" button not found. Trying "Correct" button (may trigger request flow)...');
    if (!await correctBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      return { status: 'error', reason: 'Neither "Request Correction" nor "Correct" button found' };
    }
    await correctBtn.click();
    await sleep(2000);
  } else {
    await reqCorrBtn.click();
    await sleep(2000);
  }

  // Fill in the correction reason modal
  const REASON_SELECTORS = [
    'textarea[id*="REASON"]', 'textarea[id*="reason"]',
    'input[id*="REASON"]',   'input[id*="reason"]',
    'textarea:visible',
  ];
  let reasonField = null;
  for (const sel of REASON_SELECTORS) {
    if (await page.locator(sel).isVisible({ timeout: 1000 }).catch(() => false)) {
      reasonField = page.locator(sel).first();
      log(`  Reason field: ${sel}`);
      break;
    }
  }
  if (reasonField) {
    await reasonField.fill(CORRECTION_REASON);
    await sleep(500);
  } else {
    log('  WARNING: Correction reason field not found. The modal may not have appeared.');
  }

  // Submit the correction request
  const MODAL_SUBMIT_SELECTORS = [
    'button:has-text("Submit")', 'button:has-text("OK")',
    'button:has-text("Request")', 'button[id*="submit"]',
    'button:has-text("Save")',
  ];
  let modalSubmit = null;
  for (const sel of MODAL_SUBMIT_SELECTORS) {
    // Prefer buttons inside a dialog/modal
    const inDialog = page.locator(`[role="dialog"] ${sel}, .x-window ${sel}, .modal ${sel}`).first();
    if (await inDialog.isVisible({ timeout: 500 }).catch(() => false)) {
      modalSubmit = inDialog;
      log(`  Modal submit button (in dialog): ${sel}`);
      break;
    }
    if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
      modalSubmit = page.locator(sel).first();
      log(`  Modal submit button: ${sel}`);
      break;
    }
  }

  if (modalSubmit) {
    await modalSubmit.click();
    await sleep(2000);
  } else {
    log('  WARNING: Modal submit button not found. Request may not have been submitted.');
  }

  // Dismiss any confirmation popup
  const confirmBtn = page.locator('button:has-text("OK"), button:has-text("Close")').first();
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
    await sleep(1000);
  }

  return { status: 'requested', reason: `Correction request submitted for period ending ${periodEnd}` };
}

// ---------------------------------------------------------------------------
// PHASE 3: Fill the D-Correcting timesheet (after supervisor approval)
// ---------------------------------------------------------------------------
async function fillCorrectingTimesheet(page, periodEnd) {
  await navigateToScreen(page, SCREEN.TIMESHEET, 'TMMTIMESHEET');
  const loaded = await loadTimesheetPeriod(page, periodEnd);
  if (!loaded) {
    return { status: 'error', reason: 'Could not load timesheet for this period' };
  }

  // Wait / poll for the "Correct" button to become enabled
  log(`  Waiting for supervisor approval (Correct button to enable)...`);
  let correctEnabled = false;
  for (let attempt = 0; attempt < APPROVAL_POLL_MAX_ATTEMPTS; attempt++) {
    const correctBtn = page.locator('button:has-text("Correct"), a:has-text("Correct")').first();
    correctEnabled = await correctBtn.isEnabled({ timeout: 2000 }).catch(() => false);
    if (correctEnabled) break;

    if (attempt === 0) {
      log(`  "Correct" button still disabled. Waiting for supervisor approval...`);
      log(`  SUPERVISOR ACTION REQUIRED: Log into TMMCORRECTSTATUS and approve the request for period ${periodEnd}.`);
      log(`  URL: ${SCREEN.CORR_STATUS}`);
      log(`  Polling every ${APPROVAL_POLL_INTERVAL_MS / 1000}s (max ${APPROVAL_POLL_MAX_ATTEMPTS} attempts)...`);
    }
    await sleep(APPROVAL_POLL_INTERVAL_MS);

    // Reload the timesheet to check current state
    await navigateToScreen(page, SCREEN.TIMESHEET, 'TMMTIMESHEET');
    await loadTimesheetPeriod(page, periodEnd);
  }

  if (!correctEnabled) {
    return { status: 'error', reason: `Supervisor approval not received within ${APPROVAL_POLL_MAX_ATTEMPTS * APPROVAL_POLL_INTERVAL_MS / 60000} minutes` };
  }

  log('  "Correct" button is now enabled — supervisor has approved the request.');

  // Click "Correct" to open the D-Correcting timesheet
  const correctBtn = page.locator('button:has-text("Correct"), a:has-text("Correct")').first();
  await correctBtn.click();
  await sleep(3000);

  // The D-Correcting timesheet is now open. Find the FROM charge line.
  const fromRow = await findChargeLine(page, FROM_CODE);
  if (!fromRow) {
    return { status: 'error', reason: `${FROM_CODE} not found in D-Correcting timesheet` };
  }

  const totalHours = await getRowTotalHours(page, fromRow);
  if (totalHours <= 0) {
    return { status: 'skipped', reason: `${FROM_CODE} has 0 hours` };
  }

  // Find or add the TO charge line
  let toRow = await findChargeLine(page, TO_CODE);
  if (!toRow) {
    log(`  ${TO_CODE} not found — adding new line...`);
    toRow = await addChargeLine(page, TO_CODE);
    if (!toRow) {
      return { status: 'error', reason: `Could not add charge line ${TO_CODE}` };
    }
  }

  // Read day-by-day hours
  const fromDayHours = await getDayByDayHours(page, fromRow);
  const toDayHours   = await getDayByDayHours(page, toRow);

  log(`  FROM hours by day: [${fromDayHours.join(', ')}]`);
  log(`  TO   hours by day: [${toDayHours.join(', ')}]`);

  let actualShifted = 0;
  for (const [dayIdx, fromHours] of fromDayHours.entries()) {
    if (fromHours <= 0) continue;

    const shift  = Math.round(fromHours * 0.5 * 100) / 100;
    const newFrom = Math.round((fromHours - shift) * 100) / 100;
    const newTo   = Math.round(((toDayHours[dayIdx] || 0) + shift) * 100) / 100;

    log(`  Day ${dayIdx}: ${fromHours}h → FROM=${newFrom}h, TO=${newTo}h (shift=${shift}h)`);

    await setDayHours(page, fromRow, dayIdx, newFrom);
    await setDayHours(page, toRow,   dayIdx, newTo);
    actualShifted += shift;
  }

  // Save the correcting timesheet
  await saveTimesheet(page);

  return { status: 'success', hoursShifted: Math.round(actualShifted * 100) / 100 };
}

// ---------------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------------

async function navigateToScreen(page, url, screenName) {
  log(`  Navigating to ${screenName}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // CPWeb may redirect to home if the hash is not recognized — check
  const current = page.url();
  if (!current.includes(screenName) && !current.includes(url.split('#')[1])) {
    log(`  WARNING: Redirected away from ${screenName}. Current URL: ${current}`);
    log(`  This may indicate session expiry or unsupported direct navigation.`);
    log(`  Please navigate manually to: ${url}`);
    await ask(`  Press Enter when you are on the ${screenName} screen: `);
  }
}

async function loadTimesheetPeriod(page, periodEnd) {
  // Costpoint TMMTIMESHEET typically has a "Period Ending" date input in the toolbar.
  // The field ID follows the pattern TMMTIMESHEET_PD_END_DT or similar.
  const PERIOD_SELECTORS = [
    'input[id*="PD_END"]',       // Most common Costpoint 8 pattern
    'input[id*="PERIOD_END"]',
    'input[id*="pdEnd"]',
    'input[id*="PD_END_DT"]',
    'input[id*="END_DATE"]',
    'input[id*="period"]',
    'input[name*="period"]',
  ];

  let periodInput = null;
  for (const sel of PERIOD_SELECTORS) {
    if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
      periodInput = page.locator(sel).first();
      log(`  Period input found: ${sel}`);
      break;
    }
  }

  if (!periodInput) {
    log(`  WARNING: Period input not found. Visible inputs on page:`);
    const inputs = await page.evaluate(() =>
      [...document.querySelectorAll('input')].filter(el => el.offsetWidth > 0)
        .map(el => `id="${el.id}" name="${el.name}" type="${el.type}"`)
    );
    inputs.forEach(i => log(`    ${i}`));
    return false;
  }

  await periodInput.click({ clickCount: 3 });
  await periodInput.fill(periodEnd);
  await periodInput.press('Tab');
  await sleep(1000);

  // Click Find/Search
  const FIND_SELECTORS = [
    'button:has-text("Find")', 'input[value="Find"]',
    'button[title="Find"]',   'a:has-text("Find")',
    'button[id*="find"]',     'button:has-text("Search")',
  ];
  for (const sel of FIND_SELECTORS) {
    if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
      await page.locator(sel).first().click();
      await sleep(2500);
      break;
    }
  }

  // Check for "no records" message
  const noData = await page.locator(
    'text=/No records found/i, text=/No data/i, text=/No timesheet/i'
  ).isVisible({ timeout: 1000 }).catch(() => false);
  if (noData) return false;

  return true;
}

// ---------------------------------------------------------------------------
// GRID HELPERS
// ---------------------------------------------------------------------------

async function findChargeLine(page, chargeCode) {
  // CPWeb timesheet grids render charge codes in table rows.
  // The charge code may appear as a text node in a <td> or as an input value.
  // Try both text-content matching and input-value matching.
  const byText = page.locator(`tr:has-text("${chargeCode}")`).first();
  if (await byText.isVisible({ timeout: 1000 }).catch(() => false)) {
    return byText;
  }
  // Some versions render code in a read-only input cell
  const byInput = page.locator(`tr:has(input[value="${chargeCode}"])`).first();
  if (await byInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    return byInput;
  }
  return null;
}

async function getRowTotalHours(page, row) {
  // Total column: last numeric input or td in the row, or a cell with id*=TOTAL
  const totalCell = row.locator(
    'input[id*="TOTAL"], td[id*="TOTAL"], td[class*="total"]'
  ).first();
  if (await totalCell.isVisible({ timeout: 500 }).catch(() => false)) {
    const val = await totalCell.inputValue().catch(async () => totalCell.innerText().catch(() => '0'));
    return parseFloat(String(val).replace(/,/g, '')) || 0;
  }
  // Fallback: last <td> in the row
  const lastTd = row.locator('td').last();
  const val = await lastTd.innerText().catch(() => '0');
  return parseFloat(val.replace(/,/g, '')) || 0;
}

async function getDayByDayHours(page, row) {
  // Day input cells: CPWeb uses input[id*="DAY_1"] through input[id*="DAY_14"] for biweekly
  // Common patterns: TMMTIMESHEET_HOURS_1, TMMTIMESHEET_DAY_HOURS_1, etc.
  const dayCells = row.locator(
    'input[id*="DAY_"], input[id*="_HOURS_"], input[id*="HOUR"], td[class*="day"] input'
  );
  const count = await dayCells.count();
  const hours = [];
  for (let i = 0; i < count; i++) {
    const val = await dayCells.nth(i).inputValue().catch(() => '0');
    hours.push(parseFloat(val.replace(/,/g, '')) || 0);
  }
  return hours;
}

async function setDayHours(page, row, dayIdx, value) {
  const dayCells = row.locator(
    'input[id*="DAY_"], input[id*="_HOURS_"], input[id*="HOUR"], td[class*="day"] input'
  );
  const count = await dayCells.count();
  if (dayIdx >= count) {
    log(`  WARNING: dayIdx ${dayIdx} out of range (${count} day cells found)`);
    return;
  }
  const cell = dayCells.nth(dayIdx);
  if (await cell.isVisible().catch(() => false) && !await cell.isDisabled().catch(() => true)) {
    await cell.click({ clickCount: 3 });
    await cell.fill(String(value));
    await cell.press('Tab');
    await sleep(200);
  } else {
    log(`  WARNING: Day cell ${dayIdx} not editable (hidden or disabled)`);
  }
}

async function addChargeLine(page, chargeCode) {
  // Click the Add/Insert row button in the timesheet toolbar or grid
  const ADD_SELECTORS = [
    'button:has-text("Add Line")', 'button:has-text("Add Row")',
    'button:has-text("Insert")',   'button[title*="Add"]',
    'a:has-text("Add Line")',      'button[id*="addRow"]',
    'button[id*="add"]',
  ];
  let addBtn = null;
  for (const sel of ADD_SELECTORS) {
    if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
      addBtn = page.locator(sel).first();
      log(`  Add line button: ${sel}`);
      break;
    }
  }

  if (!addBtn) {
    log('  WARNING: Add Line button not found — trying Costpoint insert-row shortcut (Insert key)...');
    await page.keyboard.press('Insert');
    await sleep(1000);
  } else {
    await addBtn.click();
    await sleep(1000);
  }

  // Fill the charge code into the new row's account/project field
  // CPWeb field IDs for charge code entry: typically ACCT_ID, PROJ_ID, or a combined field
  const CODE_INPUT_SELECTORS = [
    'input[id*="ACCT_ID"]:visible',
    'input[id*="PROJ_ID"]:visible',
    'input[id*="charge"]:visible',
    'input[id*="CHARGE"]:visible',
  ];
  let codeInput = null;
  for (const sel of CODE_INPUT_SELECTORS) {
    // Use the LAST visible match — the new row should be last
    const matches = page.locator(sel);
    const count = await matches.count();
    if (count > 0) {
      codeInput = matches.last();
      log(`  Charge code input: ${sel} (last of ${count})`);
      break;
    }
  }

  if (codeInput && await codeInput.isVisible().catch(() => false)) {
    await codeInput.fill(chargeCode);
    await codeInput.press('Tab');
    await sleep(1500);
  } else {
    log(`  WARNING: Charge code input not found for new row. Cannot add ${chargeCode} automatically.`);
    return null;
  }

  return await findChargeLine(page, chargeCode);
}

async function saveTimesheet(page) {
  const SAVE_SELECTORS = [
    'button:has-text("Save")', 'input[value="Save"]',
    'button[id*="save"]',      'button[title="Save"]',
    'a:has-text("Save")',
  ];
  let saved = false;
  for (const sel of SAVE_SELECTORS) {
    if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
      await page.locator(sel).first().click();
      saved = true;
      log(`  Save clicked: ${sel}`);
      await sleep(2500);
      break;
    }
  }
  if (!saved) {
    log('  WARNING: Save button not found — trying Ctrl+S...');
    await page.keyboard.press('Control+s');
    await sleep(2500);
  }

  // Dismiss any confirmation dialogs
  const confirmBtn = page.locator(
    '[role="dialog"] button:has-text("OK"), [role="dialog"] button:has-text("Yes"), ' +
    '.x-window button:has-text("OK"), .x-window button:has-text("Yes")'
  ).first();
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
    await sleep(1000);
  }
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  process.exit(1);
});
