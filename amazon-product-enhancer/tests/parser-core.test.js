// Simplified parser tests for core functionality

// Import the parser
const { AmazonParser } = require('../parser.js');

// Create a parser instance
const parser = new AmazonParser();

// Test BSR parsing
console.log('Testing BSR parsing...');
const bsrText = 'Best Sellers Rank: #1,234 in Electronics (See Top 100 in Electronics)';
const bsrData = parser.extractBSRData(bsrText);
console.log('BSR Data:', bsrData);
console.log('BSR Test:', bsrData && bsrData.length === 1 && bsrData[0].rank === 1234 ? 'PASSED' : 'FAILED');

// Test sales data parsing
console.log('\nTesting sales data parsing...');
const salesText = '1,234 bought in past month';
const salesData = parser.extractSalesData(salesText);
console.log('Sales Data:', salesData);
console.log('Sales Test:', salesData && salesData.boughtInPastMonth === 1234 ? 'PASSED' : 'FAILED');

// Test sales data aggregation
console.log('\nTesting sales data aggregation...');
const mainSalesData = { boughtInPastMonth: 1000, totalVariants: 1 };
const variants = [
  { asin: 'B08N5KWB9H', boughtInPastMonth: 500 },
  { asin: 'B08N5LFLC3', boughtInPastMonth: 300 }
];
const aggregatedData = parser.aggregateSalesData(mainSalesData, variants);
console.log('Aggregated Data:', aggregatedData);
console.log('Aggregation Test:', aggregatedData && aggregatedData.boughtInPastMonth === 1800 ? 'PASSED' : 'FAILED');

// Test error handling
console.log('\nTesting error handling...');
const nullResult = parser.extractBSRData(null);
console.log('Null Result:', nullResult);
console.log('Error Handling Test:', nullResult === null ? 'PASSED' : 'FAILED');

// Overall result
console.log('\n=== Core Parser Tests Summary ===');
const allPassed = 
  (bsrData && bsrData.length === 1 && bsrData[0].rank === 1234) &&
  (salesData && salesData.boughtInPastMonth === 1234) &&
  (aggregatedData && aggregatedData.boughtInPastMonth === 1800) &&
  (nullResult === null);
console.log(`Overall: ${allPassed ? 'PASSED' : 'FAILED'}`);