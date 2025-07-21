// Popup script for Amazon Product Enhancer

// Load settings when popup opens
document.addEventListener('DOMContentLoaded', () => {
  // Get all toggle elements
  const enabledToggle = document.getElementById('enabled');
  const showBSRToggle = document.getElementById('showBSR');
  const showASINToggle = document.getElementById('showASIN');
  const showBrandToggle = document.getElementById('showBrand');
  const showSalesDataToggle = document.getElementById('showSalesData');
  
  // Load current settings
  chrome.storage.sync.get([
    'enabled',
    'showBSR',
    'showASIN',
    'showBrand',
    'showSalesData'
  ], (result) => {
    // Set toggle states based on settings
    enabledToggle.checked = result.enabled !== false;
    showBSRToggle.checked = result.showBSR !== false;
    showASINToggle.checked = result.showASIN !== false;
    showBrandToggle.checked = result.showBrand !== false;
    showSalesDataToggle.checked = result.showSalesData !== false;
    
    // Update dependent toggles state
    updateDependentToggles(enabledToggle.checked);
  });
  
  // Add event listeners for toggles
  enabledToggle.addEventListener('change', () => {
    const enabled = enabledToggle.checked;
    chrome.storage.sync.set({ enabled });
    updateDependentToggles(enabled);
    
    // Reload active tab to apply changes
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.reload(tabs[0].id);
      }
    });
  });
  
  showBSRToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ showBSR: showBSRToggle.checked });
    updateActiveTab();
  });
  
  showASINToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ showASIN: showASINToggle.checked });
    updateActiveTab();
  });
  
  showBrandToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ showBrand: showBrandToggle.checked });
    updateActiveTab();
  });
  
  showSalesDataToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ showSalesData: showSalesDataToggle.checked });
    updateActiveTab();
  });
});

// Update dependent toggles based on main toggle state
function updateDependentToggles(enabled) {
  const dependentToggles = [
    document.getElementById('showBSR'),
    document.getElementById('showASIN'),
    document.getElementById('showBrand'),
    document.getElementById('showSalesData')
  ];
  
  dependentToggles.forEach(toggle => {
    toggle.disabled = !enabled;
    toggle.parentElement.style.opacity = enabled ? '1' : '0.5';
  });
}

// Update the active tab to reflect setting changes
function updateActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'settingsUpdated' });
    }
  });
}