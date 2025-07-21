/**
 * Tests for the Cache Manager module
 */

// Mock Chrome API
const mockChromeStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn()
  },
  sync: {
    get: jest.fn(),
    set: jest.fn()
  }
};

global.chrome = {
  storage: mockChromeStorage
};

// Import the CacheManager class
const CacheManager = require('../cache-manager');

describe('CacheManager', () => {
  let cacheManager;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Set up default mock implementations
    mockChromeStorage.sync.get.mockImplementation((keys, callback) => {
      callback({});
    });
    
    mockChromeStorage.sync.set.mockImplementation((data, callback) => {
      if (callback) callback();
    });
    
    mockChromeStorage.local.get.mockImplementation((keys, callback) => {
      callback({});
    });
    
    mockChromeStorage.local.set.mockImplementation((data, callback) => {
      if (callback) callback();
    });
    
    mockChromeStorage.local.remove.mockImplementation((keys, callback) => {
      if (callback) callback();
    });
    
    // Create a new instance for each test
    cacheManager = new CacheManager();
  });
  
  describe('Constructor and Settings', () => {
    test('should initialize with default settings', () => {
      expect(cacheManager.defaultSettings).toBeDefined();
      expect(cacheManager.settings.cacheExpiry).toBe(24);
      expect(cacheManager.settings.maxCacheSize).toBe(500);
    });
    
    test('should load settings from storage', async () => {
      const customSettings = {
        cacheExpiry: 48,
        maxCacheSize: 1000,
        cleanupThreshold: 0.8,
        cleanupRatio: 0.2
      };
      
      mockChromeStorage.sync.get.mockImplementation((keys, callback) => {
        callback(customSettings);
      });
      
      await cacheManager.loadSettings();
      
      expect(cacheManager.settings.cacheExpiry).toBe(48);
      expect(cacheManager.settings.maxCacheSize).toBe(1000);
      expect(cacheManager.settings.cleanupThreshold).toBe(0.8);
      expect(cacheManager.settings.cleanupRatio).toBe(0.2);
    });
    
    test('should update settings', async () => {
      const newSettings = { cacheExpiry: 12 };
      
      await cacheManager.updateSettings(newSettings);
      
      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith(
        newSettings,
        expect.any(Function)
      );
      expect(cacheManager.settings.cacheExpiry).toBe(12);
    });
  });
  
  describe('Cache Operations', () => {
    test('should generate correct cache key', () => {
      const asin = 'B07PXGQC1Q';
      const key = cacheManager.generateCacheKey(asin);
      expect(key).toBe('cache_B07PXGQC1Q');
    });
    
    test('should cache product data', async () => {
      const asin = 'B07PXGQC1Q';
      const data = { title: 'Test Product' };
      
      // Mock the addToCacheIndex method
      cacheManager.addToCacheIndex = jest.fn().mockResolvedValue();
      cacheManager.checkAndCleanupCache = jest.fn().mockResolvedValue();
      
      await cacheManager.cacheProductData(asin, data);
      
      expect(cacheManager.addToCacheIndex).toHaveBeenCalledWith(
        'cache_B07PXGQC1Q',
        asin
      );
      
      expect(mockChromeStorage.local.set).toHaveBeenCalled();
      const setCall = mockChromeStorage.local.set.mock.calls[0][0];
      expect(Object.keys(setCall)[0]).toBe('cache_B07PXGQC1Q');
      expect(setCall['cache_B07PXGQC1Q'].data).toEqual(data);
    });
    
    test('should return cached data if valid', async () => {
      const asin = 'B07PXGQC1Q';
      const cachedData = {
        data: { title: 'Test Product' },
        timestamp: Date.now(),
        accessTimestamp: Date.now()
      };
      
      const mockResult = {};
      mockResult['cache_B07PXGQC1Q'] = cachedData;
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback(mockResult);
      });
      
      // Mock the updateAccessTimestamp method
      cacheManager.updateAccessTimestamp = jest.fn().mockResolvedValue();
      
      const result = await cacheManager.getCachedData(asin);
      
      expect(result).toEqual(cachedData.data);
      expect(cacheManager.updateAccessTimestamp).toHaveBeenCalledWith('cache_B07PXGQC1Q');
      expect(cacheManager.cacheStats.hits).toBe(1);
    });
    
    test('should return null for expired cache data', async () => {
      const asin = 'B07PXGQC1Q';
      const cachedData = {
        data: { title: 'Test Product' },
        timestamp: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago (expired)
        accessTimestamp: Date.now() - (25 * 60 * 60 * 1000)
      };
      
      const mockResult = {};
      mockResult['cache_B07PXGQC1Q'] = cachedData;
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback(mockResult);
      });
      
      // Mock the removeFromCache method
      cacheManager.removeFromCache = jest.fn().mockResolvedValue();
      
      const result = await cacheManager.getCachedData(asin);
      
      expect(result).toBeNull();
      expect(cacheManager.removeFromCache).toHaveBeenCalledWith('cache_B07PXGQC1Q');
      expect(cacheManager.cacheStats.misses).toBe(1);
    });
    
    test('should return null for non-existent cache data', async () => {
      const asin = 'B07PXGQC1Q';
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });
      
      const result = await cacheManager.getCachedData(asin);
      
      expect(result).toBeNull();
      expect(cacheManager.cacheStats.misses).toBe(1);
    });
  });
  
  describe('Cache Management', () => {
    test('should add item to cache index', async () => {
      const cacheKey = 'cache_B07PXGQC1Q';
      const asin = 'B07PXGQC1Q';
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ cacheIndex: [] });
      });
      
      await cacheManager.addToCacheIndex(cacheKey, asin);
      
      expect(mockChromeStorage.local.set).toHaveBeenCalled();
      const setCall = mockChromeStorage.local.set.mock.calls[0][0];
      expect(setCall.cacheIndex.length).toBe(1);
      expect(setCall.cacheIndex[0].key).toBe(cacheKey);
      expect(setCall.cacheIndex[0].asin).toBe(asin);
    });
    
    test('should update existing item in cache index', async () => {
      const cacheKey = 'cache_B07PXGQC1Q';
      const asin = 'B07PXGQC1Q';
      const existingIndex = [
        {
          key: cacheKey,
          asin: asin,
          timestamp: Date.now() - 1000 // 1 second ago
        }
      ];
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ cacheIndex: existingIndex });
      });
      
      await cacheManager.addToCacheIndex(cacheKey, asin);
      
      expect(mockChromeStorage.local.set).toHaveBeenCalled();
      const setCall = mockChromeStorage.local.set.mock.calls[0][0];
      expect(setCall.cacheIndex.length).toBe(1);
      expect(setCall.cacheIndex[0].key).toBe(cacheKey);
      expect(setCall.cacheIndex[0].timestamp).toBeGreaterThan(existingIndex[0].timestamp);
    });
    
    test('should remove item from cache', async () => {
      const cacheKey = 'cache_B07PXGQC1Q';
      const existingIndex = [
        {
          key: cacheKey,
          asin: 'B07PXGQC1Q',
          timestamp: Date.now()
        }
      ];
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ cacheIndex: existingIndex });
      });
      
      await cacheManager.removeFromCache(cacheKey);
      
      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith([cacheKey], expect.any(Function));
      expect(mockChromeStorage.local.set).toHaveBeenCalled();
      const setCall = mockChromeStorage.local.set.mock.calls[0][0];
      expect(setCall.cacheIndex).toEqual([]);
    });
    
    test('should check and cleanup cache when threshold reached', async () => {
      // Setup cache manager with smaller threshold for testing
      cacheManager.settings.maxCacheSize = 10;
      cacheManager.settings.cleanupThreshold = 0.5; // 50% threshold
      
      // Create a cache index with 6 items (above the 50% threshold of 10)
      const cacheIndex = Array(6).fill(0).map((_, i) => ({
        key: `cache_item_${i}`,
        asin: `ASIN_${i}`,
        timestamp: Date.now() - (i * 1000) // Different timestamps
      }));
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ cacheIndex });
      });
      
      // Mock the cleanupCache method
      cacheManager.cleanupCache = jest.fn().mockResolvedValue();
      
      await cacheManager.checkAndCleanupCache();
      
      expect(cacheManager.cleanupCache).toHaveBeenCalled();
    });
    
    test('should not cleanup cache when below threshold', async () => {
      // Setup cache manager with smaller threshold for testing
      cacheManager.settings.maxCacheSize = 10;
      cacheManager.settings.cleanupThreshold = 0.5; // 50% threshold
      
      // Create a cache index with 4 items (below the 50% threshold of 10)
      const cacheIndex = Array(4).fill(0).map((_, i) => ({
        key: `cache_item_${i}`,
        asin: `ASIN_${i}`,
        timestamp: Date.now() - (i * 1000)
      }));
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ cacheIndex });
      });
      
      // Mock the cleanupCache method
      cacheManager.cleanupCache = jest.fn().mockResolvedValue();
      
      await cacheManager.checkAndCleanupCache();
      
      expect(cacheManager.cleanupCache).not.toHaveBeenCalled();
    });
    
    test('should cleanup oldest items from cache', async () => {
      // Create 10 cache items with different timestamps
      const cacheIndex = Array(10).fill(0).map((_, i) => ({
        key: `cache_item_${i}`,
        asin: `ASIN_${i}`,
        timestamp: Date.now() - (i * 1000) // Oldest items have higher indices
      }));
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ cacheIndex });
      });
      
      // Mock the removeFromCache method
      cacheManager.removeFromCache = jest.fn().mockResolvedValue();
      cacheManager.settings.cleanupRatio = 0.3; // Remove 30% of items
      
      await cacheManager.cleanupCache();
      
      // Should remove 3 items (30% of 10)
      expect(cacheManager.removeFromCache).toHaveBeenCalledTimes(3);
      
      // Should remove the oldest items (highest indices)
      expect(cacheManager.removeFromCache).toHaveBeenCalledWith('cache_item_7');
      expect(cacheManager.removeFromCache).toHaveBeenCalledWith('cache_item_8');
      expect(cacheManager.removeFromCache).toHaveBeenCalledWith('cache_item_9');
    });
    
    test('should clear entire cache', async () => {
      const cacheIndex = [
        { key: 'cache_item_1', asin: 'ASIN_1', timestamp: Date.now() },
        { key: 'cache_item_2', asin: 'ASIN_2', timestamp: Date.now() }
      ];
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ cacheIndex });
      });
      
      await cacheManager.clearCache();
      
      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith(
        ['cache_item_1', 'cache_item_2'],
        expect.any(Function)
      );
      
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith(
        { cacheIndex: [] },
        expect.any(Function)
      );
      
      expect(cacheManager.cacheStats.hits).toBe(0);
      expect(cacheManager.cacheStats.misses).toBe(0);
    });
  });
  
  describe('Cache Statistics', () => {
    test('should return correct cache statistics', async () => {
      // Setup cache stats
      cacheManager.cacheStats.hits = 15;
      cacheManager.cacheStats.misses = 5;
      cacheManager.settings.maxCacheSize = 100;
      
      // Mock cache index with 20 items
      const cacheIndex = Array(20).fill(0).map((_, i) => ({
        key: `cache_item_${i}`,
        asin: `ASIN_${i}`,
        timestamp: Date.now() - (i * 1000)
      }));
      
      mockChromeStorage.local.get.mockImplementation((keys, callback) => {
        callback({ cacheIndex });
      });
      
      const stats = await cacheManager.getCacheStats();
      
      expect(stats.totalItems).toBe(20);
      expect(stats.usagePercent).toBe(20); // 20 items out of 100 max = 20%
      expect(stats.hitRatio).toBe(75); // 15 hits out of 20 total requests = 75%
      expect(stats.hits).toBe(15);
      expect(stats.misses).toBe(5);
    });
  });
});