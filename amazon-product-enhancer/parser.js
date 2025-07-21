/**
 * Amazon Product Details Parser
 * 
 * This module is responsible for parsing Amazon product detail pages to extract:
 * - Best Sellers Rank (BSR)
 * - Brand information
 * - Sales data ("bought in past month")
 * - Product variants
 * 
 * The parser includes fallback mechanisms to handle different page layouts and
 * structural changes in Amazon's HTML.
 */

class AmazonParser {
  /**
   * Parse an Amazon product detail page HTML
   * @param {string} html - The HTML content of the product page
   * @param {string} asin - The ASIN of the product
   * @returns {Object} Parsed product data
   */
  parseProductPage(html, asin) {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract all required data
    const bsr = this.parseBSR(doc);
    const brand = this.parseBrand(doc);
    const salesData = this.parseSalesData(doc);
    const variants = this.parseVariants(doc);
    
    // Aggregate sales data from variants if available
    const aggregatedSalesData = this.aggregateSalesData(salesData, variants);
    
    return {
      asin: asin,
      bsr: bsr,
      brand: brand,
      salesData: aggregatedSalesData,
      variants: variants,
      lastUpdated: new Date().toISOString()
    };
  }
  
  /**
   * Parse Best Sellers Rank (BSR) information
   * @param {Document} doc - The parsed HTML document
   * @returns {Array|null} Array of BSR objects with rank and category, or null if not found
   */
  parseBSR(doc) {
    try {
      // Try multiple selectors for BSR information
      const bsrSelectors = [
        '#productDetails_detailBullets_sections1 th:contains("Best Sellers Rank") + td',
        '#detailBulletsWrapper_feature_div li:contains("Best Sellers Rank")',
        '#detailBullets_feature_div li:contains("Best Sellers Rank")',
        '#SalesRank',
        '.prodDetSectionEntry:contains("Best Sellers Rank")',
        '#productDetails tr:contains("Best Sellers Rank") td',
        '.detail-bullet:contains("Best Sellers Rank")',
        '#productDetails_db_sections tr:contains("Amazon Best Sellers Rank") td'
      ];
      
      let bsrText = null;
      
      // Try each selector until we find BSR information
      for (const selector of bsrSelectors) {
        const element = this.querySelector(doc, selector);
        if (element) {
          bsrText = element.textContent.trim();
          break;
        }
      }
      
      // If no BSR found with selectors, try searching in the entire document
      if (!bsrText) {
        const allText = doc.body.textContent;
        const bsrRegex = /Best Sellers Rank[:\s]+(#[0-9,]+)\s+in\s+([^(#)]+)/i;
        const match = allText.match(bsrRegex);
        if (match) {
          bsrText = match[0];
        }
      }
      
      // If still no BSR found, return null
      if (!bsrText) {
        return null;
      }
      
      // Parse BSR text to extract ranks and categories
      return this.extractBSRData(bsrText);
    } catch (error) {
      console.error('Error parsing BSR:', error);
      return null;
    }
  }
  
  /**
   * Extract structured BSR data from text
   * @param {string} bsrText - The text containing BSR information
   * @returns {Array} Array of BSR objects with rank and category
   */
  extractBSRData(bsrText) {
    try {
      const bsrData = [];
      
      // Regular expression to match BSR patterns
      // Matches patterns like "#1,234 in Category" or "#5,678 in Category (See Top 100 in Category)"
      const bsrRegex = /#([\d,]+)\s+in\s+([^(#)]+?)(?:\s+\(|$)/g;
      
      let match;
      while ((match = bsrRegex.exec(bsrText)) !== null) {
        const rank = parseInt(match[1].replace(/,/g, ''), 10);
        const category = match[2].trim();
        
        bsrData.push({
          rank: rank,
          category: category
        });
      }
      
      return bsrData.length > 0 ? bsrData : null;
    } catch (error) {
      console.error('Error extracting BSR data:', error);
      return null;
    }
  }
  
  /**
   * Parse brand information
   * @param {Document} doc - The parsed HTML document
   * @returns {string|null} Brand name or null if not found
   */
  parseBrand(doc) {
    try {
      // Try multiple selectors for brand information
      const brandSelectors = [
        '#bylineInfo',
        '#bylineInfo_feature_div a',
        '.po-brand .a-span9',
        '#brand',
        '#product-byline a',
        '.a-section.a-spacing-none:contains("Brand") .a-span9',
        'a#bylineInfo[href*="brandtextbin"]',
        '.a-box-group .a-box:contains("Brand") .a-size-base',
        'tr:contains("Brand") td.a-span9',
        'tr.a-spacing-small:contains("Brand") td.a-span9',
        '.product-facts-detail:contains("Brand") span'
      ];
      
      // Try each selector until we find brand information
      for (const selector of brandSelectors) {
        const element = this.querySelector(doc, selector);
        if (element) {
          let brandText = element.textContent.trim();
          
          // Clean up brand text
          brandText = brandText.replace(/^Visit the |^Brand: |^by |^from /i, '').trim();
          
          // If brand text is too long, it might not be a brand
          if (brandText.length > 50) {
            continue;
          }
          
          return brandText;
        }
      }
      
      // Try to find brand in meta tags
      const metaBrand = doc.querySelector('meta[name="brand"], meta[property="og:brand"]');
      if (metaBrand && metaBrand.getAttribute('content')) {
        return metaBrand.getAttribute('content').trim();
      }
      
      // Try to extract from structured data
      const structuredData = this.extractStructuredData(doc);
      if (structuredData && structuredData.brand) {
        return typeof structuredData.brand === 'string' 
          ? structuredData.brand 
          : structuredData.brand.name || null;
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing brand:', error);
      return null;
    }
  }
  
  /**
   * Parse sales data ("bought in past month")
   * @param {Document} doc - The parsed HTML document
   * @returns {Object|null} Sales data object or null if not found
   */
  parseSalesData(doc) {
    try {
      // Try multiple selectors for "bought in past month" information
      const salesSelectors = [
        '.social-proofing-faceout-title:contains("bought in past month")',
        '.a-size-base:contains("bought in past month")',
        '.a-box-inner:contains("bought in past month")',
        '.a-section:contains("bought in past month")',
        '.a-row:contains("bought in past month")'
      ];
      
      // Try each selector until we find sales information
      for (const selector of salesSelectors) {
        const element = this.querySelector(doc, selector);
        if (element) {
          const salesText = element.textContent.trim();
          return this.extractSalesData(salesText);
        }
      }
      
      // If no element found, try searching in the entire document
      const allText = doc.body.textContent;
      const salesRegex = /([0-9,]+)\s+bought in past month/i;
      const match = allText.match(salesRegex);
      
      if (match) {
        const count = parseInt(match[1].replace(/,/g, ''), 10);
        return {
          boughtInPastMonth: count,
          totalVariants: 1 // Default to 1 if we don't know the variant count
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing sales data:', error);
      return null;
    }
  }
  
  /**
   * Extract structured sales data from text
   * @param {string} salesText - The text containing sales information
   * @returns {Object|null} Sales data object or null if parsing fails
   */
  extractSalesData(salesText) {
    try {
      const salesRegex = /([0-9,]+)\s+bought in past month/i;
      const match = salesText.match(salesRegex);
      
      if (match) {
        const count = parseInt(match[1].replace(/,/g, ''), 10);
        return {
          boughtInPastMonth: count,
          totalVariants: 1 // Default to 1, will be updated if variants are found
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting sales data:', error);
      return null;
    }
  }
  
  /**
   * Parse product variants
   * @param {Document} doc - The parsed HTML document
   * @returns {Array} Array of variant objects with ASIN and sales data
   */
  parseVariants(doc) {
    try {
      const variants = [];
      
      // Try to extract variants from twister data
      const twisterData = this.extractTwisterData(doc);
      if (twisterData && twisterData.length > 0) {
        return twisterData;
      }
      
      // Try to extract variants from dimension values
      const dimensionValues = this.extractDimensionValues(doc);
      if (dimensionValues && dimensionValues.length > 0) {
        return dimensionValues;
      }
      
      // Try to find variant elements in the page
      const variantSelectors = [
        '#variation_color_name li',
        '#variation_size_name li',
        '#variation_style_name li',
        '.twisterSwatchWrapper',
        '.a-button-toggle[data-defaultasin]'
      ];
      
      for (const selector of variantSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements && elements.length > 0) {
          for (const element of elements) {
            const variantAsin = element.getAttribute('data-defaultasin') || 
                               element.getAttribute('data-asin') || 
                               element.getAttribute('id');
            
            if (variantAsin && /^[A-Z0-9]{10}$/i.test(variantAsin)) {
              variants.push({
                asin: variantAsin.toUpperCase(),
                boughtInPastMonth: 0 // Default value, would need to fetch each variant page to get actual data
              });
            }
          }
        }
      }
      
      return variants;
    } catch (error) {
      console.error('Error parsing variants:', error);
      return [];
    }
  }
  
  /**
   * Extract twister data (Amazon's variant system)
   * @param {Document} doc - The parsed HTML document
   * @returns {Array} Array of variant objects
   */
  extractTwisterData(doc) {
    try {
      // Look for twister data in script tags
      const scripts = doc.querySelectorAll('script');
      let twisterData = null;
      
      for (const script of scripts) {
        const content = script.textContent;
        
        // Look for twister initialization data
        if (content.includes('var dataToReturn') && content.includes('dimensionValuesDisplayData')) {
          const match = content.match(/var dataToReturn = ({.+});/);
          if (match) {
            try {
              const data = JSON.parse(match[1]);
              if (data.asinVariationValues) {
                twisterData = data;
                break;
              }
            } catch (e) {
              console.error('Error parsing twister data JSON:', e);
            }
          }
        }
        
        // Alternative format
        if (content.includes('P.register') && content.includes('twister')) {
          const match = content.match(/P\.register\('twister-js-init-dpx-data',\s*({.+})\);/);
          if (match) {
            try {
              const data = JSON.parse(match[1]);
              if (data.variationValues) {
                twisterData = data;
                break;
              }
            } catch (e) {
              console.error('Error parsing twister init data JSON:', e);
            }
          }
        }
      }
      
      if (!twisterData) {
        return [];
      }
      
      // Extract ASINs from twister data
      const variants = [];
      const asinMap = twisterData.asinVariationValues || 
                     (twisterData.dimensionValuesData ? Object.values(twisterData.dimensionValuesData).flatMap(v => Object.keys(v)) : []);
      
      if (Array.isArray(asinMap)) {
        asinMap.forEach(asin => {
          if (asin && /^[A-Z0-9]{10}$/i.test(asin)) {
            variants.push({
              asin: asin.toUpperCase(),
              boughtInPastMonth: 0 // Default value
            });
          }
        });
      } else if (typeof asinMap === 'object') {
        Object.keys(asinMap).forEach(key => {
          const asin = key;
          if (asin && /^[A-Z0-9]{10}$/i.test(asin)) {
            variants.push({
              asin: asin.toUpperCase(),
              boughtInPastMonth: 0 // Default value
            });
          }
        });
      }
      
      return variants;
    } catch (error) {
      console.error('Error extracting twister data:', error);
      return [];
    }
  }
  
  /**
   * Extract dimension values (another variant system)
   * @param {Document} doc - The parsed HTML document
   * @returns {Array} Array of variant objects
   */
  extractDimensionValues(doc) {
    try {
      // Look for dimension values in script tags
      const scripts = doc.querySelectorAll('script');
      let dimensionData = null;
      
      for (const script of scripts) {
        const content = script.textContent;
        
        if (content.includes('dimensionValuesDisplayData') || content.includes('asinVariationValues')) {
          const jsonRegex = /var obj = jQuery\.parseJSON\('(.+?)'\);/;
          const match = content.match(jsonRegex);
          
          if (match) {
            try {
              // Need to handle escaped JSON
              const jsonStr = match[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
              const data = JSON.parse(jsonStr);
              if (data.asinVariationValues || data.dimensionValuesDisplayData) {
                dimensionData = data;
                break;
              }
            } catch (e) {
              console.error('Error parsing dimension data JSON:', e);
            }
          }
        }
      }
      
      if (!dimensionData) {
        return [];
      }
      
      // Extract ASINs from dimension data
      const variants = [];
      const asinMap = dimensionData.asinVariationValues || {};
      
      Object.keys(asinMap).forEach(asin => {
        if (asin && /^[A-Z0-9]{10}$/i.test(asin)) {
          variants.push({
            asin: asin.toUpperCase(),
            boughtInPastMonth: 0 // Default value
          });
        }
      });
      
      return variants;
    } catch (error) {
      console.error('Error extracting dimension values:', error);
      return [];
    }
  }
  
  /**
   * Aggregate sales data from variants
   * @param {Object} mainSalesData - Sales data from the main product
   * @param {Array} variants - Array of variant objects
   * @returns {Object} Aggregated sales data
   */
  aggregateSalesData(mainSalesData, variants) {
    try {
      // If no main sales data and no variants with sales data, return null
      if (!mainSalesData && (!variants || variants.length === 0)) {
        return null;
      }
      
      // Start with main product's sales data or default values
      const aggregated = {
        boughtInPastMonth: mainSalesData ? mainSalesData.boughtInPastMonth : 0,
        totalVariants: variants ? variants.length : 1
      };
      
      // Add sales data from variants
      if (variants && variants.length > 0) {
        variants.forEach(variant => {
          if (variant.boughtInPastMonth) {
            aggregated.boughtInPastMonth += variant.boughtInPastMonth;
          }
        });
      }
      
      return aggregated;
    } catch (error) {
      console.error('Error aggregating sales data:', error);
      return mainSalesData || null;
    }
  }
  
  /**
   * Extract structured data from the page
   * @param {Document} doc - The parsed HTML document
   * @returns {Object|null} Structured data object or null if not found
   */
  extractStructuredData(doc) {
    try {
      const structuredDataElements = doc.querySelectorAll('script[type="application/ld+json"]');
      
      for (const element of structuredDataElements) {
        try {
          const data = JSON.parse(element.textContent);
          if (data && (data['@type'] === 'Product' || data.brand)) {
            return data;
          }
        } catch (e) {
          console.error('Error parsing structured data JSON:', e);
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting structured data:', error);
      return null;
    }
  }
  
  /**
   * Custom querySelector that handles jQuery-like selectors
   * @param {Document} doc - The parsed HTML document
   * @param {string} selector - The selector string
   * @returns {Element|null} The found element or null
   */
  querySelector(doc, selector) {
    try {
      // Handle jQuery-like :contains() selector
      if (selector.includes(':contains(')) {
        const parts = selector.split(':contains(');
        const baseSelector = parts[0];
        const searchText = parts[1].split(')')[0].replace(/["']/g, '');
        
        const elements = doc.querySelectorAll(baseSelector);
        for (const element of elements) {
          if (element.textContent.includes(searchText)) {
            return element;
          }
        }
        return null;
      }
      
      // Standard querySelector
      return doc.querySelector(selector);
    } catch (error) {
      console.error('Error in querySelector:', error);
      return null;
    }
  }
}

// Export the parser
if (typeof module !== 'undefined') {
  module.exports = { AmazonParser };
}