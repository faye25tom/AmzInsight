// Test runner for Amazon Product Enhancer

// Import test modules
const { runAllTests } = require('./product-identification.test.js');
const { runParserTests } = require('./parser.test.js');

// Run all tests
console.log('Starting Amazon Product Enhancer tests...');
console.log('\n=== Product Identification Tests ===');
runAllTests();

console.log('\n=== Parser Tests ===');
runParserTests();