/**
 * TripAdvisorService.js
 * 
 * This service enhances location information using TripAdvisor Content API
 * to get ratings, reviews, and detailed descriptions for attractions and restaurants.
 */

const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

class TripAdvisorService {
  constructor() {
    this.apiKey = process.env.API_KEY_TRIPADVISOR;
    this.baseURL = 'https://api.content.tripadvisor.com/api/v1';
    
    // Cache to store TripAdvisor data (longer cache since this data changes less frequently)
    this.cache = new NodeCache({ stdTTL: 60 * 60 * 24 * 7 }); // 7 days cache
    
    // Rate limiting - TripAdvisor allows up to 50 calls per second
    this.lastRequestTime = 0;
    this.minRequestInterval = 25; // 25ms between requests (40 requests per second to be safe)
    
    // Monthly usage tracking (5000 free calls per month)
    this.monthlyUsage = 0;
    this.monthlyLimit = 5000;
    this.usageResetDate = this.getNextMonthStart();
  }

  // Get the start of next month for usage reset
  getNextMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  // Rate limiting helper
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
  }

  // Check monthly usage limit
  checkMonthlyLimit() {
    const now = new Date();
    
    // Reset usage if new month
    if (now >= this.usageResetDate) {
      this.monthlyUsage = 0;
      this.usageResetDate = this.getNextMonthStart();
    }
    
    if (this.monthlyUsage >= this.monthlyLimit) {
      throw new Error(`TripAdvisor API monthly limit reached (${this.monthlyLimit} calls). Resets on ${this.usageResetDate.toDateString()}`);
    }
  }

  // Normalize TripAdvisor location data to handle different API response formats
  normalizeLocationData(rawData) {
    if (!rawData) return null;
    
    // Calculate total reviews from review_rating_count if num_reviews is not available
    let totalReviews = rawData.num_reviews;
    if (!totalReviews && rawData.review_rating_count) {
      totalReviews = Object.values(rawData.review_rating_count)
        .reduce((sum, count) => sum + parseInt(count || 0), 0)
        .toString();
    }
    
    return {
      location_id: rawData.location_id,
      name: rawData.name,
      rating: rawData.rating ? parseFloat(rawData.rating) : null, // Convert string to number
      num_reviews: totalReviews || null,
      address_obj: rawData.address_obj || rawData.address,
      description: rawData.description || rawData.snippet || null,
      price_level: rawData.price_level || rawData.price || null,
      cuisine: rawData.cuisine || null,
      groups: rawData.groups || null,
      awards: rawData.awards || [],
      web_url: rawData.web_url || rawData.website || null,
      photo_count: rawData.photo_count ? parseInt(rawData.photo_count) : null,
      ranking_data: rawData.ranking_data || null,
      subratings: rawData.subratings || null,
      trip_types: rawData.trip_types || null,
      review_rating_count: rawData.review_rating_count || null
    };
  }

  // Search for locations by name and city
  async searchLocation(name, city, country, type = null) {
    const cacheKey = `search_${name}_${city}_${country}_${type}`.toLowerCase().replace(/\s+/g, '_');
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`Using cached TripAdvisor search for ${name} in ${city}`);
      return cached;
    }

    try {
      this.checkMonthlyLimit();
      await this.waitForRateLimit();

      const searchQuery = `${name} ${city} ${country}`;
      console.log(`Searching TripAdvisor for: "${searchQuery}"`);

      const response = await axios.get(`${this.baseURL}/location/search`, {
        params: {
          key: this.apiKey,
          searchQuery: searchQuery,
          category: type, // 'hotels', 'restaurants', 'attractions'
          language: 'en'
        },
        timeout: 10000
      });

      this.lastRequestTime = Date.now();
      this.monthlyUsage++;

      const results = response.data?.data || [];
      
      if (results.length > 0) {
        // Find the best match by name (since search results don't have ratings)
        const bestMatch = this.findBestMatchByName(results, name);
        
        if (bestMatch) {
          // Get detailed information with ratings
          console.log(`Getting details for ${bestMatch.name} (ID: ${bestMatch.location_id})`);
          const detailedData = await this.getLocationDetails(bestMatch.location_id);
          
          if (detailedData) {
            console.log(`Found TripAdvisor match for ${name}: ${detailedData.name} (Rating: ${detailedData.rating})`);
            this.cache.set(cacheKey, detailedData);
            return detailedData;
          } else {
            // Fallback to basic data if details fail
            const normalizedData = this.normalizeLocationData(bestMatch);
            console.log(`Found TripAdvisor match for ${name}: ${normalizedData.name} (No details available)`);
            this.cache.set(cacheKey, normalizedData);
            return normalizedData;
          }
        }
      }

      console.log(`No TripAdvisor results found for ${name} in ${city}`);
      this.cache.set(cacheKey, null);
      return null;

    } catch (error) {
      console.error(`Error searching TripAdvisor: ${error.message}`);
      this.cache.set(cacheKey, null);
      return null;
    }
  }

  // Find best match from search results by name similarity (since no ratings in search)
  findBestMatchByName(results, targetName) {
    const targetLower = targetName.toLowerCase();
    
    // First try exact name match
    let exactMatch = results.find(result => 
      result.name && result.name.toLowerCase().includes(targetLower)
    );
    
    if (exactMatch) {
      return exactMatch;
    }
    
    // If no exact match, return first result (search is already sorted by relevance)
    return results[0];
  }

  // Get detailed location information
  async getLocationDetails(locationId) {
    const cacheKey = `details_${locationId}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`Using cached TripAdvisor details for location ${locationId}`);
      return cached;
    }

    try {
      this.checkMonthlyLimit();
      await this.waitForRateLimit();

      console.log(`Getting TripAdvisor details for location ${locationId}`);

      const response = await axios.get(`${this.baseURL}/location/${locationId}/details`, {
        params: {
          key: this.apiKey,
          language: 'en',
          currency: 'EUR'
        },
        timeout: 10000
      });

      this.lastRequestTime = Date.now();
      this.monthlyUsage++;

      const details = response.data;
      
      if (details) {
        const normalizedDetails = this.normalizeLocationData(details);
        console.log(`Retrieved TripAdvisor details for ${normalizedDetails.name}`);
        this.cache.set(cacheKey, normalizedDetails);
        return normalizedDetails;
      }

      return null;

    } catch (error) {
      console.error(`Error getting TripAdvisor location details: ${error.message}`);
      return null;
    }
  }

  // Enhance attraction data with TripAdvisor information
  async enhanceAttraction(attraction, location) {
    try {
      // Search for the attraction on TripAdvisor
      const tripAdvisorData = await this.searchLocation(
        attraction.name, 
        location.name, 
        location.country, 
        'attractions'
      );

      if (!tripAdvisorData) {
        return attraction; // Return original if no TripAdvisor data found
      }

      // Get detailed information if we have a location ID
      let details = null;
      if (tripAdvisorData.location_id) {
        details = await this.getLocationDetails(tripAdvisorData.location_id);
      }

      // Enhance the attraction object with TripAdvisor data
      const enhanced = {
        ...attraction,
        tripadvisor: {
          location_id: tripAdvisorData.location_id,
          rating: tripAdvisorData.rating,
          num_reviews: tripAdvisorData.num_reviews,
          ranking_data: details?.ranking_data,
          awards: details?.awards || [],
          price_level: details?.price_level,
          web_url: details?.web_url,
          photo_count: details?.photo_count,
          groups: details?.groups, // Attraction categories
          trip_types: details?.trip_types // Popular with families, couples, etc.
        }
      };

      // Update description with TripAdvisor insights
      if (details?.ranking_data?.ranking_string) {
        enhanced.description = `${attraction.description} ${details.ranking_data.ranking_string} on TripAdvisor.`;
      }

      return enhanced;

    } catch (error) {
      console.error(`Error enhancing attraction with TripAdvisor data: ${error.message}`);
      return attraction; // Return original on error
    }
  }

  // Enhance restaurant data with TripAdvisor information
  async enhanceRestaurant(restaurant, location) {
    try {
      // Search for the restaurant on TripAdvisor
      const tripAdvisorData = await this.searchLocation(
        restaurant.name, 
        location.name, 
        location.country, 
        'restaurants'
      );

      if (!tripAdvisorData) {
        return restaurant; // Return original if no TripAdvisor data found
      }

      // Get detailed information if we have a location ID
      let details = null;
      if (tripAdvisorData.location_id) {
        details = await this.getLocationDetails(tripAdvisorData.location_id);
      }

      // Enhance the restaurant object with TripAdvisor data
      const enhanced = {
        ...restaurant,
        tripadvisor: {
          location_id: tripAdvisorData.location_id,
          rating: tripAdvisorData.rating,
          num_reviews: tripAdvisorData.num_reviews,
          ranking_data: details?.ranking_data,
          price_level: details?.price_level,
          cuisine: details?.cuisine,
          awards: details?.awards || [],
          web_url: details?.web_url,
          subratings: details?.subratings, // Food, service, value, atmosphere
          trip_types: details?.trip_types // Business, couples, family, etc.
        }
      };

      // Update cuisine information if available
      if (details?.cuisine && details.cuisine.length > 0) {
        enhanced.cuisine = details.cuisine.map(c => c.name).join(', ');
      }

      // Update description with TripAdvisor insights
      if (details?.ranking_data?.ranking_string) {
        enhanced.description = `${restaurant.description} ${details.ranking_data.ranking_string} on TripAdvisor.`;
      }

      return enhanced;

    } catch (error) {
      console.error(`Error enhancing restaurant with TripAdvisor data: ${error.message}`);
      return restaurant; // Return original on error
    }
  }

  // Get city's top attractions from TripAdvisor
  async getCityTopAttractions(cityName, country, limit = 10) {
    const cacheKey = `top_attractions_${cityName}_${country}_${limit}`.toLowerCase().replace(/\s+/g, '_');
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`Using cached top attractions for ${cityName}`);
      return cached;
    }

    try {
      this.checkMonthlyLimit();
      await this.waitForRateLimit();

      const searchQuery = `${cityName} ${country} attractions`;
      console.log(`Getting top attractions for ${cityName} from TripAdvisor`);

      const response = await axios.get(`${this.baseURL}/location/search`, {
        params: {
          key: this.apiKey,
          searchQuery: searchQuery,
          category: 'attractions',
          language: 'en'
        },
        timeout: 10000
      });

      this.lastRequestTime = Date.now();
      this.monthlyUsage++;

      const results = response.data?.data || [];
      
      if (results.length === 0) {
        console.log(`No attractions found for ${cityName}`);
        this.cache.set(cacheKey, []);
        return [];
      }

      // Get details for each attraction to get ratings (limit to avoid too many API calls)
      const attractionsWithDetails = [];
      const maxToProcess = Math.min(results.length, limit * 2); // Process more than needed to filter by rating
      
      for (let i = 0; i < maxToProcess; i++) {
        const attraction = results[i];
        
        try {
          // Rate limiting between requests
          await this.waitForRateLimit();
          
          const details = await this.getLocationDetails(attraction.location_id);
          if (details && details.rating && details.rating >= 4.0) {
            attractionsWithDetails.push(details);
          }
          
          // Stop if we have enough good attractions
          if (attractionsWithDetails.length >= limit) {
            break;
          }
          
        } catch (detailError) {
          console.warn(`Failed to get details for attraction ${attraction.name}: ${detailError.message}`);
          // Continue with next attraction
        }
      }

      // Sort by rating (highest first) and take top results
      const topAttractions = attractionsWithDetails
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, limit);

      console.log(`Found ${topAttractions.length} top-rated attractions for ${cityName}`);
      
      this.cache.set(cacheKey, topAttractions);
      return topAttractions;

    } catch (error) {
      console.error(`Error getting top attractions: ${error.message}`);
      this.cache.set(cacheKey, []);
      return [];
    }
  }

  // Calculate average rating from attractions list
  calculateAverageRating(attractions) {
    if (!attractions || attractions.length === 0) return 0;
    
    const validRatings = attractions
      .map(attraction => attraction.rating) // Already normalized to number
      .filter(rating => rating && rating > 0);
    
    if (validRatings.length === 0) return 0;
    
    const sum = validRatings.reduce((acc, rating) => acc + rating, 0);
    return Math.round((sum / validRatings.length) * 10) / 10; // Round to 1 decimal place
  }

  // Get usage statistics
  getUsageStats() {
    return {
      monthlyUsage: this.monthlyUsage,
      monthlyLimit: this.monthlyLimit,
      remainingCalls: this.monthlyLimit - this.monthlyUsage,
      resetDate: this.usageResetDate.toDateString(),
      cacheSize: this.cache.keys().length
    };
  }

  // Clear cache (useful for testing)
  clearCache() {
    this.cache.flushAll();
    console.log('TripAdvisor cache cleared');
  }
}

module.exports = new TripAdvisorService(); 