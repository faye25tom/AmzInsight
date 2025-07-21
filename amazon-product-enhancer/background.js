/**
 * Background script for Amazon Product Enhancer
 * 
 * This script handles:
 * - Message processing from content scripts
 * - Cross-domain HTTP requests to fetch Amazon product pages
 * - Data parsing and caching
 * - Request queue management and concurrency control
 * - Error handling and retry mechanism
 */

// Import the parser, cache manager, and error handler
importScripts('parser.js');
importScripts('cache-manager.js');
importScripts('error-handling.js');

// Background service class
class BackgroundService {
  constructor() {
    this.settings = {
      enabled: true,
      showBSR: true,
      showASIN: true,
      showBrand: true,
      showSalesData: true,
      cacheExpiry: 24, // hours
      maxConcurrentRequests: 3,
      maxRetries: 2,
      retryDelay: 2000, // ms
      maxCacheSize: 500, // maximum number of items to store
      cleanupThreshold: 0.9, // cleanup when cache reaches 90% of max size
      cleanupRatio: 0.3, // remove 30% of oldest items during cleanup
      debugMode: false, // debug mode for error handler
      errorReportEndpoint: null // endpoint for error reporting
    };
    
    // Request queue and active requests tracking
    this.requestQueue = [];
    this.activeRequests = 0;
    this.processingQueue = false;
    
    // Initialize cache manager
    this.cacheManager = new CacheManager();
    
    // Initialize error handler
    this.errorHandler = new ErrorHandler();
    
    // Initialize event listeners
    this.initEventListeners();
  }
  
  // Initialize event listeners
  initEventListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));
    
    // Handle messages from content scripts
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }
  
  // Handle extension installation
  handleInstalled() {
    // Initialize default settings if not already set
    chrome.storage.sync.get([
      'enabled', 
      'showBSR', 
      'showASIN', 
      'showBrand', 
      'showSalesData',
      'cacheExpiry',
      'maxConcurrentRequests',
      'maxRetries',
      'retryDelay',
      'maxCacheSize',
      'cleanupThreshold',
      'cleanupRatio',
      'debugMode',
      'enableGlobalErrorHandler',
      'showUserFriendlyErrors',
      'enableErrorReporting',
      'errorReportEndpoint'
    ], (result) => {
      if (result.enabled === undefined) {
        chrome.storage.sync.set(this.settings);
        console.log('Default settings initialized');
      } else {
        // Update our settings with stored values
        this.settings = {...this.settings, ...result};
        console.log('Settings loaded from storage');
      }
      
      // Update cache manager settings
      this.cacheManager.updateSettings({
        cacheExpiry: this.settings.cacheExpiry,
        maxCacheSize: this.settings.maxCacheSize,
        cleanupThreshold: this.settings.cleanupThreshold,
        cleanupRatio: this.settings.cleanupRatio
      });
      
      // Initialize error handler with settings
      this.errorHandler.init({
        debugMode: this.settings.debugMode || false,
        maxRetries: this.settings.maxRetries || 3,
        retryDelays: [this.settings.retryDelay || 2000, 
                     (this.settings.retryDelay || 2000) * 2, 
                     (this.settings.retryDelay || 2000) * 4],
        enableGlobalErrorHandler: this.settings.enableGlobalErrorHandler || false,
        errorReportEndpoint: this.settings.enableErrorReporting ? 
                            (this.settings.errorReportEndpoint || null) : null
      });
      
      console.log('Error handler initialized with settings');
    });
  }
  
  // Handle messages from content scripts
  handleMessage(message, sender, sendResponse) {
    const tabId = sender.tab ? sender.tab.id : 'unknown';
    console.log(`Received message from tab ${tabId}:`, message.type);
    
    // Track message receipt time for performance monitoring
    const receiptTime = Date.now();
    const messageLatency = message.timestamp ? (receiptTime - message.timestamp) : null;
    
    if (messageLatency !== null && messageLatency > 1000) {
      console.warn(`High message latency detected: ${messageLatency}ms for ${message.type}`);
    }
    
    try {
      switch (message.type) {
        case 'fetchProductDetails':
          this.handleFetchProductDetails(message, sender, (response) => {
            // Add performance metrics to response
            if (response) {
              response.metrics = {
                processingTime: Date.now() - receiptTime,
                totalTime: message.timestamp ? (Date.now() - message.timestamp) : null
              };
            }
            sendResponse(response);
          });
          return true; // Keep the message channel open for async response
          
        case 'clearCache':
          this.clearCache(sendResponse);
          return true;
          
        case 'getSettings':
          this.getSettings(sendResponse);
          return true;
          
        case 'updateSettings':
          this.updateSettings(message.settings, sendResponse);
          return true;
          
        case 'getCacheStats':
          this.getCacheStats(sendResponse);
          return true;
          
        case 'clearCacheForAsin':
          this.clearCacheForAsin(message.asin, sendResponse);
          return true;
          
        case 'getErrorLog':
          this.getErrorLog(sendResponse);
          return true;
          
        case 'clearErrorLog':
          this.clearErrorLog(sendResponse);
          return true;
          
        case 'ping':
          // Simple ping-pong for connection testing
          sendResponse({ success: true, pong: Date.now() });
          return false;
          
        default:
          console.warn(`Unknown message type from tab ${tabId}:`, message.type);
          sendResponse({ 
            success: false, 
            error: 'Unknown message type',
            receivedMessage: message.type
          });
          return false;
      }
    } catch (error) {
      console.error(`Error handling message ${message.type}:`, error);
      sendResponse({ 
        success: false, 
        error: `Internal error: ${error.message}`,
        errorType: 'message_handling_error'
      });
      return false;
    }
  }
  
  // Handle fetch product details request
  async handleFetchProductDetails(message, sender, sendResponse) {
    const { asin, url } = message;
    
    try {
      // First check if we have valid cached data
      const cachedData = await this.getCachedData(asin);
      
      if (cachedData) {
        console.log(`Using cached data for ASIN: ${asin}`);
        sendResponse({ success: true, data: cachedData, fromCache: true });
        return;
      }
      
      // Add to queue if we're at max concurrent requests
      if (this.activeRequests >= this.settings.maxConcurrentRequests) {
        console.log(`Queueing request for ASIN: ${asin}, queue length: ${this.requestQueue.length}`);
        this.requestQueue.push({
          asin,
          url,
          sendResponse,
          retries: 0
        });
        
        // Start processing the queue if not already
        if (!this.processingQueue) {
          this.processQueue();
        }
        return;
      }
      
      // Otherwise process immediately
      this.activeRequests++;
      this.fetchAndProcessProduct(asin, url, 0, sendResponse);
      
    } catch (error) {
      console.error('Error handling fetch product details:', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'Unknown error',
        asin: asin
      });
    }
  }
  
  // Process the request queue
  async processQueue() {
    if (this.requestQueue.length === 0 || this.processingQueue) {
      return;
    }
    
    this.processingQueue = true;
    
    while (this.requestQueue.length > 0 && this.activeRequests < this.settings.maxConcurrentRequests) {
      const request = this.requestQueue.shift();
      this.activeRequests++;
      
      // Process this request
      this.fetchAndProcessProduct(
        request.asin,
        request.url,
        request.retries,
        request.sendResponse
      );
    }
    
    this.processingQueue = false;
  }
  
  // Fetch and process product data
  async fetchAndProcessProduct(asin, url, retries, sendResponse) {
    const startTime = Date.now();
    
    try {
      this.errorHandler.log(`Fetching product data for ASIN: ${asin}, attempt ${retries + 1}`, 'info', 'fetch');
      
      // Create an abort controller for the fetch request
      const controller = new AbortController();
      const signal = controller.signal;
      
      // Set a timeout for the entire operation
      const operationTimeout = setTimeout(() => {
        controller.abort();
      }, 20000); // 20 second timeout
      
      try {
        // Fetch the product page
        const html = await this.fetchProductPage(url, retries, signal);
        
        // Clear the operation timeout
        clearTimeout(operationTimeout);
        
        // Parse the HTML to extract product details
        this.errorHandler.log(`Parsing data for ASIN: ${asin}`, 'info', 'parse');
        const productData = this.parseProductData(html, asin);
        
        // Add metadata to the product data
        productData.metadata = {
          fetchTime: Date.now() - startTime,
          fetchDate: new Date().toISOString(),
          source: url,
          retryCount: retries
        };
        
        // Cache the data
        await this.cacheProductData(asin, productData);
        
        // Send response back to content script
        this.errorHandler.log(`Successfully processed ASIN: ${asin} in ${Date.now() - startTime}ms`, 'info', 'success');
        sendResponse({ 
          success: true, 
          data: productData,
          processingTime: Date.now() - startTime
        });
      } catch (error) {
        // Clear the operation timeout if it exists
        clearTimeout(operationTimeout);
        throw error; // Re-throw to be handled by the outer try-catch
      }
      
    } catch (error) {
      // Use error handler to standardize the error
      const errorInfo = this.errorHandler.handleNetworkError(error, `fetch-${asin}`);
      
      // Retry if we haven't exceeded max retries and error is recoverable
      if (retries < this.settings.maxRetries && errorInfo.recoverable) {
        this.errorHandler.log(`Retrying ASIN: ${asin}, attempt ${retries + 1} of ${this.settings.maxRetries}`, 'info', 'retry');
        
        // Calculate delay based on retry strategy
        let delay = this.settings.retryDelay;
        if (errorInfo.retryStrategy === 'exponential') {
          delay = this.settings.retryDelay * Math.pow(2, retries);
        } else if (errorInfo.retryStrategy === 'linear') {
          delay = this.settings.retryDelay * (retries + 1);
        }
        
        // Add back to queue with incremented retry count
        setTimeout(() => {
          this.requestQueue.unshift({
            asin,
            url,
            sendResponse,
            retries: retries + 1
          });
          
          this.activeRequests--;
          this.processQueue();
        }, delay);
        
        return;
      }
      
      // Send error response if we've exhausted retries or error is not recoverable
      sendResponse({ 
        success: false, 
        error: errorInfo.userMessage,
        errorType: errorInfo.type,
        technicalMessage: errorInfo.technicalMessage,
        recoverable: errorInfo.recoverable,
        asin: asin,
        retries: retries,
        processingTime: Date.now() - startTime
      });
      
      // Log the failure for monitoring
      this.errorHandler.log(`Failed to process ASIN: ${asin} after ${retries + 1} attempts. Error: ${errorInfo.technicalMessage}`, 'error', 'fetch-failure');
      
      this.activeRequests--;
      this.processQueue();
    }
  }
  
  // Fetch product page HTML with timeout and error handling
  async fetchProductPage(url, retryCount = 0, externalSignal = null) {
    const timeout = 10000 + (retryCount * 5000); // Increase timeout with each retry
    
    try {
      // Create abort controller if not provided externally
      const controller = externalSignal ? null : new AbortController();
      const signal = externalSignal || controller?.signal;
      
      // Set timeout only if we created our own controller
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeout) : null;
      
      console.log(`Fetching URL: ${url} (timeout: ${timeout}ms)`);
      const fetchStartTime = Date.now();
      
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      // Clear our timeout if we set one
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      console.log(`Fetch completed in ${Date.now() - fetchStartTime}ms with status ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Check if we got a valid HTML response
      if (!html) {
        throw new Error('Empty response received');
      }
      
      if (html.length < 1000) {
        throw new Error('Response too small, likely not a valid product page');
      }
      
      if (!html.includes('<html')) {
        throw new Error('Invalid HTML response received');
      }
      
      // Check for captcha or other blocking mechanisms
      if (html.includes('captcha') && html.includes('robot')) {
        throw new Error('Access blocked - CAPTCHA detected');
      }
      
      // Check for "page not found"
      if (html.includes('page you requested could not be found') || 
          html.includes('404') && html.includes('not found')) {
        throw new Error('Product page not found (404)');
      }
      
      console.log(`Successfully fetched HTML content (${html.length} bytes)`);
      return html;
      
    } catch (error) {
      console.error('Error fetching product page:', error);
      
      // Customize error message based on error type
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      } else if (error.message.includes('NetworkError') || error.message.includes('network')) {
        throw new Error('Network error, check your connection');
      } else if (error.message.includes('CAPTCHA')) {
        throw new Error('Access blocked - CAPTCHA verification required');
      } else if (error.message.includes('404') || error.message.includes('not found')) {
        throw new Error('Product page not found');
      } else {
        throw error;
      }
    }
  }
  
  // Parse product data from HTML
  parseProductData(html, asin) {
    try {
      const parser = new AmazonParser();
      return parser.parseProductPage(html, asin);
    } catch (error) {
      // Log the parsing error
      this.errorHandler.log(`Error parsing product data for ASIN ${asin}: ${error.message}`, 'error', 'parsing');
      
      // Create a fallback data structure with graceful degradation
      const fallbackData = {
        asin: asin,
        lastUpdated: new Date().toISOString(),
        error: error.message,
        parsingError: true
      };
      
      // Try to extract partial data if possible
      try {
        // Try to extract brand with graceful degradation
        try {
          fallbackData.brand = parser.extractBrand(html) || this.errorHandler.handleGracefulDegradation(error, 'brand');
        } catch (brandError) {
          fallbackData.brand = this.errorHandler.handleGracefulDegradation(brandError, 'brand');
        }
        
        // Try to extract BSR with graceful degradation
        try {
          fallbackData.bsr = parser.extractBSR(html) || this.errorHandler.handleGracefulDegradation(error, 'bsr');
        } catch (bsrError) {
          fallbackData.bsr = this.errorHandler.handleGracefulDegradation(bsrError, 'bsr');
        }
        
        // Try to extract sales data with graceful degradation
        try {
          fallbackData.salesData = parser.extractSalesData(html) || this.errorHandler.handleGracefulDegradation(error, 'salesData');
        } catch (salesError) {
          fallbackData.salesData = this.errorHandler.handleGracefulDegradation(salesError, 'salesData');
        }
        
        // Try to extract variants with graceful degradation
        try {
          fallbackData.variants = parser.extractVariants(html) || this.errorHandler.handleGracefulDegradation(error, 'variants');
        } catch (variantsError) {
          fallbackData.variants = this.errorHandler.handleGracefulDegradation(variantsError, 'variants');
        }
      } catch (fallbackError) {
        // If all else fails, use completely empty data structure
        this.errorHandler.log(`Failed to extract any partial data: ${fallbackError.message}`, 'error', 'parsing-fallback');
      }
      
      // Report the parsing error for monitoring
      this.errorHandler.reportError({
        type: 'parsing_error',
        message: error.message,
        asin: asin,
        timestamp: new Date().toISOString()
      });
      
      return fallbackData;
    }
  }
  
  // Get cached data if valid - using cache manager
  async getCachedData(asin) {
    return await this.cacheManager.getCachedData(asin);
  }
  
  // Cache product data - using cache manager
  async cacheProductData(asin, data) {
    await this.cacheManager.cacheProductData(asin, data);
    
    // Decrement active requests and process queue
    this.activeRequests--;
    this.processQueue();
  }
  
  // Clear cache
  clearCache(sendResponse) {
    this.cacheManager.clearCache().then(() => {
      console.log('Cache cleared');
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error clearing cache:', error);
      sendResponse({ success: false, error: error.message });
    });
  }
  
  // Get current settings
  getSettings(sendResponse) {
    chrome.storage.sync.get(null, (settings) => {
      this.settings = {...this.settings, ...settings};
      sendResponse({ success: true, settings: this.settings });
    });
  }
  
  // Update settings
  updateSettings(newSettings, sendResponse) {
    chrome.storage.sync.set(newSettings, () => {
      this.settings = {...this.settings, ...newSettings};
      console.log('Settings updated:', this.settings);
      
      // Update cache manager settings if cache-related settings were changed
      const cacheSettings = {};
      if (newSettings.cacheExpiry !== undefined) {
        cacheSettings.cacheExpiry = newSettings.cacheExpiry;
      }
      if (newSettings.maxCacheSize !== undefined) {
        cacheSettings.maxCacheSize = newSettings.maxCacheSize;
      }
      if (newSettings.cleanupThreshold !== undefined) {
        cacheSettings.cleanupThreshold = newSettings.cleanupThreshold;
      }
      if (newSettings.cleanupRatio !== undefined) {
        cacheSettings.cleanupRatio = newSettings.cleanupRatio;
      }
      
      if (Object.keys(cacheSettings).length > 0) {
        this.cacheManager.updateSettings(cacheSettings);
      }
      
      sendResponse({ success: true, settings: this.settings });
    });
  }
  
  // Get cache statistics
  async getCacheStats(sendResponse) {
    try {
      const stats = await this.cacheManager.getCacheStats();
      sendResponse({ success: true, stats });
    } catch (error) {
      this.errorHandler.log('Error getting cache stats: ' + error.message, 'error', 'cache');
      sendResponse({ success: false, error: error.message });
    }
  }
  
  // Clear cache for a specific ASIN
  async clearCacheForAsin(asin, sendResponse) {
    try {
      await this.cacheManager.removeCachedItem(asin);
      this.errorHandler.log(`Cache cleared for ASIN: ${asin}`, 'info', 'cache');
      sendResponse({ success: true });
    } catch (error) {
      this.errorHandler.log(`Error clearing cache for ASIN ${asin}: ${error.message}`, 'error', 'cache');
      sendResponse({ success: false, error: error.message });
    }
  }
  
  // Get error log
  getErrorLog(sendResponse) {
    try {
      const errorLog = this.errorHandler.getErrorLog();
      sendResponse({ success: true, errorLog });
    } catch (error) {
      console.error('Error getting error log:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  // Clear error log
  clearErrorLog(sendResponse) {
    try {
      this.errorHandler.clearErrorLog();
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error clearing error log:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
}

// Initialize the background service
const backgroundService = new BackgroundService();
console.log('Amazon Product Enhancer background service initialized');