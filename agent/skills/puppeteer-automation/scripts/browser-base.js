/**
 * Browser Base Configuration
 * Standardized Puppeteer browser setup
 */

const puppeteer = require('puppeteer');
require('dotenv').config();

// Environment configuration
const BASE_URL = process.env.BASE_URL || 'https://example.com';
const PUPPETEER_TIMEOUT = parseInt(process.env.PUPPETEER_TIMEOUT) || 30000;
const WAF_BYPASS_TOKEN = process.env.WAF_BYPASS_TOKEN;
const WAF_BYPASS_HEADERS = (process.env.WAF_BYPASS_HEADERS || '').split(',').map(h => h.trim()).filter(Boolean);

// Viewport configurations for responsive testing
const VIEWPORTS = {
  desktop1: { width: 1920, height: 1080 },
  desktop2: { width: 1366, height: 768 },
  desktop3: { width: 1280, height: 720 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 360, height: 800 }
};

/**
 * Get browser executable path based on platform
 */
function getBrowserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  
  switch (process.platform) {
    case 'darwin':
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'linux':
      return '/usr/bin/chromium';
    case 'win32':
      return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    default:
      return undefined; // Let Puppeteer auto-detect
  }
}

/**
 * Standard browser launch configuration
 */
function getBrowserLaunchOptions(headless = true) {
  const options = {
    headless,
    timeout: PUPPETEER_TIMEOUT,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  };

  const executablePath = getBrowserExecutablePath();
  if (executablePath) {
    options.executablePath = executablePath;
  }

  return options;
}

/**
 * Configure page with standard settings
 */
async function configurePage(page, viewportType = 'desktop1') {
  // Set viewport
  if (VIEWPORTS[viewportType]) {
    await page.setViewport(VIEWPORTS[viewportType]);
  }

  // Set modern User-Agent to bypass bot detection
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // WAF bypass headers, if configured (set WAF_BYPASS_TOKEN and
  // WAF_BYPASS_HEADERS, a comma-separated list of header names your WAF expects)
  if (WAF_BYPASS_TOKEN && WAF_BYPASS_HEADERS.length > 0) {
    const headers = {};
    for (const headerName of WAF_BYPASS_HEADERS) {
      headers[headerName] = WAF_BYPASS_TOKEN;
    }
    await page.setExtraHTTPHeaders(headers);
  }

  // Set default timeout
  page.setDefaultTimeout(PUPPETEER_TIMEOUT);
  page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT);

  return page;
}

/**
 * Robust navigation with retry logic
 */
async function navigateWithRetry(page, url, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const waitUntil = options.waitUntil || 'domcontentloaded';
  
  let response, retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      response = await page.goto(url, { 
        waitUntil, 
        timeout: PUPPETEER_TIMEOUT 
      });
      
      if (response && response.ok()) {
        return response;
      }
    } catch (error) {
      console.warn(`Navigation attempt ${retryCount + 1} failed: ${error.message}`);
    }
    
    retryCount++;
    if (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, PUPPETEER_TIMEOUT / 6));
    }
  }
  
  throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts`);
}

/**
 * Wait for element with enhanced error handling
 */
async function waitForElementSafely(page, selector, options = {}) {
  const timeout = options.timeout || PUPPETEER_TIMEOUT;
  const visible = options.visible !== false;
  
  try {
    await page.waitForSelector(selector, { timeout, visible });
    return true;
  } catch (error) {
    console.error(`Element not found: ${selector} (${error.message})`);
    
    // Take debug screenshot
    if (options.debugScreenshot) {
      await page.screenshot({ 
        path: `debug-${selector.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
        fullPage: true 
      });
    }
    
    return false;
  }
}

/**
 * Form filling utility
 */
async function fillForm(page, formData, options = {}) {
  const submitSelector = options.submitSelector || 'input[type="submit"], button[type="submit"]';
  const waitForNavigation = options.waitForNavigation !== false;
  
  for (const [selector, value] of Object.entries(formData)) {
    await page.waitForSelector(selector);
    await page.type(selector, value);
  }
  
  if (options.submit !== false) {
    await page.click(submitSelector);
    
    if (waitForNavigation) {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    }
  }
}

/**
 * Screenshot with error handling
 */
async function captureScreenshot(page, filename, options = {}) {
  const fullPage = options.fullPage !== false;
  const path = options.path || `screenshots/${filename}`;
  
  try {
    await page.screenshot({ path, fullPage });
    console.log(`Screenshot saved: ${path}`);
    return path;
  } catch (error) {
    console.error(`Screenshot failed: ${error.message}`);
    return null;
  }
}

/**
 * Performance monitoring setup
 */
function setupPerformanceMonitoring(page) {
  const metrics = {
    requests: 0,
    responses: 0,
    errors: 0,
    redirects: 0
  };

  page.on('request', (request) => {
    metrics.requests++;
  });

  page.on('response', (response) => {
    metrics.responses++;
    
    if (response.status() >= 400) {
      metrics.errors++;
    }
    
    if (response.status() >= 300 && response.status() < 400) {
      metrics.redirects++;
    }
  });

  return metrics;
}

/**
 * Resource blocking for performance
 */
async function blockResources(page, resourceTypes = ['stylesheet', 'image', 'font']) {
  await page.setRequestInterception(true);
  
  page.on('request', (request) => {
    if (resourceTypes.includes(request.resourceType())) {
      request.abort();
    } else {
      request.continue();
    }
  });
}

/**
 * Main browser factory function
 */
async function createBrowser(options = {}) {
  const launchOptions = getBrowserLaunchOptions(options.headless);
  const browser = await puppeteer.launch(launchOptions);
  
  // Add cleanup handler
  process.on('exit', async () => {
    if (browser) {
      await browser.close();
    }
  });
  
  return browser;
}

/**
 * Page factory with standard configuration
 */
async function createPage(browser, viewportType = 'desktop1', options = {}) {
  const page = await browser.newPage();
  await configurePage(page, viewportType);
  
  if (options.blockResources) {
    await blockResources(page, options.resourceTypes);
  }
  
  if (options.monitoring) {
    const metrics = setupPerformanceMonitoring(page);
    page.metrics = metrics;
  }
  
  return page;
}

module.exports = {
  // Core functions
  createBrowser,
  createPage,
  configurePage,
  
  // Navigation utilities
  navigateWithRetry,
  waitForElementSafely,
  
  // Interaction utilities
  fillForm,
  captureScreenshot,
  
  // Performance utilities
  setupPerformanceMonitoring,
  blockResources,
  
  // Configuration
  VIEWPORTS,
  BASE_URL,
  PUPPETEER_TIMEOUT,
  getBrowserLaunchOptions,
  getBrowserExecutablePath
};