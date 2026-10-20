/**
 * Test Utilities
 * Common test patterns and utilities for Puppeteer automation
 */

const { expect } = require('chai');
const { createBrowser, createPage, navigateWithRetry, captureScreenshot } = require('./browser-base');

/**
 * Cross-browser, cross-viewport test execution
 * Replicates the testCase pattern from puppeteer-utils.js
 */
async function testCase(testConfig, options = {}) {
  const browserTypes = options.browserTypes || ['chrome'];
  const viewportTypes = options.viewportTypes || ['desktop1'];
  const headless = options.headless !== false;
  
  for (const browserType of browserTypes) {
    for (const viewportType of viewportTypes) {
      console.log(`Running test: ${browserType} - ${viewportType}`);
      
      let browser, page;
      
      try {
        // Create browser and page
        browser = await createBrowser({ headless });
        page = await createPage(browser, viewportType, {
          blockResources: options.blockResources,
          monitoring: options.monitoring
        });
        
        // Navigate to test path
        const fullUrl = testConfig.baseUrl || process.env.BASE_URL;
        const testUrl = `${fullUrl}${testConfig.path}`;
        
        await navigateWithRetry(page, testUrl, {
          waitUntil: testConfig.waitUntil || 'domcontentloaded'
        });
        
        // Execute test expectations
        if (testConfig.expectations) {
          await testConfig.expectations(page, browser, { browserType, viewportType });
        }
        
        // Take success screenshot if requested
        if (options.screenshots) {
          await captureScreenshot(page, `success-${browserType}-${viewportType}.png`);
        }
        
      } catch (error) {
        // Take error screenshot
        if (page) {
          await captureScreenshot(page, `error-${browserType}-${viewportType}.png`);
        }
        
        console.error(`Test failed for ${browserType}-${viewportType}: ${error.message}`);
        throw error;
        
      } finally {
        // Cleanup
        if (page) await page.close();
        if (browser) await browser.close();
      }
    }
  }
}

/**
 * Form testing utility
 */
async function testFormSubmission(formConfig, options = {}) {
  return testCase({
    path: formConfig.path,
    expectations: async (page) => {
      // Wait for form to load
      await page.waitForSelector(formConfig.formSelector || 'form');
      
      // Fill form fields
      for (const [selector, value] of Object.entries(formConfig.fields)) {
        await page.waitForSelector(selector);
        await page.type(selector, value);
      }
      
      // Submit form
      const submitSelector = formConfig.submitSelector || 'input[type="submit"]';
      await page.click(submitSelector);
      
      // Wait for response
      if (formConfig.waitForNavigation !== false) {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
      }
      
      // Validate success
      if (formConfig.successSelector) {
        await page.waitForSelector(formConfig.successSelector);
      }
      
      if (formConfig.successText) {
        const content = await page.content();
        expect(content).to.include(formConfig.successText);
      }
    }
  }, options);
}

/**
 * Navigation and redirect testing
 */
async function testRedirect(redirectConfig, options = {}) {
  return testCase({
    path: redirectConfig.fromPath,
    expectations: async (page) => {
      // Check if redirect occurred
      const currentUrl = page.url();
      const expectedUrl = `${redirectConfig.baseUrl || process.env.BASE_URL}${redirectConfig.toPath}`;
      
      expect(currentUrl).to.equal(expectedUrl);
      
      // Additional validations
      if (redirectConfig.expectedTitle) {
        const title = await page.title();
        expect(title).to.include(redirectConfig.expectedTitle);
      }
      
      if (redirectConfig.expectedElement) {
        await page.waitForSelector(redirectConfig.expectedElement);
      }
    }
  }, options);
}

/**
 * Performance testing utility
 */
async function testPerformance(performanceConfig, options = {}) {
  return testCase({
    path: performanceConfig.path,
    expectations: async (page) => {
      const startTime = Date.now();
      
      // Wait for page to be fully loaded
      await page.waitForLoadState?.('networkidle') || 
            await page.waitForSelector(performanceConfig.readySelector || 'body');
      
      const loadTime = Date.now() - startTime;
      
      // Performance assertions
      if (performanceConfig.maxLoadTime) {
        expect(loadTime).to.be.lessThan(performanceConfig.maxLoadTime);
      }
      
      // Check for performance metrics
      const metrics = await page.metrics();
      
      if (performanceConfig.maxJSHeapUsedSize) {
        expect(metrics.JSHeapUsedSize).to.be.lessThan(performanceConfig.maxJSHeapUsedSize);
      }
      
      console.log(`Performance metrics for ${performanceConfig.path}:`, {
        loadTime,
        ...metrics
      });
    }
  }, { ...options, monitoring: true });
}

/**
 * Accessibility testing utility
 */
async function testAccessibility(accessibilityConfig, options = {}) {
  return testCase({
    path: accessibilityConfig.path,
    expectations: async (page) => {
      // Check for required accessibility elements
      if (accessibilityConfig.requiredElements) {
        for (const selector of accessibilityConfig.requiredElements) {
          await page.waitForSelector(selector);
        }
      }
      
      // Check for alt text on images
      if (accessibilityConfig.checkImages !== false) {
        const imagesWithoutAlt = await page.$$eval('img', imgs => 
          imgs.filter(img => !img.alt || img.alt.trim() === '').length
        );
        expect(imagesWithoutAlt).to.equal(0, 'All images should have alt text');
      }
      
      // Check for proper heading hierarchy
      if (accessibilityConfig.checkHeadings !== false) {
        const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', headings => 
          headings.map(h => ({ tag: h.tagName, text: h.textContent.trim() }))
        );
        
        expect(headings.length).to.be.greaterThan(0, 'Page should have headings');
        
        // Should have at least one H1
        const h1Count = headings.filter(h => h.tag === 'H1').length;
        expect(h1Count).to.be.greaterThan(0, 'Page should have at least one H1');
      }
    }
  }, options);
}

/**
 * Cross-browser compatibility testing
 */
async function testCrossBrowser(testConfig, options = {}) {
  const defaultBrowsers = ['chrome', 'firefox', 'edge'];
  const browsers = options.browsers || defaultBrowsers;
  
  return testCase(testConfig, {
    ...options,
    browserTypes: browsers
  });
}

/**
 * Responsive design testing
 */
async function testResponsive(testConfig, options = {}) {
  const defaultViewports = ['desktop1', 'tablet', 'mobile'];
  const viewports = options.viewports || defaultViewports;
  
  return testCase(testConfig, {
    ...options,
    viewportTypes: viewports
  });
}

/**
 * Screenshot comparison utility
 */
async function compareScreenshots(page, baselinePath, options = {}) {
  const threshold = options.threshold || 0.1;
  const currentScreenshot = await page.screenshot({ fullPage: true });
  
  // This would require additional image comparison library
  // For now, just save the current screenshot
  const fs = require('fs');
  const path = require('path');
  
  const screenshotDir = path.dirname(baselinePath);
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  
  fs.writeFileSync(baselinePath.replace('.png', '-current.png'), currentScreenshot);
  
  console.log(`Screenshot saved for comparison: ${baselinePath}`);
}

/**
 * Wait for AJAX/dynamic content
 */
async function waitForDynamicContent(page, options = {}) {
  const timeout = options.timeout || 10000;
  const stabilityTime = options.stabilityTime || 500;
  
  // Wait for network to be idle
  await page.waitForLoadState?.('networkidle') || 
        await page.waitForTimeout(stabilityTime);
  
  // Wait for specific dynamic content if specified
  if (options.selector) {
    await page.waitForSelector(options.selector, { timeout });
  }
  
  // Wait for JavaScript to finish executing
  await page.evaluate(() => {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve);
      }
    });
  });
}

/**
 * Error boundary testing
 */
async function testErrorHandling(errorConfig, options = {}) {
  return testCase({
    path: errorConfig.path,
    expectations: async (page) => {
      // Trigger error condition
      if (errorConfig.triggerError) {
        await errorConfig.triggerError(page);
      }
      
      // Check for error message
      if (errorConfig.errorSelector) {
        await page.waitForSelector(errorConfig.errorSelector);
      }
      
      if (errorConfig.errorText) {
        const content = await page.content();
        expect(content).to.include(errorConfig.errorText);
      }
      
      // Ensure page doesn't crash
      const title = await page.title();
      expect(title).to.not.be.empty;
    }
  }, options);
}

module.exports = {
  // Core testing functions
  testCase,
  testFormSubmission,
  testRedirect,
  testPerformance,
  testAccessibility,
  
  // Specialized testing
  testCrossBrowser,
  testResponsive,
  testErrorHandling,
  
  // Utility functions
  compareScreenshots,
  waitForDynamicContent
};