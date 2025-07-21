/**
 * Tests for UI Renderer
 */

// Import the UI Renderer class
const UIRenderer = require('../ui-renderer');

// Mock document functions for testing
global.document = {
  createElement: (tag) => {
    const element = {
      className: '',
      style: {},
      dataset: {},
      children: [],
      innerHTML: '',
      textContent: '',
      appendChild: function(child) {
        this.children.push(child);
        return child;
      },
      addEventListener: jest.fn()
    };
    return element;
  },
  querySelector: jest.fn(),
  querySelectorAll: jest.fn().mockReturnValue([])
};

describe('UIRenderer', () => {
  let renderer;
  let container;
  let dataContainer;
  
  beforeEach(() => {
    // Create a new renderer instance for each test
    renderer = new UIRenderer({
      showBSR: true,
      showASIN: true,
      showBrand: true,
      showSalesData: true
    });
    
    // Create a mock container for testing
    container = {
      className: 'amz-enhancer-container',
      querySelector: jest.fn().mockImplementation((selector) => {
        if (selector === '.amz-enhancer-data') {
          return dataContainer;
        }
        return null;
      }),
      children: []
    };
    
    // Create a mock data container
    dataContainer = {
      className: 'amz-enhancer-data',
      innerHTML: '',
      children: [],
      appendChild: function(child) {
        this.children.push(child);
        return child;
      }
    };
  });
  
  test('should render BSR information correctly', () => {
    const bsrData = [
      { rank: 1234, category: 'Electronics' },
      { rank: 5678, category: 'Computers & Accessories' }
    ];
    
    renderer.renderBSR(dataContainer, bsrData);
    
    // Check that the BSR container was created
    expect(dataContainer.children.length).toBe(1);
    expect(dataContainer.children[0].className).toContain('amz-enhancer-bsr-container');
    
    // Check that the BSR value is correct
    const bsrValueContainer = dataContainer.children[0].children[1];
    expect(bsrValueContainer.textContent).toContain('#1,234 in Electronics');
  });
  
  test('should render ASIN information correctly', () => {
    renderer.renderASIN(dataContainer, 'B08N5KWB9H');
    
    // Check that the ASIN item was created
    expect(dataContainer.children.length).toBe(1);
    expect(dataContainer.children[0].className).toBe('amz-enhancer-item');
    
    // Check that the ASIN value is correct
    const asinLabel = dataContainer.children[0].children[0];
    const asinValue = dataContainer.children[0].children[1];
    expect(asinLabel.textContent).toBe('ASIN: ');
    expect(asinValue.textContent).toBe('B08N5KWB9H');
  });
  
  test('should render brand information correctly', () => {
    renderer.renderBrand(dataContainer, 'Apple');
    
    // Check that the brand item was created
    expect(dataContainer.children.length).toBe(1);
    expect(dataContainer.children[0].className).toBe('amz-enhancer-item');
    
    // Check that the brand value is correct
    const brandLabel = dataContainer.children[0].children[0];
    const brandValue = dataContainer.children[0].children[1];
    expect(brandLabel.textContent).toBe('品牌: ');
    expect(brandValue.textContent).toBe('Apple');
  });
  
  test('should render sales data correctly', () => {
    const salesData = {
      boughtInPastMonth: 5000,
      totalVariants: 3
    };
    
    renderer.renderSalesData(dataContainer, salesData);
    
    // Check that the sales data item was created
    expect(dataContainer.children.length).toBe(1);
    expect(dataContainer.children[0].className).toBe('amz-enhancer-item');
    
    // Check that the sales data value is correct
    const salesLabel = dataContainer.children[0].children[0];
    const salesValue = dataContainer.children[0].children[1];
    expect(salesLabel.textContent).toBe('销售数据: ');
    expect(salesValue.textContent).toContain('5,000');
    expect(salesValue.textContent).toContain('3');
  });
  
  test('should render all product information correctly', () => {
    const productData = {
      asin: 'B08N5KWB9H',
      brand: 'Apple',
      bsr: [
        { rank: 1234, category: 'Electronics' }
      ],
      salesData: {
        boughtInPastMonth: 5000,
        totalVariants: 1
      }
    };
    
    // Spy on the render methods
    const renderASINSpy = jest.spyOn(renderer, 'renderASIN');
    const renderBrandSpy = jest.spyOn(renderer, 'renderBrand');
    const renderBSRSpy = jest.spyOn(renderer, 'renderBSR');
    const renderSalesDataSpy = jest.spyOn(renderer, 'renderSalesData');
    
    renderer.renderProductInfo(container, productData);
    
    // Check that all render methods were called with the correct data
    expect(renderASINSpy).toHaveBeenCalledWith(dataContainer, 'B08N5KWB9H');
    expect(renderBrandSpy).toHaveBeenCalledWith(dataContainer, 'Apple');
    expect(renderBSRSpy).toHaveBeenCalledWith(dataContainer, productData.bsr);
    expect(renderSalesDataSpy).toHaveBeenCalledWith(dataContainer, productData.salesData);
  });
  
  test('should show loading state correctly', () => {
    renderer.showLoading(container);
    
    // Check that the loading element was created
    expect(dataContainer.innerHTML).toBe('');
    expect(dataContainer.children.length).toBe(1);
    expect(dataContainer.children[0].className).toBe('amz-enhancer-loading');
    expect(dataContainer.children[0].textContent).toBe('加载中...');
  });
  
  test('should show error state correctly', () => {
    renderer.showError(container, 'Test error message');
    
    // Check that the error element was created
    expect(dataContainer.innerHTML).toBe('');
    expect(dataContainer.children.length).toBe(1);
    expect(dataContainer.children[0].className).toBe('amz-enhancer-error');
    expect(dataContainer.children[0].textContent).toBe('Test error message');
  });
  
  test('should apply user settings correctly', () => {
    const newSettings = {
      showBSR: false,
      showASIN: true,
      showBrand: false,
      showSalesData: true
    };
    
    renderer.applyUserSettings(newSettings);
    
    // Check that the settings were updated
    expect(renderer.settings.showBSR).toBe(false);
    expect(renderer.settings.showASIN).toBe(true);
    expect(renderer.settings.showBrand).toBe(false);
    expect(renderer.settings.showSalesData).toBe(true);
  });
  
  test('should format numbers correctly', () => {
    expect(renderer.formatNumber(1234)).toBe('1,234');
    expect(renderer.formatNumber(5678)).toBe('5,678');
    expect(renderer.formatNumber(1000000)).toBe('1,000,000');
    expect(renderer.formatNumber(0)).toBe('0');
  });
});