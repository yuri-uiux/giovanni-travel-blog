/**
 * AccommodationFinderService.js
 * 
 * This service searches for real accommodations in specific locations
 * using Google Places API instead of web scraping.
 */
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

class AccommodationFinderService {
  constructor() {
    // Cache to store search results to reduce API calls
    this.cache = new NodeCache({ stdTTL: 60 * 60 * 24 * 7 }); // 7 days cache
    this.apiKey = process.env.API_KEY_GOOGLE;
    
    // Rate limiting settings
    this.lastRequestTime = 0;
    this.minRequestInterval = 200; // 200ms between requests
  }

  /**
   * Find real accommodations in a location using Google Places API
   * @param {string} city - City name
   * @param {string} country - Country name
   * @param {object} options - Search options
   * @returns {Promise<object>} - Accommodation details
   */
  async findAccommodation(city, country, options = {}) {
    try {
      const cacheKey = `accommodation_${city}_${country}`.replace(/\s+/g, '_').toLowerCase();
      
      // Check cache first
      const cachedResult = this.cache.get(cacheKey);
      if (cachedResult) {
        console.log(`Using cached accommodation for ${city}, ${country}`);
        return cachedResult;
      }
      
      // Respect rate limiting
      const now = Date.now();
      const timeElapsed = now - this.lastRequestTime;
      if (timeElapsed < this.minRequestInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeElapsed));
      }
      
      // Build search query based on options
      let queryTerms = [`accommodation in ${city} ${country}`];
      
      if (options.budget === 'low') {
        queryTerms.push('budget affordable');
      } else if (options.budget === 'high') {
        queryTerms.push('luxury');
      }
      
      if (options.features && options.features.length > 0) {
        queryTerms = queryTerms.concat(options.features);
      }
      
      const query = queryTerms.join(' ');
      
      // Use Google Places API Text Search to find accommodations
      console.log(`Searching for accommodation in ${city}, ${country} using Places API`);
      const textSearchResponse = await axios.get(
        'https://maps.googleapis.com/maps/api/place/textsearch/json',
        {
          params: {
            query: query,
            type: 'lodging',
            key: this.apiKey
          },
          timeout: 5000
        }
      );
      
      this.lastRequestTime = Date.now();
      
      // Check if we found any places
      if (!textSearchResponse.data.results || textSearchResponse.data.results.length === 0) {
        console.log(`No accommodations found for ${city}, ${country}. Falling back to defaults.`);
        return this.createDefaultAccommodation(city, country);
      }
      
      // Select a few promising accommodations
      const topResults = textSearchResponse.data.results.slice(0, 3);
      const accommodations = [];
      
      // Get details for each accommodation
      for (const place of topResults) {
        // Respect rate limiting
        await new Promise(resolve => setTimeout(resolve, this.minRequestInterval));
        
        const detailsResponse = await axios.get(
          'https://maps.googleapis.com/maps/api/place/details/json',
          {
            params: {
              place_id: place.place_id,
              fields: 'name,rating,formatted_address,website,url,formatted_phone_number,geometry',
              key: this.apiKey
            },
            timeout: 5000
          }
        );
        
        this.lastRequestTime = Date.now();
        
        if (detailsResponse.data.result) {
          const result = detailsResponse.data.result;
          
          accommodations.push({
            name: result.name,
            description: `A well-located ${options.budget || 'comfortable'} accommodation in ${city}, ${country}.`,
            pricePerNight: this.estimatePriceFromRating(result.rating, options.budget),
            address: result.formatted_address || `${city}, ${country}`,
            amenities: this.generateDefaultAmenities(options.budget),
            currency: this.getCurrencyForCountry(country),
            bookingUrl: result.website || result.url,
            source: result.website ? 'Official Website' : 'Google Maps',
            rating: result.rating,
            lat: result.geometry?.location?.lat,
            lng: result.geometry?.location?.lng,
            phone: result.formatted_phone_number
          });
        }
      }
      
      // If we have accommodation results, select the best match
      if (accommodations.length > 0) {
        const bestMatch = this.selectBestAccommodation(accommodations, options);
        
        // Store in cache
        this.cache.set(cacheKey, bestMatch);
        
        console.log(`Found accommodation in ${city}: ${bestMatch.name}`);
        return bestMatch;
      }
      
      // Fallback to default
      console.log(`No suitable accommodations found for ${city}, ${country}. Using default.`);
      return this.createDefaultAccommodation(city, country);
      
    } catch (error) {
      console.error(`Error finding accommodation via Places API: ${error.message}`);
      
      // Return a default accommodation in case of error
      return this.createDefaultAccommodation(city, country);
    }
  }

  /**
   * Select the best accommodation from search results
   * @param {Array} accommodations - List of found accommodations
   * @param {object} options - Search preferences
   * @returns {object} - Best matching accommodation
   */
  selectBestAccommodation(accommodations, options = {}) {
    // If specific options are provided, filter further
    let filtered = accommodations;
    
    if (options.maxPrice) {
      filtered = filtered.filter(acc => !acc.pricePerNight || acc.pricePerNight <= options.maxPrice);
    }
    
    // Sort by rating if available
    filtered.sort((a, b) => {
      if (a.rating && b.rating) return b.rating - a.rating;
      if (a.rating) return -1;
      if (b.rating) return 1;
      return 0;
    });
    
    // Take the highest scored accommodation
    const bestMatch = filtered[0] || accommodations[0];
    
    return bestMatch;
  }

  /**
   * Estimate price based on rating and budget preferences
   * @param {number} rating - Place rating (0-5)
   * @param {string} budget - Budget preference (low, medium, high)
   * @returns {number} - Estimated price per night
   */
  estimatePriceFromRating(rating, budget) {
    // Base price depending on budget preference
    let basePrice = 70; // Medium budget
    
    if (budget === 'low') {
      basePrice = 45;
    } else if (budget === 'high') {
      basePrice = 120;
    }
    
    // Adjust based on rating if available
    if (rating) {
      // 5-star would be 100% of base, 1-star would be 60% of base
      const multiplier = 0.6 + (rating / 5) * 0.4;
      return Math.round(basePrice * multiplier);
    }
    
    // Add some randomness for variety
    return basePrice + Math.floor(Math.random() * 20) - 10;
  }

  /**
   * Generate default amenities based on budget
   * @param {string} budget - Budget preference
   * @returns {string} - Comma-separated list of amenities
   */
  generateDefaultAmenities(budget) {
    const baseAmenities = ['WiFi', 'TV', 'Air conditioning'];
    
    if (budget === 'low') {
      return [...baseAmenities, 'Shared bathroom'].join(', ');
    } else if (budget === 'high') {
      return [...baseAmenities, 'Kitchen', 'Washing machine', 'Balcony', 'City view', 'Premium bedding'].join(', ');
    }
    
    // Medium budget (default)
    return [...baseAmenities, 'Kitchen', 'Washing machine'].join(', ');
  }

  /**
   * Create a default accommodation when search fails
   * @param {string} city - City name
   * @param {string} country - Country name
   * @returns {object} - Default accommodation object
   */
  createDefaultAccommodation(city, country) {
    return {
      name: `${city} City Center Apartment`,
      description: `Cozy apartment in the heart of ${city}, perfect for exploring the historic center. Featuring modern amenities and a convenient location.`,
      pricePerNight: 50 + Math.floor(Math.random() * 50),
      address: `City Center, ${city}`,
      amenities: 'WiFi, Kitchen, Air conditioning, TV, Washing machine',
      currency: this.getCurrencyForCountry(country),
      bookingUrl: `https://www.booking.com/city/${country.toLowerCase()}/${city.toLowerCase().replace(/\s+/g, '-')}.html`,
      source: 'Default Generator'
    };
  }

  /**
   * Helper method to get currency for country
   * @param {string} country - Country name
   * @returns {string} - Currency code
   */
  getCurrencyForCountry(country) {
    const currencies = {
      'Serbia': 'RSD',
      'Croatia': 'EUR',
      'Italy': 'EUR',
      'Montenegro': 'EUR',
      'Bulgaria': 'BGN',
      'Hungary': 'HUF',
      'Greece': 'EUR',
      'Romania': 'RON',
      'North Macedonia': 'MKD',
      'Czech Republic': 'CZK',
      'Austria': 'EUR',
      'Slovenia': 'EUR',
      'Albania': 'ALL',
      'Poland': 'PLN',
      'Slovakia': 'EUR'
    };
    return currencies[country] || 'EUR';
  }
}

module.exports = new AccommodationFinderService();
