/**
 * Performance Optimizer for Amazon Product Enhancer
 * 
 * This module provides:
 * - Request throttling and debouncing mechanisms
 * - DOM operation optimization to reduce page reflows
 * - Memory usage monitoring and cleanup
 * - Smart caching strategies
 * - Performance metrics collection and reporting
 */

class PerformanceOptimizer {
  constructor() {
    this.settings = {
      // Throttling and debouncing settings
      requestThrottleDelay: 300, // ms between requests
      domDebounceDelay: 150,     // ms to wait before processing DOM changes
      scrollThrottleDelay: 200,  // ms between scroll event processing
      
      // Memory management settings
      memoryCheckInterval: 60000, // Check memory usage every minute
      memoryThreshold: 50,        // MB threshold for cleanup
      
      // DOM optimization settings
      batchSize: 5,               // Number of elements to process in a batch
      batchDelay: 50,             // ms delay between batches
      useRequestIdleCallback: true, // Use requestIdleCallback when available
      
      // Cache optimization settings
      adaptiveCacheExpiry: true,  // Adjust cache expiry based on usage patterns
      priorityItems: [],          // ASINs to prioritize in cache
      
      // Performance monitoring
      collectMetrics: true,       // Whether to collect performance metrics
      metricsReportThreshold: 50, // Report metrics after this many samples
      slowOperationThreshold: 500 // ms threshold to consider an operation slow
    };
    
    // Performance metrics storage
    this.metrics = {
      requestTimes: [],
      renderTimes: [],
      parseTimings: [],
      domOperations: [],
      memoryUsage: []
    };
    
    // Throttle and debounce function storage
    this.throttledFunctions = new Map();
    this.debouncedFunctions = new Map();
    this.pendingBatches = new Map();
    
    // Memory monitoring
    this.memoryCheckTimer = null;
    
    // DOM mutation batching
    this.pendingMutations = [];
    this.isBatchProcessing = false;
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the performance optimizer
   */
  init() {
    // Start memory monitoring if supported
    this.startMemoryMonitoring();
    
    // Log initialization
    console.log('Performance Optimizer initialized');
  }
  
  /**
   * Update settings
   * @param {Object} newSettings - New settings to apply
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    console.log('Performance Optimizer settings updated:', this.settings);
    
    // Restart memory monitoring with new settings
    this.startMemoryMonitoring();
  }
  
  /**
   * Create a throttled version of a function
   * @param {Function} func - Function to throttle
   * @param {number} limit - Throttle limit in ms
   * @param {string} key - Optional key to identify this throttled function
   * @returns {Function} Throttled function
   */
  throttle(func, limit = this.settings.requestThrottleDelay, key = null) {
    // If we already have this function throttled with the same key, return it
    if (key && this.throttledFunctions.has(key)) {
      return this.throttledFunctions.get(key);
    }
    
    let lastCall = 0;
    let lastCallArgs = null;
    let lastCallThis = null;
    let timeout = null;
    
    const throttled = function(...args) {
      const now = Date.now();
      const context = this;
      
      // Store the latest arguments and context
      lastCallArgs = args;
      lastCallThis = context;
      
      // If enough time has passed since last call, execute immediately
      if (now - lastCall >= limit) {
        lastCall = now;
        return func.apply(context, args);
      }
      
      // Otherwise, schedule execution
      if (!timeout) {
        timeout = setTimeout(() => {
          lastCall = Date.now();
          timeout = null;
          func.apply(lastCallThis, lastCallArgs);
        }, limit - (now - lastCall));
      }
    };
    
    // Store the throttled function if a key was provided
    if (key) {
      this.throttledFunctions.set(key, throttled);
    }
    
    return throttled;
  }
  
  /**
   * Create a debounced version of a function
   * @param {Function} func - Function to debounce
   * @param {number} wait - Debounce wait time in ms
   * @param {boolean} immediate - Whether to execute on the leading edge
   * @param {string} key - Optional key to identify this debounced function
   * @returns {Function} Debounced function
   */
  debounce(func, wait = this.settings.domDebounceDelay, immediate = false, key = null) {
    // If we already have this function debounced with the same key, return it
    if (key && this.debouncedFunctions.has(key)) {
      return this.debouncedFunctions.get(key);
    }
    
    let timeout;
    
    const debounced = function(...args) {
      const context = this;
      const later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      
      if (callNow) func.apply(context, args);
    };
    
    // Store the debounced function if a key was provided
    if (key) {
      this.debouncedFunctions.set(key, debounced);
    }
    
    return debounced;
  }
  
  /**
   * Process DOM operations in batches to reduce reflows
   * @param {Array} elements - Elements to process
   * @param {Function} processFunc - Function to process each element
   * @param {string} batchId - Identifier for this batch operation
   * @param {number} batchSize - Size of each batch
   * @param {number} delay - Delay between batches
   * @returns {Promise} Promise that resolves when all batches are processed
   */
  batchDomOperations(elements, processFunc, batchId, batchSize = this.settings.batchSize, delay = this.settings.batchDelay) {
    // Cancel any existing batch with the same ID
    if (this.pendingBatches.has(batchId)) {
      const { timeoutId } = this.pendingBatches.get(batchId);
      clearTimeout(timeoutId);
    }
    
    return new Promise((resolve) => {
      const items = Array.from(elements);
      const totalItems = items.length;
      let processedItems = 0;
      
      const processBatch = () => {
        // Process a batch of items
        const batch = items.splice(0, batchSize);
        
        if (batch.length === 0) {
          // All items processed
          this.pendingBatches.delete(batchId);
          resolve(processedItems);
          return;
        }
        
        // Use requestAnimationFrame to align with browser's render cycle
        requestAnimationFrame(() => {
          // Process each item in the batch
          batch.forEach(item => {
            try {
              processFunc(item);
              processedItems++;
            } catch (error) {
              console.error('Error processing batch item:', error);
            }
          });
          
          // Schedule next batch
          const timeoutId = setTimeout(() => {
            // Use requestIdleCallback if available and enabled
            if (this.settings.useRequestIdleCallback && window.requestIdleCallback) {
              window.requestIdleCallback(() => processBatch(), { timeout: 1000 });
            } else {
              processBatch();
            }
          }, delay);
          
          // Store the timeout ID
          this.pendingBatches.set(batchId, { timeoutId, total: totalItems, processed: processedItems });
        });
      };
      
      // Start processing
      processBatch();
    });
  }
  
  /**
   * Optimize DOM mutations by batching and using document fragments
   * @param {Function} mutationHandler - Function to handle mutations
   * @param {Array} mutations - Mutation records
   * @param {string} context - Context identifier
   */
  optimizeDomMutations(mutationHandler, mutations, context) {
    // Add mutations to pending queue
    this.pendingMutations.push(...mutations);
    
    // If already processing a batch, just return
    if (this.isBatchProcessing) {
      return;
    }
    
    // Mark as processing
    this.isBatchProcessing = true;
    
    // Process mutations in the next animation frame
    requestAnimationFrame(() => {
      // Create a document fragment for batch DOM operations
      const fragment = document.createDocumentFragment();
      
      // Get all pending mutations
      const batchMutations = [...this.pendingMutations];
      this.pendingMutations = [];
      
      // Start performance measurement
      const startTime = performance.now();
      
      try {
        // Process mutations
        mutationHandler(batchMutations, fragment, context);
        
        // Record performance metrics
        if (this.settings.collectMetrics) {
          const duration = performance.now() - startTime;
          this.metrics.domOperations.push({
            type: 'mutation',
            context,
            count: batchMutations.length,
            duration,
            timestamp: Date.now()
          });
          
          // Log slow operations
          if (duration > this.settings.slowOperationThreshold) {
            console.warn(`Slow DOM mutation processing: ${duration.toFixed(2)}ms for ${batchMutations.length} mutations in ${context}`);
          }
        }
      } catch (error) {
        console.error('Error processing DOM mutations:', error);
      } finally {
        // Mark as no longer processing
        this.isBatchProcessing = false;
      }
    });
  }
  
  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    // Clear existing timer if any
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
    }
    
    // Skip if memory API not available
    if (!this.isMemoryAPIAvailable()) {
      console.log('Memory API not available, skipping memory monitoring');
      return;
    }
    
    // Start periodic memory checks
    this.memoryCheckTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, this.settings.memoryCheckInterval);
    
    console.log('Memory monitoring started');
  }
  
  /**
   * Check if memory API is available
   * @returns {boolean} Whether memory API is available
   */
  isMemoryAPIAvailable() {
    return (
      window.performance && 
      window.performance.memory && 
      typeof window.performance.memory.usedJSHeapSize === 'number'
    );
  }
  
  /**
   * Check memory usage and perform cleanup if necessary
   */
  checkMemoryUsage() {
    // Skip if memory API not available
    if (!this.isMemoryAPIAvailable()) {
      return;
    }
    
    try {
      const memoryInfo = window.performance.memory;
      const usedMemoryMB = memoryInfo.usedJSHeapSize / (1024 * 1024);
      const totalMemoryMB = memoryInfo.totalJSHeapSize / (1024 * 1024);
      const memoryUsagePercent = (usedMemoryMB / totalMemoryMB) * 100;
      
      // Record memory metrics
      if (this.settings.collectMetrics) {
        this.metrics.memoryUsage.push({
          used: usedMemoryMB,
          total: totalMemoryMB,
          percent: memoryUsagePercent,
          timestamp: Date.now()
        });
        
        // Trim metrics if too many
        if (this.metrics.memoryUsage.length > 100) {
          this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-100);
        }
      }
      
      // Check if memory usage exceeds threshold
      if (usedMemoryMB > this.settings.memoryThreshold) {
        console.warn(`High memory usage detected: ${usedMemoryMB.toFixed(2)}MB used (${memoryUsagePercent.toFixed(2)}%)`);
        this.performMemoryCleanup();
      }
    } catch (error) {
      console.error('Error checking memory usage:', error);
    }
  }
  
  /**
   * Perform memory cleanup
   */
  performMemoryCleanup() {
    console.log('Performing memory cleanup...');
    
    // Clear unused throttled and debounced functions
    this.throttledFunctions.clear();
    this.debouncedFunctions.clear();
    
    // Clear metrics if too many
    if (this.metrics.requestTimes.length > 1000) {
      this.metrics.requestTimes = this.metrics.requestTimes.slice(-500);
    }
    if (this.metrics.renderTimes.length > 1000) {
      this.metrics.renderTimes = this.metrics.renderTimes.slice(-500);
    }
    if (this.metrics.parseTimings.length > 1000) {
      this.metrics.parseTimings = this.metrics.parseTimings.slice(-500);
    }
    if (this.metrics.domOperations.length > 1000) {
      this.metrics.domOperations = this.metrics.domOperations.slice(-500);
    }
    
    // Force garbage collection if available (only works in some browsers)
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        // Ignore errors
      }
    }
    
    console.log('Memory cleanup completed');
  }
  
  /**
   * Track request performance
   * @param {string} requestType - Type of request
   * @param {string} identifier - Request identifier (e.g., ASIN)
   * @param {number} duration - Request duration in ms
   * @param {boolean} fromCache - Whether the request was served from cache
   */
  trackRequestPerformance(requestType, identifier, duration, fromCache = false) {
    if (!this.settings.collectMetrics) return;
    
    this.metrics.requestTimes.push({
      type: requestType,
      id: identifier,
      duration,
      fromCache,
      timestamp: Date.now()
    });
    
    // Report slow requests
    if (duration > this.settings.slowOperationThreshold && !fromCache) {
      console.warn(`Slow ${requestType} request: ${duration.toFixed(2)}ms for ${identifier}`);
    }
    
    // Check if we should report metrics
    this.checkReportMetrics();
  }
  
  /**
   * Track render performance
   * @param {string} renderType - Type of render operation
   * @param {string} identifier - Element identifier
   * @param {number} duration - Render duration in ms
   */
  trackRenderPerformance(renderType, identifier, duration) {
    if (!this.settings.collectMetrics) return;
    
    this.metrics.renderTimes.push({
      type: renderType,
      id: identifier,
      duration,
      timestamp: Date.now()
    });
    
    // Report slow renders
    if (duration > this.settings.slowOperationThreshold) {
      console.warn(`Slow ${renderType} render: ${duration.toFixed(2)}ms for ${identifier}`);
    }
    
    // Check if we should report metrics
    this.checkReportMetrics();
  }
  
  /**
   * Track parsing performance
   * @param {string} parseType - Type of parsing operation
   * @param {string} identifier - Data identifier
   * @param {number} duration - Parse duration in ms
   * @param {boolean} success - Whether parsing was successful
   */
  trackParsingPerformance(parseType, identifier, duration, success = true) {
    if (!this.settings.collectMetrics) return;
    
    this.metrics.parseTimings.push({
      type: parseType,
      id: identifier,
      duration,
      success,
      timestamp: Date.now()
    });
    
    // Report slow parsing
    if (duration > this.settings.slowOperationThreshold) {
      console.warn(`Slow ${parseType} parsing: ${duration.toFixed(2)}ms for ${identifier}`);
    }
    
    // Check if we should report metrics
    this.checkReportMetrics();
  }
  
  /**
   * Check if we should report metrics
   */
  checkReportMetrics() {
    // Count total metrics
    const totalMetrics = 
      this.metrics.requestTimes.length + 
      this.metrics.renderTimes.length + 
      this.metrics.parseTimings.length + 
      this.metrics.domOperations.length;
    
    // Report if we have enough samples
    if (totalMetrics >= this.settings.metricsReportThreshold) {
      this.reportMetrics();
    }
  }
  
  /**
   * Report collected metrics
   */
  reportMetrics() {
    // Skip if not collecting metrics
    if (!this.settings.collectMetrics) return;
    
    // Calculate average metrics
    const avgRequestTime = this.calculateAverage(this.metrics.requestTimes.map(m => m.duration));
    const avgRenderTime = this.calculateAverage(this.metrics.renderTimes.map(m => m.duration));
    const avgParseTime = this.calculateAverage(this.metrics.parseTimings.map(m => m.duration));
    const avgDomOpTime = this.calculateAverage(this.metrics.domOperations.map(m => m.duration));
    
    // Calculate cache hit ratio
    const cacheRequests = this.metrics.requestTimes.filter(m => m.fromCache);
    const cacheHitRatio = cacheRequests.length / (this.metrics.requestTimes.length || 1);
    
    // Log performance report
    console.log('Performance Report:');
    console.log(`- Average request time: ${avgRequestTime.toFixed(2)}ms`);
    console.log(`- Average render time: ${avgRenderTime.toFixed(2)}ms`);
    console.log(`- Average parse time: ${avgParseTime.toFixed(2)}ms`);
    console.log(`- Average DOM operation time: ${avgDomOpTime.toFixed(2)}ms`);
    console.log(`- Cache hit ratio: ${(cacheHitRatio * 100).toFixed(2)}%`);
    
    // Get memory usage if available
    if (this.metrics.memoryUsage.length > 0) {
      const latestMemory = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
      console.log(`- Current memory usage: ${latestMemory.used.toFixed(2)}MB (${latestMemory.percent.toFixed(2)}%)`);
    }
    
    // Clear metrics after reporting
    this.clearMetrics();
  }
  
  /**
   * Calculate average of an array of numbers
   * @param {Array<number>} values - Array of numbers
   * @returns {number} Average value
   */
  calculateAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  /**
   * Clear collected metrics
   */
  clearMetrics() {
    this.metrics = {
      requestTimes: [],
      renderTimes: [],
      parseTimings: [],
      domOperations: [],
      memoryUsage: this.metrics.memoryUsage.slice(-10) // Keep some memory history
    };
  }
  
  /**
   * Get performance metrics
   * @returns {Object} Current performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      summary: {
        avgRequestTime: this.calculateAverage(this.metrics.requestTimes.map(m => m.duration)),
        avgRenderTime: this.calculateAverage(this.metrics.renderTimes.map(m => m.duration)),
        avgParseTime: this.calculateAverage(this.metrics.parseTimings.map(m => m.duration)),
        avgDomOpTime: this.calculateAverage(this.metrics.domOperations.map(m => m.duration)),
        cacheHitRatio: this.metrics.requestTimes.filter(m => m.fromCache).length / 
                      (this.metrics.requestTimes.length || 1),
        currentMemoryUsage: this.metrics.memoryUsage.length > 0 ? 
                           this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1] : null
      }
    };
  }
  
  /**
   * Optimize cache strategy based on usage patterns
   * @param {CacheManager} cacheManager - Reference to the cache manager
   */
  optimizeCacheStrategy(cacheManager) {
    // Skip if adaptive cache expiry is disabled
    if (!this.settings.adaptiveCacheExpiry) return;
    
    // Get cache stats
    cacheManager.getCacheStats().then(stats => {
      // Adjust cache expiry based on hit ratio
      if (stats.hitRatio < 30) {
        // Low hit ratio, increase cache expiry
        const newExpiry = Math.min(cacheManager.settings.cacheExpiry * 1.5, 72); // Max 72 hours
        cacheManager.updateSettings({ cacheExpiry: newExpiry });
        console.log(`Adjusted cache expiry to ${newExpiry} hours due to low hit ratio`);
      } else if (stats.hitRatio > 80 && stats.usagePercent > 90) {
        // High hit ratio but cache nearly full, decrease expiry slightly
        const newExpiry = Math.max(cacheManager.settings.cacheExpiry * 0.8, 1); // Min 1 hour
        cacheManager.updateSettings({ cacheExpiry: newExpiry });
        console.log(`Adjusted cache expiry to ${newExpiry} hours due to high usage`);
      }
      
      // Prioritize frequently accessed items
      if (this.settings.priorityItems.length > 0) {
        // Ensure priority items are kept in cache longer
        // This would require implementation in the cache manager
      }
    }).catch(error => {
      console.error('Error optimizing cache strategy:', error);
    });
  }
  
  /**
   * Create an optimized scroll handler
   * @param {Function} scrollHandler - Original scroll handler
   * @returns {Function} Optimized scroll handler
   */
  createOptimizedScrollHandler(scrollHandler) {
    // Use throttling for scroll events
    return this.throttle(
      (event) => {
        // Use requestAnimationFrame to align with browser's render cycle
        requestAnimationFrame(() => {
          scrollHandler(event);
        });
      },
      this.settings.scrollThrottleDelay,
      'scroll-handler'
    );
  }
  
  /**
   * Create an intersection observer for lazy loading
   * @param {Function} callback - Callback function when elements intersect
   * @param {Object} options - Intersection observer options
   * @returns {IntersectionObserver} Configured intersection observer
   */
  createLazyLoadObserver(callback, options = {}) {
    const defaultOptions = {
      root: null,
      rootMargin: '200px', // Load items 200px before they enter viewport
      threshold: 0.1
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    return new IntersectionObserver((entries, observer) => {
      // Batch process entries
      const visibleEntries = entries.filter(entry => entry.isIntersecting);
      
      if (visibleEntries.length > 0) {
        // Process in batches to avoid blocking the main thread
        this.batchDomOperations(
          visibleEntries,
          (entry) => {
            callback(entry, observer);
          },
          'intersection-observer',
          this.settings.batchSize,
          this.settings.batchDelay
        );
      }
    }, mergedOptions);
  }
  
  /**
   * Dispose resources and stop monitoring
   */
  dispose() {
    // Clear memory check timer
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
    
    // Clear all pending batches
    for (const [batchId, { timeoutId }] of this.pendingBatches.entries()) {
      clearTimeout(timeoutId);
    }
    this.pendingBatches.clear();
    
    // Clear metrics
    this.clearMetrics();
    
    console.log('Performance Optimizer disposed');
  }
}

// Export the class for use in other modules
if (typeof module !== 'undefined') {
  module.exports = PerformanceOptimizer;
}