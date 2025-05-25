const UnsplashService = require('./UnsplashService');
const FreepikService = require('./FreepikService');
require('dotenv').config();

/**
 * Unified Image Service that provides a common interface for both Unsplash and Freepik
 * Uses configuration to determine which service to use for image generation/retrieval
 */
class ImageService {
  constructor() {
    // Get image provider from environment configuration
    this.imageProvider = process.env.IMAGE_PROVIDER || 'unsplash'; // 'unsplash' or 'freepik'
    
    // Initialize the appropriate service based on configuration
    if (this.imageProvider === 'freepik') {
      this.imageService = new FreepikService();
      console.log('ImageService initialized with Freepik AI generation');
    } else {
      this.imageService = UnsplashService; // Use the exported instance, not create new
      console.log('ImageService initialized with Unsplash search');
    }
    
    // Fallback service in case primary fails
    this.fallbackService = this.imageProvider === 'freepik' 
      ? UnsplashService  // Use the exported instance
      : new FreepikService();
  }

  /**
   * Get location image with automatic fallback
   */
  async getLocationImage(location, filename) {
    try {
      console.log(`Getting location image using ${this.imageProvider} for ${location.name}, ${location.country}`);
      
      const result = await this.imageService.getLocationImage(location, filename);
      
      if (result && result.path) {
        return result;
      }
      
      // If primary service fails, try fallback
      console.log(`Primary service failed, trying fallback service`);
      return await this.fallbackService.getLocationImage(location, filename);
      
    } catch (error) {
      console.error(`Error in getLocationImage: ${error.message}`);
      
      // Try fallback service
      try {
        console.log(`Attempting fallback service for location image`);
        return await this.fallbackService.getLocationImage(location, filename);
      } catch (fallbackError) {
        console.error(`Fallback also failed: ${fallbackError.message}`);
        // Create placeholder as last resort
        return this.imageService.createPlaceholderImage(filename, 'location');
      }
    }
  }

  /**
   * Get accommodation image with automatic fallback
   */
  async getAccommodationImage(accommodation, country, filename) {
    try {
      console.log(`Getting accommodation image using ${this.imageProvider} for ${country}`);
      
      const result = await this.imageService.getAccommodationImage(accommodation, country, filename);
      
      if (result && result.path) {
        return result;
      }
      
      // If primary service fails, try fallback
      console.log(`Primary service failed, trying fallback service`);
      return await this.fallbackService.getAccommodationImage(accommodation, country, filename);
      
    } catch (error) {
      console.error(`Error in getAccommodationImage: ${error.message}`);
      
      try {
        console.log(`Attempting fallback service for accommodation image`);
        return await this.fallbackService.getAccommodationImage(accommodation, country, filename);
      } catch (fallbackError) {
        console.error(`Fallback also failed: ${fallbackError.message}`);
        return this.imageService.createPlaceholderImage(filename, 'accommodation');
      }
    }
  }

  /**
   * Get food image with automatic fallback
   */
  async getFoodImage(restaurant, location, filename) {
    try {
      console.log(`Getting food image using ${this.imageProvider} for ${location.name}`);
      
      const result = await this.imageService.getFoodImage(restaurant, location, filename);
      
      if (result && result.path) {
        return result;
      }
      
      // If primary service fails, try fallback
      console.log(`Primary service failed, trying fallback service`);
      return await this.fallbackService.getFoodImage(restaurant, location, filename);
      
    } catch (error) {
      console.error(`Error in getFoodImage: ${error.message}`);
      
      try {
        console.log(`Attempting fallback service for food image`);
        return await this.fallbackService.getFoodImage(restaurant, location, filename);
      } catch (fallbackError) {
        console.error(`Fallback also failed: ${fallbackError.message}`);
        return this.imageService.createPlaceholderImage(filename, 'food');
      }
    }
  }

  /**
   * Get attraction image with automatic fallback
   */
  async getAttractionImage(attraction, location, filename) {
    try {
      console.log(`Getting attraction image using ${this.imageProvider} for ${attraction.name}`);
      
      const result = await this.imageService.getAttractionImage(attraction, location, filename);
      
      if (result && result.path) {
        return result;
      }
      
      // If primary service fails, try fallback
      console.log(`Primary service failed, trying fallback service`);
      return await this.fallbackService.getAttractionImage(attraction, location, filename);
      
    } catch (error) {
      console.error(`Error in getAttractionImage: ${error.message}`);
      
      try {
        console.log(`Attempting fallback service for attraction image`);
        return await this.fallbackService.getAttractionImage(attraction, location, filename);
      } catch (fallbackError) {
        console.error(`Fallback also failed: ${fallbackError.message}`);
        return this.imageService.createPlaceholderImage(filename, 'attraction');
      }
    }
  }

  /**
   * Generic image search/generation method
   * For Unsplash: performs search with query
   * For Freepik: generates image with prompt
   */
  async searchImage(query, queryType = 'general', page = null) {
    try {
      if (this.imageProvider === 'freepik') {
        // For Freepik, treat query as a prompt
        console.log(`Generating image with Freepik for prompt: "${query}"`);
        return await this.imageService.generateImage(query, queryType);
      } else {
        // For Unsplash, perform search
        console.log(`Searching Unsplash for: "${query}"`);
        return await this.imageService.searchImage(query, queryType, page);
      }
    } catch (error) {
      console.error(`Error in searchImage: ${error.message}`);
      
      // Try fallback service
      try {
        if (this.imageProvider === 'freepik') {
          // Fallback to Unsplash search
          return await this.fallbackService.searchImage(query, queryType, page);
        } else {
          // Fallback to Freepik generation
          return await this.fallbackService.generateImage(query, queryType);
        }
      } catch (fallbackError) {
        console.error(`Fallback searchImage also failed: ${fallbackError.message}`);
        return null;
      }
    }
  }

  /**
   * Download/save image method
   * For Unsplash: downloads from URL
   * For Freepik: saves base64 data
   */
  async downloadImage(imageInfo, filename) {
    try {
      if (this.imageProvider === 'freepik' && imageInfo.base64) {
        // For Freepik, save base64 data
        return await this.imageService.saveBase64Image(imageInfo.base64, filename);
      } else if (this.imageProvider === 'unsplash' && imageInfo.url) {
        // For Unsplash, download from URL
        return await this.imageService.downloadImage(imageInfo, filename);
      } else {
        // Try the appropriate method for the image info type
        if (imageInfo.base64) {
          return await this.imageService.saveBase64Image(imageInfo.base64, filename);
        } else if (imageInfo.url) {
          return await this.imageService.downloadImage(imageInfo, filename);
        } else {
          throw new Error('Invalid image info provided');
        }
      }
    } catch (error) {
      console.error(`Error downloading/saving image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create placeholder image
   */
  createPlaceholderImage(filename, type = 'placeholder') {
    return this.imageService.createPlaceholderImage(filename, type);
  }

  /**
   * Get service status and configuration
   */
  getServiceInfo() {
    return {
      primaryProvider: this.imageProvider,
      fallbackProvider: this.imageProvider === 'freepik' ? 'unsplash' : 'freepik',
      hasApiKey: this.imageProvider === 'freepik' 
        ? !!process.env.API_KEY_FREEPIK 
        : !!process.env.API_KEY_UNSPLASH
    };
  }

  /**
   * Check rate limits for current service
   */
  async checkRateLimit() {
    return await this.imageService.checkRateLimit();
  }

  /**
   * Switch image provider (useful for testing or manual override)
   */
  switchProvider(newProvider) {
    if (newProvider !== 'unsplash' && newProvider !== 'freepik') {
      throw new Error('Invalid provider. Use "unsplash" or "freepik"');
    }
    
    const oldProvider = this.imageProvider;
    this.imageProvider = newProvider;
    
    // Swap services
    const oldService = this.imageService;
    this.imageService = this.fallbackService;
    this.fallbackService = oldService;
    
    console.log(`Switched image provider from ${oldProvider} to ${newProvider}`);
    
    return this.getServiceInfo();
  }

  /**
   * For backward compatibility with existing code that uses UnsplashService methods
   */
  async getAndSaveImage(query, filename) {
    try {
      const imageInfo = await this.searchImage(query);
      if (imageInfo) {
        return await this.downloadImage(imageInfo, filename);
      } else {
        return this.createPlaceholderImage(filename);
      }
    } catch (error) {
      console.error(`Error in getAndSaveImage: ${error.message}`);
      return this.createPlaceholderImage(filename);
    }
  }
}

module.exports = ImageService; 