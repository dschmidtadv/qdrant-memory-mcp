# Puppeteer Automation Scripts

This directory contains helper scripts and utilities for the Puppeteer Automation Skill.

## Files Overview

### Core Scripts

- **`browser-base.js`** - Standardized browser configuration and utilities
- **`test-utilities.js`** - Common test patterns and helper functions
- **`sample-test.js`** - Example test implementation demonstrating skill usage

### Configuration Templates

- **`.env.template`** - Environment configuration template
- **`package.json.template`** - NPM package configuration template

## Quick Start

1. **Copy environment template:**
   ```bash
   cp .env.template .env
   ```

2. **Configure environment variables:**
   Edit `.env` with your specific values (BASE_URL, WAF_BYPASS_TOKEN, etc.)

3. **Copy package.json template:**
   ```bash
   cp package.json.template package.json
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Run sample test:**
   ```bash
   npm test
   ```

## Usage Examples

### Basic Test Setup

```javascript
const { testCase } = require('./test-utilities');

describe('My Tests', function() {
  it('should test homepage', async function() {
    await testCase({
      path: '/',
      expectations: async (page) => {
        const title = await page.title();
        expect(title).to.include('Expected Title');
      }
    });
  });
});
```

### Cross-Browser Testing

```javascript
await testCase(testConfig, {
  browserTypes: ['chrome', 'firefox'],
  viewportTypes: ['desktop1', 'mobile']
});
```

### Form Testing

```javascript
const { testFormSubmission } = require('./test-utilities');

await testFormSubmission({
  path: '/contact',
  fields: {
    '#name': 'Test User',
    '#email': 'test@example.com'
  },
  successText: 'Form submitted successfully'
});
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_URL` | Base URL for testing | `https://example.com` |
| `PUPPETEER_TIMEOUT` | Timeout in milliseconds | `30000` |
| `PUPPETEER_EXECUTABLE_PATH` | Browser executable path | Auto-detected |
| `WAF_BYPASS_TOKEN` | WAF bypass token for production | Required if testing behind a WAF |

## Browser Support

The scripts automatically handle browser executable paths for:

- **macOS:** Chrome.app bundle
- **Linux:** Chromium system installation  
- **Windows:** Chrome Program Files
- **Docker:** Container-optimized paths

## Security Features

- WAF bypass headers for production testing
- Modern User-Agent strings to avoid bot detection
- Configurable request interception for resource blocking
- Environment-based security token management

## Performance Optimization

- Resource blocking (CSS, images, fonts) for faster tests
- Network monitoring and metrics collection
- Configurable cache management
- Memory usage tracking

## Error Handling

- Automatic retry logic for navigation failures
- Debug screenshot capture on test failures
- Graceful browser cleanup on process exit
- Comprehensive error logging

## Testing Patterns

The utilities support various testing patterns:

- **Functional Testing:** Form submissions, navigation, interactions
- **Visual Testing:** Screenshot comparison, responsive design
- **Performance Testing:** Load times, memory usage, network metrics
- **Accessibility Testing:** ARIA attributes, heading structure, alt text
- **Cross-Browser Testing:** Chrome, Firefox, Edge compatibility
- **Responsive Testing:** Desktop, tablet, mobile viewports

## Integration

### Mocha Integration

```javascript
// package.json scripts
"test:chrome": "mocha test/*.js --browser chrome",
"test:mobile": "mocha test/*.js --viewport mobile"
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Puppeteer Tests
  run: |
    export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
    npm run test:headless
```

## Troubleshooting

### Common Issues

1. **Browser not found:** Set `PUPPETEER_EXECUTABLE_PATH` environment variable
2. **Timeout errors:** Increase `PUPPETEER_TIMEOUT` value
3. **WAF blocking:** Ensure `WAF_BYPASS_TOKEN` is set for production testing
4. **Memory issues:** Enable resource blocking for large test suites

### Debug Mode

Run tests with debug flags:

```bash
DEBUG=true HEADLESS=false npm test
```

This will:
- Run browser in headed mode
- Enable verbose logging
- Capture debug screenshots
- Show detailed error messages

## Contributing

When adding new utilities:

1. Follow the established patterns in `browser-base.js`
2. Add comprehensive error handling
3. Include JSDoc documentation
4. Update this README with new functionality
5. Add example usage in `sample-test.js`