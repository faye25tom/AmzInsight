// Background script for Amazon Product Enhancer

// Initialize default settings if not already set
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['enabled', 'showBSR', 'showASIN', 'showBrand', 'showSalesData'], (result) => {
    if (result.enabled === undefined) {
      chrome.storage.sync.set({
        enabled: true,
        showBSR: true,
        showASIN: true,
        showBrand: true,
        showSalesData: true,
        cacheExpiry: 24, // hours
        maxConcurrentRequests: 3
      });
    }
  });
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fetchProductDetails') {
    // Check cache first
    chrome.storage.local.get([message.asin], (result) => {
      const cachedData = result[message.asin];
      
      if (cachedData && isDataValid(cachedData)) {
        // Return cached data if valid
        sendResponse({ success: true, data: cachedData.data });
      } else {
        // Fetch fresh data
        fetchProductPage(message.url)
          .then(html => {
            // Parse the HTML to extract product details
            const productData = parseProductData(html, message.asin);
            
            // Cache the data
            const cacheEntry = {
              data: productData,
              timestamp: Date.now()
            };
            
            const cacheUpdate = {};
            cacheUpdate[message.asin] = cacheEntry;
            chrome.storage.local.set(cacheUpdate);
            
            // Send response back to content script
            sendResponse({ success: true, data: productData });
          })
          .catch(error => {
            sendResponse({ success: false, error: error.message });
          });
      }
    });
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});

// Check if cached data is still valid
function isDataValid(cachedEntry) {
  return chrome.storage.sync.get(['cacheExpiry'], (result) => {
    const expiryHours = result.cacheExpiry || 24;
    const expiryMs = expiryHours * 60 * 60 * 1000;
    return (Date.now() - cachedEntry.timestamp) < expiryMs;
  });
}

// Fetch product page HTML
async function fetchProductPage(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error('Error fetching product page:', error);
    throw error;
  }
}

// Import the parser
importScripts('parser.js');

// Parse product data from HTML
function parseProductData(html, asin) {
  try {
    const parser = new AmazonParser();
    return parser.parseProductPage(html, asin);
  } catch (error) {
    console.error('Error parsing product data:', error);
    return {
      asin: asin,
      bsr: null,
      brand: null,
      salesData: null,
      lastUpdated: new Date().toISOString(),
      error: error.message
    };
  }
}