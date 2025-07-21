// Popup script for Amazon Product Enhancer

// Initialize settings manager when popup opens
document.addEventListener('DOMContentLoaded', () => {
  // Create and initialize settings manager
  const settingsManager = new SettingsManager();
  settingsManager.init();
  
  // Set up tab navigation
  setupTabs();
  
  // Set up error log display
  setupErrorLog();
  
  // Set up debug settings
  setupDebugSettings();
});

/**
 * Set up tab navigation
 */
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      const tabId = tab.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });
}

/**
 * Set up debug settings
 */
function setupDebugSettings() {
  // Get debug settings elements
  const debugModeToggle = document.getElementById('debugMode');
  const enableGlobalErrorHandlerToggle = document.getElementById('enableGlobalErrorHandler');
  const enableErrorReportingToggle = document.getElementById('enableErrorReporting');
  const showUserFriendlyErrorsToggle = document.getElementById('showUserFriendlyErrors');
  const maxRetriesInput = document.getElementById('maxRetries');
  
  // Load current settings
  chrome.storage.sync.get([
    'debugMode',
    'enableGlobalErrorHandler',
    'enableErrorReporting',
    'showUserFriendlyErrors',
    'maxRetries'
  ], (result) => {
    // Update UI with current settings
    if (debugModeToggle) {
      debugModeToggle.checked = result.debugMode === true;
      debugModeToggle.addEventListener('change', () => {
        saveSetting('debugMode', debugModeToggle.checked);
      });
    }
    
    if (enableGlobalErrorHandlerToggle) {
      enableGlobalErrorHandlerToggle.checked = result.enableGlobalErrorHandler === true;
      enableGlobalErrorHandlerToggle.addEventListener('change', () => {
        saveSetting('enableGlobalErrorHandler', enableGlobalErrorHandlerToggle.checked);
      });
    }
    
    if (enableErrorReportingToggle) {
      enableErrorReportingToggle.checked = result.enableErrorReporting === true;
      enableErrorReportingToggle.addEventListener('change', () => {
        saveSetting('enableErrorReporting', enableErrorReportingToggle.checked);
      });
    }
    
    if (showUserFriendlyErrorsToggle) {
      showUserFriendlyErrorsToggle.checked = result.showUserFriendlyErrors !== false; // Default to true
      showUserFriendlyErrorsToggle.addEventListener('change', () => {
        saveSetting('showUserFriendlyErrors', showUserFriendlyErrorsToggle.checked);
      });
    }
    
    if (maxRetriesInput) {
      maxRetriesInput.value = result.maxRetries || 2;
      maxRetriesInput.addEventListener('change', () => {
        const value = parseInt(maxRetriesInput.value);
        if (value >= 0 && value <= 5) {
          saveSetting('maxRetries', value);
        } else {
          // Reset to valid value
          maxRetriesInput.value = result.maxRetries || 2;
        }
      });
    }
  });
  
  // Helper function to save a setting
  function saveSetting(key, value) {
    const setting = {};
    setting[key] = value;
    
    chrome.storage.sync.set(setting, () => {
      console.log(`Setting ${key} saved:`, value);
      
      // Update background script settings
      chrome.runtime.sendMessage({ 
        type: 'updateSettings', 
        settings: setting 
      });
    });
  }
}

/**
 * Set up error log display
 */
function setupErrorLog() {
  const errorLogContainer = document.getElementById('errorLogContainer');
  const clearErrorLogButton = document.getElementById('clearErrorLog');
  const downloadErrorLogButton = document.getElementById('downloadErrorLog');
  const refreshErrorLogButton = document.getElementById('refreshErrorLog');
  
  if (!errorLogContainer) return;
  
  // Function to load and display error log
  const loadErrorLog = () => {
    // Show loading state
    errorLogContainer.innerHTML = '<div class="log-entry log-entry-info">加载错误日志中...</div>';
    
    // Request error log from background script
    chrome.runtime.sendMessage({ type: 'getErrorLog' }, (response) => {
      if (response && response.success && response.errorLog) {
        displayErrorLog(response.errorLog);
      } else {
        errorLogContainer.innerHTML = '<div class="log-entry log-entry-error">无法加载错误日志</div>';
      }
    });
  };
  
  // Function to display error log entries
  const displayErrorLog = (errorLog) => {
    if (!errorLog || errorLog.length === 0) {
      errorLogContainer.innerHTML = '<div class="log-entry log-entry-info">没有错误日志</div>';
      return;
    }
    
    // Clear container
    errorLogContainer.innerHTML = '';
    
    // Add log entries (most recent first)
    errorLog.slice().reverse().forEach(entry => {
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry log-entry-${entry.level}`;
      
      // Format timestamp
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      
      // Create entry content
      logEntry.innerHTML = `
        <strong>${timestamp}</strong> [${entry.context || 'general'}] ${entry.message}
      `;
      
      errorLogContainer.appendChild(logEntry);
    });
  };
  
  // Set up button event listeners
  if (clearErrorLogButton) {
    clearErrorLogButton.addEventListener('click', () => {
      clearErrorLogButton.disabled = true;
      clearErrorLogButton.textContent = '正在清除...';
      
      chrome.runtime.sendMessage({ type: 'clearErrorLog' }, (response) => {
        if (response && response.success) {
          loadErrorLog();
          clearErrorLogButton.textContent = '已清除';
        } else {
          clearErrorLogButton.textContent = '清除失败';
        }
        
        setTimeout(() => {
          clearErrorLogButton.textContent = '清除日志';
          clearErrorLogButton.disabled = false;
        }, 1000);
      });
    });
  }
  
  if (downloadErrorLogButton) {
    downloadErrorLogButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'getErrorLog' }, (response) => {
        if (response && response.success && response.errorLog) {
          // Create and download the log file
          const logJson = JSON.stringify(response.errorLog, null, 2);
          const blob = new Blob([logJson], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = url;
          a.download = `amazon-enhancer-error-log-${new Date().toISOString().replace(/:/g, '-')}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      });
    });
  }
  
  if (refreshErrorLogButton) {
    refreshErrorLogButton.addEventListener('click', () => {
      refreshErrorLogButton.disabled = true;
      loadErrorLog();
      setTimeout(() => {
        refreshErrorLogButton.disabled = false;
      }, 500);
    });
  }
  
  // Initial load of error log
  loadErrorLog();
}