/**
 * Tests for Error Handling and User Feedback System
 */

// Import the ErrorHandler class
const ErrorHandler = require('../error-handling');

// Mock DOM elements and functions
global.document = {
  createElement: jest.fn().mockImplementation((tag) => {
    const element = {
      style: {},
      className: '',
      textContent: '',
      appendChild: jest.fn(),
      addEventListener: jest.fn(),
      href: '',
      download: '',
      click: jest.fn()
    };
    return element;
  }),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn()
  },
  getElementById: jest.fn().mockImplementation(() => null),
  querySelector: jest.fn().mockImplementation(() => null)
};

global.URL = {
  createObjectURL: jest.fn().mockReturnValue('blob:url'),
  revokeObjectURL: jest.fn()
};

global.navigator = {
  sendBeacon: jest.fn().mockReturnValue(true)
};

global.Blob = jest.fn().mockImplementation(() => ({}));

// Mock chrome API
global.chrome = {
  runtime: {
    getManifest: jest.fn().mockReturnValue({ version: '1.0.0' }),
    lastError: null
  }
};

// Mock window
global.window = {
  addEventListener: jest.fn(),
  location: {
    href: 'https://example.com'
  }
};

describe('ErrorHandler', () => {
  let errorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler();
    errorHandler.init({
      debugMode: true,
      maxLogSize: 10,
      maxRetries: 3,
      retryDelays: [100, 200, 300],
      errorReportEndpoint: 'https://example.com/report'
    });
    
    // Clear mocks
    jest.clearAllMocks();
  });

  describe('Network Error Handling', () => {
    test('should handle timeout errors correctly', () => {
      const error = new Error('Request timed out');
      error.name = 'AbortError';
      
      const result = errorHandler.handleNetworkError(error, 'fetch');
      
      expect(result.type).toBe('timeout');
      expect(result.userMessage).toBe('请求超时，请稍后再试');
      expect(result.recoverable).toBe(true);
      expect(result.retryStrategy).toBe('exponential');
    });
    
    test('should handle connection errors correctly', () => {
      const error = new Error('NetworkError: Failed to fetch');
      
      const result = errorHandler.handleNetworkError(error, 'fetch');
      
      expect(result.type).toBe('connection');
      expect(result.userMessage).toBe('网络连接错误，请检查您的网络连接');
      expect(result.recoverable).toBe(true);
      expect(result.retryStrategy).toBe('linear');
    });
    
    test('should handle CAPTCHA detection correctly', () => {
      const error = new Error('CAPTCHA detected, you are a robot');
      
      const result = errorHandler.handleNetworkError(error, 'fetch');
      
      expect(result.type).toBe('captcha');
      expect(result.userMessage).toBe('访问受限，请稍后再试');
      expect(result.recoverable).toBe(false);
      expect(result.retryStrategy).toBe('none');
    });
    
    test('should handle 404 errors correctly', () => {
      const error = new Error('404 not found');
      
      const result = errorHandler.handleNetworkError(error, 'fetch');
      
      expect(result.type).toBe('not_found');
      expect(result.userMessage).toBe('产品信息不可用');
      expect(result.recoverable).toBe(false);
      expect(result.retryStrategy).toBe('none');
    });
  });

  describe('Parsing Error Handling', () => {
    test('should handle parsing errors with partial data', () => {
      const error = new Error('Failed to parse BSR');
      const partialData = { brand: 'Test Brand' };
      
      const result = errorHandler.handleParsingError(error, 'BSR', partialData);
      
      expect(result.type).toBe('parsing');
      expect(result.userMessage).toBe('数据解析错误，部分信息可能不可用');
      expect(result.dataType).toBe('BSR');
      expect(result.partialData).toBe(partialData);
      expect(result.recoverable).toBe(true);
    });
    
    test('should handle graceful degradation for different data types', () => {
      const error = new Error('Failed to parse');
      
      expect(errorHandler.handleGracefulDegradation(error, 'bsr')).toBeNull();
      expect(errorHandler.handleGracefulDegradation(error, 'brand')).toBe('未知品牌');
      expect(errorHandler.handleGracefulDegradation(error, 'salesData')).toEqual({ boughtInPastMonth: 0, totalVariants: 1 });
      expect(errorHandler.handleGracefulDegradation(error, 'variants')).toEqual([]);
    });
  });

  describe('UI Error Display', () => {
    test('should create error display with retry button for recoverable errors', () => {
      const retryCallback = jest.fn();
      const errorDisplay = errorHandler.createErrorDisplay('测试错误', true, retryCallback);
      
      expect(errorDisplay.className).toBe('amz-enhancer-error-container');
      expect(errorDisplay.appendChild).toHaveBeenCalledTimes(2); // Message and retry button
      
      // Simulate click on retry button
      const retryButton = document.createElement('button');
      retryButton.addEventListener.mock.calls[0][1]({ preventDefault: jest.fn(), stopPropagation: jest.fn() });
      
      expect(retryCallback).toHaveBeenCalledTimes(1);
    });
    
    test('should create error display without retry button for non-recoverable errors', () => {
      const errorDisplay = errorHandler.createErrorDisplay('测试错误', false);
      
      expect(errorDisplay.className).toBe('amz-enhancer-error-container');
      expect(errorDisplay.appendChild).toHaveBeenCalledTimes(1); // Only message, no retry button
    });
    
    test('should add debug info when debug mode is enabled', () => {
      const errorDisplay = document.createElement('div');
      const errorDetails = { type: 'test', message: 'Test error' };
      
      errorHandler.debugMode = true;
      errorHandler.addDebugInfo(errorDisplay, errorDetails);
      
      expect(errorDisplay.appendChild).toHaveBeenCalledTimes(1);
    });
    
    test('should not add debug info when debug mode is disabled', () => {
      const errorDisplay = document.createElement('div');
      const errorDetails = { type: 'test', message: 'Test error' };
      
      errorHandler.debugMode = false;
      errorHandler.addDebugInfo(errorDisplay, errorDetails);
      
      expect(errorDisplay.appendChild).not.toHaveBeenCalled();
    });
  });

  describe('Retry Mechanism', () => {
    test('should retry operation with exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('Success');
      
      const result = await errorHandler.retryWithBackoff(operation, 3);
      
      expect(operation).toHaveBeenCalledTimes(3);
      expect(result).toBe('Success');
    });
    
    test('should throw error after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Always fail'));
      
      await expect(errorHandler.retryWithBackoff(operation, 2)).rejects.toThrow('Always fail');
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
    
    test('should not retry if shouldRetry returns false', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Do not retry'));
      const shouldRetry = jest.fn().mockReturnValue(false);
      
      await expect(errorHandler.retryWithBackoff(operation, 3, shouldRetry)).rejects.toThrow('Do not retry');
      expect(operation).toHaveBeenCalledTimes(1); // Only initial attempt, no retries
      expect(shouldRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Logging and Reporting', () => {
    test('should log messages with correct level and context', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      errorHandler.log('Test info message', 'info', 'test');
      errorHandler.log('Test warning message', 'warn', 'test');
      errorHandler.log('Test error message', 'error', 'test');
      
      expect(errorHandler.errorLog.length).toBe(3);
      expect(errorHandler.errorLog[0].level).toBe('info');
      expect(errorHandler.errorLog[1].level).toBe('warn');
      expect(errorHandler.errorLog[2].level).toBe('error');
      
      expect(consoleSpy).toHaveBeenCalledTimes(3);
      
      consoleSpy.mockRestore();
    });
    
    test('should limit log size to maxLogSize', () => {
      errorHandler.maxLogSize = 3;
      
      for (let i = 0; i < 5; i++) {
        errorHandler.log(`Message ${i}`);
      }
      
      expect(errorHandler.errorLog.length).toBe(3);
      expect(errorHandler.errorLog[0].message).toBe('Message 2');
      expect(errorHandler.errorLog[2].message).toBe('Message 4');
    });
    
    test('should report errors to endpoint', () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve());
      
      errorHandler.reportError({
        type: 'test_error',
        message: 'Test error message'
      });
      
      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
      expect(navigator.sendBeacon.mock.calls[0][0]).toBe('https://example.com/report');
      
      // Test fallback to fetch
      navigator.sendBeacon = undefined;
      
      errorHandler.reportError({
        type: 'test_error_2',
        message: 'Another test error'
      });
      
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/report');
      
      fetchMock.mockRestore();
    });
  });

  describe('Notification System', () => {
    test('should create notification with correct type and message', () => {
      const toast = errorHandler.createNotification('Success message', 'success', 1000);
      
      expect(toast.className).toContain('amz-enhancer-notification-success');
      expect(toast.textContent).toBe('Success message');
      
      const errorToast = errorHandler.createNotification('Error message', 'error', 1000);
      
      expect(errorToast.className).toContain('amz-enhancer-notification-error');
      expect(errorToast.textContent).toBe('Error message');
    });
  });
});