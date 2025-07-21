// Test runner for Amazon Product Enhancer

// Import test modules
const { runAllTests } = require('./product-identification.test.js');
const { runParserTests } = require('./parser.test.js');
const { runBackgroundTests } = require('./background.test.js');
const { runCommunicationTests } = require('./communication.test.js');

// Function to run specific test file
function runTests(testFile) {
  try {
    console.log(`Running tests from ${testFile}...`);
    require(`./${testFile}`);
  } catch (error) {
    console.error(`Error running tests from ${testFile}:`, error);
  }
}

// Run all tests if no specific test file is provided
function runAllTestSuites() {
  console.log('Starting Amazon Product Enhancer tests...');
  console.log('\n=== Product Identification Tests ===');
  runAllTests();

  console.log('\n=== Parser Tests ===');
  runParserTests();

  console.log('\n=== Background Script Tests ===');
  runBackgroundTests();
  
  console.log('\n=== Cache Manager Tests ===');
  runTests('cache-manager.test.js');
  
  console.log('\n=== Communication Integration Tests ===');
  runCommunicationTests();
}

// If this file is being run directly, run all tests
if (require.main === module) {
  runAllTestSuites();
}

// Export the runTests function for individual test runners
module.exports = {
  runTests,
  runAllTestSuites
};