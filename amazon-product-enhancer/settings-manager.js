/**
 * Settings Manager for Amazon Product Enhancer
 * 
 * This module handles:
 * - Loading and saving user settings
 * - Managing UI controls in the popup
 * - Communicating settings changes to background script
 * - Providing default settings and reset functionality
 */

class SettingsManager {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      showBSR: true,
      showASIN: true,
      showBrand: true,
      showSalesData: true,
      cacheExpiry: 24, // hours
      maxCacheSize: 500, // maximum number of items to store
      cleanupThreshold: 0.9, // cleanup when cache reaches 90% of max size
      cleanupRatio: 0.3, // remove 30% of oldest items during cleanup
      debugMode: false, // debug mode for error handler
      enableGlobalErrorHandler: false, // global error handler
      showUserFriendlyErrors: true, // show user-friendly error messages
      enableErrorReporting: false, // enable error reporting
      errorReportEndpoint: null, // endpoint for error reporting
      maxRetries: 2 // maximum number of retries for network requests
    };
    
    this.settings = { ...this.defaultSettings };
    this.elements = {};
  }
  
  /**
   * Initialize the settings manager
   */
  init() {
    // Get all UI elements
    this.getElements();
    
    // Load current settings
    this.loadSettings();
    
    // Add event listeners
    this.setupEventListeners();
    
    // Load cache statistics
    this.loadCacheStats();
  }
  
  /**
   * Get all UI elements
   */
  getElements() {
    // Toggle elements
    this.elements.enabledToggle = document.getElementById('enabled');
    this.elements.showBSRToggle = document.getElementById('showBSR');
    this.elements.showASINToggle = document.getElementById('showASIN');
    this.elements.showBrandToggle = document.getElementById('showBrand');
    this.elements.showSalesDataToggle = document.getElementById('showSalesData');
    
    // Cache setting elements
    this.elements.cacheExpiryInput = document.getElementById('cacheExpiry');
    this.elements.maxCacheSizeInput = document.getElementById('maxCacheSize');
    this.elements.clearCacheButton = document.getElementById('clearCache');
    this.elements.resetSettingsButton = document.getElementById('resetSettings');
    this.elements.cacheStatsDiv = document.getElementById('cacheStats');
    
    // Error handling elements
    this.elements.debugModeToggle = document.getElementById('debugMode');
    this.elements.enableGlobalErrorHandlerToggle = document.getElementById('enableGlobalErrorHandler');
    this.elements.showUserFriendlyErrorsToggle = document.getElementById('showUserFriendlyErrors');
    this.elements.enableErrorReportingToggle = document.getElementById('enableErrorReporting');
    this.elements.maxRetriesInput = document.getElementById('maxRetries');
  }
  
  /**
   * Load settings from storage
   */
  loadSettings() {
    chrome.storage.sync.get([
      'enabled',
      'showBSR',
      'showASIN',
      'showBrand',
      'showSalesData',
      'cacheExpiry',
      'maxCacheSize',
      'debugMode',
      'enableGlobalErrorHandler',
      'showUserFriendlyErrors',
      'enableErrorReporting',
      'errorReportEndpoint',
      'maxRetries'
    ], (result) => {
      // Update settings with stored values or defaults
      this.settings = { ...this.defaultSettings, ...result };
      
      // Update UI elements
      this.updateUI();
    });
  }
  
  /**
   * Update UI elements based on current settings
   */
  updateUI() {
    // Set toggle states
    if (this.elements.enabledToggle) {
      this.elements.enabledToggle.checked = this.settings.enabled !== false;
    }
    
    if (this.elements.showBSRToggle) {
      this.elements.showBSRToggle.checked = this.settings.showBSR !== false;
    }
    
    if (this.elements.showASINToggle) {
      this.elements.showASINToggle.checked = this.settings.showASIN !== false;
    }
    
    if (this.elements.showBrandToggle) {
      this.elements.showBrandToggle.checked = this.settings.showBrand !== false;
    }
    
    if (this.elements.showSalesDataToggle) {
      this.elements.showSalesDataToggle.checked = this.settings.showSalesData !== false;
    }
    
    // Set cache settings
    if (this.elements.cacheExpiryInput) {
      this.elements.cacheExpiryInput.value = this.settings.cacheExpiry || 24;
    }
    
    if (this.elements.maxCacheSizeInput) {
      this.elements.maxCacheSizeInput.value = this.settings.maxCacheSize || 500;
    }
    
    // Set error handling settings
    if (this.elements.debugModeToggle) {
      this.elements.debugModeToggle.checked = this.settings.debugMode === true;
    }
    
    if (this.elements.enableGlobalErrorHandlerToggle) {
      this.elements.enableGlobalErrorHandlerToggle.checked = this.settings.enableGlobalErrorHandler === true;
    }
    
    if (this.elements.showUserFriendlyErrorsToggle) {
      this.elements.showUserFriendlyErrorsToggle.checked = this.settings.showUserFriendlyErrors !== false;
    }
    
    if (this.elements.enableErrorReportingToggle) {
      this.elements.enableErrorReportingToggle.checked = this.settings.enableErrorReporting === true;
    }
    
    if (this.elements.maxRetriesInput) {
      this.elements.maxRetriesInput.value = this.settings.maxRetries || 2;
    }
    
    // Update dependent toggles state
    if (this.elements.enabledToggle) {
      this.updateDependentToggles(this.elements.enabledToggle.checked);
    }
  }
  
  /**
   * Set up event listeners for UI elements
   */
  setupEventListeners() {
    // Main toggle
    this.elements.enabledToggle.addEventListener('change', () => {
      const enabled = this.elements.enabledToggle.checked;
      this.saveSetting('enabled', enabled);
      this.updateDependentToggles(enabled);
      this.reloadActiveTab();
    });
    
    // Feature toggles
    this.elements.showBSRToggle.addEventListener('change', () => {
      this.saveSetting('showBSR', this.elements.showBSRToggle.checked);
      this.updateActiveTab();
    });
    
    this.elements.showASINToggle.addEventListener('change', () => {
      this.saveSetting('showASIN', this.elements.showASINToggle.checked);
      this.updateActiveTab();
    });
    
    this.elements.showBrandToggle.addEventListener('change', () => {
      this.saveSetting('showBrand', this.elements.showBrandToggle.checked);
      this.updateActiveTab();
    });
    
    this.elements.showSalesDataToggle.addEventListener('change', () => {
      this.saveSetting('showSalesData', this.elements.showSalesDataToggle.checked);
      this.updateActiveTab();
    });
    
    // Cache expiry input
    this.elements.cacheExpiryInput.addEventListener('change', () => {
      const value = parseInt(this.elements.cacheExpiryInput.value);
      if (value >= 1 && value <= 168) {
        this.saveSetting('cacheExpiry', value);
        this.updateBackgroundSettings({ cacheExpiry: value });
      } else {
        // Reset to valid value
        this.elements.cacheExpiryInput.value = this.settings.cacheExpiry || 24;
      }
    });
    
    // Max cache size input
    this.elements.maxCacheSizeInput.addEventListener('change', () => {
      const value = parseInt(this.elements.maxCacheSizeInput.value);
      if (value >= 100 && value <= 2000) {
        this.saveSetting('maxCacheSize', value);
        this.updateBackgroundSettings({ maxCacheSize: value });
      } else {
        // Reset to valid value
        this.elements.maxCacheSizeInput.value = this.settings.maxCacheSize || 500;
      }
    });
    
    // Clear cache button
    this.elements.clearCacheButton.addEventListener('click', () => {
      this.clearCache();
    });
    
    // Reset settings button
    if (this.elements.resetSettingsButton) {
      this.elements.resetSettingsButton.addEventListener('click', () => {
        this.resetSettings();
      });
    }
  }
  
  /**
   * Save a setting to storage
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  saveSetting(key, value) {
    const setting = {};
    setting[key] = value;
    
    chrome.storage.sync.set(setting, () => {
      this.settings[key] = value;
      console.log(`Setting ${key} saved:`, value);
    });
  }
  
  /**
   * Update dependent toggles based on main toggle state
   * @param {boolean} enabled - Whether the main toggle is enabled
   */
  updateDependentToggles(enabled) {
    const dependentToggles = [
      this.elements.showBSRToggle,
      this.elements.showASINToggle,
      this.elements.showBrandToggle,
      this.elements.showSalesDataToggle
    ];
    
    dependentToggles.forEach(toggle => {
      if (toggle) {
        toggle.disabled = !enabled;
        const container = toggle.closest('.toggle-container') || toggle.parentElement;
        if (container) {
          container.style.opacity = enabled ? '1' : '0.5';
        }
      }
    });
  }
  
  /**
   * Update the active tab to reflect setting changes
   */
  updateActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'settingsUpdated' });
      }
    });
  }
  
  /**
   * Reload the active tab
   */
  reloadActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.reload(tabs[0].id);
      }
    });
  }
  
  /**
   * Update settings in the background script
   * @param {Object} settings - Settings to update
   */
  updateBackgroundSettings(settings) {
    chrome.runtime.sendMessage({ 
      type: 'updateSettings', 
      settings: settings 
    }, (response) => {
      if (response && response.success) {
        console.log('Background settings updated:', settings);
      } else {
        console.error('Failed to update background settings:', response?.error || 'Unknown error');
      }
    });
  }
  
  /**
   * Clear the cache
   */
  clearCache() {
    const button = this.elements.clearCacheButton;
    button.disabled = true;
    button.textContent = '正在清除...';
    
    chrome.runtime.sendMessage({ type: 'clearCache' }, (response) => {
      if (response && response.success) {
        button.textContent = '已清除';
        setTimeout(() => {
          button.textContent = '清除缓存';
          button.disabled = false;
          this.loadCacheStats();
        }, 1000);
      } else {
        button.textContent = '清除失败';
        setTimeout(() => {
          button.textContent = '清除缓存';
          button.disabled = false;
        }, 1000);
      }
    });
  }
  
  /**
   * Reset all settings to defaults
   */
  resetSettings() {
    const button = this.elements.resetSettingsButton;
    if (button) {
      button.disabled = true;
      button.textContent = '正在重置...';
    }
    
    // Save default settings to storage
    chrome.storage.sync.set(this.defaultSettings, () => {
      // Update local settings
      this.settings = { ...this.defaultSettings };
      
      // Update UI
      this.updateUI();
      
      // Update background settings
      this.updateBackgroundSettings({
        cacheExpiry: this.defaultSettings.cacheExpiry,
        maxCacheSize: this.defaultSettings.maxCacheSize,
        cleanupThreshold: this.defaultSettings.cleanupThreshold,
        cleanupRatio: this.defaultSettings.cleanupRatio
      });
      
      if (button) {
        button.textContent = '已重置';
        setTimeout(() => {
          button.textContent = '恢复默认设置';
          button.disabled = false;
        }, 1000);
      }
      
      console.log('All settings reset to defaults');
    });
  }
  
  /**
   * Load and display cache statistics
   */
  loadCacheStats() {
    if (!this.elements.cacheStatsDiv) return;
    
    this.elements.cacheStatsDiv.textContent = '缓存统计: 加载中...';
    
    chrome.runtime.sendMessage({ type: 'getCacheStats' }, (response) => {
      if (response && response.success) {
        const stats = response.stats;
        const hitRatio = stats.hitRatio.toFixed(1);
        const usagePercent = stats.usagePercent.toFixed(1);
        
        this.elements.cacheStatsDiv.textContent = `缓存统计: ${stats.totalItems} 项 (${usagePercent}%), 命中率: ${hitRatio}%`;
      } else {
        this.elements.cacheStatsDiv.textContent = '缓存统计: 无法加载';
      }
    });
  }
}

// Export the SettingsManager class
if (typeof module !== 'undefined') {
  module.exports = SettingsManager;
}