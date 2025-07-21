/**
 * Cache Manager for Amazon Product Enhancer
 * 
 * This module handles:
 * - Chrome storage API integration for product data
 * - Cache expiry and cleaning mechanism
 * - Cache key management based on ASIN and timestamp
 * - Cache performance optimization
 */

class CacheManager {
  constructor() {
    this.defaultSettings = {
      cacheExpiry: 24, // hours
      maxCacheSize: 500, // maximum number of items to store
      cleanupThreshold: 0.9, // cleanup when cache reaches 90% of max size
      cleanupRatio: 0.3 // remove 30% of oldest items during cleanup
    };
    
    this.settings = { ...this.defaultSettings };
    this.cacheStats = {
      hits: 0,
      misses: 0,
      lastCleanup: Date.now()
    };
    
    // Load settings
    this.loadSettings();
  }
  
  /**
   * Load cache settings from storage
   */
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([
        'cacheExpiry',
        'maxCacheSize',
        'cleanupThreshold',
        'cleanupRatio'
      ], (result) => {
        this.settings = { ...this.defaultSettings, ...result };
        console.log('Cache settings loaded:', this.settings);
        resolve(this.settings);
      });
    });
  }
  
  /**
   * Update cache settings
   * @param {Object} newSettings - New settings to apply
   */
  async updateSettings(newSettings) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(newSettings, () => {
        this.settings = { ...this.settings, ...newSettings };
        console.log('Cache settings updated:', this.settings);
        resolve(this.settings);
      });
    });
  }
  
  /**
   * Get cached data for an ASIN if valid
   * @param {string} asin - Amazon Standard Identification Number
   * @returns {Promise<Object|null>} - Cached data or null if not found/expired
   */
  async getCachedData(asin) {
    return new Promise((resolve) => {
      const cacheKey = this.generateCacheKey(asin);
      
      chrome.storage.local.get([cacheKey], async (result) => {
        const cachedEntry = result[cacheKey];
        
        if (!cachedEntry) {
          this.cacheStats.misses++;
          resolve(null);
          return;
        }
        
        // Check if cache entry is expired
        const expiryMs = this.settings.cacheExpiry * 60 * 60 * 1000;
        if ((Date.now() - cachedEntry.timestamp) < expiryMs) {
          // Update access timestamp for LRU implementation
          await this.updateAccessTimestamp(cacheKey);
          this.cacheStats.hits++;
          resolve(cachedEntry.data);
        } else {
          console.log(`Cached data for ASIN: ${asin} has expired`);
          this.cacheStats.misses++;
          
          // Remove expired entry
          this.removeFromCache(cacheKey);
          resolve(null);
        }
      });
    });
  }
  
  /**
   * Cache product data
   * @param {string} asin - Amazon Standard Identification Number
   * @param {Object} data - Product data to cache
   * @returns {Promise<void>}
   */
  async cacheProductData(asin, data) {
    return new Promise(async (resolve) => {
      // Check if we need to clean up the cache first
      await this.checkAndCleanupCache();
      
      const cacheKey = this.generateCacheKey(asin);
      const cacheEntry = {
        data: data,
        timestamp: Date.now(),
        accessTimestamp: Date.now()
      };
      
      const cacheUpdate = {};
      cacheUpdate[cacheKey] = cacheEntry;
      
      // Add to cache index for faster lookups and management
      await this.addToCacheIndex(cacheKey, asin);
      
      chrome.storage.local.set(cacheUpdate, () => {
        console.log(`Cached data for ASIN: ${asin}`);
        resolve();
      });
    });
  }
  
  /**
   * Generate a cache key from ASIN
   * @param {string} asin - Amazon Standard Identification Number
   * @returns {string} - Cache key
   */
  generateCacheKey(asin) {
    return `cache_${asin}`;
  }
  
  /**
   * Update access timestamp for LRU implementation
   * @param {string} cacheKey - Cache key
   * @returns {Promise<void>}
   */
  async updateAccessTimestamp(cacheKey) {
    return new Promise((resolve) => {
      chrome.storage.local.get([cacheKey], (result) => {
        const entry = result[cacheKey];
        if (entry) {
          entry.accessTimestamp = Date.now();
          const update = {};
          update[cacheKey] = entry;
          chrome.storage.local.set(update, resolve);
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * Add a cache key to the index
   * @param {string} cacheKey - Cache key
   * @param {string} asin - Amazon Standard Identification Number
   * @returns {Promise<void>}
   */
  async addToCacheIndex(cacheKey, asin) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cacheIndex'], (result) => {
        const cacheIndex = result.cacheIndex || [];
        
        // Remove existing entry if present
        const existingIndex = cacheIndex.findIndex(item => item.key === cacheKey);
        if (existingIndex !== -1) {
          cacheIndex.splice(existingIndex, 1);
        }
        
        // Add new entry
        cacheIndex.push({
          key: cacheKey,
          asin: asin,
          timestamp: Date.now()
        });
        
        chrome.storage.local.set({ cacheIndex }, resolve);
      });
    });
  }
  
  /**
   * Remove an item from cache
   * @param {string} cacheKey - Cache key
   * @returns {Promise<void>}
   */
  async removeFromCache(cacheKey) {
    return new Promise((resolve) => {
      // Remove the actual cached data
      chrome.storage.local.remove([cacheKey], () => {
        // Update the cache index
        chrome.storage.local.get(['cacheIndex'], (result) => {
          const cacheIndex = result.cacheIndex || [];
          const updatedIndex = cacheIndex.filter(item => item.key !== cacheKey);
          chrome.storage.local.set({ cacheIndex: updatedIndex }, resolve);
        });
      });
    });
  }
  
  /**
   * Check if cache needs cleanup and perform if necessary
   * @returns {Promise<void>}
   */
  async checkAndCleanupCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cacheIndex'], async (result) => {
        const cacheIndex = result.cacheIndex || [];
        
        // Check if we need to clean up based on size
        if (cacheIndex.length >= this.settings.maxCacheSize * this.settings.cleanupThreshold) {
          await this.cleanupCache();
        }
        
        resolve();
      });
    });
  }
  
  /**
   * Clean up the cache by removing oldest or least recently used items
   * @returns {Promise<void>}
   */
  async cleanupCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cacheIndex'], async (result) => {
        const cacheIndex = result.cacheIndex || [];
        if (cacheIndex.length === 0) {
          resolve();
          return;
        }
        
        console.log('Starting cache cleanup...');
        this.cacheStats.lastCleanup = Date.now();
        
        // Sort by timestamp (oldest first)
        cacheIndex.sort((a, b) => a.timestamp - b.timestamp);
        
        // Calculate how many items to remove
        const removeCount = Math.ceil(cacheIndex.length * this.settings.cleanupRatio);
        const itemsToRemove = cacheIndex.slice(0, removeCount);
        
        // Remove items
        for (const item of itemsToRemove) {
          await this.removeFromCache(item.key);
        }
        
        console.log(`Cache cleanup complete. Removed ${removeCount} items.`);
        resolve();
      });
    });
  }
  
  /**
   * Clear the entire cache
   * @returns {Promise<void>}
   */
  async clearCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cacheIndex'], async (result) => {
        const cacheIndex = result.cacheIndex || [];
        
        // Remove all cached items
        const keysToRemove = cacheIndex.map(item => item.key);
        chrome.storage.local.remove(keysToRemove, () => {
          // Reset the cache index
          chrome.storage.local.set({ cacheIndex: [] }, () => {
            console.log('Cache cleared');
            this.cacheStats = {
              hits: 0,
              misses: 0,
              lastCleanup: Date.now()
            };
            resolve();
          });
        });
      });
    });
  }
  
  /**
   * Get cache statistics
   * @returns {Promise<Object>} - Cache statistics
   */
  async getCacheStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cacheIndex'], (result) => {
        const cacheIndex = result.cacheIndex || [];
        
        const stats = {
          ...this.cacheStats,
          totalItems: cacheIndex.length,
          usagePercent: (cacheIndex.length / this.settings.maxCacheSize) * 100,
          hitRatio: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses || 1) * 100
        };
        
        resolve(stats);
      });
    });
  }
  
  /**
   * Remove a specific item from the cache by ASIN
   * @param {string} asin - The ASIN to remove from cache
   * @returns {Promise<void>}
   */
  async removeCachedItem(asin) {
    return new Promise((resolve) => {
      const cacheKey = this.generateCacheKey(asin);
      
      // Remove the item from cache
      this.removeFromCache(cacheKey).then(() => {
        console.log(`Removed item from cache: ${asin}`);
        resolve();
      }).catch(error => {
        console.error(`Error removing item from cache: ${error.message}`);
        resolve(); // Resolve anyway to prevent blocking
      });
    });
  }
}

// Export the CacheManager class
if (typeof module !== 'undefined') {
  module.exports = CacheManager;
}