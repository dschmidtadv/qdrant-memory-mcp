/**
 * Costpoint Timesheet Correction — DRY RUN (single period, read-only)
 *
 * Logs in, navigates to TMMTIMESHEET, loads one pay period, and reports:
 *   - Whether the FROM charge line exists and how many hours it has
 *   - Whether the period is locked (needs Request Correction workflow)
 *   - All input field IDs found on screen (for selector confirmation)
 *   - 4 screenshots for visual verification
 *
 * NOTHING IS SAVED. Use this to confirm selectors before the full run.
 *
 * Usage:
 *   node dry_run.js [PERIOD_END_DATE]
 *   node dry_run.js 06/14/2025      ← specific period-ENDING date
 *   node dry_run.js                 ← defaults to 06/14/2025
 *
 * Note: Costpoint TMMTIMESHEET searches by period-ENDING date, not start date.
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
const HOME_URL  = `${BASE_URL}/masterPage.htm#A0`;
const TIMSH_URL = `${BASE_URL}/masterPage.htm#TMMTIMESHEET`;

// Default to the ending date of the first pay period (Jun 1–14, 2025)
const DRY_RUN_PERIOD_END = process.argv[2] || '06/14/2025';

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a); }));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = msg => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n=== COSTPOINT DRY RUN (read-only) ===');
  console.log(`Period end: ${DRY_RUN_PERIOD_END}`);
  console.log(`FROM code:  ${FROM_CODE}`);
  console.log(`TO code:    ${TO_CODE}`);
  console.log('Nothing will be saved.\n');

  const password = await ask('Costpoint password: ');

  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Capture CPWeb network requests — helps identify API call patterns
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('CPWeb')) requests.push(`${req.method()} ${req.url()}`);
  });

  try {
    // ------------------------------------------------------------------
    // STEP 1: LOGIN
    // ------------------------------------------------------------------
    log('Step 1: Login...');
    await page.goto(`${BASE_URL}/login.htm`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(() => page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }));
    await sleep(2000);

    // Log every input on the login page for selector discovery
    const loginInputs = await page.evaluate(() =>
      [...document.querySelectorAll('input')].map(el => ({
        id: el.id, name: el.name, type: el.type, placeholder: el.placeholder,
      }))
    );
    log(`  Login page inputs: ${JSON.stringify(loginInputs)}`);

    // Try selectors in priority order
    const tryFill = async (selectors, value) => {
      for (const sel of selectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 600 }).catch(() => false)) {
          await el.fill(value);
          log(`  Filled "${sel}" with value`);
          return sel;
        }
      }
      return null;
    };

    const userSel = await tryFill(
      ['input[name="j_username"]', '#j_username', '#username', 'input[name="username"]',
       'input[autocomplete="username"]', 'input[type="text"]:visible'],
      USERNAME
    );
    const passSel = await tryFill(
      ['input[name="j_password"]', '#j_password', '#password', 'input[name="password"]',
       'input[type="password"]:visible'],
      password
    );

    if (!userSel || !passSel) {
      log('  Could not find login fields — may already be logged in or SSO required.');
      log('  Trying direct navigation to home...');
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } else {
      // Submit
      const submitSels = [
        'input[type="submit"]', 'button[type="submit"]',
        'button:has-text("Sign In")', 'button:has-text("Log In")', 'button:has-text("Login")',
      ];
      let submitted = false;
      for (const sel of submitSels) {
        if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
          await page.locator(sel).first().click();
          submitted = true;
          log(`  Clicked submit: ${sel}`);
          break;
        }
      }
      if (!submitted) {
        await page.keyboard.press('Enter');
        log('  Pressed Enter to submit');
      }
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await sleep(3000);
    }

    if (page.url().includes('login')) throw new Error('Still on login page — check credentials or SSO/MFA');
    log(`  Login OK. URL: ${page.url()}`);
    await page.screenshot({ path: 'screenshot_01_home.png' });
    log('  Saved: screenshot_01_home.png');

    // ------------------------------------------------------------------
    // STEP 2: Navigate to TMMTIMESHEET
    // ------------------------------------------------------------------
    log('\nStep 2: Navigate to TMMTIMESHEET...');
    await page.goto(TIMSH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    log(`  URL after nav: ${page.url()}`);

    // Dump visible text
    const screenText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    log(`  Screen text (first 30 lines):\n${screenText.split('\n').slice(0, 30).map(l => '    ' + l).join('\n')}`);

    // Dump ALL inputs for selector discovery
    const allInputs = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')].map(el => ({
        tag: el.tagName, id: el.id, name: el.name, type: el.type || '',
        placeholder: el.placeholder || '', value: (el.value || '').slice(0, 40),
        visible: el.offsetWidth > 0 && el.offsetHeight > 0,
      }))
    );
    log(`  ALL inputs on TMMTIMESHEET (${allInputs.length} total, showing visible):`);
    allInputs.filter(i => i.visible).forEach(i =>
      log(`    <${i.tag}> id="${i.id}" name="${i.name}" type="${i.type}" placeholder="${i.placeholder}" value="${i.value}"`)
    );

    await page.screenshot({ path: 'screenshot_02_tmmtimesheet.png' });
    log('  Saved: screenshot_02_tmmtimesheet.png');

    // ------------------------------------------------------------------
    // STEP 3: Enter period-ending date and Find
    // ------------------------------------------------------------------
    log(`\nStep 3: Setting period end date to ${DRY_RUN_PERIOD_END}...`);

    const periodSels = [
      'input[id*="PD_END"]', 'input[id*="PERIOD_END"]', 'input[id*="pdEnd"]',
      'input[id*="PD_BEGIN"]', 'input[id*="period"]', 'input[id*="Period"]',
      'input[id*="BEGIN_DATE"]', 'input[id*="END_DATE"]',
    ];
    let periodFilled = false;
    for (const sel of periodSels) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        await el.click({ clickCount: 3 });
        await el.fill(DRY_RUN_PERIOD_END);
        await el.press('Tab');
        await sleep(800);
        log(`  Period input found and filled: ${sel}`);
        periodFilled = true;
        break;
      }
    }
    if (!periodFilled) log('  WARNING: Period input not found — see input dump above for correct selector');

    // Click Find
    const findSels = [
      'button:has-text("Find")', 'input[value="Find"]',
      'button[id*="find"]', 'a:has-text("Find")', 'button:has-text("Search")',
    ];
    for (const sel of findSels) {
      if (await page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)) {
        await page.locator(sel).first().click();
        await sleep(2500);
        log(`  Clicked Find: ${sel}`);
        break;
      }
    }

    await page.screenshot({ path: 'screenshot_03_period_loaded.png' });
    log('  Saved: screenshot_03_period_loaded.png');

    // ------------------------------------------------------------------
    // STEP 4: Inspect the timesheet — look for charge lines and lock state
    // ------------------------------------------------------------------
    log('\nStep 4: Inspecting timesheet...');

    const bodyText = await page.evaluate(() => document.body.innerText);
    log(`  FROM code (${FROM_CODE}) on page: ${bodyText.includes(FROM_CODE)}`);
    log(`  TO code  (${TO_CODE}) on page:    ${bodyText.includes(TO_CODE)}`);

    // Check lock state
    const lockSels = {
      'Request Correction button':  'button:has-text("Request Correction"), a:has-text("Request Correction")',
      'Correct button':             'button:has-text("Correct"), a:has-text("Correct")',
      'Save button':                'button:has-text("Save"), button[id*="save"]',
      'Read-only indicator':        '[class*="readonly"], [class*="locked"], text=Read Only',
    };
    for (const [label, sel] of Object.entries(lockSels)) {
      const el = page.locator(sel).first();
      const visible  = await el.isVisible({ timeout: 500 }).catch(() => false);
      const disabled = visible ? await el.isDisabled({ timeout: 300 }).catch(() => false) : 'N/A';
      log(`  ${label}: visible=${visible}, disabled=${disabled}`);
    }

    // Try to read FROM line hours
    if (bodyText.includes(FROM_CODE)) {
      const fromRow = page.locator(`tr:has-text("${FROM_CODE}")`).first();
      if (await fromRow.isVisible({ timeout: 1000 }).catch(() => false)) {
        const rowText   = await fromRow.innerText().catch(() => '(unreadable)');
        const rowInputs = await fromRow.locator('input').all();
        log(`  FROM row text: ${rowText.replace(/\s+/g, ' ').slice(0, 200)}`);
        log(`  FROM row inputs (${rowInputs.length}):`);
        for (const inp of rowInputs) {
          const id  = await inp.getAttribute('id').catch(() => '');
          const val = await inp.inputValue().catch(() => '');
          log(`    id="${id}" value="${val}"`);
        }
      }
    }

    // ------------------------------------------------------------------
    // STEP 5: Capture network request patterns
    // ------------------------------------------------------------------
    log('\nStep 5: Recent CPWeb network requests:');
    requests.slice(-15).forEach(r => log(`  ${r}`));

    await page.screenshot({ path: 'screenshot_04_final.png' });
    log('  Saved: screenshot_04_final.png');

    // ------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------
    console.log('\n=== DRY RUN COMPLETE ===');
    console.log('4 screenshots saved in this directory.');
    console.log('Share the terminal output above and the screenshots.');
    console.log('Key things to confirm:');
    console.log('  1. Is "Request Correction" button visible? (period is locked)');
    console.log('  2. Is FROM charge code visible on the screen?');
    console.log('  3. What are the actual input IDs for day-hours cells?');

  } catch (err) {
    log(`\nERROR: ${err.message}`);
    await page.screenshot({ path: 'screenshot_error.png' }).catch(() => {});
    log('Saved: screenshot_error.png');
  } finally {
    await ask('\nPress Enter to close the browser...');
    await browser.close();
  }
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
