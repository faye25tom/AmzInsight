/**
 * Tests for Performance Optimizer
 */

// Import the performance optimizer
// In a real extension, this would be handled by the build system
// For this implementation, we'll assume the script is loaded in the test runner

describe('PerformanceOptimizer', () => {
  let performanceOptimizer;
  
  beforeEach(() => {
    // Create a new instance for each test
    performanceOptimizer = new PerformanceOptimizer();
    
    // Mock requestAnimationFrame
    window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    
    // Mock requestIdleCallback
    window.requestIdleCallback = (callback) => setTimeout(callback, 0);
    
    // Mock performance.memory if not available
    if (!window.performance) {
      window.performance = {};
    }
    if (!window.performance.memory) {
      window.performance.memory = {
        usedJSHeapSize: 20 * 1024 * 1024, // 20MB
        totalJSHeapSize: 100 * 1024 * 1024 // 100MB
      };
    }
  });
  
  afterEach(() => {
    // Clean up
    performanceOptimizer.dispose();
  });
  
  test('should initialize with default settings', () => {
    expect(performanceOptimizer.settings).toBeDefined();
    expect(performanceOptimizer.settings.requestThrottleDelay).toBe(300);
    expect(performanceOptimizer.settings.domDebounceDelay).toBe(150);
  });
  
  test('should update settings correctly', () => {
    const newSettings = {
      requestThrottleDelay: 500,
      memoryThreshold: 100
    };
    
    performanceOptimizer.updateSettings(newSettings);
    
    expect(performanceOptimizer.settings.requestThrottleDelay).toBe(500);
    expect(performanceOptimizer.settings.memoryThreshold).toBe(100);
    expect(performanceOptimizer.settings.domDebounceDelay).toBe(150); // Unchanged
  });
  
  test('throttle should limit function calls', (done) => {
    let callCount = 0;
    const testFunc = () => { callCount++; };
    const throttled = performanceOptimizer.throttle(testFunc, 100);
    
    // Call multiple times in quick succession
    throttled();
    throttled();
    throttled();
    
    // Should only be called once immediately
    expect(callCount).toBe(1);
    
    // Wait for throttle delay and check again
    setTimeout(() => {
      expect(callCount).toBe(2); // One immediate call + one delayed call
      done();
    }, 150);
  });
  
  test('debounce should delay function execution', (done) => {
    let callCount = 0;
    const testFunc = () => { callCount++; };
    const debounced = performanceOptimizer.debounce(testFunc, 100);
    
    // Call multiple times in quick succession
    debounced();
    debounced();
    debounced();
    
    // Should not be called yet
    expect(callCount).toBe(0);
    
    // Wait for debounce delay and check again
    setTimeout(() => {
      expect(callCount).toBe(1); // Only called once after delay
      done();
    }, 150);
  });
  
  test('batchDomOperations should process elements in batches', (done) => {
    const elements = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const processed = [];
    
    performanceOptimizer.batchDomOperations(
      elements,
      (item) => { processed.push(item); },
      'test-batch',
      3, // batch size
      10 // delay
    ).then((count) => {
      expect(count).toBe(10);
      expect(processed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      done();
    });
  });
  
  test('optimizeDomMutations should batch mutation processing', (done) => {
    const mockMutations = [
      { type: 'childList', addedNodes: [document.createElement('div')] },
      { type: 'childList', addedNodes: [document.createElement('span')] }
    ];
    
    let processCalled = false;
    const mockHandler = (mutations, fragment, context) => {
      processCalled = true;
      expect(mutations.length).toBe(2);
      expect(fragment).toBeDefined();
      expect(context).toBe('test');
    };
    
    performanceOptimizer.optimizeDomMutations(mockHandler, mockMutations, 'test');
    
    // Wait for requestAnimationFrame to execute
    setTimeout(() => {
      expect(processCalled).toBe(true);
      done();
    }, 50);
  });
  
  test('should track request performance', () => {
    performanceOptimizer.trackRequestPerformance('product', 'B00TEST123', 150, false);
    
    expect(performanceOptimizer.metrics.requestTimes.length).toBe(1);
    expect(performanceOptimizer.metrics.requestTimes[0].type).toBe('product');
    expect(performanceOptimizer.metrics.requestTimes[0].id).toBe('B00TEST123');
    expect(performanceOptimizer.metrics.requestTimes[0].duration).toBe(150);
    expect(performanceOptimizer.metrics.requestTimes[0].fromCache).toBe(false);
  });
  
  test('should track render performance', () => {
    performanceOptimizer.trackRenderPerformance('product-info', 'container-1', 75);
    
    expect(performanceOptimizer.metrics.renderTimes.length).toBe(1);
    expect(performanceOptimizer.metrics.renderTimes[0].type).toBe('product-info');
    expect(performanceOptimizer.metrics.renderTimes[0].id).toBe('container-1');
    expect(performanceOptimizer.metrics.renderTimes[0].duration).toBe(75);
  });
  
  test('should calculate average correctly', () => {
    const values = [10, 20, 30, 40, 50];
    const avg = performanceOptimizer.calculateAverage(values);
    
    expect(avg).toBe(30);
  });
  
  test('should handle empty array in average calculation', () => {
    const avg = performanceOptimizer.calculateAverage([]);
    
    expect(avg).toBe(0);
  });
  
  test('should clear metrics', () => {
    // Add some metrics
    performanceOptimizer.trackRequestPerformance('product', 'B00TEST123', 150, false);
    performanceOptimizer.trackRenderPerformance('product-info', 'container-1', 75);
    
    // Clear metrics
    performanceOptimizer.clearMetrics();
    
    // Check if metrics are cleared
    expect(performanceOptimizer.metrics.requestTimes.length).toBe(0);
    expect(performanceOptimizer.metrics.renderTimes.length).toBe(0);
  });
  
  test('should create optimized scroll handler', () => {
    let scrollCalled = false;
    const originalHandler = () => { scrollCalled = true; };
    const optimizedHandler = performanceOptimizer.createOptimizedScrollHandler(originalHandler);
    
    // Call the optimized handler
    optimizedHandler();
    
    // Should be throttled and use requestAnimationFrame
    setTimeout(() => {
      expect(scrollCalled).toBe(true);
    }, 50);
  });
  
  test('should create lazy load observer', () => {
    const callback = jest.fn();
    const observer = performanceOptimizer.createLazyLoadObserver(callback);
    
    expect(observer).toBeInstanceOf(IntersectionObserver);
  });
});