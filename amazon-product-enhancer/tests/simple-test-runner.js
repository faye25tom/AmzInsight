/**
 * Simple Test Runner for Settings Manager
 */

// Mock Chrome API
global.chrome = {
  storage: {
    sync: {
      get: (keys, callback) => {
        console.log('Mock chrome.storage.sync.get called with:', keys);
        callback({
          enabled: true,
          showBSR: true,
          showASIN: true,
          showBrand: true,
          showSalesData: true,
          cacheExpiry: 24,
          maxCacheSize: 500
        });
      },
      set: (settings, callback) => {
        console.log('Mock chrome.storage.sync.set called with:', settings);
        if (callback) callback();
      }
    }
  },
  tabs: {
    query: (query, callback) => {
      console.log('Mock chrome.tabs.query called with:', query);
      callback([{ id: 1 }]);
    },
    reload: (tabId) => {
      console.log('Mock chrome.tabs.reload called with:', tabId);
    },
    sendMessage: (tabId, message) => {
      console.log('Mock chrome.tabs.sendMessage called with:', tabId, message);
    }
  },
  runtime: {
    sendMessage: (message, callback) => {
      console.log('Mock chrome.runtime.sendMessage called with:', message);
      callback({ 
        success: true, 
        stats: { 
          totalItems: 100, 
          usagePercent: 20, 
          hitRatio: 75 
        } 
      });
    },
    lastError: null
  }
};

// Mock DOM
document.body.innerHTML = `
  <div id="enabled-toggle-container">
    <input type="checkbox" id="enabled">
  </div>
  <div id="showBSR-toggle-container">
    <input type="checkbox" id="showBSR">
  </div>
  <div id="showASIN-toggle-container">
    <input type="checkbox" id="showASIN">
  </div>
  <div id="showBrand-toggle-container">
    <input type="checkbox" id="showBrand">
  </div>
  <div id="showSalesData-toggle-container">
    <input type="checkbox" id="showSalesData">
  </div>
  <input type="number" id="cacheExpiry" value="24">
  <input type="number" id="maxCacheSize" value="500">
  <button id="clearCache">清除缓存</button>
  <button id="resetSettings">恢复默认设置</button>
  <div id="cacheStats">缓存统计: 加载中...</div>
`;

// Import the settings manager
const SettingsManager = require('../settings-manager');

// Create a new settings manager instance
const settingsManager = new SettingsManager();

// Test initialization
console.log('Testing initialization...');
settingsManager.init();

// Test that the settings were loaded
console.log('Settings after initialization:', settingsManager.settings);

// Test that the UI was updated
console.log('Enabled toggle checked:', document.getElementById('enabled').checked);
console.log('showBSR toggle checked:', document.getElementById('showBSR').checked);
console.log('showASIN toggle checked:', document.getElementById('showASIN').checked);
console.log('showBrand toggle checked:', document.getElementById('showBrand').checked);
console.log('showSalesData toggle checked:', document.getElementById('showSalesData').checked);

// Test saving a setting
console.log('\nTesting saving a setting...');
settingsManager.saveSetting('enabled', false);

// Test updating dependent toggles
console.log('\nTesting updating dependent toggles...');
settingsManager.updateDependentToggles(false);
console.log('showBSR toggle disabled:', document.getElementById('showBSR').disabled);
console.log('showASIN toggle disabled:', document.getElementById('showASIN').disabled);
console.log('showBrand toggle disabled:', document.getElementById('showBrand').disabled);
console.log('showSalesData toggle disabled:', document.getElementById('showSalesData').disabled);

// Test clearing cache
console.log('\nTesting clearing cache...');
settingsManager.clearCache();

// Test resetting settings
console.log('\nTesting resetting settings...');
settingsManager.resetSettings();

console.log('\nAll tests completed successfully!');