/**
 * Soron Ads SDK - Production Ready
 * Version: 1.0.0
 * 
 * Features:
 * - User Query mode for search-based ad matching
 * - Agent Response mode for article assistant integration
 * - Automatic impression and click tracking
 * - Secure API key handling
 * - Error handling and retry logic
 * - Customizable rendering
 * - Performance optimized
 */

(function(global) {
  'use strict';

  // SDK Configuration
  const config = {
    apiUrl: 'https://soron.ai',
    defaultTimeout: 10000,
    maxRetries: 0,
    retryDelay: 1000,
    debug: false
  };

  // Utility functions
  const utils = {
    log: function(...args) {
      if (config.debug || (global.SORON_ADS_DEBUG === true)) {
        console.log('[SoronAds]', ...args);
      }
    },
    error: function(...args) {
      console.error('[SoronAds]', ...args);
    },
    generateUserId: function() {
      // Generate anonymous user ID if not provided
      const stored = localStorage.getItem('soron_user_id');
      if (stored) return stored;
      
      const newId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('soron_user_id', newId);
      return newId;
    },
    parseApiKey: function(keyOrElement) {
      // Support both direct API key or element selector
      if (typeof keyOrElement === 'string') {
        if (keyOrElement.startsWith('#') || keyOrElement.startsWith('.')) {
          const element = document.querySelector(keyOrElement);
          return element ? element.getAttribute('data-api-key') || element.textContent : null;
        }
        return keyOrElement;
      }
      return null;
    }
  };

  // Main SDK Class
  class SoronAdsSDK {
    constructor(options = {}) {
      this.apiKey = utils.parseApiKey(options.apiKey);
      this.mode = options.mode || 'user-query'; // 'user-query' or 'agent-response'
      this.userId = options.userId || utils.generateUserId();
      this.platform = options.platform || 'web';
      this.debug = options.debug || false;
      this.callbacks = {};
      this.impressionsFired = new Set();
      
      if (this.debug) config.debug = true;
      
      if (!this.apiKey) {
        utils.error('API key is required. Pass it in options.apiKey');
      }
    }

    /**
     * Fetch ad based on mode
     * @param {string|object} input - User query string or agent response object
     * @param {object} options - Additional options
     */
    async getAd(input, options = {}) {
      if (!this.apiKey) {
        throw new Error('API key not configured');
      }

      const endpoint = this.mode === 'agent-response' 
        ? '/ads/agent-response' 
        : '/ads/user-query';

      const payload = this.mode === 'agent-response'
        ? {
            agentResponse: typeof input === 'string' ? input : input.response,
            userId: options.userId || this.userId,
            platform: options.platform || this.platform,
            location: options.location || 'US'
          }
        : {
            userPrompt: typeof input === 'string' ? input : input.query,
            userId: options.userId || this.userId,
            platform: options.platform || this.platform,
            location: options.location || 'US'
          };

      utils.log(`Fetching ad in ${this.mode} mode`, payload);

      let lastError;
      for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
          const response = await this._makeRequest(endpoint, payload);
          
          if (response.ads && response.ads.length > 0) {
            const ad = response.ads[0];
            
            // Track impression automatically
            this._trackImpression(ad);
            
            // Call success callback
            if (this.callbacks.onAdLoaded) {
              this.callbacks.onAdLoaded(ad);
            }
            
            return ad;
          } else {
            utils.log('No ads returned from API');
            if (this.callbacks.onNoAd) {
              this.callbacks.onNoAd();
            }
            return null;
          }
        } catch (error) {
          lastError = error;
          utils.error(`Attempt ${attempt + 1} failed:`, error.message);
          
          if (attempt < config.maxRetries) {
            await this._sleep(config.retryDelay * (attempt + 1));
          }
        }
      }
      
      if (this.callbacks.onError) {
        this.callbacks.onError(lastError);
      }
      throw lastError;
    }

    /**
     * Render ad into container
     * @param {object} ad - Ad object from getAd()
     * @param {string|HTMLElement} container - Container selector or element
     * @param {object} options - Rendering options
     */
    renderAd(ad, container, options = {}) {
      if (!ad) {
        utils.error('No ad to render');
        return;
      }

      const element = typeof container === 'string' 
        ? document.querySelector(container)
        : container;

      if (!element) {
        utils.error('Container not found:', container);
        return;
      }

      // Default template with customization options
      const template = options.template || this._getDefaultTemplate();
      const html = template(ad);
      
      element.innerHTML = html;
      
      // Attach click handlers
      this._attachClickHandlers(element, ad);
      
      // Fire viewability tracking after render
      this._trackViewability(ad, element);
      
      if (this.callbacks.onAdRendered) {
        this.callbacks.onAdRendered(ad, element);
      }
    }

    /**
     * Get formatted ad content for native display
     * @param {object} ad - Ad object
     * @returns {string} Formatted HTML string
     */
    getFormattedAd(ad) {
      if (!ad) return '';
      const template = this._getDefaultTemplate();
      return template(ad);
    }

    /**
     * Set callbacks
     */
    on(event, callback) {
      this.callbacks[event] = callback;
      return this;
    }

    /**
     * Helper for agent response mode
     */
    async getAdForAgentResponse(agentResponse, options = {}) {
      const originalMode = this.mode;
      this.mode = 'agent-response';
      try {
        return await this.getAd(agentResponse, options);
      } finally {
        this.mode = originalMode;
      }
    }

    /**
     * Helper for user query mode
     */
    async getAdForUserQuery(userQuery, options = {}) {
      const originalMode = this.mode;
      this.mode = 'user-query';
      try {
        return await this.getAd(userQuery, options);
      } finally {
        this.mode = originalMode;
      }
    }

    // Private methods
    async _makeRequest(endpoint, payload) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.defaultTimeout);
      
      try {
        const response = await fetch(config.apiUrl + endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || `HTTP ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    }

    _trackImpression(ad) {
      // API returns pixelUrl for impression tracking
      const trackingUrl = ad.pixelUrl;
      
      if (!trackingUrl || this.impressionsFired.has(trackingUrl)) {
        return;
      }

      const img = new Image();
      img.src = trackingUrl;
      img.style.display = 'none';
      
      img.onload = () => {
        utils.log('Impression tracked');
        this.impressionsFired.add(trackingUrl);
      };
      
      img.onerror = () => {
        utils.error('Failed to track impression');
      };
      
      // Add to DOM briefly to ensure tracking
      document.body.appendChild(img);
      setTimeout(() => {
        if (img.parentNode) {
          img.parentNode.removeChild(img);
        }
      }, 100);
    }

    _trackClick(ad, targetElement) {
      const trackingUrl = ad.clickUrl;
      if (!trackingUrl) return;

      utils.log('Tracking click');
      
      // For click tracking, we should navigate to the click URL
      // which will handle tracking and redirect to the final destination
      if (this.callbacks.onAdClicked) {
        this.callbacks.onAdClicked(ad, targetElement);
      }
      
      // The click URL handles both tracking and redirection
      return trackingUrl;
    }

    _trackViewability(ad, element) {
      if (!ad.viewabilityUrl) return;

      // Use Intersection Observer for viewability
      if ('IntersectionObserver' in window) {
        let startTime = null;
        let totalViewTime = 0;
        
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              if (!startTime) {
                startTime = Date.now();
              }
            } else if (startTime) {
              totalViewTime += Date.now() - startTime;
              startTime = null;
              
              // MRC standard: 50% visible for 1 second
              if (totalViewTime >= 1000) {
                const img = new Image();
                img.src = ad.viewabilityUrl;
                utils.log('Viewability tracked');
                observer.disconnect();
              }
            }
          });
        }, {
          threshold: [0.5]
        });
        
        observer.observe(element);
        
        // Clean up after 30 seconds
        setTimeout(() => observer.disconnect(), 30000);
      }
    }

    _attachClickHandlers(container, ad) {
      const links = container.querySelectorAll('a[data-soron-click]');
      
      links.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const trackingUrl = this._trackClick(ad, link);
          
          // Use click tracking URL if available, otherwise use direct URL
          const targetUrl = trackingUrl || link.href;
          
          // Navigate immediately - the click URL handles tracking server-side
          window.open(targetUrl, link.target || '_blank', 'noopener,noreferrer');
        });
      });
    }

    _getDefaultTemplate() {
      return (ad) => {
        // Native chat format - just the content with advertiser attribution
        const linkUrl = ad.clickUrl || ad.url || '#';
        const hasLink = linkUrl && linkUrl !== '#';
        
        return `${this._escapeHtml(ad.content)}<br><br>— ${hasLink ? 
          `<a href="${this._escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer" data-soron-click="true" style="color: #007bff; text-decoration: none;">${this._escapeHtml(ad.advertiser)}</a>` : 
          this._escapeHtml(ad.advertiser)}`;
      };
    }

    _escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    _sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // Simple API for backward compatibility
  const simpleAPI = {
    init: function(apiKey, options = {}) {
      this.instance = new SoronAdsSDK({ apiKey, ...options });
      return this.instance;
    },
    
    getAd: async function(input, container, options = {}) {
      if (!this.instance) {
        throw new Error('Call SoronAds.init(apiKey) first');
      }
      
      const ad = await this.instance.getAd(input, options);
      if (ad && container) {
        this.instance.renderAd(ad, container, options);
      }
      return ad;
    },
    
    getFormattedAd: async function(input, options = {}) {
      if (!this.instance) {
        throw new Error('Call SoronAds.init(apiKey) first');
      }
      
      const ad = await this.instance.getAd(input, options);
      if (!ad) return null;
      
      return this.instance.getFormattedAd(ad);
    },
    
    getFormattedAdWithPromise: async function(input, aiPromise, options = {}) {
      if (!this.instance) {
        throw new Error('Call SoronAds.init(apiKey) first');
      }
      
      // Start fetching ad immediately
      const adPromise = this.instance.getAd(input, options).then(ad => {
        if (!ad) return null;
        return this.instance.getFormattedAd(ad);
      });
      
      // Wait for both in parallel
      const [adResult, aiResult] = await Promise.allSettled([adPromise, aiPromise]);
      
      return {
        ad: adResult.status === 'fulfilled' ? adResult.value : null,
        adError: adResult.status === 'rejected' ? adResult.reason : null,
        ai: aiResult.status === 'fulfilled' ? aiResult.value : null,
        aiError: aiResult.status === 'rejected' ? aiResult.reason : null
      };
    }
  };

  // Export
  global.SoronAdsSDK = SoronAdsSDK;
  global.SoronAds = simpleAPI;
  
  // AMD/CommonJS/ES6 module support
  if (typeof define === 'function' && define.amd) {
    define([], function() { return SoronAdsSDK; });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = SoronAdsSDK;
  }

})(typeof window !== 'undefined' ? window : this);