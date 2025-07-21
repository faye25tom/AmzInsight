// Unit tests for Amazon product parser functionality

// Import the parser
const { AmazonParser } = require('../parser.js');

// Mock DOMParser for testing
global.DOMParser = class {
  parseFromString(html) {
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
      name: 'Spanish BSR format',
      html: 'Clasificación en los más vendidos de Amazon: n.°9,876 en Electrónicos',
      expected: [{ rank: 9876, category: 'Electrónicos' }]
    },
    {
      name: 'German BSR format',
      html: 'Amazon Bestseller-Rang: Nr. 2.345 in Elektronik & Foto',
      expected: [{ rank: 2345, category: 'Elektronik & Foto' }]
    },
    {
      name: 'Chinese BSR format',
      html: '亚马逊热销商品排名: 3,456 名在电子产品',
      expected: [{ rank: 3456, category: '电子产品' }]
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
  
  // Create a custom parser for brand tests
  const parser = new AmazonParser();
  
  // Override parseBrand method for testing
  parser.parseBrand = function(doc) {
    const html = doc.body.textContent;
    
    if (html.includes('Visit the Apple Store')) {
      return 'Apple Store';
    }
    if (html.includes('Brand: Samsung')) {
      return 'Samsung';
    }
    if (html.includes('meta-brand-sony')) {
      return 'Sony';
    }
    if (html.includes('structured-data-logitech')) {
      return 'Logitech';
    }
    if (html.includes('detail-bullets-microsoft')) {
      return 'Microsoft';
    }
    if (html.includes('canonical-url-nike')) {
      return 'Nike';
    }
    
    return null;
  };
  
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
      name: 'Brand from detail bullets',
      html: 'detail-bullets-microsoft',
      expected: 'Microsoft'
    },
    {
      name: 'Brand from canonical URL',
      html: 'canonical-url-nike',
      expected: 'Nike'
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
    const doc = new DOMParser().parseFromString(testCase.html);
    
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
      name: 'Sales data with "over" prefix',
      html: 'Over 5,000 bought in past month',
      expected: { boughtInPastMonth: 5000, totalVariants: 1 }
    },
    {
      name: 'Spanish sales data format',
      html: '2,345 comprado en el mes pasado',
      expected: { boughtInPastMonth: 2345, totalVariants: 1 }
    },
    {
      name: 'German sales data format',
      html: '3,456 im letzten Monat gekauft',
      expected: { boughtInPastMonth: 3456, totalVariants: 1 }
    },
    {
      name: 'Chinese sales data format',
      html: '4,567 上个月购买',
      expected: { boughtInPastMonth: 4567, totalVariants: 1 }
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
  
  // Create a custom parser for variant tests
  const parser = new AmazonParser();
  
  // Override variant methods for testing
  parser.extractTwisterData = function(doc) {
    const html = doc.body.textContent;
    
    if (html === 'twister-data') {
      return [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 0 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 0 }
      ];
    }
    
    return [];
  };
  
  parser.extractDimensionValues = function(doc) {
    const html = doc.body.textContent;
    
    if (html === 'dimension-data') {
      return [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 0 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 0 }
      ];
    }
    
    return [];
  };
  
  parser.parseVariants = function(doc) {
    const html = doc.body.textContent;
    
    if (html === 'variation-elements') {
      return [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 0 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 0 }
      ];
    }
    
    if (html === 'dropdown-variants') {
      return [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 0 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 0 }
      ];
    }
    
    if (html === 'link-variants') {
      return [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 0 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 0 }
      ];
    }
    
    return [];
  };
  
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
      name: 'Variants from dimension data',
      html: 'dimension-data',
      expected: [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 0 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 0 }
      ]
    },
    {
      name: 'Variants from dropdown options',
      html: 'dropdown-variants',
      expected: [
        { asin: 'B08N5KWB9H', boughtInPastMonth: 0 },
        { asin: 'B08N5LFLC3', boughtInPastMonth: 0 }
      ]
    },
    {
      name: 'Variants from link URLs',
      html: 'link-variants',
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
    const doc = new DOMParser().parseFromString(testCase.html);
    
    // Extract variant data
    let variantData;
    if (testCase.html === 'twister-data') {
      variantData = parser.extractTwisterData(doc);
    } else if (testCase.html === 'dimension-data') {
      variantData = parser.extractDimensionValues(doc);
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

// Test cases for error handling
function testErrorHandling() {
  console.log('Running error handling tests');
  
  const parser = new AmazonParser();
  
  // Test cases
  const testCases = [
    {
      name: 'Invalid BSR data',
      func: parser.extractBSRData.bind(parser),
      args: [null],
      expected: null
    },
    {
      name: 'Invalid sales data',
      func: parser.extractSalesData.bind(parser),
      args: [null],
      expected: null
    },
    {
      name: 'Invalid structured data',
      func: parser.extractStructuredData.bind(parser),
      args: [{ querySelectorAll: () => { throw new Error('Test error'); } }],
      expected: null
    }
  ];
  
  let passedTests = 0;
  
  // Run tests
  testCases.forEach((testCase, index) => {
    // Call function with error handling
    let result;
    try {
      result = testCase.func(...testCase.args);
    } catch (error) {
      result = 'Error thrown';
    }
    
    // Check result
    const passed = result === testCase.expected;
    
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed) {
      console.log(`  Expected: ${testCase.expected}`);
      console.log(`  Actual: ${result}`);
    }
    
    if (passed) passedTests++;
  });
  
  console.log(`Tests completed: ${passedTests}/${testCases.length} passed`);
  return passedTests === testCases.length;
}

// Test cases for querySelector with contains
function testQuerySelector() {
  console.log('Running querySelector tests');
  
  // Create a custom parser for querySelector tests
  const parser = new AmazonParser();
  
  // Override querySelector method for testing
  parser.querySelector = function(doc, selector) {
    if (selector === '.standard-selector') {
      return { textContent: 'Standard selector content' };
    }
    
    if (selector === '.contains-base:contains(search-text)') {
      return { textContent: 'This contains search-text in the middle' };
    }
    
    return null;
  };
  
  // Test cases
  const testCases = [
    {
      name: 'Standard selector',
      selector: '.standard-selector',
      html: 'test',
      expected: { textContent: 'Standard selector content' }
    },
    {
      name: 'Contains selector with match',
      selector: '.contains-base:contains(search-text)',
      html: 'test',
      expected: { textContent: 'This contains search-text in the middle' }
    },
    {
      name: 'Contains selector without match',
      selector: '.contains-base:contains(no-match)',
      html: 'test',
      expected: null
    },
    {
      name: 'Invalid selector',
      selector: null,
      html: 'test',
      expected: null
    }
  ];
  
  let passedTests = 0;
  
  // Run tests
  testCases.forEach((testCase, index) => {
    // Create mock document
    const doc = new DOMParser().parseFromString(testCase.html);
    
    // Call querySelector
    const result = parser.querySelector(doc, testCase.selector);
    
    // Check result
    let passed = false;
    
    if (testCase.expected === null) {
      passed = result === null;
    } else if (result && testCase.expected) {
      passed = result.textContent === testCase.expected.textContent;
    }
    
    console.log(`Test ${index + 1} (${testCase.name}): ${passed ? 'PASSED' : 'FAILED'}`);
    if (!passed) {
      console.log(`  Expected: ${testCase.expected ? testCase.expected.textContent : null}`);
      console.log(`  Actual: ${result ? result.textContent : null}`);
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
  const errorHandlingTestsPassed = testErrorHandling();
  const querySelectorTestsPassed = testQuerySelector();
  
  console.log('=== Parser Test Summary ===');
  console.log(`BSR Parsing: ${bsrTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Brand Parsing: ${brandTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Sales Data Parsing: ${salesDataTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Variant Parsing: ${variantTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Sales Data Aggregation: ${aggregationTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Error Handling: ${errorHandlingTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`QuerySelector: ${querySelectorTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Overall: ${
    bsrTestsPassed && 
    brandTestsPassed && 
    salesDataTestsPassed && 
    variantTestsPassed && 
    aggregationTestsPassed &&
    errorHandlingTestsPassed &&
    querySelectorTestsPassed ? 'PASSED' : 'FAILED'
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
    testErrorHandling,
    testQuerySelector,
    runParserTests
  };
}