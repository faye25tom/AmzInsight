/**
 * Error Handling and User Feedback System for Amazon Product Enhancer
 * 
 * This module provides:
 * - Standardized error handling for network requests
 * - Graceful degradation for data parsing failures
 * - User-friendly error messages
 * - Retry mechanisms
 * - Debug logging and error reporting
 */

class ErrorHandler {
  constructor() {
    this.debugMode = false;
    this.errorLog = [];
    this.maxLogSize = 100;
    this.retryDelays = [2000, 5000, 10000]; // Retry delays in ms (exponential backoff)
    this.maxRetries = 3;
    this.errorReportEndpoint = null; // Optional endpoint for error reporting
  }

  /**
   * Initialize error handler with settings
   * @param {Object} settings - Settings object
   */
  init(settings = {}) {
    this.debugMode = settings.debugMode || false;
    this.maxLogSize = settings.maxLogSize || 100;
    this.maxRetries = settings.maxRetries || 3;
    this.retryDelays = settings.retryDelays || [2000, 5000, 10000];
    this.errorReportEndpoint = settings.errorReportEndpoint || null;
    this.log('Error handler initialized', 'info');
    
    // Add global error handler if enabled
    if (settings.enableGlobalErrorHandler) {
      this.setupGlobalErrorHandler();
    }
  }

  /**
   * Set up global error handler for uncaught exceptions
   */
  setupGlobalErrorHandler() {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.log(`Global error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, 'error', 'global');
        
        // Don't report errors from external scripts
        if (event.filename && event.filename.includes('amazon-product-enhancer')) {
          this.reportError({
            type: 'uncaught_exception',
            message: event.message,
            stack: event.error ? event.error.stack : null,
            location: `${event.filename}:${event.lineno}:${event.colno}`,
            timestamp: new Date().toISOString()
          });
        }
        
        // Don't prevent default handling
        return false;
      });
      
      // Handle promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        const message = event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled Promise rejection';
        this.log(`Unhandled Promise rejection: ${message}`, 'error', 'promise');
        
        this.reportError({
          type: 'unhandled_rejection',
          message: message,
          stack: event.reason && event.reason.stack ? event.reason.stack : null,
          timestamp: new Date().toISOString()
        });
        
        // Don't prevent default handling
        return false;
      });
      
      this.log('Global error handlers installed', 'info', 'global');
    }
  }

  /**
   * Handle network request errors
   * @param {Error} error - The error object
   * @param {string} context - Context where the error occurred
   * @returns {Object} Standardized error object
   */
  handleNetworkError(error, context = 'network') {
    let errorType = 'unknown';
    let userMessage = '网络错误，请稍后再试';
    let technicalMessage = error.message || 'Unknown network error';
    let recoverable = true;
    let retryStrategy = 'exponential'; // 'exponential', 'linear', or 'none'

    // Determine error type and appropriate messages
    if (error.name === 'AbortError' || technicalMessage.includes('timeout')) {
      errorType = 'timeout';
      userMessage = '请求超时，请稍后再试';
      technicalMessage = 'Request timed out';
      retryStrategy = 'exponential';
    } else if (technicalMessage.includes('NetworkError') || technicalMessage.includes('network')) {
      errorType = 'connection';
      userMessage = '网络连接错误，请检查您的网络连接';
      technicalMessage = 'Network connection error';
      retryStrategy = 'linear';
    } else if (technicalMessage.includes('CAPTCHA') || technicalMessage.includes('robot')) {
      errorType = 'captcha';
      userMessage = '访问受限，请稍后再试';
      technicalMessage = 'CAPTCHA detected, access blocked';
      recoverable = false;
      retryStrategy = 'none';
    } else if (technicalMessage.includes('404') || technicalMessage.includes('not found')) {
      errorType = 'not_found';
      userMessage = '产品信息不可用';
      technicalMessage = 'Product page not found (404)';
      recoverable = false;
      retryStrategy = 'none';
    } else if (technicalMessage.includes('403') || technicalMessage.includes('forbidden')) {
      errorType = 'forbidden';
      userMessage = '访问被拒绝，请稍后再试';
      technicalMessage = 'Access forbidden (403)';
      recoverable = false;
      retryStrategy = 'none';
    } else if (technicalMessage.includes('429') || technicalMessage.includes('too many requests')) {
      errorType = 'rate_limited';
      userMessage = '请求过于频繁，请稍后再试';
      technicalMessage = 'Rate limited (429)';
      recoverable = true;
      retryStrategy = 'exponential';
    } else if (technicalMessage.includes('500') || technicalMessage.includes('server error')) {
      errorType = 'server_error';
      userMessage = '服务器错误，请稍后再试';
      technicalMessage = 'Server error (500)';
      recoverable = true;
      retryStrategy = 'linear';
    }

    // Log the error
    this.log(`Network error (${errorType}): ${technicalMessage}`, 'error', context);

    // Report severe errors
    if (!recoverable || errorType === 'server_error') {
      this.reportError({
        type: errorType,
        message: technicalMessage,
        context,
        recoverable,
        timestamp: new Date().toISOString()
      });
    }

    // Return standardized error object
    return {
      type: errorType,
      userMessage,
      technicalMessage,
      recoverable,
      retryStrategy,
      context,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Handle data parsing errors
   * @param {Error} error - The error object
   * @param {string} dataType - Type of data being parsed (e.g., 'BSR', 'brand')
   * @param {Object} partialData - Any partial data that was successfully parsed
   * @returns {Object} Standardized error object with partial data
   */
  handleParsingError(error, dataType, partialData = null) {
    const errorType = 'parsing';
    const userMessage = '数据解析错误，部分信息可能不可用';
    const technicalMessage = `Error parsing ${dataType}: ${error.message || 'Unknown parsing error'}`;
    
    // Log the error
    this.log(technicalMessage, 'error', dataType);

    // Return standardized error object with partial data
    return {
      type: errorType,
      userMessage,
      technicalMessage,
      dataType,
      partialData,
      recoverable: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Handle graceful degradation for parsing errors
   * @param {Error} error - The error object
   * @param {string} dataType - Type of data being parsed
   * @param {Object} fallbackData - Fallback data to use
   * @returns {Object} Fallback data or null
   */
  handleGracefulDegradation(error, dataType, fallbackData = null) {
    this.log(`Graceful degradation for ${dataType}: ${error.message}`, 'warn', dataType);
    
    // Return fallback data if provided
    if (fallbackData) {
      return fallbackData;
    }
    
    // Create appropriate fallback based on data type
    switch (dataType) {
      case 'bsr':
        return null;
      case 'brand':
        return '未知品牌';
      case 'salesData':
        return { boughtInPastMonth: 0, totalVariants: 1 };
      case 'variants':
        return [];
      default:
        return null;
    }
  }

  /**
   * Create a user-friendly error display
   * @param {string} message - User-friendly error message
   * @param {boolean} isRecoverable - Whether the error is recoverable
   * @param {Function} retryCallback - Callback function for retry action
   * @returns {HTMLElement} Error display element
   */
  createErrorDisplay(message, isRecoverable = true, retryCallback = null) {
    // Create container
    const container = document.createElement('div');
    container.className = 'amz-enhancer-error-container';
    container.style.padding = '8px';
    container.style.marginTop = '5px';
    container.style.backgroundColor = '#fff8f8';
    container.style.border = '1px solid #ffd6d6';
    container.style.borderRadius = '3px';
    
    // Create error message
    const errorMessage = document.createElement('div');
    errorMessage.className = 'amz-enhancer-error-message';
    errorMessage.textContent = message || '发生错误';
    errorMessage.style.color = '#c40000';
    errorMessage.style.fontSize = '12px';
    container.appendChild(errorMessage);
    
    // Add retry button if error is recoverable
    if (isRecoverable && typeof retryCallback === 'function') {
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
      
      // Add click handler
      retryButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        retryCallback();
      });
      
      container.appendChild(retryButton);
    }
    
    return container;
  }

  /**
   * Add debug information to an error display
   * @param {HTMLElement} errorDisplay - The error display element
   * @param {Object} errorDetails - Technical error details
   */
  addDebugInfo(errorDisplay, errorDetails) {
    if (!this.debugMode || !errorDisplay) return;
    
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
    debugDetails.textContent = JSON.stringify(errorDetails, null, 2);
    
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
    errorDisplay.appendChild(debugContainer);
  }

  /**
   * Create a manual refresh button
   * @param {Function} refreshCallback - Callback function for refresh action
   * @returns {HTMLElement} Refresh button element
   */
  createRefreshButton(refreshCallback) {
    const refreshButton = document.createElement('button');
    refreshButton.className = 'amz-enhancer-refresh-button';
    refreshButton.textContent = '刷新数据';
    refreshButton.style.padding = '3px 10px';
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
    
    // Add click handler
    refreshButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      refreshCallback();
    });
    
    return refreshButton;
  }

  /**
   * Create a notification toast
   * @param {string} message - Message to display
   * @param {string} type - Notification type ('success', 'error', 'warning', 'info')
   * @param {number} duration - Duration in milliseconds
   * @returns {HTMLElement} Toast element
   */
  createNotification(message, type = 'info', duration = 3000) {
    // Create container if it doesn't exist
    let container = document.getElementById('amz-enhancer-notifications');
    if (!container) {
      container = document.createElement('div');
      container.id = 'amz-enhancer-notifications';
      container.style.position = 'fixed';
      container.style.bottom = '20px';
      container.style.right = '20px';
      container.style.zIndex = '9999';
      document.body.appendChild(container);
    }
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `amz-enhancer-notification amz-enhancer-notification-${type}`;
    toast.style.padding = '10px 15px';
    toast.style.marginBottom = '10px';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    toast.style.fontSize = '14px';
    toast.style.minWidth = '200px';
    toast.style.maxWidth = '300px';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease-in-out';
    
    // Set colors based on type
    switch (type) {
      case 'success':
        toast.style.backgroundColor = '#dff0d8';
        toast.style.color = '#3c763d';
        toast.style.border = '1px solid #d6e9c6';
        break;
      case 'error':
        toast.style.backgroundColor = '#f2dede';
        toast.style.color = '#a94442';
        toast.style.border = '1px solid #ebccd1';
        break;
      case 'warning':
        toast.style.backgroundColor = '#fcf8e3';
        toast.style.color = '#8a6d3b';
        toast.style.border = '1px solid #faebcc';
        break;
      default: // info
        toast.style.backgroundColor = '#d9edf7';
        toast.style.color = '#31708f';
        toast.style.border = '1px solid #bce8f1';
    }
    
    // Add message
    toast.textContent = message;
    
    // Add close button
    const closeButton = document.createElement('span');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '5px';
    closeButton.style.right = '10px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontWeight = 'bold';
    closeButton.addEventListener('click', () => {
      removeToast();
    });
    toast.appendChild(closeButton);
    
    // Add to container
    container.appendChild(toast);
    
    // Fade in
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 10);
    
    // Auto remove after duration
    const removeToast = () => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
        
        // Remove container if empty
        if (container.children.length === 0) {
          document.body.removeChild(container);
        }
      }, 300);
    };
    
    if (duration > 0) {
      setTimeout(removeToast, duration);
    }
    
    return toast;
  }

  /**
   * Handle retry logic with exponential backoff
   * @param {Function} operation - The operation to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {Function} shouldRetry - Function to determine if retry should be attempted
   * @returns {Promise} Promise that resolves with the operation result or rejects with an error
   */
  async retryWithBackoff(operation, maxRetries = this.maxRetries, shouldRetry = () => true) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Attempt the operation
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if we should retry
        if (attempt >= maxRetries || !shouldRetry(error)) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = this.retryDelays[attempt] || Math.pow(2, attempt) * 1000;
        
        // Log retry attempt
        this.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`, 'info', 'retry');
        
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we get here, all retries failed
    throw lastError;
  }

  /**
   * Report an error to the error reporting endpoint
   * @param {Object} errorData - Error data to report
   */
  reportError(errorData) {
    // Skip if no endpoint configured
    if (!this.errorReportEndpoint) {
      return;
    }
    
    // Add extension version and user agent
    const enhancedErrorData = {
      ...errorData,
      userAgent: navigator.userAgent,
      extensionVersion: chrome.runtime.getManifest().version,
      url: window.location.href
    };
    
    // Log that we're reporting the error
    this.log(`Reporting error to ${this.errorReportEndpoint}`, 'info', 'reporting');
    
    // Send error report
    try {
      // Use sendBeacon if available for non-blocking report
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(enhancedErrorData)], { type: 'application/json' });
        navigator.sendBeacon(this.errorReportEndpoint, blob);
      } else {
        // Fall back to fetch
        fetch(this.errorReportEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enhancedErrorData),
          // Use keepalive to ensure the request completes even if the page is unloaded
          keepalive: true
        }).catch(e => {
          // Silently ignore fetch errors to avoid cascading errors
          console.error('Error reporting failed:', e);
        });
      }
    } catch (e) {
      // Silently ignore errors in error reporting
      console.error('Error reporting failed:', e);
    }
  }

  /**
   * Log a message to the error log
   * @param {string} message - The message to log
   * @param {string} level - Log level ('info', 'warn', 'error')
   * @param {string} context - Context where the log was generated
   */
  log(message, level = 'info', context = '') {
    // Create log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message
    };
    
    // Add to log array
    this.errorLog.push(logEntry);
    
    // Trim log if it exceeds max size
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
    
    // Output to console in debug mode
    if (this.debugMode) {
      const consoleMethod = level === 'error' ? 'error' : 
                           level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](`[${context}] ${message}`);
    }
  }

  /**
   * Get the current error log
   * @returns {Array} Array of log entries
   */
  getErrorLog() {
    return this.errorLog;
  }

  /**
   * Clear the error log
   */
  clearErrorLog() {
    this.errorLog = [];
    this.log('Error log cleared', 'info');
  }

  /**
   * Export error log as JSON
   * @returns {string} JSON string of error log
   */
  exportErrorLog() {
    return JSON.stringify(this.errorLog, null, 2);
  }

  /**
   * Download error log as a file
   */
  downloadErrorLog() {
    const logJson = this.exportErrorLog();
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

  /**
   * Set debug mode
   * @param {boolean} enabled - Whether debug mode is enabled
   */
  setDebugMode(enabled) {
    this.debugMode = !!enabled;
    this.log(`Debug mode ${this.debugMode ? 'enabled' : 'disabled'}`, 'info');
  }
}

// Export the class for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorHandler;
}