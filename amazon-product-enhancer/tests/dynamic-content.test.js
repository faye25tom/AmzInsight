/**
 * Tests for dynamic content handling functionality
 * 
 * These tests verify that the ProductEnhancer correctly:
 * 1. Detects and processes dynamically added products
 * 2. Handles scroll events for infinite scrolling
 * 3. Optimizes performance with debouncing and throttling
 * 4. Properly handles URL changes and page navigation
 * 5. Uses intersection observer for lazy-loaded products
 */

// Mock dependencies
const mockUIRenderer = {
  createInfoContainer: jest.fn(() => document.createElement('div')),
  showLoading: jest.fn(),
  renderProductInfo: jest.fn(),
  showError: jest.fn(),
  applyUserSettings: jest.fn()
};

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn((message, callback) => {
      setTimeout(() => {
        callback({ success: true, data: { asin: message.asin } });
      }, 10);
    }),
    lastError: null
  },
  storage: {
    sync: {
      get: jest.fn((keys, callback) => {
        callback({
          enabled: true,
          showBSR: true,
          showASIN: true,
          showBrand: true,
          showSalesData: true
        });
      })
    }
  }
};

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn(function(callback) {
  this.observe = jest.fn();
  this.unobserve = jest.fn();
  this.disconnect = jest.fn();
  this.callback = callback;
  
  // Method to trigger the callback with mock entries
  this.triggerIntersection = (entries) => {
    this.callback(entries);
  };
});

// Import ProductEnhancer class
// In a real test environment, we would use proper imports
// For this test, we'll assume the class is available globally
const ProductEnhancer = window.ProductEnhancer;

describe('Dynamic Content Handling', () => {
  let enhancer;
  let originalMutationObserver;
  let mockMutationObserver;
  
  beforeEach(() => {
    // Save original MutationObserver
    originalMutationObserver = window.MutationObserver;
    
    // Create mock MutationObserver
    mockMutationObserver = jest.fn(function(callback) {
      this.observe = jest.fn();
      this.disconnect = jest.fn();
      this.callback = callback;
      
      // Method to trigger the callback with mock mutations
      this.triggerMutations = (mutations) => {
        this.callback(mutations);
      };
    });
    
    // Replace global MutationObserver with mock
    window.MutationObserver = mockMutationObserver;
    
    // Create enhancer instance
    enhancer = new ProductEnhancer();
    enhancer.uiRenderer = mockUIRenderer;
    enhancer.initialized = true;
    
    // Mock methods
    enhancer.processProductElement = jest.fn();
    enhancer.scanProducts = jest.fn();
    enhancer.isProductElement = jest.fn(element => {
      return element.hasAttribute('data-asin') && !element.dataset.enhancerProcessed;
    });
    enhancer.findProductElements = jest.fn(container => {
      const products = Array.from(container.querySelectorAll('[data-asin]'))
        .filter(el => !el.dataset.enhancerProcessed);
      return products;
    });
    
    // Setup document body
    document.body.innerHTML = `
      <div id="search">
        <div class="s-search-results">
          <div data-asin="B08N5KWB9H" class="s-result-item">Product 1</div>
          <div data-asin="B08N5KWB9I" class="s-result-item">Product 2</div>
        </div>
      </div>
    `;
    
    // Mock window methods
    window.scrollY = 0;
    window.innerHeight = 800;
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000 });
    
    // Mock requestAnimationFrame
    window.requestAnimationFrame = jest.fn(callback => setTimeout(callback, 0));
  });
  
  afterEach(() => {
    // Restore original MutationObserver
    window.MutationObserver = originalMutationObserver;
    
    // Clean up
    document.body.innerHTML = '';
    jest.clearAllMocks();
    
    // Call cleanup to ensure all observers are disconnected
    if (enhancer.cleanup) {
      enhancer.cleanup();
    }
  });
  
  test('setupDynamicContentObserver initializes all observers', () => {
    enhancer.setupDynamicContentObserver();
    
    expect(mockMutationObserver).toHaveBeenCalled();
    expect(enhancer.observer).toBeDefined();
    expect(enhancer.observer.observe).toHaveBeenCalled();
    
    // Check that URL change listener is set up
    expect(enhancer.urlObserver).toBeDefined();
    
    // Check that intersection observer is set up
    expect(enhancer.intersectionObserver).toBeDefined();
    expect(enhancer.intersectionObserverInterval).toBeDefined();
  });
  
  test('MutationObserver detects new products', (done) => {
    enhancer.setupDynamicContentObserver();
    
    // Create a mock mutation
    const mockMutation = {
      type: 'childList',
      addedNodes: [
        document.createElement('div') // Non-product element
      ]
    };
    
    // Create a product element
    const productElement = document.createElement('div');
    productElement.setAttribute('data-asin', 'B08N5KWB9J');
    productElement.classList.add('s-result-item');
    
    // Add product to mutation
    mockMutation.addedNodes.push(productElement);
    
    // Trigger mutation
    enhancer.observer.triggerMutations([mockMutation]);
    
    // Wait for debounce
    setTimeout(() => {
      expect(enhancer.isProductElement).toHaveBeenCalledWith(productElement);
      expect(enhancer.processBatch).toHaveBeenCalled();
      done();
    }, 350); // Slightly longer than debounce time
  });
  
  test('Scroll listener triggers product scan near bottom of page', (done) => {
    enhancer.setupDynamicContentObserver();
    
    // Mock scroll to bottom
    window.scrollY = 1300; // Near bottom (1300 + 800 > 2000 - 1000)
    
    // Trigger scroll event
    window.dispatchEvent(new Event('scroll'));
    
    // Wait for throttle
    setTimeout(() => {
      expect(enhancer.scanProducts).toHaveBeenCalled();
      done();
    }, 550); // Slightly longer than throttle time
  });
  
  test('Visibility change listener triggers product scan', (done) => {
    enhancer.setupDynamicContentObserver();
    
    // Mock visibility change
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    
    // Trigger visibility change event
    document.dispatchEvent(new Event('visibilitychange'));
    
    // Wait for timeout
    setTimeout(() => {
      expect(enhancer.scanProducts).toHaveBeenCalled();
      done();
    }, 550); // Slightly longer than timeout
  });
  
  test('URL change listener detects URL changes', (done) => {
    // Mock isAmazonSearchPage to return true
    enhancer.isAmazonSearchPage = jest.fn(() => true);
    enhancer.setupDynamicContentObserver();
    
    // Store initial URL
    const initialURL = window.location.href;
    
    // Change URL
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://www.amazon.com/s?k=new+search',
        ...window.location
      },
      writable: true
    });
    
    // Trigger URL change
    enhancer.urlObserver.triggerMutations([{
      type: 'childList',
      addedNodes: [document.createElement('div')]
    }]);
    
    // Wait for debounce
    setTimeout(() => {
      expect(enhancer.isAmazonSearchPage).toHaveBeenCalled();
      expect(enhancer.processedProducts.size).toBe(0); // Should be reset
      
      // Wait for scan timeout
      setTimeout(() => {
        expect(enhancer.scanProducts).toHaveBeenCalled();
        done();
      }, 1050);
    }, 350);
  });
  
  test('Intersection observer processes products when they become visible', (done) => {
    enhancer.setupDynamicContentObserver();
    
    // Create mock product elements
    const product1 = document.createElement('div');
    product1.setAttribute('data-asin', 'B08N5KWB9K');
    
    const product2 = document.createElement('div');
    product2.setAttribute('data-asin', 'B08N5KWB9L');
    
    // Create mock intersection entries
    const entries = [
      {
        isIntersecting: true,
        target: product1
      },
      {
        isIntersecting: false, // This one shouldn't be processed
        target: product2
      }
    ];
    
    // Trigger intersection
    enhancer.intersectionObserver.triggerIntersection(entries);
    
    // Check that only the intersecting product was processed
    expect(enhancer.isProductElement).toHaveBeenCalledWith(product1);
    expect(enhancer.isProductElement).not.toHaveBeenCalledWith(product2);
    
    // Check that the observer stopped watching the processed product
    expect(enhancer.intersectionObserver.unobserve).toHaveBeenCalledWith(product1);
    expect(enhancer.intersectionObserver.unobserve).not.toHaveBeenCalledWith(product2);
    
    done();
  });
  
  test('processBatch handles products in batches', (done) => {
    // Create test products
    const products = [];
    for (let i = 0; i < 12; i++) {
      const product = document.createElement('div');
      product.setAttribute('data-asin', `B08N5KWB${i}`);
      products.push(product);
    }
    
    // Process batch
    enhancer.processBatch(products, 0, 5);
    
    // Check first batch processed immediately
    expect(enhancer.processProductElement).toHaveBeenCalledTimes(5);
    
    // Wait for second batch
    setTimeout(() => {
      expect(enhancer.processProductElement).toHaveBeenCalledTimes(10);
      
      // Wait for third batch
      setTimeout(() => {
        expect(enhancer.processProductElement).toHaveBeenCalledTimes(12);
        
        // Check that observeNewProducts is called after all batches
        setTimeout(() => {
          // Mock the observeNewProducts method
          enhancer.observeNewProducts = jest.fn();
          enhancer.intersectionObserver = {}; // Mock the observer
          
          // Process a new batch
          enhancer.processBatch([product1, product2], 0, 2);
          
          // Wait for the final timeout
          setTimeout(() => {
            expect(enhancer.observeNewProducts).toHaveBeenCalled();
            done();
          }, 550);
        }, 100);
      }, 100);
    }, 100);
  });
  
  test('cleanup disconnects all observers and removes event listeners', () => {
    enhancer.setupDynamicContentObserver();
    
    // Mock the observers and listeners
    enhancer.observer = { disconnect: jest.fn() };
    enhancer.urlObserver = { disconnect: jest.fn() };
    enhancer.intersectionObserver = { disconnect: jest.fn() };
    enhancer.intersectionObserverInterval = 123;
    enhancer.scrollListener = jest.fn();
    
    // Mock clearInterval
    const originalClearInterval = window.clearInterval;
    window.clearInterval = jest.fn();
    
    // Mock removeEventListener
    const originalRemoveEventListener = window.removeEventListener;
    window.removeEventListener = jest.fn();
    
    // Call cleanup
    enhancer.cleanup();
    
    // Check that all observers were disconnected
    expect(enhancer.observer.disconnect).toHaveBeenCalled();
    expect(enhancer.urlObserver.disconnect).toHaveBeenCalled();
    expect(enhancer.intersectionObserver.disconnect).toHaveBeenCalled();
    
    // Check that interval was cleared
    expect(window.clearInterval).toHaveBeenCalledWith(123);
    
    // Check that event listener was removed
    expect(window.removeEventListener).toHaveBeenCalledWith('scroll', enhancer.scrollListener);
    
    // Restore original functions
    window.clearInterval = originalClearInterval;
    window.removeEventListener = originalRemoveEventListener;
  });
  
  test('isProductElement correctly identifies product elements', () => {
    // Restore the original method for this test
    enhancer.isProductElement = ProductEnhancer.prototype.isProductElement;
    
    // Valid product element
    const validProduct = document.createElement('div');
    validProduct.setAttribute('data-asin', 'B08N5KWB9H');
    expect(enhancer.isProductElement(validProduct)).toBe(true);
    
    // Already processed product
    const processedProduct = document.createElement('div');
    processedProduct.setAttribute('data-asin', 'B08N5KWB9I');
    processedProduct.dataset.enhancerProcessed = 'true';
    expect(enhancer.isProductElement(processedProduct)).toBe(false);
    
    // Sponsored product
    const sponsoredProduct = document.createElement('div');
    sponsoredProduct.setAttribute('data-asin', 'B08N5KWB9J');
    const sponsoredLabel = document.createElement('span');
    sponsoredLabel.classList.add('s-sponsored-label-info-icon');
    sponsoredProduct.appendChild(sponsoredLabel);
    expect(enhancer.isProductElement(sponsoredProduct)).toBe(false);
    
    // Non-product element
    const nonProduct = document.createElement('div');
    expect(enhancer.isProductElement(nonProduct)).toBe(false);
  });
  
  test('findProductElements finds all product elements in container', () => {
    // Restore the original method for this test
    enhancer.findProductElements = ProductEnhancer.prototype.findProductElements;
    enhancer.processedProducts = new Set(); // Reset processed products
    
    // Create test container with products
    const container = document.createElement('div');
    
    // Add valid products
    for (let i = 0; i < 3; i++) {
      const product = document.createElement('div');
      product.setAttribute('data-asin', `B08N5KWB${i}`);
      product.classList.add('s-result-item');
      container.appendChild(product);
    }
    
    // Add already processed product
    const processedProduct = document.createElement('div');
    processedProduct.setAttribute('data-asin', 'B08N5KWBX');
    processedProduct.dataset.enhancerProcessed = 'true';
    container.appendChild(processedProduct);
    
    // Add sponsored product
    const sponsoredProduct = document.createElement('div');
    sponsoredProduct.setAttribute('data-asin', 'B08N5KWBY');
    const sponsoredLabel = document.createElement('span');
    sponsoredLabel.classList.add('s-sponsored-label-info-icon');
    sponsoredProduct.appendChild(sponsoredLabel);
    container.appendChild(sponsoredProduct);
    
    // Add non-product element
    const nonProduct = document.createElement('div');
    container.appendChild(nonProduct);
    
    // Find products
    const products = enhancer.findProductElements(container);
    
    // Should find 3 valid products
    expect(products.length).toBe(3);
    
    // Should not include processed or sponsored products
    const asins = products.map(p => p.getAttribute('data-asin'));
    expect(asins).toContain('B08N5KWB0');
    expect(asins).toContain('B08N5KWB1');
    expect(asins).toContain('B08N5KWB2');
    expect(asins).not.toContain('B08N5KWBX');
    expect(asins).not.toContain('B08N5KWBY');
  });
});