// Unit tests for Amazon product parser functionality

// Import the parser
const { AmazonParser } = require('../parser.js');

// Mock DOMParser for testing
global.DOMParser = class {
  parseFromString(html, contentType) {
    // Create a simple mock document
    return {
      querySelector: function(selector) {
        return null; // Default implementation
      },
      querySelectorAll: function(selector) {
        return []; // Default implementation
      },
      body: {
        textContent: html // Use the HTML as text content for testing
      }
    };
  }
};

// Test cases for BSR parsing
function testBSRParsing() {
  console.log('Running BSR parsing tests');
  
  const parser = new AmazonParser();
  
  // Test cases
  const testCases = [
    {
      name: 'Standard BSR format',
      html: 'Best Sellers Rank: #1,234 in Electronics (See Top 100 in Electronics)',
      expected: [{ rank: 1234, category: 'Electronics' }]
    },
    {
      name: 'Multiple BSR categories',
      html: 'Best Sellers Rank: #1,234 in Electronics (See Top 100 in Electronics) #5,678 in Computers & Accessories',
      expected: [
        { rank: 1234, category: 'Electronics' },
        { rank: 5678, category: 'Computers & Accessories' }
      ]
    },
    {
      name: 'BSR with different format',
      html: 'Amazon Best Sellers Rank: #12,345 in Home & Kitchen (See Top 100 in Home & Kitchen)',
      expected: [{ rank: 12345, category: 'Home & Kitchen' }]
    },
    {
      name: 'No BSR information',
      html: 'Product details without BSR information',
      expected: null
    }
  ];
  
  let passedTests = 0;
  
  // Run tests
  testCases.forEach((testCase, index) => {
    // Create mock document
    const doc = new DOMParser().parseFromString(testCase.html, 'text/html');
    
    // Extract BSR data
    const bsrData = parser.extractBSRData(testCase.html);
    
    // Check result
    let passed = false;
    
    if (testCase.expected === null) {
      passed = bsrData === null;
    } else if (bsrData && testCase.expected) {
      passed = bsrData.length === testCase.expected.length &&
               bsrData.every((item, i) => 
                 item.rank === testCase.expected[i].rank && 
                 item.category === testCase.expected[i].category
               );
    }
    
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed) {
      console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`  Actual: ${JSON.stringify(bsrData)}`);
    }
    
    if (passed) passedTests++;
  });
  
  console.log(`Tests completed: ${passedTests}/${testCases.length} passed`);
  return passedTests === testCases.length;
}

// Test cases for brand parsing
function testBrandParsing() {
  console.log('Running brand parsing tests');
  
  // Override querySelector for brand tests
  const originalQuerySelector = global.DOMParser.prototype.parseFromString;
  
  global.DOMParser.prototype.parseFromString = function(html, contentType) {
    const doc = {
      querySelector: function(selector) {
        if (selector === '#bylineInfo' && html.includes('Visit the Apple Store')) {
          return { textContent: 'Visit the Apple Store' };
        }
        if (selector === '#bylineInfo' && html.includes('Brand: Samsung')) {
          return { textContent: 'Brand: Samsung' };
        }
        if (selector === 'meta[name="brand"]' && html.includes('meta-brand-sony')) {
          return { 
            getAttribute: function(attr) { 
              return attr === 'content' ? 'Sony' : null; 
            } 
          };
        }
        return null;
      },
      querySelectorAll: function(selector) {
        if (selector === 'script[type="application/ld+json"]' && html.includes('structured-data-logitech')) {
          return [{
            textContent: '{"@type":"Product","brand":"Logitech"}'
          }];
        }
        return [];
      },
      body: {
        textContent: html
      }
    };
    return doc;
  };
  
  const parser = new AmazonParser();
  
  // Test cases
  const testCases = [
    {
      name: 'Brand from bylineInfo with "Visit the" prefix',
      html: 'Visit the Apple Store',
      expected: 'Apple Store'
    },
    {
      name: 'Brand from bylineInfo with "Brand:" prefix',
      html: 'Brand: Samsung',
      expected: 'Samsung'
    },
    {
      name: 'Brand from meta tag',
      html: 'meta-brand-sony',
      expected: 'Sony'
    },
    {
      name: 'Brand from structured data',
      html: 'structured-data-logitech',
      expected: 'Logitech'
    },
    {
      name: 'No brand information',
      html: 'Product details without brand information',
      expected: null
    }
  ];
  
  let passedTests = 0;
  
  // Run tests
  testCases.forEach((testCase, index) => {
    // Create mock document
    const doc = new DOMParser().parseFromString(testCase.html, 'text/html');
    
    // Extract brand data
    const brandData = parser.parseBrand(doc);
    
    // Check result
    const passed = brandData === testCase.expected;
    
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed) {
      console.log(`  Expected: ${testCase.expected}`);
      console.log(`  Actual: ${brandData}`);
    }
    
    if (passed) passedTests++;
  });
  
  // Restore original function
  global.DOMParser.prototype.parseFromString = originalQuerySelector;
  
  console.log(`Tests completed: ${passedTests}/${testCases.length} passed`);
  return passedTests === testCases.length;
}

// Test cases for sales data parsing
function testSalesDataParsing() {
  console.log('Running sales data parsing tests');
  
  const parser = new AmazonParser();
  
  // Test cases
  const testCases = [
    {
      name: 'Standard sales data format',
      html: '1,234 bought in past month',
      expected: { boughtInPastMonth: 1234, totalVariants: 1 }
    },
    {
      name: 'Sales data with different format',
      html: 'Over 5,000 bought in past month',
      expected: { boughtInPastMonth: 5000, totalVariants: 1 }
    },
    {
      name: 'No sales data',
      html: 'Product details without sales data',
      expected: null
    }
  ];
  
  let passedTests = 0;
  
  // Run tests
  testCases.forEach((testCase, index) => {
    // Extract sales data
    const salesData = parser.extractSalesData(testCase.html);
    
    // Check result
    let passed = false;
    
    if (testCase.expected === null) {
      passed = salesData === null;
    } else if (salesData && testCase.expected) {
      passed = salesData.boughtInPastMonth === testCase.expected.boughtInPastMonth &&
               salesData.totalVariants === testCase.expected.totalVariants;
    }
    
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed) {
      console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`  Actual: ${JSON.stringify(salesData)}`);
    }
    
    if (passed) passedTests++;
  });
  
  console.log(`Tests completed: ${passedTests}/${testCases.length} passed`);
  return passedTests === testCases.length;
}

// Test cases for variant parsing
function testVariantParsing() {
  console.log('Running variant parsing tests');
  
  // Override parseFromString for variant tests
  const originalParseFromString = global.DOMParser.prototype.parseFromString;
  
  global.DOMParser.prototype.parseFromString = function(html, contentType) {
    const doc = {
      querySelector: function() { return null; },
      querySelectorAll: function(selector) {
        if (selector === 'script' && html.includes('twister-data')) {
          return [{
            textContent: 'var dataToReturn = {"asinVariationValues": {"B08N5KWB9H": {}, "B08N5LFLC3": {}}};'
          }];
        }
        if (selector === '#variation_color_name li' && html.includes('variation-elements')) {
          return [
            { getAttribute: function(attr) { return attr === 'data-defaultasin' ? 'B08N5KWB9H' : null; } },
            { getAttribute: function(attr) { return attr === 'data-defaultasin' ? 'B08N5LFLC3' : null; } }
          ];
        }
        return [];
      },
      body: {
        textContent: html
      }
    };
    return doc;
  };
  
  const parser = new AmazonParser();
  
  // Test cases
  const testCases = [
    {
      name: 'Variants from twister data',
      html: 'twister-data',
      expected: [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 0 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 0 }
      ]
    },
    {
      name: 'Variants from variation elements',
      html: 'variation-elements',
      expected: [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 0 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 0 }
      ]
    },
    {
      name: 'No variants',
      html: 'Product details without variants',
      expected: []
    }
  ];
  
  let passedTests = 0;
  
  // Run tests
  testCases.forEach((testCase, index) => {
    // Create mock document
    const doc = new DOMParser().parseFromString(testCase.html, 'text/html');
    
    // Extract variant data
    let variantData;
    if (testCase.html === 'twister-data') {
      variantData = parser.extractTwisterData(doc);
    } else if (testCase.html === 'variation-elements') {
      variantData = parser.parseVariants(doc);
    } else {
      variantData = parser.parseVariants(doc);
    }
    
    // Check result
    let passed = false;
    
    if (testCase.expected.length === 0) {
      passed = variantData.length === 0;
    } else if (variantData && testCase.expected) {
      passed = variantData.length === testCase.expected.length &&
               variantData.every((item, i) => 
                 item.asin === testCase.expected[i].asin
               );
    }
    
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed) {
      console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`  Actual: ${JSON.stringify(variantData)}`);
    }
    
    if (passed) passedTests++;
  });
  
  // Restore original function
  global.DOMParser.prototype.parseFromString = originalParseFromString;
  
  console.log(`Tests completed: ${passedTests}/${testCases.length} passed`);
  return passedTests === testCases.length;
}

// Test cases for sales data aggregation
function testSalesDataAggregation() {
  console.log('Running sales data aggregation tests');
  
  const parser = new AmazonParser();
  
  // Test cases
  const testCases = [
    {
      name: 'Aggregate main product and variants',
      mainSalesData: { boughtInPastMonth: 1000, totalVariants: 1 },
      variants: [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 500 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 300 }
      ],
      expected: { boughtInPastMonth: 1800, totalVariants: 2 }
    },
    {
      name: 'Main product only, no variants',
      mainSalesData: { boughtInPastMonth: 1000, totalVariants: 1 },
      variants: [],
      expected: { boughtInPastMonth: 1000, totalVariants: 0 }
    },
    {
      name: 'Variants only, no main product data',
      mainSalesData: null,
      variants: [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 500 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 300 }
      ],
      expected: { boughtInPastMonth: 800, totalVariants: 2 }
    },
    {
      name: 'No sales data',
      mainSalesData: null,
      variants: [],
      expected: null
    }
  ];
  
  let passedTests = 0;
  
  // Run tests
  testCases.forEach((testCase, index) => {
    // Aggregate sales data
    const aggregatedData = parser.aggregateSalesData(testCase.mainSalesData, testCase.variants);
    
    // Check result
    let passed = false;
    
    if (testCase.expected === null) {
      passed = aggregatedData === null;
    } else if (aggregatedData && testCase.expected) {
      passed = aggregatedData.boughtInPastMonth === testCase.expected.boughtInPastMonth &&
               aggregatedData.totalVariants === testCase.expected.totalVariants;
    }
    
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed) {
      console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`  Actual: ${JSON.stringify(aggregatedData)}`);
    }
    
    if (passed) passedTests++;
  });
  
  console.log(`Tests completed: ${passedTests}/${testCases.length} passed`);
  return passedTests === testCases.length;
}

// Run all parser tests
function runParserTests() {
  console.log('=== Running Amazon Product Parser Tests ===');
  
  const bsrTestsPassed = testBSRParsing();
  const brandTestsPassed = testBrandParsing();
  const salesDataTestsPassed = testSalesDataParsing();
  const variantTestsPassed = testVariantParsing();
  const aggregationTestsPassed = testSalesDataAggregation();
  
  console.log('=== Parser Test Summary ===');
  console.log(`BSR Parsing: ${bsrTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Brand Parsing: ${brandTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Sales Data Parsing: ${salesDataTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Variant Parsing: ${variantTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Sales Data Aggregation: ${aggregationTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Overall: ${
    bsrTestsPassed && 
    brandTestsPassed && 
    salesDataTestsPassed && 
    variantTestsPassed && 
    aggregationTestsPassed ? 'PASSED' : 'FAILED'
  }`);
}

// Export for use in test runners
if (typeof module !== 'undefined') {
  module.exports = {
    testBSRParsing,
    testBrandParsing,
    testSalesDataParsing,
    testVariantParsing,
    testSalesDataAggregation,
    runParserTests
  };
}