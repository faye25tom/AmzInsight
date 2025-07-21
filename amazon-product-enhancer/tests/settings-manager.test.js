/**
 * Settings Manager Tests
 * 
 * Tests for the settings management functionality in the popup interface
 */

// Mock Chrome API
const mockChromeStorage = {
  sync: {
    get: jest.fn(),
    set: jest.fn()
  }
};

const mockChromeTabs = {
  query: jest.fn(),
  reload: jest.fn(),
  sendMessage: jest.fn()
};

const mockChromeRuntime = {
  sendMessage: jest.fn(),
  lastError: null
};

global.chrome = {
  storage: mockChromeStorage,
  tabs: mockChromeTabs,
  runtime: mockChromeRuntime
};

// Mock DOM elements
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

describe('Settings Manager', () => {
  let settingsManager;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a new settings manager instance
    settingsManager = new SettingsManager();
    
    // Setup default mock responses
    mockChromeStorage.sync.get.mockImplementation((keys, callback) => {
      callback({
        enabled: true,
        showBSR: true,
        showASIN: true,
        showBrand: true,
        showSalesData: true,
        cacheExpiry: 24,
        maxCacheSize: 500
      });
    });
    
    mockChromeStorage.sync.set.mockImplementation((settings, callback) => {
      if (callback) callback();
    });
    
    mockChromeTabs.query.mockImplementation((query, callback) => {
      callback([{ id: 1 }]);
    });
    
    mockChromeRuntime.sendMessage.mockImplementation((message, callback) => {
      callback({ success: true, stats: { totalItems: 100, usagePercent: 20, hitRatio: 75 } });
    });
  });
  
  test('should load settings on initialization', () => {
    // Initialize the settings manager
    settingsManager.init();
    
    // Verify that chrome.storage.sync.get was called
    expect(mockChromeStorage.sync.get).toHaveBeenCalled();
    
    // Verify that the toggle states were set correctly
    expect(document.getElementById('enabled').checked).toBe(true);
    expect(document.getElementById('showBSR').checked).toBe(true);
    expect(document.getElementById('showASIN').checked).toBe(true);
    expect(document.getElementById('showBrand').checked).toBe(true);
    expect(document.getElementById('showSalesData').checked).toBe(true);
    
    // Verify that the cache settings were set correctly
    expect(document.getElementById('cacheExpiry').value).toBe('24');
    expect(document.getElementById('maxCacheSize').value).toBe('500');
  });
  
  test('should save settings when toggles are changed', () => {
    // Initialize the settings manager
    settingsManager.init();
    
    // Simulate changing the enabled toggle
    const enabledToggle = document.getElementById('enabled');
    enabledToggle.checked = false;
    enabledToggle.dispatchEvent(new Event('change'));
    
    // Verify that chrome.storage.sync.set was called with the correct settings
    expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({ enabled: false });
    
    // Verify that the active tab was reloaded
    expect(mockChromeTabs.reload).toHaveBeenCalledWith(1);
  });
  
  test('should update dependent toggles when main toggle is changed', () => {
    // Initialize the settings manager
    settingsManager.init();
    
    // Simulate changing the enabled toggle to false
    const enabledToggle = document.getElementById('enabled');
    enabledToggle.checked = false;
    enabledToggle.dispatchEvent(new Event('change'));
    
    // Verify that dependent toggles were disabled
    expect(document.getElementById('showBSR').disabled).toBe(true);
    expect(document.getElementById('showASIN').disabled).toBe(true);
    expect(document.getElementById('showBrand').disabled).toBe(true);
    expect(document.getElementById('showSalesData').disabled).toBe(true);
    
    // Simulate changing the enabled toggle back to true
    enabledToggle.checked = true;
    enabledToggle.dispatchEvent(new Event('change'));
    
    // Verify that dependent toggles were enabled
    expect(document.getElementById('showBSR').disabled).toBe(false);
    expect(document.getElementById('showASIN').disabled).toBe(false);
    expect(document.getElementById('showBrand').disabled).toBe(false);
    expect(document.getElementById('showSalesData').disabled).toBe(false);
  });
  
  test('should update settings when cache settings are changed', () => {
    // Initialize the settings manager
    settingsManager.init();
    
    // Simulate changing the cache expiry
    const cacheExpiryInput = document.getElementById('cacheExpiry');
    cacheExpiryInput.value = '48';
    cacheExpiryInput.dispatchEvent(new Event('change'));
    
    // Verify that chrome.storage.sync.set was called with the correct settings
    expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({ cacheExpiry: 48 });
    
    // Verify that the background script was notified
    expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith(
      { type: 'updateSettings', settings: { cacheExpiry: 48 } },
      expect.any(Function)
    );
  });
  
  test('should validate cache settings input', () => {
    // Initialize the settings manager
    settingsManager.init();
    
    // Simulate entering an invalid cache expiry (too low)
    const cacheExpiryInput = document.getElementById('cacheExpiry');
    cacheExpiryInput.value = '0';
    cacheExpiryInput.dispatchEvent(new Event('change'));
    
    // Verify that the value was reset to the default
    expect(cacheExpiryInput.value).toBe('24');
    
    // Simulate entering an invalid cache expiry (too high)
    cacheExpiryInput.value = '200';
    cacheExpiryInput.dispatchEvent(new Event('change'));
    
    // Verify that the value was reset to the default
    expect(cacheExpiryInput.value).toBe('24');
  });
  
  test('should clear cache when clear cache button is clicked', () => {
    // Initialize the settings manager
    settingsManager.init();
    
    // Simulate clicking the clear cache button
    const clearCacheButton = document.getElementById('clearCache');
    clearCacheButton.click();
    
    // Verify that the background script was notified
    expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith(
      { type: 'clearCache' },
      expect.any(Function)
    );
    
    // Verify that the button was disabled
    expect(clearCacheButton.disabled).toBe(true);
    
    // Verify that the button text was updated
    expect(clearCacheButton.textContent).toBe('正在清除...');
  });
  
  test('should reset settings when reset button is clicked', () => {
    // Initialize the settings manager
    settingsManager.init();
    
    // Simulate clicking the reset settings button
    const resetSettingsButton = document.getElementById('resetSettings');
    resetSettingsButton.click();
    
    // Verify that chrome.storage.sync.set was called with the default settings
    expect(mockChromeStorage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        showBSR: true,
        showASIN: true,
        showBrand: true,
        showSalesData: true,
        cacheExpiry: 24,
        maxCacheSize: 500
      })
    );
    
    // Verify that the background script was notified
    expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith(
      { 
        type: 'updateSettings', 
        settings: expect.objectContaining({
          cacheExpiry: 24,
          maxCacheSize: 500
        }) 
      },
      expect.any(Function)
    );
  });
  
  test('should load cache statistics', () => {
    // Initialize the settings manager
    settingsManager.init();
    
    // Verify that the background script was queried for cache stats
    expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith(
      { type: 'getCacheStats' },
      expect.any(Function)
    );
    
    // Verify that the cache stats were displayed
    expect(document.getElementById('cacheStats').textContent).toBe(
      '缓存统计: 100 项 (20.0%), 命中率: 75.0%'
    );
  });
});