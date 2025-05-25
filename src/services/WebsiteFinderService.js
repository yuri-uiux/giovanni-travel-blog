/**
 * WebsiteFinderService.js
 * 
 * This service finds official websites for places of interest
 * using Google Places API with improved verification.
 */

const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

class WebsiteFinderService {
  constructor() {
    // Cache to store website URLs to reduce API calls
    this.cache = new NodeCache({ stdTTL: 60 * 60 * 24 * 30 }); // 30 days cache
    this.apiKey = process.env.API_KEY_GOOGLE;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 200; // 200ms between requests
  }

  /**
   * Find the official website for a place using Google Places API
   * @param {string} name - The name of the place
   * @param {string} location - The location (city, country)
   * @param {string} type - The type (restaurant, attraction, etc.)
   * @returns {Promise<object>} The website URL, maps URL, status and place info
   */
  async findWebsite(name, location, type) {
    try {
      // Generate cache key
      const cacheKey = `website_${name}_${location}`.replace(/\s+/g, '_').toLowerCase();
      
      // Check cache first
      const cachedResult = this.cache.get(cacheKey);
      if (cachedResult) {
        console.log(`Using cached place info for ${name}: ${JSON.stringify(cachedResult)}`);
        return cachedResult;
      }
      
      // Respect rate limiting
      const now = Date.now();
      const timeElapsed = now - this.lastRequestTime;
      if (timeElapsed < this.minRequestInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeElapsed));
      }
      
      // First use Find Place to get the place_id
      console.log(`Searching for place: ${name} in ${location}`);
      const searchQuery = `${name} ${location}`;
      
      const findPlaceResponse = await axios.get(
        'https://maps.googleapis.com/maps/api/place/findplacefromtext/json',
        {
          params: {
            input: searchQuery,
            inputtype: 'textquery',
            fields: 'place_id,name,business_status',
            key: this.apiKey
          },
          timeout: 5000
        }
      );
      
      this.lastRequestTime = Date.now();
      
      // Check if we found a place
      if (!findPlaceResponse.data.candidates || findPlaceResponse.data.candidates.length === 0) {
        console.log(`No places found for ${name} in ${location}`);
        
        // Return a result with Google search URL as fallback
        const result = {
          url: `https://www.google.com/search?q=${encodeURIComponent(name+' '+location)}`,
          mapsUrl: null,
          placeId: null,
          isOpen: false,
          name: name
        };
        
        this.cache.set(cacheKey, result);
        return result;
      }
      
      // Get the first candidate's place_id and check business status
      const candidate = findPlaceResponse.data.candidates[0];
      const placeId = candidate.place_id;
      
      // Check if the place is permanently closed
      if (candidate.business_status === 'CLOSED_PERMANENTLY') {
        console.log(`${name} in ${location} is permanently closed`);
        
        // Create Google Maps URL as fallback
        const mapsUrl = `https://www.google.com/maps/place/?q=place_id:${placeId}`;
        const result = {
          url: mapsUrl,  // Use Maps URL as the primary URL
          mapsUrl: mapsUrl,
          placeId: placeId,
          isOpen: false,
          name: candidate.name || name,
          isPermanentlyClosed: true
        };
        
        this.cache.set(cacheKey, result);
        return result;
      }
      
      // Now get the details including the website
      const detailsResponse = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: placeId,
            fields: 'name,website,formatted_address,business_status,url',
            key: this.apiKey
          },
          timeout: 5000
        }
      );
      
      this.lastRequestTime = Date.now();
      
      // Create Google Maps URL
      const mapsUrl = `https://www.google.com/maps/place/?q=place_id:${placeId}`;
      
      // Get place details
      const placeDetails = detailsResponse.data.result || {};
      
      // Check business status in details
      const isOpen = placeDetails.business_status === 'OPERATIONAL' || 
                     !placeDetails.business_status || 
                     placeDetails.business_status === 'CLOSED_TEMPORARILY';
      
      // Prepare result
      const result = {
        url: placeDetails.website || mapsUrl, // Use website if available, otherwise Maps URL
        mapsUrl: mapsUrl,
        placeId: placeId,
        isOpen: isOpen,
        name: placeDetails.name || candidate.name || name,
        isPermanentlyClosed: placeDetails.business_status === 'CLOSED_PERMANENTLY'
      };
      
      // Store in cache
      this.cache.set(cacheKey, result);
      
      if (placeDetails.website) {
        console.log(`Found website for ${name}: ${placeDetails.website}`);
      } else {
        console.log(`No website found for ${name}, using Google Maps URL: ${mapsUrl}`);
      }
      
      return result;
    } catch (error) {
      console.error(`Error finding website via Places API: ${error.message}`);
      
      // Return a fallback result with Google search URL
      return {
        url: `https://www.google.com/search?q=${encodeURIComponent(name+' '+location)}`,
        mapsUrl: null,
        placeId: null,
        isOpen: true, // Assume open by default
        name: name
      };
    }
  }
}

module.exports = new WebsiteFinderService();
