---
name: puppeteer-automation
description: Comprehensive Puppeteer automation skill for web scraping, browser testing, screenshot generation, form automation, and performance monitoring. Use when tasks involve browser automation, web testing, data extraction, or UI validation.
triggers:
  - web scrape
  - browser test
  - take screenshot
  - automate browser
  - test website
  - form automation
  - performance test
  - accessibility test
  - cross-browser test
  - responsive test
  - UI test
  - end-to-end test
  - e2e test
  - selenium alternative
  - headless browser
  - web automation
  - site monitoring
  - visual regression
  - PDF generation
  - data extraction
version: 1.0.0
created: 2026-03-18
updated: 2026-03-18
---

# Puppeteer Automation Skill

This skill provides comprehensive Puppeteer automation capabilities. It includes standardized browser configurations, common test utilities, and production-ready patterns for web automation tasks.

## When to Use This Skill

Use this skill when you need to:

- **Web Testing:** Automated testing of web applications, forms, and user interactions
- **Cross-Browser Testing:** Testing across Chrome, Firefox, and other browsers
- **Responsive Testing:** Validating layouts across different viewport sizes
- **Performance Monitoring:** Measuring page load times, memory usage, and network metrics
- **Accessibility Testing:** Checking ARIA attributes, heading structure, and alt text
- **Web Scraping:** Extracting data from websites with JavaScript rendering
- **Screenshot Generation:** Capturing visual states for documentation or comparison
- **PDF Generation:** Converting web pages to PDF documents
- **Form Automation:** Automated form filling and submission testing
- **Visual Regression Testing:** Comparing screenshots across deployments

## Negative Boundaries (When NOT to Use)

**Do NOT use this skill for:**

- Simple HTTP requests (use `fetch` or `axios` instead)
- Static HTML parsing (use `cheerio` or similar)
- API testing (use dedicated API testing tools)
- Tasks that don't require a full browser environment
- High-frequency monitoring (too resource-intensive)
- Production data scraping without proper rate limiting

## Quick Start

### 1. Project Setup

```bash
# Copy the skill templates to your project
cp .roo/skills/puppeteer-automation/scripts/.env.template .env
cp .roo/skills/puppeteer-automation/scripts/package.json.template package.json

# Configure environment variables
# Edit .env with your BASE_URL, WAF_BYPASS_TOKEN, etc.

# Install dependencies
npm install

# Copy utility files
cp .roo/skills/puppeteer-automation/scripts/browser-base.js ./
cp .roo/skills/puppeteer-automation/scripts/test-utilities.js ./
```

### 2. Basic Test Structure

```javascript
const { testCase, testFormSubmission, testResponsive } = require('./test-utilities');
const { expect } = require('chai');

describe('Website Tests', function() {
  this.timeout(60000);

  it('should load homepage successfully', async function() {
    await testCase({
      path: '/',
      expectations: async (page) => {
        const title = await page.title();
        expect(title).to.include('Expected Title');
        
        await page.waitForSelector('.main-content');
        const content = await page.$('.main-content');
        expect(content).to.not.be.null;
      }
    });
  });
});
```

## Core Patterns

### Pattern 1: Basic Page Testing

```javascript
await testCase({
  path: '/about',
  expectations: async (page) => {
    // Check page elements
    await page.waitForSelector('h1');
    const heading = await page.$eval('h1', el => el.textContent);
    expect(heading).to.include('About');
    
    // Check navigation
    await page.waitForSelector('.main-nav');
    
    // Check footer
    await page.waitForSelector('footer');
  }
}, {
  browserTypes: ['chrome'], // Optional: specify browsers
  viewportTypes: ['desktop1'] // Optional: specify viewports
});
```

### Pattern 2: Form Testing

```javascript
await testFormSubmission({
  path: '/contact',
  formSelector: '#contact-form',
  fields: {
    '#edit-name': 'Test User',
    '#edit-email': 'test@example.com',
    '#edit-subject': 'Test Subject',
    '#edit-message': 'This is a test message.'
  },
  submitSelector: '#edit-submit',
  successSelector: '.messages--status',
  successText: 'Your message has been sent'
}, {
  browserTypes: ['chrome'],
  viewportTypes: ['desktop1']
});
```

### Pattern 3: Cross-Browser Testing

```javascript
await testCase({
  path: '/',
  expectations: async (page) => {
    // Your test logic here
  }
}, {
  browserTypes: ['chrome', 'firefox'], // Test in multiple browsers
  viewportTypes: ['desktop1', 'mobile'] // Test multiple viewports
});
```

### Pattern 4: Responsive Design Testing

```javascript
await testResponsive({
  path: '/',
  expectations: async (page, browser, { viewportType }) => {
    if (viewportType === 'mobile') {
      // Mobile-specific checks
      await page.waitForSelector('.mobile-menu-toggle');
    } else {
      // Desktop-specific checks
      await page.waitForSelector('.main-nav ul');
    }
    
    // Check for content overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).to.be.lessThanOrEqual(viewportWidth + 20);
  }
});
```

### Pattern 5: Performance Testing

```javascript
await testCase({
  path: '/',
  expectations: async (page) => {
    const startTime = Date.now();
    await page.waitForSelector('footer');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).to.be.lessThan(5000); // 5 second limit
    
    // Check performance metrics
    const metrics = await page.metrics();
    expect(metrics.JSHeapUsedSize).to.be.lessThan(50 * 1024 * 1024); // 50MB
  }
}, {
  monitoring: true // Enable performance monitoring
});
```

### Pattern 6: Screenshot Generation

```javascript
const { createBrowser } = require('./browser-base');

async function captureScreenshots() {
  const browser = await createBrowser('chrome');
  const page = await browser.newPage();
  
  try {
    await page.goto('https://example.com');
    await page.waitForSelector('.main-content');
    
    // Full page screenshot
    await page.screenshot({
      path: 'screenshots/homepage-full.png',
      fullPage: true
    });
    
    // Element screenshot
    const element = await page.$('.hero-section');
    await element.screenshot({
      path: 'screenshots/hero-section.png'
    });
    
  } finally {
    await browser.close();
  }
}
```

### Pattern 7: Data Extraction

```javascript
const { createBrowser } = require('./browser-base');

async function scrapeData() {
  const browser = await createBrowser('chrome');
  const page = await browser.newPage();
  
  try {
    await page.goto('https://example.com/data');
    await page.waitForSelector('.data-table');
    
    const data = await page.$$eval('.data-table tr', rows => {
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        return Array.from(cells, cell => cell.textContent.trim());
      });
    });
    
    return data;
    
  } finally {
    await browser.close();
  }
}
```

## Advanced Configuration

### Environment Variables

Configure your `.env` file:

```bash
# Base URL for testing
BASE_URL=https://example.com

# Puppeteer settings
PUPPETEER_TIMEOUT=30000
PUPPETEER_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# WAF bypass (optional, only needed if testing behind a WAF)
WAF_BYPASS_TOKEN=your-waf-bypass-token-here

# Test configuration
TEST_HEADLESS=true
TEST_SCREENSHOTS=false
DEBUG_SCREENSHOTS=false
```

### Browser Configuration

The skill automatically handles:

- **Cross-platform browser detection** (macOS, Linux, Windows)
- **WAF bypass headers** for testing behind a web application firewall
- **Resource blocking** for faster test execution
- **Modern User-Agent strings** to avoid bot detection
- **Viewport presets** (desktop1, desktop2, tablet, mobile)

### Available Viewports

```javascript
const viewports = {
  desktop1: { width: 1920, height: 1080 },
  desktop2: { width: 1366, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 }
};
```

## Error Handling & Debugging

### Debug Mode

Run tests with debugging enabled:

```bash
DEBUG=true HEADLESS=false npm test
```

This enables:
- Headed browser mode (visible browser window)
- Debug screenshots on failures
- Verbose console logging
- Extended timeouts for manual inspection

### Common Error Patterns

```javascript
// Robust element waiting
await page.waitForSelector('.element', { 
  visible: true, 
  timeout: 30000 
});

// Handle navigation with retries
await page.goto(url, { 
  waitUntil: 'networkidle2',
  timeout: 30000 
});

// Graceful error handling
try {
  await page.click('.button');
} catch (error) {
  if (DEBUG_SCREENSHOTS) {
    await page.screenshot({ path: 'debug-error.png' });
  }
  throw error;
}
```

## NPM Scripts

The skill provides these NPM scripts:

```json
{
  "test": "mocha test/*.js --timeout 60000",
  "test:chrome": "mocha test/*.js --timeout 60000 --grep 'chrome'",
  "test:firefox": "mocha test/*.js --timeout 60000 --grep 'firefox'",
  "test:headless": "HEADLESS=true mocha test/*.js --timeout 60000",
  "test:headed": "HEADLESS=false mocha test/*.js --timeout 60000",
  "test:desktop": "VIEWPORT=desktop1 mocha test/*.js --timeout 60000",
  "test:mobile": "VIEWPORT=mobile mocha test/*.js --timeout 60000",
  "test:responsive": "npm run test:desktop && npm run test:mobile",
  "test:performance": "mocha test/*performance*.js --timeout 120000",
  "screenshots": "SCREENSHOTS=true npm test",
  "debug": "DEBUG=true HEADLESS=false npm test"
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Puppeteer Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm install
        
      - name: Run Puppeteer tests
        run: |
          export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
          npm run test:headless
        env:
          BASE_URL: ${{ secrets.BASE_URL }}
          WAF_BYPASS_TOKEN: ${{ secrets.WAF_BYPASS_TOKEN }}
```

### Docker Integration

```dockerfile
FROM node:18-alpine

# Install Chromium
RUN apk add --no-cache chromium

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
CMD ["npm", "test"]
```

## Security Considerations

### WAF Bypass

For production testing behind a WAF, the skill includes WAF bypass functionality:

```javascript
// Automatically added to requests when WAF_BYPASS_TOKEN is set
headers: {
  'X-WAF-Bypass': process.env.WAF_BYPASS_TOKEN,
  'User-Agent': 'Mozilla/5.0 (compatible; PuppeteerAutomation/1.0)'
}
```

### Rate Limiting

```javascript
// Built-in delays between requests
await page.waitForTimeout(1000); // 1 second delay

// Request interception for rate limiting
await page.setRequestInterception(true);
page.on('request', (req) => {
  // Add delays or block certain resources
  setTimeout(() => req.continue(), 100);
});
```

## Performance Optimization

### Resource Blocking

```javascript
// Automatically blocks unnecessary resources
const blockedResources = ['image', 'stylesheet', 'font', 'media'];
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (blockedResources.includes(req.resourceType())) {
    req.abort();
  } else {
    req.continue();
  }
});
```

### Memory Management

```javascript
// Automatic cleanup
process.on('exit', async () => {
  if (browser) {
    await browser.close();
  }
});

// Memory monitoring
const metrics = await page.metrics();
console.log('Memory usage:', metrics.JSHeapUsedSize);
```

## Troubleshooting

### Common Issues

1. **Browser not found:**
   ```bash
   export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome
   ```

2. **Timeout errors:**
   ```bash
   export PUPPETEER_TIMEOUT=60000
   ```

3. **WAF blocking:**
   ```bash
   export WAF_BYPASS_TOKEN=your-token-here
   ```

4. **Memory issues:**
   ```bash
   # Enable resource blocking
   export BLOCK_RESOURCES=true
   ```

### Debug Commands

```bash
# Run single test with debugging
DEBUG=true HEADLESS=false npx mocha test/specific-test.js

# Capture screenshots during test run
SCREENSHOTS=true npm test

# Verbose logging
VERBOSE=true npm test
```

## File Structure

After setup, your project should have:

```
project/
├── .env                    # Environment configuration
├── package.json           # NPM configuration
├── browser-base.js        # Browser utilities
├── test-utilities.js      # Test helper functions
├── test/                  # Test files
│   ├── homepage.spec.js
│   ├── forms.spec.js
│   └── responsive.spec.js
├── screenshots/           # Generated screenshots
└── reports/              # Test reports
```

## Resources

- **Scripts Directory:** `.roo/skills/puppeteer-automation/scripts/`
- **Sample Test:** `scripts/sample-test.js`
- **Environment Template:** `scripts/.env.template`
- **Package Template:** `scripts/package.json.template`
- **Documentation:** `scripts/README.md`

## Support

For issues specific to this skill:

1. Check the `scripts/README.md` for detailed troubleshooting
2. Review the sample test file for usage examples
3. Ensure environment variables are properly configured
4. Verify browser executable paths for your platform

## Version History

- **v1.0.0** (2026-03-18): Initial release
  - Cross-browser testing support
  - WAF bypass functionality
  - Responsive design testing utilities
  - Performance monitoring capabilities
  - Comprehensive error handling and debugging tools