/**
 * Sample Puppeteer Test
 * Demonstrates usage of the puppeteer-automation skill
 */

const { expect } = require('chai');
const { testCase, testFormSubmission, testResponsive } = require('./test-utilities');

describe('Website Tests', function() {
  // Set timeout for all tests
  this.timeout(60000);

  describe('Homepage Tests', function() {
    it('should load homepage successfully', async function() {
      await testCase({
        path: '/',
        expectations: async (page) => {
          // Check page title
          const title = await page.title();
          expect(title).to.include('Expected Title');

          // Check for main navigation
          await page.waitForSelector('.main-nav');

          // Check for logo
          const logo = await page.$('.site-logo');
          expect(logo).to.not.be.null;
          
          // Check for footer
          await page.waitForSelector('footer');
        }
      }, {
        browserTypes: ['chrome'],
        viewportTypes: ['desktop1', 'mobile']
      });
    });

    it('should have proper accessibility elements', async function() {
      await testCase({
        path: '/',
        expectations: async (page) => {
          // Check for skip link
          const skipLink = await page.$('a[href="#main-content"]');
          expect(skipLink).to.not.be.null;
          
          // Check for proper heading structure
          const h1Elements = await page.$$('h1');
          expect(h1Elements.length).to.be.greaterThan(0);
          
          // Check for alt text on images
          const imagesWithoutAlt = await page.$$eval('img', imgs => 
            imgs.filter(img => !img.alt || img.alt.trim() === '').length
          );
          expect(imagesWithoutAlt).to.equal(0);
        }
      });
    });
  });

  describe('Form Tests', function() {
    it('should handle contact form submission', async function() {
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
    });
  });

  describe('Responsive Design Tests', function() {
    it('should display properly across all viewports', async function() {
      await testResponsive({
        path: '/',
        expectations: async (page, browser, { viewportType }) => {
          // Check navigation behavior based on viewport
          if (viewportType === 'mobile') {
            // Mobile should have hamburger menu
            await page.waitForSelector('.mobile-menu-toggle');
          } else {
            // Desktop should have full navigation
            await page.waitForSelector('.main-nav ul');
          }
          
          // Check that content is not overflowing
          const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
          const viewportWidth = await page.evaluate(() => window.innerWidth);
          expect(bodyWidth).to.be.lessThanOrEqual(viewportWidth + 20); // Allow small tolerance
        }
      });
    });
  });

  describe('Performance Tests', function() {
    it('should load within acceptable time limits', async function() {
      await testCase({
        path: '/',
        expectations: async (page) => {
          const startTime = Date.now();
          
          // Wait for page to be fully loaded
          await page.waitForSelector('footer');
          
          const loadTime = Date.now() - startTime;
          expect(loadTime).to.be.lessThan(5000); // 5 second limit
          
          // Check performance metrics
          const metrics = await page.metrics();
          console.log('Performance metrics:', metrics);
          
          // Ensure reasonable memory usage
          expect(metrics.JSHeapUsedSize).to.be.lessThan(50 * 1024 * 1024); // 50MB limit
        }
      }, {
        monitoring: true
      });
    });
  });

  describe('Error Handling Tests', function() {
    it('should handle 404 pages gracefully', async function() {
      await testCase({
        path: '/non-existent-page',
        expectations: async (page) => {
          // Should show 404 page, not crash
          const title = await page.title();
          expect(title).to.include('404');
          
          // Should still have navigation
          await page.waitForSelector('.main-nav');
          
          // Should have helpful content
          const content = await page.content();
          expect(content).to.include('Page not found');
        }
      });
    });
  });
});