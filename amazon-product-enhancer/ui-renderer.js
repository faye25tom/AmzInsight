/**
 * UI Renderer for Amazon Product Enhancer
 * 
 * This module is responsible for rendering product information UI components:
 * - BSR (Best Sellers Rank) information
 * - ASIN and brand information
 * - Sales data (bought in past month)
 * - Loading states and error messages
 * 
 * The renderer ensures that the UI is consistent with Amazon's design language
 * and provides a seamless experience for users.
 */

class UIRenderer {
  /**
   * Create a new UI Renderer instance
   * @param {Object} settings - User settings for display options
   */
  constructor(settings = {}) {
    this.settings = {
      showBSR: true,
      showASIN: true,
      showBrand: true,
      showSalesData: true,
      ...settings
    };
  }

  /**
   * Create or get the information container for a product
   * @param {Element} productElement - The product element to enhance
   * @param {Object} productInfo - Basic product information
   * @returns {Element} The container element
   */
  createInfoContainer(productElement, productInfo) {
    // Check if container already exists
    let container = productElement.querySelector('.amz-enhancer-container');
    if (container) {
      return container;
    }
    
    // Find a good location to insert our container
    let insertLocation = this.findInsertLocation(productElement);
    
    // Create the container
    container = document.createElement('div');
    container.className = 'amz-enhancer-container';
    container.dataset.asin = productInfo.asin;
    
    // Build the initial content with available information
    let initialContent = `
      <div class="amz-enhancer-title">产品信息</div>
      <div class="amz-enhancer-data"></div>
    `;
    
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

  /**
   * Find the best location to insert the info container
   * @param {Element} productElement - The product element
   * @returns {Element} The element to insert after
   */
  findInsertLocation(productElement) {
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
        return elements[elements.length - 1];
      }
    }
    
    // If no specific insertion point found, try to find any suitable parent
    const fallbackSelectors = [
      '.a-row',
      '.a-box-inner',
      '.a-section'
    ];
    
    for (const selector of fallbackSelectors) {
      const elements = productElement.querySelectorAll(selector);
      if (elements.length > 0) {
        return elements[elements.length - 1];
      }
    }
    
    // If still no insertion point, use the product element itself
    return productElement;
  }

  /**
   * Show loading state in the container
   * @param {Element} container - The info container
   */
  showLoading(container) {
    const dataContainer = container.querySelector('.amz-enhancer-data');
    if (!dataContainer) return;
    
    // Clear existing content
    dataContainer.innerHTML = '';
    
    // Add loading indicator
    const loadingElement = document.createElement('div');
    loadingElement.className = 'amz-enhancer-loading';
    loadingElement.textContent = '加载中...';
    dataContainer.appendChild(loadingElement);
  }

  /**
   * Show error state in the container
   * @param {Element} container - The info container
   * @param {string} errorMessage - The error message to display
   */
  showError(container, errorMessage) {
    const dataContainer = container.querySelector('.amz-enhancer-data');
    if (!dataContainer) return;
    
    // Clear existing content
    dataContainer.innerHTML = '';
    
    // Create error container with styling
    const errorContainer = document.createElement('div');
    errorContainer.className = 'amz-enhancer-error-wrapper';
    errorContainer.style.padding = '5px';
    errorContainer.style.backgroundColor = '#fff8f8';
    errorContainer.style.border = '1px solid #ffd6d6';
    errorContainer.style.borderRadius = '3px';
    
    // Add error message
    const errorElement = document.createElement('div');
    errorElement.className = 'amz-enhancer-error';
    errorElement.textContent = errorMessage || '无法加载数据';
    errorElement.style.color = '#c40000';
    errorElement.style.fontSize = '12px';
    
    // Add error icon
    const errorIcon = document.createElement('span');
    errorIcon.innerHTML = '⚠️ ';
    errorIcon.style.marginRight = '5px';
    
    errorElement.prepend(errorIcon);
    errorContainer.appendChild(errorElement);
    dataContainer.appendChild(errorContainer);
  }

  /**
   * Render all product information
   * @param {Element} container - The info container
   * @param {Object} productData - The product data to render
   */
  renderProductInfo(container, productData) {
    const dataContainer = container.querySelector('.amz-enhancer-data');
    if (!dataContainer) return;
    
    // Clear existing content
    dataContainer.innerHTML = '';
    
    // Render each component based on settings
    if (this.settings.showASIN && productData.asin) {
      this.renderASIN(dataContainer, productData.asin);
    }
    
    if (this.settings.showBrand && productData.brand) {
      this.renderBrand(dataContainer, productData.brand);
    }
    
    if (this.settings.showBSR && productData.bsr) {
      this.renderBSR(dataContainer, productData.bsr);
    }
    
    if (this.settings.showSalesData && productData.salesData) {
      this.renderSalesData(dataContainer, productData.salesData);
    }
    
    // If no data was rendered, show a message
    if (dataContainer.children.length === 0) {
      const noDataElement = document.createElement('div');
      noDataElement.className = 'amz-enhancer-item';
      noDataElement.textContent = '无可用数据';
      dataContainer.appendChild(noDataElement);
    }
  }

  /**
   * Render BSR (Best Sellers Rank) information
   * @param {Element} container - The container to render into
   * @param {Array} bsrData - BSR data array with rank and category
   */
  renderBSR(container, bsrData) {
    if (!bsrData || bsrData.length === 0) {
      this.renderInfoItem(container, 'BSR', '无排名数据');
      return;
    }
    
    // Create BSR container
    const bsrContainer = document.createElement('div');
    bsrContainer.className = 'amz-enhancer-item amz-enhancer-bsr-container';
    
    // Add BSR label
    const bsrLabel = document.createElement('span');
    bsrLabel.className = 'amz-enhancer-label';
    bsrLabel.textContent = 'BSR: ';
    bsrContainer.appendChild(bsrLabel);
    
    // Add BSR value container
    const bsrValueContainer = document.createElement('span');
    bsrValueContainer.className = 'amz-enhancer-value';
    
    // If there's only one BSR, display it directly
    if (bsrData.length === 1) {
      bsrValueContainer.textContent = `#${this.formatNumber(bsrData[0].rank)} in ${bsrData[0].category}`;
    } else {
      // For multiple BSRs, show the primary one with a dropdown for others
      bsrValueContainer.textContent = `#${this.formatNumber(bsrData[0].rank)} in ${bsrData[0].category}`;
      
      if (bsrData.length > 1) {
        // Add a toggle button for additional categories
        const toggleButton = document.createElement('span');
        toggleButton.className = 'amz-enhancer-bsr-toggle';
        toggleButton.textContent = ` +${bsrData.length - 1} more`;
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.color = '#0066c0';
        toggleButton.style.marginLeft = '4px';
        bsrValueContainer.appendChild(toggleButton);
        
        // Create dropdown for additional categories
        const dropdown = document.createElement('div');
        dropdown.className = 'amz-enhancer-bsr-dropdown';
        dropdown.style.display = 'none';
        dropdown.style.marginTop = '4px';
        dropdown.style.marginLeft = '8px';
        
        // Add each additional category
        for (let i = 1; i < bsrData.length; i++) {
          const item = document.createElement('div');
          item.className = 'amz-enhancer-bsr-item';
          item.textContent = `#${this.formatNumber(bsrData[i].rank)} in ${bsrData[i].category}`;
          dropdown.appendChild(item);
        }
        
        // Toggle dropdown on click
        toggleButton.addEventListener('click', (e) => {
          e.preventDefault();
          dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
          toggleButton.textContent = dropdown.style.display === 'none' ? 
            ` +${bsrData.length - 1} more` : 
            ` -hide`;
        });
        
        bsrContainer.appendChild(dropdown);
      }
    }
    
    bsrContainer.appendChild(bsrValueContainer);
    container.appendChild(bsrContainer);
  }

  /**
   * Render ASIN information
   * @param {Element} container - The container to render into
   * @param {string} asin - The ASIN value
   */
  renderASIN(container, asin) {
    if (!asin) return;
    this.renderInfoItem(container, 'ASIN', asin);
  }

  /**
   * Render brand information
   * @param {Element} container - The container to render into
   * @param {string} brand - The brand name
   */
  renderBrand(container, brand) {
    if (!brand) return;
    this.renderInfoItem(container, '品牌', brand);
  }

  /**
   * Render sales data information
   * @param {Element} container - The container to render into
   * @param {Object} salesData - Sales data object
   */
  renderSalesData(container, salesData) {
    if (!salesData || !salesData.boughtInPastMonth) {
      this.renderInfoItem(container, '销售数据', '无销售数据');
      return;
    }
    
    let salesText = `${this.formatNumber(salesData.boughtInPastMonth)} 上个月购买`;
    
    // Add variant information if available
    if (salesData.totalVariants > 1) {
      salesText += ` (共 ${salesData.totalVariants} 个变体)`;
    }
    
    this.renderInfoItem(container, '销售数据', salesText);
  }

  /**
   * Render a generic info item with label and value
   * @param {Element} container - The container to render into
   * @param {string} label - The label text
   * @param {string} value - The value text
   */
  renderInfoItem(container, label, value) {
    const item = document.createElement('div');
    item.className = 'amz-enhancer-item';
    
    const labelElement = document.createElement('span');
    labelElement.className = 'amz-enhancer-label';
    labelElement.textContent = `${label}: `;
    
    const valueElement = document.createElement('span');
    valueElement.className = 'amz-enhancer-value';
    valueElement.textContent = value;
    
    item.appendChild(labelElement);
    item.appendChild(valueElement);
    container.appendChild(item);
  }

  /**
   * Format a number with thousands separators
   * @param {number} num - The number to format
   * @returns {string} Formatted number string
   */
  formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /**
   * Apply user settings to the renderer
   * @param {Object} settings - User settings object
   */
  applyUserSettings(settings) {
    this.settings = {
      ...this.settings,
      ...settings
    };
  }
}

// Export the class for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIRenderer;
}