// Unit tests for Amazon product identification functionality

// Mock ProductEnhancer class for testing
class ProductEnhancer {
  constructor() {
    this.processedProducts = new Set();
  }
  
  // Extract basic product information from the element
  extractProductInfo(productElement) {
    let productInfo = {
      asin: null,
      url: null,
      title: null
    };
    
    try {
      // Extract ASIN - it's usually in the data-asin attribute
      productInfo.asin = productElement.getAttribute('data-asin');
      
      // If ASIN is not in the data-asin attribute, try to extract from other sources
      if (!productInfo.asin) {
        // Try to extract from URL
        const linkElement = productElement.querySelector('a[href*="/dp/"]');
        if (linkElement) {
          const href = linkElement.getAttribute('href');
          const asinMatch = href.match(/\/dp\/([A-Z0-9]{10})/);
          if (asinMatch && asinMatch[1]) {
            productInfo.asin = asinMatch[1];
          }
        }
      }
      
      // Extract product URL
      const linkSelectors = [
        'a.a-link-normal.s-no-outline',
        'a.a-link-normal.a-text-normal',
        'a[href*="/dp/"]',
        '.a-link-normal[href*="/dp/"]'
      ];
      
      for (const selector of linkSelectors) {
        const linkElement = productElement.querySelector(selector);
        if (linkElement) {
          let href = linkElement.getAttribute('href');
          
          // Make sure we have an absolute URL
          if (href && href.startsWith('/')) {
            href = `https://www.amazon.com${href}`;
          }
          
          productInfo.url = href;
          break;
        }
      }
      
      // Extract product title
      const titleSelectors = [
        'h2 a span',
        'h2 .a-link-normal',
        '.a-size-medium.a-color-base.a-text-normal',
        '.a-size-base-plus.a-color-base.a-text-normal'
      ];
      
      for (const selector of titleSelectors) {
        const titleElement = productElement.querySelector(selector);
        if (titleElement) {
          productInfo.title = titleElement.textContent.trim();
          break;
        }
      }
    } catch (error) {
      console.error('Error extracting product info:', error);
    }
    
    return productInfo;
  }
  
  // Check if current page is an Amazon search results page
  isAmazonSearchPage() {
    const url = window.location.href;
    const hostname = window.location.hostname;
    
    // Check if we're on an Amazon domain
    if (!hostname.includes('amazon.')) {
      return false;
    }
    
    // Check for various Amazon search URL patterns
    const isSearchUrl = url.includes('/s?') || 
                        url.includes('/s/') || 
                        url.includes('/search/') || 
                        url.includes('keywords=');
    
    // Check for search results container elements
    const hasSearchResults = Boolean(
      document.querySelector('.s-search-results') || 
      document.querySelector('.s-result-list') ||
      document.querySelector('[data-component-type="s-search-results"]')
    );
    
    return isSearchUrl && hasSearchResults;
  }
}

// Test cases for ASIN extraction
function testAsinExtraction() {
  console.log('Running ASIN extraction tests');
  
  // Create a mock document for testing
  const mockDocument = {
    createElement: function(tagName) {
      const element = {
        innerHTML: '',
        getAttribute: function(attr) { return null; },
        querySelector: function(selector) { return null; },
        querySelectorAll: function(selector) { return []; }
      };
      return element;
    }
  };
  
  // Save original document if it exists
  const originalDocument = typeof document !== 'undefined' ? document : null;
  
  // Replace with mock
  global.document = mockDocument;
  
  // Test cases
  const testCases = [
    {
      name: 'Extract ASIN from data-asin attribute',
      element: {
        getAttribute: function(attr) { return attr === 'data-asin' ? 'B08N5KWB9H' : null; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; }
      },
      expectedAsin: 'B08N5KWB9H'
    },
    {
      name: 'Extract ASIN from product URL with /dp/ pattern',
      element: {
        getAttribute: function() { return null; },
        querySelector: function(selector) { 
          return selector.includes('/dp/') ? {
            getAttribute: function() { return '/dp/B08N5KWB9H/ref=sr_1_1'; }
          } : null;
        },
        querySelectorAll: function() { return []; }
      },
      expectedAsin: 'B08N5KWB9H'
    },
    {
      name: 'Extract ASIN from product URL with /gp/product/ pattern',
      element: {
        getAttribute: function() { return null; },
        querySelector: function(selector) { 
          return selector.includes('/gp/product/') ? {
            getAttribute: function() { return '/gp/product/B07ZPML7NP?th=1'; }
          } : null;
        },
        querySelectorAll: function() { return []; }
      },
      expectedAsin: 'B07ZPML7NP'
    },
    {
      name: 'Extract lowercase ASIN and convert to uppercase',
      element: {
        getAttribute: function() { return null; },
        querySelector: function(selector) { 
          return selector.includes('/dp/') ? {
            getAttribute: function() { return '/dp/b08n5kwb9h/ref=sr_1_1'; }
          } : null;
        },
        querySelectorAll: function() { return []; }
      },
      expectedAsin: 'B08N5KWB9H'
    },
    {
      name: 'Extract ASIN from data-id attribute when data-asin is missing',
      element: {
        getAttribute: function(attr) { 
          if (attr === 'data-id') return 'B07ZPML7NP';
          return null;
        },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; }
      },
      expectedAsin: 'B07ZPML7NP'
    },
    {
      name: 'Handle missing ASIN gracefully',
      element: {
        getAttribute: function() { return null; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; }
      },
      expectedAsin: null
    }
  ];
  
  // Run tests
  const enhancer = new ProductEnhancer();
  let passedTests = 0;
  
  testCases.forEach((testCase, index) => {
    // Extract product info
    const productInfo = enhancer.extractProductInfo(testCase.element);
    
    // Check result
    const passed = productInfo.asin === testCase.expectedAsin;
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  Expected: ${testCase.expectedAsin}`);
    console.log(`  Actual: ${productInfo.asin}`);
    
    if (passed) passedTests++;
  });
  
  // Restore original document if it existed
  if (originalDocument) {
    global.document = originalDocument;
  } else {
    delete global.document;
  }
  
  console.log(`Tests completed: ${passedTests}/${testCases.length} passed`);
  return passedTests === testCases.length;
}

// Test cases for Amazon search page detection
function testSearchPageDetection() {
  console.log('Running Amazon search page detection tests');
  
  // Test cases
  const testCases = [
    {
      name: 'Valid Amazon search page with /s? pattern',
      location: {
        href: 'https://www.amazon.com/s?k=laptop',
        hostname: 'www.amazon.com'
      },
      elements: {
        '.s-search-results': [{}]
      },
      expected: true
    },
    {
      name: 'Valid Amazon search page with /s/ pattern',
      location: {
        href: 'https://www.amazon.com/s/ref=nb_sb_noss?url=search-alias%3Daps&field-keywords=laptop',
        hostname: 'www.amazon.com'
      },
      elements: {
        '.s-result-list': [{}]
      },
      expected: true
    },
    {
      name: 'Valid Amazon search page with /gp/search/ pattern',
      location: {
        href: 'https://www.amazon.com/gp/search/ref=sr_nr_p_36_5?keywords=laptop',
        hostname: 'www.amazon.com'
      },
      elements: {
        '[data-component-type="s-search-results"]': [{}]
      },
      expected: true
    },
    {
      name: 'Valid Amazon search page with /sr/ref= pattern',
      location: {
        href: 'https://www.amazon.com/sr/ref=sr_nr_p_36_5?keywords=laptop',
        hostname: 'www.amazon.com'
      },
      elements: {
        '#search > div.s-desktop-width-max': [{}]
      },
      expected: true
    },
    {
      name: 'Amazon product page (not search)',
      location: {
        href: 'https://www.amazon.com/dp/B08N5KWB9H',
        hostname: 'www.amazon.com'
      },
      elements: {},
      expected: false
    },
    {
      name: 'Amazon search URL but no search results container',
      location: {
        href: 'https://www.amazon.com/s?k=nonexistentproduct123456789',
        hostname: 'www.amazon.com'
      },
      elements: {}, // No search results elements
      expected: false
    },
    {
      name: 'Non-Amazon page',
      location: {
        href: 'https://www.example.com/search?q=laptop',
        hostname: 'www.example.com'
      },
      elements: {},
      expected: false
    },
    {
      name: 'Amazon.co.jp search page (international domain)',
      location: {
        href: 'https://www.amazon.co.jp/s?k=laptop',
        hostname: 'www.amazon.co.jp'
      },
      elements: {
        '.s-search-results': [{}]
      },
      expected: true
    }
  ];
  
  // Save originals
  const originalLocation = typeof window !== 'undefined' ? window.location : null;
  const originalQuerySelector = typeof document !== 'undefined' ? document.querySelector : null;
  const originalConsoleLog = console.log;
  
  // Create mock window and document if they don't exist
  if (typeof window === 'undefined') {
    global.window = {};
  }
  if (typeof document === 'undefined') {
    global.document = {
      querySelector: function() { return null; }
    };
  }
  
  // Suppress console logs during tests
  console.log = function() {};
  
  let passedTests = 0;
  
  // Run tests
  testCases.forEach((testCase, index) => {
    // Mock location
    delete window.location;
    window.location = testCase.location;
    
    // Mock querySelector
    document.querySelector = function(selector) {
      return testCase.elements[selector] ? testCase.elements[selector][0] : null;
    };
    
    // Create enhancer instance
    const enhancer = new ProductEnhancer();
    
    // Test page detection
    const result = enhancer.isAmazonSearchPage();
    
    // Check result
    const passed = result === testCase.expected;
    
    // Restore console.log temporarily for test results
    const tempLog = console.log;
    console.log = originalConsoleLog;
    
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  Expected: ${testCase.expected}`);
    console.log(`  Actual: ${result}`);
    
    // Suppress logs again
    console.log = tempLog;
    
    if (passed) passedTests++;
  });
  
  // Restore originals
  if (originalLocation) {
    window.location = originalLocation;
  } else {
    delete window.location;
  }
  
  if (originalQuerySelector) {
    document.querySelector = originalQuerySelector;
  }
  
  console.log = originalConsoleLog;
  
  console.log(`Tests completed: ${passedTests}/${testCases.length} passed`);
  return passedTests === testCases.length;
}

// Test cases for product URL extraction
function testProductUrlExtraction() {
  console.log('Running product URL extraction tests');
  
  // Test cases
  const testCases = [
    {
      name: 'Extract URL from standard product link',
      element: {
        getAttribute: function() { return null; },
        querySelector: function(selector) { 
          if (selector.includes('a[href*="/dp/"]')) {
            return {
              getAttribute: function() { return 'https://www.amazon.com/dp/B08N5KWB9H/ref=sr_1_1'; }
            };
          }
          return null;
        },
        querySelectorAll: function() { return []; }
      },
      expectedUrl: 'https://www.amazon.com/dp/B08N5KWB9H'
    },
    {
      name: 'Extract URL from relative path',
      element: {
        getAttribute: function() { return null; },
        querySelector: function(selector) { 
          if (selector.includes('a[href*="/dp/"]')) {
            return {
              getAttribute: function() { return '/dp/B08N5KWB9H/ref=sr_1_1'; }
            };
          }
          return null;
        },
        querySelectorAll: function() { return []; }
      },
      expectedHostname: 'www.amazon.com', // For this test we'll check if hostname is included
      expectedUrlPattern: '/dp/B08N5KWB9H'
    },
    {
      name: 'Extract URL with essential parameters',
      element: {
        getAttribute: function() { return null; },
        querySelector: function(selector) { 
          if (selector.includes('a[href*="/dp/"]')) {
            return {
              getAttribute: function() { return 'https://www.amazon.com/dp/B08N5KWB9H?th=1&psc=1&ref=sr_1_1'; }
            };
          }
          return null;
        },
        querySelectorAll: function() { return []; }
      },
      expectedUrlPattern: 'th=1&psc=1'
    },
    {
      name: 'Handle missing URL gracefully',
      element: {
        getAttribute: function() { return null; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; }
      },
      expectedUrl: null
    }
  ];
  
  // Save original window.location
  const originalLocation = window.location;
  
  // Mock window.location
  delete window.location;
  window.location = {
    hostname: 'www.amazon.com'
  };
  
  // Run tests
  const enhancer = new ProductEnhancer();
  let passedTests = 0;
  
  testCases.forEach((testCase, index) => {
    // Extract product info
    const productInfo = enhancer.extractProductInfo(testCase.element);
    
    // Check result based on test case expectations
    let passed = false;
    
    if (testCase.expectedUrl === null) {
      passed = productInfo.url === null;
    } else if (testCase.expectedUrl) {
      passed = productInfo.url === testCase.expectedUrl;
    } else if (testCase.expectedHostname && testCase.expectedUrlPattern) {
      passed = productInfo.url && 
              productInfo.url.includes(testCase.expectedHostname) && 
              productInfo.url.includes(testCase.expectedUrlPattern);
    } else if (testCase.expectedUrlPattern) {
      passed = productInfo.url && productInfo.url.includes(testCase.expectedUrlPattern);
    }
    
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  Expected pattern: ${testCase.expectedUrl || testCase.expectedUrlPattern || 'null'}`);
    console.log(`  Actual: ${productInfo.url}`);
    
    if (passed) passedTests++;
  });
  
  // Restore original window.location
  window.location = originalLocation;
  
  console.log(`Tests completed: ${passedTests}/${testCases.length} passed`);
  return passedTests === testCases.length;
}

// Run all tests
function runAllTests() {
  console.log('=== Running Amazon Product Enhancer Tests ===');
  
  const asinTestsPassed = testAsinExtraction();
  const pageDetectionTestsPassed = testSearchPageDetection();
  const urlExtractionTestsPassed = testProductUrlExtraction();
  
  console.log('=== Test Summary ===');
  console.log(`ASIN Extraction: ${asinTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Page Detection: ${pageDetectionTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`URL Extraction: ${urlExtractionTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Overall: ${asinTestsPassed && pageDetectionTestsPassed && urlExtractionTestsPassed ? 'PASSED' : 'FAILED'}`);
}

// Export for use in test runners
if (typeof module !== 'undefined') {
  module.exports = {
    testAsinExtraction,
    testSearchPageDetection,
    testProductUrlExtraction,
    runAllTests
  };
}