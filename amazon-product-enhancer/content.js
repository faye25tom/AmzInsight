// Content script for Amazon Product Enhancer

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
    // Check if container already exists
    if (productElement.querySelector('.amz-enhancer-container')) {
      return;
    }
    
    // Find a good location to insert our container
    let insertLocation = null;
    
    // Common selectors for insertion points - ordered by preference
    const insertSelectors = [
      '.a-price-whole', // Price element
      '.a-price',
      '.a-row.a-size-base.a-color-secondary',
      '.a-row.a-size-base',
      '.a-section.a-spacing-none.a-spacing-top-small',
      '.a-section.a-spacing-small',
      '.a-section'
    ];
    
    for (const selector of insertSelectors) {
      const elements = productElement.querySelectorAll(selector);
      if (elements.length > 0) {
        // Use the last element of this type as insertion point
        // This is often better for Amazon's layout
        insertLocation = elements[elements.length - 1];
        break;
      }
    }
    
    // If no specific insertion point found, try to find any suitable parent
    if (!insertLocation) {
      const fallbackSelectors = [
        '.a-row',
        '.a-box-inner',
        '.a-section'
      ];
      
      for (const selector of fallbackSelectors) {
        const elements = productElement.querySelectorAll(selector);
        if (elements.length > 0) {
          insertLocation = elements[elements.length - 1];
          break;
        }
      }
    }
    
    // If still no insertion point, use the product element itself
    if (!insertLocation) {
      insertLocation = productElement;
    }
    
    // Create the container
    const container = document.createElement('div');
    container.className = 'amz-enhancer-container';
    container.dataset.asin = productInfo.asin;
    
    // Build the initial content with available information
    let initialContent = `
      <div class="amz-enhancer-title">产品信息</div>
      <div class="amz-enhancer-data">
    `;
    
    // Always show ASIN if available
    if (productInfo.asin) {
      initialContent += `
        <div class="amz-enhancer-item">
          <span class="amz-enhancer-label">ASIN:</span>
          <span class="amz-enhancer-value">${productInfo.asin}</span>
        </div>
      `;
    }
    
    // Add loading indicator for additional data
    initialContent += `<div class="amz-enhancer-loading">加载中...</div>`;
    initialContent += `</div>`; // Close amz-enhancer-data
    
    container.innerHTML = initialContent;
    
    // Insert after the target element
    if (insertLocation.parentNode) {
      insertLocation.parentNode.insertBefore(container, insertLocation.nextSibling);
    } else {
      // Fallback - append to the product element
      productElement.appendChild(container);
    }
    
    return container;
  }
  
  // Request product details from background script
  requestProductDetails(asin, productUrl, productElement) {
    chrome.runtime.sendMessage({
      type: 'fetchProductDetails',
      asin: asin,
      url: productUrl
    }, response => {
      if (response && response.success) {
        this.updateProductInfo(productElement, response.data);
      } else {
        this.handleProductError(productElement, response ? response.error : 'Unknown error');
      }
    });
  }
  
  // Update product information with data from background script
  updateProductInfo(productElement, productData) {
    const container = productElement.querySelector('.amz-enhancer-container');
    if (!container) return;
    
    // Remove loading indicator
    const loadingElement = container.querySelector('.amz-enhancer-loading');
    if (loadingElement) {
      loadingElement.remove();
    }
    
    // Create data display
    const dataContainer = container.querySelector('.amz-enhancer-data');
    
    // This is a placeholder for the full implementation in task 6
    // For now, we'll just show the ASIN which we already have
    if (this.settings.showASIN) {
      // ASIN is already displayed in the initial container
    }
    
    // Add a note that other data will be available in future tasks
    const noteElement = document.createElement('div');
    noteElement.className = 'amz-enhancer-item';
    noteElement.innerHTML = '<span class="amz-enhancer-label">Note:</span> <span class="amz-enhancer-value">Full data will be available in future tasks</span>';
    dataContainer.appendChild(noteElement);
  }
  
  // Handle errors in product data retrieval
  handleProductError(productElement, errorMessage) {
    const container = productElement.querySelector('.amz-enhancer-container');
    if (!container) return;
    
    // Remove loading indicator
    const loadingElement = container.querySelector('.amz-enhancer-loading');
    if (loadingElement) {
      loadingElement.remove();
    }
    
    // Add error message
    const errorElement = document.createElement('div');
    errorElement.className = 'amz-enhancer-error';
    errorElement.textContent = `Error: ${errorMessage || 'Failed to load product data'}`;
    container.querySelector('.amz-enhancer-data').appendChild(errorElement);
  }
  
  // Set up observer for dynamically loaded content
  setupDynamicContentObserver() {
    // This is a placeholder for the full implementation in task 8
    // For now, we'll implement a basic observer to detect new products
    console.log('Setting up dynamic content observer...');
    
    // Create a simple observer to detect when new products are added to the page
    const targetNode = document.querySelector('#search') || document.body;
    
    // Options for the observer
    const config = { 
      childList: true, 
      subtree: true,
      attributes: false,
      characterData: false
    };
    
    // Create an observer instance
    const observer = new MutationObserver((mutationsList) => {
      let newProductsFound = false;
      
      // Check if any mutations added new product elements
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any of the added nodes are product elements or contain product elements
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the node itself is a product element
              if (this.isProductElement(node)) {
                this.processProductElement(node);
                newProductsFound = true;
              }
              
              // Check if the node contains product elements
              const productElements = this.findProductElements(node);
              if (productElements.length > 0) {
                productElements.forEach(productElement => {
                  this.processProductElement(productElement);
                });
                newProductsFound = true;
              }
            }
          });
        }
      }
      
      if (newProductsFound) {
        console.log('New products detected and processed');
      }
    });
    
    // Start observing
    observer.observe(targetNode, config);
    
    // Store the observer for later reference
    this.observer = observer;
  }
  
  // Helper method to check if an element is a product element
  isProductElement(element) {
    if (!element || !element.getAttribute) return false;
    
    // Check for common product element indicators
    return (
      element.getAttribute('data-asin') || 
      element.classList.contains('s-result-item') ||
      element.getAttribute('data-component-type') === 's-search-result'
    );
  }
  
  // Helper method to find product elements within a container
  findProductElements(container) {
    if (!container || !container.querySelectorAll) return [];
    
    // Common selectors for product containers
    const productSelectors = [
      '[data-component-type="s-search-result"]',
      '.s-result-item:not(.s-widget):not(.AdHolder)',
      'div[data-asin]:not([data-asin=""])'
    ];
    
    // Combine results from all selectors
    let results = [];
    productSelectors.forEach(selector => {
      const elements = container.querySelectorAll(selector);
      if (elements.length > 0) {
        results = [...results, ...elements];
      }
    });
    
    // Filter out duplicates and already processed elements
    return Array.from(new Set(results)).filter(element => {
      const dataId = element.getAttribute('data-asin') || 
                    element.getAttribute('data-uuid') || 
                    element.getAttribute('id');
      
      return dataId && !this.processedProducts.has(dataId);
    });
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
  }
});

// Listen for URL changes (for single-page applications)
let lastUrl = location.href;
new MutationObserver(() => {
  if (lastUrl !== location.href) {
    lastUrl = location.href;
    console.log('URL changed, reinitializing Amazon Product Enhancer');
    
    // Reset initialization flag
    window.amazonEnhancerInitialized = false;
    
    // Reinitialize
    if (window.amazonProductEnhancer) {
      window.amazonProductEnhancer.init().then(() => {
        window.amazonEnhancerInitialized = window.amazonProductEnhancer.initialized;
      });
    } else {
      window.amazonProductEnhancer = new ProductEnhancer();
      window.amazonProductEnhancer.init().then(() => {
        window.amazonEnhancerInitialized = window.amazonProductEnhancer.initialized;
      });
    }
  }
}).observe(document, {subtree: true, childList: true});

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