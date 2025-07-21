// Content script for Amazon Product Enhancer

// Import UI Renderer
// In a real extension, this would be handled by the build system
// For this implementation, we'll assume the script is loaded in the manifest

// Main class for product enhancement
class ProductEnhancer {
  constructor() {
    this.initialized = false;
    this.settings = {
      enabled: true,
      showBSR: true,
      showASIN: true,
      showBrand: true,
      showSalesData: true
    };
    this.processedProducts = new Set(); // Track processed products to avoid duplicates
    this.uiRenderer = null; // Will be initialized when needed
  }

  // Initialize the enhancer
  async init() {
    // Load settings
    await this.loadSettings();
    
    // If disabled, don't proceed
    if (!this.settings.enabled) return;
    
    // Check if we're on an Amazon search page
    if (!this.isAmazonSearchPage()) {
      console.log('Not an Amazon search page, exiting');
      return;
    }
    
    this.initialized = true;
    console.log('Amazon Product Enhancer initialized on search page');
    
    // Scan for products
    this.scanProducts();
    
    // Set up observer for dynamically loaded content
    this.setupDynamicContentObserver();
  }
  
  // Load user settings from storage
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([
        'enabled', 
        'showBSR', 
        'showASIN', 
        'showBrand', 
        'showSalesData'
      ], (result) => {
        if (result.enabled !== undefined) {
          this.settings = result;
          
          // Update UI renderer settings if it exists
          if (this.uiRenderer) {
            this.uiRenderer.applyUserSettings(this.settings);
          }
        }
        resolve();
      });
    });
  }
  
  // Check if current page is an Amazon search results page
  isAmazonSearchPage() {
    const url = window.location.href;
    const hostname = window.location.hostname;
    
    // Check if we're on an Amazon domain
    if (!hostname.includes('amazon.')) {
      console.log('Not an Amazon domain');
      return false;
    }
    
    // Check for various Amazon search URL patterns
    const searchPatterns = [
      '/s?', 
      '/s/', 
      '/search/', 
      'keywords=',
      '/gp/search/',
      '/sr/ref='
    ];
    
    const isSearchUrl = searchPatterns.some(pattern => url.includes(pattern));
    
    if (!isSearchUrl) {
      console.log('Not a search URL pattern');
      return false;
    }
    
    // Check for search results container elements
    const searchResultSelectors = [
      '.s-search-results',
      '.s-result-list',
      '[data-component-type="s-search-results"]',
      '.sg-col-20-of-24.s-result-item',
      '.sg-col-16-of-20.s-result-item',
      '#search > div.s-desktop-width-max'
    ];
    
    const hasSearchResults = searchResultSelectors.some(selector => 
      document.querySelector(selector) !== null
    );
    
    if (!hasSearchResults) {
      console.log('No search results container found');
      return false;
    }
    
    console.log('Amazon search page detected');
    return true;
  }
  
  // Scan the page for product elements
  scanProducts() {
    console.log('Scanning for products...');
    
    // Common selectors for product containers across different Amazon layouts
    const productSelectors = [
      '[data-component-type="s-search-result"]',
      '.s-result-item:not(.s-widget):not(.AdHolder)',
      '.sg-col-4-of-12.s-result-item',
      '.sg-col-4-of-16.s-result-item',
      '.sg-col-20-of-24.s-result-item',
      '.sg-col-16-of-20.s-result-item',
      'div[data-asin]:not([data-asin=""])' // Products with non-empty ASIN
    ];
    
    // Find all product elements using the selectors
    let productElements = new Set();
    
    productSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          // Skip sponsored products and other non-product elements
          if (
            !el.classList.contains('AdHolder') && 
            !el.querySelector('.s-sponsored-label-info-icon') &&
            !el.classList.contains('s-widget') &&
            el.offsetParent !== null // Skip hidden elements
          ) {
            productElements.add(el);
          }
        });
      }
    });
    
    // Convert Set to Array for processing
    const uniqueProductElements = Array.from(productElements);
    console.log(`Found ${uniqueProductElements.length} unique product elements`);
    
    // Process each product element
    uniqueProductElements.forEach(productElement => {
      try {
        this.processProductElement(productElement);
      } catch (error) {
        console.error('Error processing product element:', error);
      }
    });
    
    return uniqueProductElements.length;
  }
  
  // Process a single product element
  processProductElement(productElement) {
    // Skip if already processed
    const dataId = productElement.getAttribute('data-asin') || 
                  productElement.getAttribute('data-uuid') || 
                  productElement.getAttribute('id');
    
    if (!dataId || this.processedProducts.has(dataId)) {
      return false;
    }
    
    // Skip sponsored products
    if (
      productElement.classList.contains('AdHolder') || 
      productElement.querySelector('.s-sponsored-label-info-icon') ||
      productElement.querySelector('[data-component-type="sp-sponsored-result"]')
    ) {
      console.log('Skipping sponsored product');
      return false;
    }
    
    // Mark as processed
    this.processedProducts.add(dataId);
    
    // Extract product information
    const productInfo = this.extractProductInfo(productElement);
    
    if (!productInfo.asin || !productInfo.url) {
      console.log('Skipping product with missing ASIN or URL');
      return false;
    }
    
    // Store product info in the element for future reference
    productElement.dataset.enhancerProcessed = 'true';
    productElement.dataset.enhancerAsin = productInfo.asin;
    
    // Create container for enhanced information
    this.createInfoContainer(productElement, productInfo);
    
    // Request additional product details from background script
    this.requestProductDetails(productInfo.asin, productInfo.url, productElement);
    
    return true;
  }
  
  // Extract basic product information from the element
  extractProductInfo(productElement) {
    let productInfo = {
      asin: null,
      url: null,
      title: null,
      price: null,
      image: null
    };
    
    try {
      // Extract ASIN - it's usually in the data-asin attribute
      productInfo.asin = productElement.getAttribute('data-asin');
      
      // If ASIN is not in the data-asin attribute, try to extract from other sources
      if (!productInfo.asin) {
        // Try to extract from URL
        const linkElement = productElement.querySelector('a[href*="/dp/"]') || 
                           productElement.querySelector('a[href*="/gp/product/"]');
        
        if (linkElement) {
          const href = linkElement.getAttribute('href');
          // Match ASIN from /dp/ or /gp/product/ URLs
          const asinMatch = href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
          if (asinMatch && asinMatch[1]) {
            productInfo.asin = asinMatch[1].toUpperCase(); // Ensure uppercase for consistency
          }
        }
      }
      
      // If still no ASIN, try to find it in other attributes
      if (!productInfo.asin) {
        // Check for ASIN in various data attributes
        const possibleAttributes = ['data-asin', 'data-id', 'id'];
        for (const attr of possibleAttributes) {
          const value = productElement.getAttribute(attr);
          if (value && /^[A-Z0-9]{10}$/i.test(value)) {
            productInfo.asin = value.toUpperCase();
            break;
          }
        }
      }
      
      // Extract product URL
      const linkSelectors = [
        'a.a-link-normal.s-no-outline',
        'a.a-link-normal.a-text-normal',
        'a[href*="/dp/"]',
        'a[href*="/gp/product/"]',
        '.a-link-normal[href*="/dp/"]',
        'h2 a',
        '.a-size-base a'
      ];
      
      for (const selector of linkSelectors) {
        const linkElement = productElement.querySelector(selector);
        if (linkElement) {
          let href = linkElement.getAttribute('href');
          
          if (href) {
            // Make sure we have an absolute URL
            if (href.startsWith('/')) {
              href = `https://${window.location.hostname}${href}`;
            }
            
            // Clean up the URL - remove unnecessary parameters
            const urlObj = new URL(href);
            // Keep only essential parameters
            const essentialParams = ['th', 'psc'];
            const params = new URLSearchParams();
            
            essentialParams.forEach(param => {
              if (urlObj.searchParams.has(param)) {
                params.append(param, urlObj.searchParams.get(param));
              }
            });
            
            // Rebuild the URL with only essential parameters
            const cleanPath = urlObj.pathname.split('/ref=')[0]; // Remove ref part from path
            const cleanUrl = `${urlObj.origin}${cleanPath}`;
            
            // Add back essential parameters if any
            const paramString = params.toString();
            productInfo.url = paramString ? `${cleanUrl}?${paramString}` : cleanUrl;
            break;
          }
        }
      }
      
      // Extract product title
      const titleSelectors = [
        'h2 a span',
        'h2 .a-link-normal',
        '.a-size-medium.a-color-base.a-text-normal',
        '.a-size-base-plus.a-color-base.a-text-normal',
        '.a-text-normal',
        'h5.s-line-clamp-1',
        'span.a-text-normal'
      ];
      
      for (const selector of titleSelectors) {
        const titleElement = productElement.querySelector(selector);
        if (titleElement && titleElement.textContent.trim()) {
          productInfo.title = titleElement.textContent.trim();
          break;
        }
      }
      
      // Extract product price
      const priceSelectors = [
        '.a-price .a-offscreen',
        '.a-price',
        '.a-color-price',
        '.s-price'
      ];
      
      for (const selector of priceSelectors) {
        const priceElement = productElement.querySelector(selector);
        if (priceElement) {
          // For elements with offscreen price (accessibility feature)
          if (selector === '.a-price .a-offscreen') {
            productInfo.price = priceElement.textContent.trim();
          } else {
            productInfo.price = priceElement.textContent.trim();
          }
          break;
        }
      }
      
      // Extract product image
      const imageSelectors = [
        '.s-image',
        'img[data-image-latency="s-product-image"]',
        'img.s-image',
        '.a-section img'
      ];
      
      for (const selector of imageSelectors) {
        const imageElement = productElement.querySelector(selector);
        if (imageElement && imageElement.src) {
          productInfo.image = imageElement.src;
          break;
        }
      }
      
      // Log extraction success
      if (productInfo.asin && productInfo.url) {
        console.log(`Successfully extracted product info for ASIN: ${productInfo.asin}`);
      } else {
        console.warn('Incomplete product info extracted:', productInfo);
      }
    } catch (error) {
      console.error('Error extracting product info:', error);
    }
    
    return productInfo;
  }
  
  // Create container for enhanced product information
  createInfoContainer(productElement, productInfo) {
    // Use the UI renderer to create the container
    if (!this.uiRenderer) {
      this.uiRenderer = new UIRenderer(this.settings);
    }
    
    const container = this.uiRenderer.createInfoContainer(productElement, productInfo);
    
    // Show loading state
    this.uiRenderer.showLoading(container);
    
    return container;
  }
  
  // Request product details from background script
  requestProductDetails(asin, productUrl, productElement) {
    console.log(`Requesting product details for ASIN: ${asin}`);
    
    // Show loading state in the UI
    const container = productElement.querySelector('.amz-enhancer-container');
    if (container && this.uiRenderer) {
      this.uiRenderer.showLoading(container);
    }
    
    // Set a timeout to handle cases where the background script doesn't respond
    const requestTimeout = 30000; // 30 seconds timeout
    let timeoutId = null;
    
    try {
      // Create a promise to handle the message response
      const requestPromise = new Promise((resolve, reject) => {
        // Set timeout to handle no response
        timeoutId = setTimeout(() => {
          reject(new Error('Request timed out after 30 seconds'));
        }, requestTimeout);
        
        // Send message to background script
        chrome.runtime.sendMessage({
          type: 'fetchProductDetails',
          asin: asin,
          url: productUrl,
          timestamp: Date.now() // Add timestamp for tracking
        }, response => {
          // Clear the timeout since we got a response
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          if (chrome.runtime.lastError) {
            // Handle Chrome runtime errors
            reject(new Error(`Chrome runtime error: ${chrome.runtime.lastError.message}`));
            return;
          }
          
          if (!response) {
            reject(new Error('No response received from background script'));
            return;
          }
          
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Unknown error'));
          }
        });
      });
      
      // Handle the promise
      requestPromise
        .then(data => {
          console.log(`Received product data for ASIN: ${asin}`);
          
          // Check if the data has a parsing error flag
          if (data.parsingError) {
            console.warn(`Received partial data with parsing errors for ASIN: ${asin}`);
            // Show a notification about partial data
            if (this.settings.showUserFriendlyErrors !== false) {
              const notification = document.createElement('div');
              notification.className = 'amz-enhancer-notification';
              notification.textContent = '部分数据可能不准确';
              notification.style.fontSize = '10px';
              notification.style.color = '#856404';
              notification.style.backgroundColor = '#fff3cd';
              notification.style.padding = '2px 5px';
              notification.style.borderRadius = '2px';
              notification.style.marginTop = '3px';
              
              const container = productElement.querySelector('.amz-enhancer-container');
              if (container) {
                const dataContainer = container.querySelector('.amz-enhancer-data');
                if (dataContainer) {
                  dataContainer.appendChild(notification);
                }
              }
            }
          }
          
          this.updateProductInfo(productElement, data);
        })
        .catch(error => {
          console.error(`Error fetching product data for ASIN: ${asin}:`, error);
          
          // Extract error details if available
          let errorDetails = {};
          if (typeof error === 'object' && error.errorDetails) {
            errorDetails = error.errorDetails;
          }
          
          this.handleProductError(productElement, error.message, errorDetails);
        });
        
    } catch (error) {
      // Handle any synchronous errors
      console.error(`Error initiating request for ASIN: ${asin}:`, error);
      this.handleProductError(productElement, error.message);
      
      // Clear timeout if it exists
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
  
  // Update product information with data from background script
  updateProductInfo(productElement, productData) {
    const container = productElement.querySelector('.amz-enhancer-container');
    if (!container) return;
    
    // Use the UI renderer to display the product data
    if (!this.uiRenderer) {
      this.uiRenderer = new UIRenderer(this.settings);
    }
    
    // Render all product information
    this.uiRenderer.renderProductInfo(container, productData);
  }
  
  // Handle errors in product data retrieval
  handleProductError(productElement, errorMessage, errorDetails = {}) {
    const container = productElement.querySelector('.amz-enhancer-container');
    if (!container) return;
    
    // Use the UI renderer to show the error
    if (!this.uiRenderer) {
      this.uiRenderer = new UIRenderer(this.settings);
    }
    
    const asin = productElement.dataset.enhancerAsin || 'unknown';
    console.error(`Error for product ${asin}: ${errorMessage}`);
    
    // Format user-friendly error message
    let userMessage = '无法加载数据';
    let isRecoverable = true;
    
    if (errorMessage) {
      if (errorMessage.includes('timeout')) {
        userMessage = '请求超时，请稍后再试';
      } else if (errorMessage.includes('network')) {
        userMessage = '网络错误，请检查连接';
      } else if (errorMessage.includes('parse')) {
        userMessage = '数据解析错误，部分信息可能不可用';
      } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        userMessage = '产品信息不可用';
        isRecoverable = false;
      } else if (errorMessage.includes('CAPTCHA') || errorMessage.includes('robot')) {
        userMessage = '访问受限，请稍后再试';
        isRecoverable = false;
      } else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
        userMessage = '访问被拒绝，请稍后再试';
        isRecoverable = false;
      }
    }
    
    // If we have errorDetails from the background script, use those
    if (errorDetails.errorType) {
      switch (errorDetails.errorType) {
        case 'timeout':
          userMessage = '请求超时，请稍后再试';
          isRecoverable = true;
          break;
        case 'connection':
          userMessage = '网络连接错误，请检查您的网络连接';
          isRecoverable = true;
          break;
        case 'captcha':
          userMessage = '访问受限，请稍后再试';
          isRecoverable = false;
          break;
        case 'not_found':
          userMessage = '产品信息不可用';
          isRecoverable = false;
          break;
        case 'forbidden':
          userMessage = '访问被拒绝，请稍后再试';
          isRecoverable = false;
          break;
        case 'rate_limited':
          userMessage = '请求过于频繁，请稍后再试';
          isRecoverable = true;
          break;
        case 'server_error':
          userMessage = '服务器错误，请稍后再试';
          isRecoverable = true;
          break;
        case 'parsing':
          userMessage = '数据解析错误，部分信息可能不可用';
          isRecoverable = true;
          break;
      }
      
      // If recoverable is explicitly set in errorDetails, use that
      if (errorDetails.recoverable !== undefined) {
        isRecoverable = errorDetails.recoverable;
      }
    }
    
    // Show the error in the UI
    this.uiRenderer.showError(container, userMessage);
    
    // Create retry callback function
    const retryCallback = () => {
      // Show loading state again
      this.uiRenderer.showLoading(container);
      
      // Get product info from element dataset
      const asin = productElement.dataset.enhancerAsin;
      const url = productElement.querySelector('a[href*="/dp/"]')?.href || 
                 `https://www.amazon.com/dp/${asin}`;
      
      // Request product details again
      if (asin && url) {
        setTimeout(() => {
          this.requestProductDetails(asin, url, productElement);
        }, 500); // Small delay to show loading state
      }
    };
    
    // Add retry button if error is recoverable
    if (isRecoverable) {
      // Create error display with retry button
      const errorElement = container.querySelector('.amz-enhancer-error');
      if (errorElement) {
        const retryButton = document.createElement('button');
        retryButton.className = 'amz-enhancer-retry-button';
        retryButton.textContent = '重试';
        retryButton.style.marginTop = '5px';
        retryButton.style.padding = '2px 8px';
        retryButton.style.fontSize = '12px';
        retryButton.style.cursor = 'pointer';
        retryButton.style.backgroundColor = '#f0f2f2';
        retryButton.style.border = '1px solid #cdcdcd';
        retryButton.style.borderRadius = '3px';
        
        // Add hover effect
        retryButton.addEventListener('mouseover', () => {
          retryButton.style.backgroundColor = '#e7e9ec';
        });
        retryButton.addEventListener('mouseout', () => {
          retryButton.style.backgroundColor = '#f0f2f2';
        });
        
        // Add click handler for retry
        retryButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          retryCallback();
        });
        
        errorElement.appendChild(document.createElement('br'));
        errorElement.appendChild(retryButton);
      }
      
      // Also add a manual refresh button
      const refreshButton = document.createElement('button');
      refreshButton.className = 'amz-enhancer-refresh-button';
      refreshButton.textContent = '刷新数据';
      refreshButton.style.marginTop = '5px';
      refreshButton.style.marginLeft = '5px';
      refreshButton.style.padding = '2px 8px';
      refreshButton.style.fontSize = '12px';
      refreshButton.style.cursor = 'pointer';
      refreshButton.style.backgroundColor = '#f0c14b';
      refreshButton.style.border = '1px solid #a88734';
      refreshButton.style.borderRadius = '3px';
      refreshButton.style.color = '#111';
      
      // Add hover effect
      refreshButton.addEventListener('mouseover', () => {
        refreshButton.style.backgroundColor = '#f4d078';
      });
      refreshButton.addEventListener('mouseout', () => {
        refreshButton.style.backgroundColor = '#f0c14b';
      });
      
      // Add click handler for refresh
      refreshButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Force refresh by clearing cache for this ASIN
        chrome.runtime.sendMessage({
          type: 'clearCacheForAsin',
          asin: asin
        }, () => {
          // After cache is cleared, retry the request
          retryCallback();
        });
      });
      
      // Add the refresh button to the container
      const errorElement = container.querySelector('.amz-enhancer-error');
      if (errorElement) {
        errorElement.appendChild(refreshButton);
      }
    }
    
    // Add debug info if available and in debug mode
    if (this.settings.debugMode && errorDetails) {
      const debugInfo = {
        errorType: errorDetails.errorType || 'unknown',
        message: errorMessage,
        asin: asin,
        retries: errorDetails.retries || 0,
        timestamp: new Date().toISOString()
      };
      
      // Add debug info to the error display
      const errorContainer = container.querySelector('.amz-enhancer-error')?.parentNode;
      if (errorContainer) {
        const debugContainer = document.createElement('div');
        debugContainer.className = 'amz-enhancer-debug-info';
        debugContainer.style.marginTop = '5px';
        debugContainer.style.fontSize = '10px';
        debugContainer.style.color = '#666';
        debugContainer.style.borderTop = '1px dashed #ddd';
        debugContainer.style.paddingTop = '3px';
        
        const debugToggle = document.createElement('a');
        debugToggle.href = '#';
        debugToggle.textContent = '显示技术详情';
        debugToggle.style.color = '#0066c0';
        debugToggle.style.textDecoration = 'none';
        debugToggle.style.fontSize = '10px';
        
        const debugDetails = document.createElement('pre');
        debugDetails.style.display = 'none';
        debugDetails.style.marginTop = '3px';
        debugDetails.style.padding = '3px';
        debugDetails.style.backgroundColor = '#f5f5f5';
        debugDetails.style.border = '1px solid #ddd';
        debugDetails.style.borderRadius = '2px';
        debugDetails.style.fontSize = '10px';
        debugDetails.style.whiteSpace = 'pre-wrap';
        debugDetails.style.wordBreak = 'break-all';
        debugDetails.textContent = JSON.stringify(debugInfo, null, 2);
        
        debugToggle.addEventListener('click', (e) => {
          e.preventDefault();
          if (debugDetails.style.display === 'none') {
            debugDetails.style.display = 'block';
            debugToggle.textContent = '隐藏技术详情';
          } else {
            debugDetails.style.display = 'none';
            debugToggle.textContent = '显示技术详情';
          }
        });
        
        debugContainer.appendChild(debugToggle);
        debugContainer.appendChild(debugDetails);
        errorContainer.appendChild(debugContainer);
      }
    }
  }
  
  // Set up observer for dynamically loaded content
  setupDynamicContentObserver() {
    console.log('Setting up dynamic content observer...');
    
    // Track if we're currently processing to avoid redundant operations
    this.isProcessing = false;
    
    // Debounce function to limit how often we process changes
    this.debounce = (func, wait) => {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    };
    
    // Throttle function to limit execution rate
    this.throttle = (func, limit) => {
      let inThrottle;
      return function executedFunction(...args) {
        if (!inThrottle) {
          func(...args);
          inThrottle = true;
          setTimeout(() => {
            inThrottle = false;
          }, limit);
        }
      };
    };
    
    // Setup mutation observer for DOM changes
    this.setupMutationObserver();
    
    // Setup scroll listener for infinite scrolling
    this.setupScrollListener();
    
    // Setup visibility change listener to handle tab switching
    this.setupVisibilityChangeListener();
    
    // Setup URL change listener for single-page applications
    this.setupURLChangeListener();
    
    // Setup intersection observer for lazy-loaded products
    this.setupIntersectionObserver();
    
    // Initial scan for products that might have been missed
    setTimeout(() => {
      this.scanProducts();
    }, 1000);
  }
  
  // Set up mutation observer to detect new products added to the DOM
  setupMutationObserver() {
    // Target the search results container or fallback to body
    const targetSelectors = [
      '#search',
      '.s-search-results',
      '.s-result-list',
      '[data-component-type="s-search-results"]',
      '.s-main-slot',
      '.sg-col-20-of-24.s-matching-dir',
      '.sg-col-16-of-20.s-matching-dir'
    ];
    
    let targetNode = null;
    for (const selector of targetSelectors) {
      targetNode = document.querySelector(selector);
      if (targetNode) break;
    }
    
    if (!targetNode) {
      targetNode = document.body;
      console.log('No specific search container found, observing body');
    } else {
      console.log(`Observing container: ${targetNode.tagName}${targetNode.id ? '#' + targetNode.id : ''}`);
    }
    
    // Options for the observer - focus on childList changes
    const config = { 
      childList: true, 
      subtree: true,
      attributes: false,
      characterData: false
    };
    
    // Process mutations with debouncing to improve performance
    const processMutations = this.debounce((mutationsList) => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      
      let newProductsFound = false;
      let productElements = new Set();
      
      // Check if any mutations added new product elements
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any of the added nodes are product elements or contain product elements
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the node itself is a product element
              if (this.isProductElement(node)) {
                productElements.add(node);
              }
              
              // Check if the node contains product elements
              const foundProducts = this.findProductElements(node);
              if (foundProducts.length > 0) {
                foundProducts.forEach(product => productElements.add(product));
              }
            }
          });
        }
      }
      
      // Process all found product elements
      if (productElements.size > 0) {
        console.log(`Found ${productElements.size} new products from DOM mutations`);
        newProductsFound = true;
        
        // Process in batches to avoid blocking the UI
        this.processBatch(Array.from(productElements));
      }
      
      this.isProcessing = false;
    }, 300); // 300ms debounce
    
    // Create an observer instance
    const observer = new MutationObserver((mutationsList) => {
      processMutations(mutationsList);
    });
    
    // Start observing
    observer.observe(targetNode, config);
    
    // Store the observer for later reference
    this.observer = observer;
    console.log('Mutation observer setup complete');
  }
  
  // Set up scroll listener to handle infinite scrolling
  setupScrollListener() {
    // Process scroll events with throttling to improve performance
    const processScroll = this.throttle(() => {
      if (this.isProcessing) return;
      
      // Check if we're near the bottom of the page
      const scrollPosition = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // If we're within 1000px of the bottom, scan for new products
      if (scrollPosition + windowHeight > documentHeight - 1000) {
        console.log('Near bottom of page, scanning for new products...');
        this.scanProducts();
      }
    }, 500); // 500ms throttle
    
    // Add scroll event listener
    window.addEventListener('scroll', processScroll);
    
    // Store the listener for later reference
    this.scrollListener = processScroll;
    console.log('Scroll listener setup complete');
  }
  
  // Set up visibility change listener to handle tab switching
  setupVisibilityChangeListener() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab became visible, scanning for new products...');
        // Slight delay to ensure page is fully rendered
        setTimeout(() => {
          this.scanProducts();
        }, 500);
      }
    });
    console.log('Visibility change listener setup complete');
  }
  
  // Set up URL change listener for single-page applications
  setupURLChangeListener() {
    // Store the current URL
    this.currentURL = window.location.href;
    
    // Create a mutation observer to detect URL changes
    const urlObserver = new MutationObserver(this.debounce(() => {
      // Check if URL has changed
      if (window.location.href !== this.currentURL) {
        console.log('URL changed from', this.currentURL, 'to', window.location.href);
        this.currentURL = window.location.href;
        
        // Check if we're still on an Amazon search page
        if (this.isAmazonSearchPage()) {
          console.log('Still on Amazon search page, rescanning products');
          
          // Reset processed products to allow rescanning
          this.processedProducts = new Set();
          
          // Scan for products with a slight delay to ensure page is loaded
          setTimeout(() => {
            this.scanProducts();
          }, 1000);
        } else {
          console.log('No longer on Amazon search page, disabling enhancer');
          this.initialized = false;
        }
      }
    }, 300));
    
    // Observe changes to the URL by watching for changes to the body
    urlObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Store the observer for later reference
    this.urlObserver = urlObserver;
    console.log('URL change listener setup complete');
  }
  
  // Set up intersection observer for lazy-loaded products
  setupIntersectionObserver() {
    // Skip if IntersectionObserver is not supported
    if (!('IntersectionObserver' in window)) {
      console.log('IntersectionObserver not supported, skipping');
      return;
    }
    
    // Create an intersection observer to detect when products come into view
    const intersectionObserver = new IntersectionObserver((entries) => {
      // Filter for entries that are intersecting (visible)
      const visibleEntries = entries.filter(entry => entry.isIntersecting);
      
      if (visibleEntries.length > 0) {
        console.log(`${visibleEntries.length} products came into view`);
        
        // Process each visible product
        visibleEntries.forEach(entry => {
          const productElement = entry.target;
          
          // Check if this is a product element that hasn't been processed
          if (this.isProductElement(productElement)) {
            this.processProductElement(productElement);
          }
          
          // Stop observing this element
          intersectionObserver.unobserve(productElement);
        });
      }
    }, {
      // Options for the observer
      root: null, // Use the viewport
      rootMargin: '200px', // Start loading when product is 200px from viewport
      threshold: 0.1 // Trigger when 10% of the product is visible
    });
    
    // Function to observe new products
    this.observeNewProducts = () => {
      // Find all product elements that haven't been processed
      const productSelectors = [
        '[data-component-type="s-search-result"]',
        '.s-result-item:not(.s-widget):not(.AdHolder)',
        '.sg-col-4-of-12.s-result-item',
        '.sg-col-4-of-16.s-result-item',
        '.sg-col-20-of-24.s-result-item',
        '.sg-col-16-of-20.s-result-item',
        'div[data-asin]:not([data-asin=""])', // Products with non-empty ASIN
        '.s-card-container' // Newer Amazon layout
      ];
      
      // Find all product elements
      let productElements = [];
      productSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            productElements = [...productElements, ...Array.from(elements)];
          }
        } catch (error) {
          console.error(`Error querying selector ${selector}:`, error);
        }
      });
      
      // Filter for unprocessed products
      const unprocessedProducts = productElements.filter(element => {
        // Skip if already processed
        if (element.dataset.enhancerProcessed === 'true') {
          return false;
        }
        
        // Skip if already in processed set
        const dataId = element.getAttribute('data-asin') || 
                      element.getAttribute('data-uuid') || 
                      element.getAttribute('id');
        
        if (!dataId || this.processedProducts.has(dataId)) {
          return false;
        }
        
        // Skip sponsored products
        if (
          element.classList.contains('AdHolder') || 
          element.querySelector('.s-sponsored-label-info-icon') ||
          element.querySelector('[data-component-type="sp-sponsored-result"]')
        ) {
          return false;
        }
        
        return true;
      });
      
      // Start observing each unprocessed product
      if (unprocessedProducts.length > 0) {
        console.log(`Observing ${unprocessedProducts.length} unprocessed products`);
        unprocessedProducts.forEach(product => {
          intersectionObserver.observe(product);
        });
      }
    };
    
    // Store the observer for later reference
    this.intersectionObserver = intersectionObserver;
    
    // Start observing products
    this.observeNewProducts();
    
    // Set up a periodic check for new products to observe
    this.intersectionObserverInterval = setInterval(() => {
      this.observeNewProducts();
    }, 2000);
    
    console.log('Intersection observer setup complete');
  }
  
  // Process a batch of product elements to avoid blocking the UI
  processBatch(productElements, index = 0, batchSize = 5) {
    if (index >= productElements.length) {
      console.log('Batch processing complete');
      
      // After processing all batches, check for any new products that might have been added
      // during processing, but use a delay to avoid immediate rescanning
      setTimeout(() => {
        // Check if we need to observe new products for intersection observer
        if (this.intersectionObserver && this.observeNewProducts) {
          this.observeNewProducts();
        }
      }, 500);
      
      return;
    }
    
    const endIndex = Math.min(index + batchSize, productElements.length);
    const currentBatch = productElements.slice(index, endIndex);
    
    console.log(`Processing batch ${index + 1} to ${endIndex} of ${productElements.length}`);
    
    // Process current batch
    currentBatch.forEach(productElement => {
      try {
        this.processProductElement(productElement);
      } catch (error) {
        console.error('Error processing product element:', error);
      }
    });
    
    // Use requestAnimationFrame for better performance
    // This ensures we process the next batch during browser's idle time
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.processBatch(productElements, endIndex, batchSize);
      }, 50);
    });
  }
  
  // Clean up all observers and event listeners
  cleanup() {
    console.log('Cleaning up observers and event listeners');
    
    // Disconnect mutation observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // Disconnect URL observer
    if (this.urlObserver) {
      this.urlObserver.disconnect();
      this.urlObserver = null;
    }
    
    // Disconnect intersection observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
    
    // Clear intersection observer interval
    if (this.intersectionObserverInterval) {
      clearInterval(this.intersectionObserverInterval);
      this.intersectionObserverInterval = null;
    }
    
    // Remove scroll event listener
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
      this.scrollListener = null;
    }
    
    console.log('Cleanup complete');
  }
  
  // Helper method to check if an element is a product element
  isProductElement(element) {
    if (!element || !element.getAttribute) return false;
    
    // Skip elements that are already processed
    if (element.dataset.enhancerProcessed === 'true') return false;
    
    // Skip sponsored products
    if (
      element.classList.contains('AdHolder') || 
      element.querySelector('.s-sponsored-label-info-icon') ||
      element.querySelector('[data-component-type="sp-sponsored-result"]')
    ) {
      return false;
    }
    
    // Check for common product element indicators
    const isProduct = (
      (element.getAttribute('data-asin') && element.getAttribute('data-asin') !== '') || 
      (element.classList.contains('s-result-item') && !element.classList.contains('s-widget')) ||
      element.getAttribute('data-component-type') === 's-search-result'
    );
    
    // Additional check: must be visible
    if (isProduct && element.offsetParent === null) {
      return false; // Skip hidden elements
    }
    
    return isProduct;
  }
  
  // Helper method to find product elements within a container
  findProductElements(container) {
    if (!container || !container.querySelectorAll) return [];
    
    // Common selectors for product containers across different Amazon layouts
    const productSelectors = [
      '[data-component-type="s-search-result"]',
      '.s-result-item:not(.s-widget):not(.AdHolder)',
      '.sg-col-4-of-12.s-result-item',
      '.sg-col-4-of-16.s-result-item',
      '.sg-col-20-of-24.s-result-item',
      '.sg-col-16-of-20.s-result-item',
      'div[data-asin]:not([data-asin=""])', // Products with non-empty ASIN
      '.s-card-container' // Newer Amazon layout
    ];
    
    // Combine results from all selectors
    let results = [];
    productSelectors.forEach(selector => {
      try {
        const elements = container.querySelectorAll(selector);
        if (elements.length > 0) {
          results = [...results, ...elements];
        }
      } catch (error) {
        console.error(`Error querying selector ${selector}:`, error);
      }
    });
    
    // Filter out duplicates and already processed elements
    const uniqueResults = Array.from(new Set(results)).filter(element => {
      // Get a unique identifier for the element
      const dataId = element.getAttribute('data-asin') || 
                    element.getAttribute('data-uuid') || 
                    element.getAttribute('id');
      
      // Skip if no ID or already processed
      if (!dataId || this.processedProducts.has(dataId)) {
        return false;
      }
      
      // Skip sponsored products
      if (
        element.classList.contains('AdHolder') || 
        element.querySelector('.s-sponsored-label-info-icon') ||
        element.querySelector('[data-component-type="sp-sponsored-result"]')
      ) {
        return false;
      }
      
      // Skip hidden elements
      if (element.offsetParent === null) {
        return false;
      }
      
      return true;
    });
    
    return uniqueResults;
  }
}

// Initialize the enhancer when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (!window.amazonEnhancerInitialized) {
    console.log('Initializing Amazon Product Enhancer on DOMContentLoaded');
    window.amazonProductEnhancer = new ProductEnhancer();
    window.amazonProductEnhancer.init().then(() => {
      window.amazonEnhancerInitialized = window.amazonProductEnhancer.initialized;
    });
  }
});

// Also initialize on window load to ensure all resources are loaded
window.addEventListener('load', () => {
  // Check if already initialized by DOMContentLoaded
  if (!window.amazonEnhancerInitialized) {
    console.log('Initializing Amazon Product Enhancer on window.load');
    window.amazonProductEnhancer = new ProductEnhancer();
    window.amazonProductEnhancer.init().then(() => {
      window.amazonEnhancerInitialized = window.amazonProductEnhancer.initialized;
    });
  } else {
    // If already initialized, make sure we're still on a search page
    // and scan for any products that might have been missed
    if (window.amazonProductEnhancer && window.amazonProductEnhancer.initialized) {
      console.log('Amazon Product Enhancer already initialized, scanning for missed products');
      window.amazonProductEnhancer.scanProducts();
    }
  }
});

// Handle page unload to clean up resources
window.addEventListener('beforeunload', () => {
  if (window.amazonProductEnhancer) {
    console.log('Page unloading, cleaning up Amazon Product Enhancer');
    window.amazonProductEnhancer.cleanup();
  }
});

// Listen for history state changes (for single-page applications)
window.addEventListener('popstate', () => {
  console.log('History state changed, checking if reinitialize is needed');
  
  if (window.amazonProductEnhancer) {
    // Check if we're on an Amazon search page
    if (window.amazonProductEnhancer.isAmazonSearchPage()) {
      console.log('Still on Amazon search page, rescanning products');
      
      // Reset processed products to allow rescanning
      window.amazonProductEnhancer.processedProducts = new Set();
      
      // Scan for products with a slight delay to ensure page is loaded
      setTimeout(() => {
        window.amazonProductEnhancer.scanProducts();
      }, 500);
    } else {
      console.log('No longer on Amazon search page, cleaning up');
      window.amazonProductEnhancer.cleanup();
      window.amazonEnhancerInitialized = false;
    }
  } else {
    // If not initialized, check if we should initialize
    const tempEnhancer = new ProductEnhancer();
    if (tempEnhancer.isAmazonSearchPage()) {
      console.log('On Amazon search page, initializing Amazon Product Enhancer');
      window.amazonProductEnhancer = tempEnhancer;
      window.amazonProductEnhancer.init().then(() => {
        window.amazonEnhancerInitialized = window.amazonProductEnhancer.initialized;
      });
    }
  }
});ue});

// Add unit tests for product identification
// These would normally be in a separate file, but for this task we'll include them here
// In a real-world scenario, we would use a testing framework like Jest

// Simple test function to validate ASIN extraction
function testAsinExtraction() {
  console.log('Running ASIN extraction tests');
  
  // Test cases
  const testCases = [
    {
      html: '<div data-asin="B08N5KWB9H"></div>',
      expectedAsin: 'B08N5KWB9H'
    },
    {
      html: '<div><a href="/dp/B08N5KWB9H/ref=sr_1_1"></a></div>',
      expectedAsin: 'B08N5KWB9H'
    },
    {
      html: '<div><a href="https://www.amazon.com/product-name/dp/B08N5KWB9H/ref=sr_1_1"></a></div>',
      expectedAsin: 'B08N5KWB9H'
    }
  ];
  
  // Run tests
  testCases.forEach((testCase, index) => {
    // Create test element
    const testElement = document.createElement('div');
    testElement.innerHTML = testCase.html;
    document.body.appendChild(testElement);
    
    // Create enhancer instance
    const enhancer = new ProductEnhancer();
    
    // Extract product info
    const productInfo = enhancer.extractProductInfo(testElement.firstChild);
    
    // Check result
    const passed = productInfo.asin === testCase.expectedAsin;
    console.log(`Test ${index + 1}: ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  Expected: ${testCase.expectedAsin}`);
    console.log(`  Actual: ${productInfo.asin}`);
    
    // Clean up
    document.body.removeChild(testElement);
  });
}

// Run tests in development mode only
if (process.env.NODE_ENV === 'development') {
  // This would run in a test environment, not in production
  // testAsinExtraction();
}