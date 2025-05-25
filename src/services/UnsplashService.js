const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

class UnsplashService {
  constructor() {
    this.apiKey = process.env.API_KEY_UNSPLASH;
    this.baseURL = 'https://api.unsplash.com';
    this.imagePath = process.env.IMAGE_STORAGE_PATH || path.join(__dirname, '..', '..', 'temp', 'images');
    this.dbPath = process.env.DB_PATH;
    
    // Create image directory if it doesn't exist
    if (!fs.existsSync(this.imagePath)) {
      fs.mkdirSync(this.imagePath, { recursive: true });
    }
    
    // Rate limiting - Unsplash free tier limits to 50 requests per hour
    this.requestCount = 0;
    this.requestResetTime = Date.now() + 3600000; // 1 hour from now
    
    // Current season for seasonal queries
    this.currentSeason = this.getCurrentSeason();
    
    // Dummy property for backward compatibility
    this.usedQueries = { 
      clear: () => console.log('Dummy usedQueries.clear() called') 
    };
  }

  // Get database connection
  async getDatabase() {
    return open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
  }

  // Get current season based on date
  getCurrentSeason() {
    const now = new Date();
    const month = now.getMonth();
    
    // Northern hemisphere seasons
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
  }

  // Generate diverse location query variants
  generateLocationQuery(name, country) {
    const locationVariants = [
      'village street people',
      'old town evening',
      'vintage car',
      'rooftop terrace sunset',
      'vintage balcony',
      'old building facade'
    ];
    
    // Select random variant
    const selectedVariant = locationVariants[Math.floor(Math.random() * locationVariants.length)];
    
    // Build query with season
    return `${name} ${country} ${selectedVariant} ${this.currentSeason}`;
  }

  // Generate diverse accommodation query variants
  generateAccommodationQuery(country) {
    const accommodationVariants = [
      'cozy eclectic apartment',
      'apartment interior',
      'modern living room with warm tones',
      'vintage home study',
      'natural light living room'
    ];
    
    // Select random variant
    const selectedVariant = accommodationVariants[Math.floor(Math.random() * accommodationVariants.length)];
    
    return `${country} ${selectedVariant}`;
  }

  // Generate diverse food query variants
  generateFoodQuery(cuisine, country) {
    // Food query options
    const foodOptions = [
      `${cuisine} food ${country}`,
      'vintage tea cup cozy morning',
      'coffee and pastries vintage',
      'reading with tea candlelight',
      'alfresco dinner table countryside',
      'cheese board with wine',
      'red wine and bread rustic'
    ];
    
    // Select a random food query option
    return foodOptions[Math.floor(Math.random() * foodOptions.length)];
  }

  // Check if image ID has been used before
  async isImageUsed(imageId) {
    if (!imageId) return false;
    
    const db = await this.getDatabase();
    try {
      const result = await db.get(
        'SELECT id FROM used_images WHERE unsplash_id = ?',
        [imageId]
      );
      return !!result;
    } catch (error) {
      console.error(`Error checking if image is used: ${error.message}`);
      return false;
    } finally {
      await db.close();
    }
  }

  // Mark image as used in database
  async markImageAsUsed(imageId, queryType, url) {
    if (!imageId) return;
    
    const db = await this.getDatabase();
    try {
      await db.run(
        'INSERT OR IGNORE INTO used_images (unsplash_id, query_type, url, created_at) VALUES (?, ?, ?, ?)',
        [imageId, queryType, url, new Date().toISOString()]
      );
    } catch (error) {
      console.error(`Error marking image as used: ${error.message}`);
    } finally {
      await db.close();
    }
  }

  // Search for image by query, ensuring no duplicates
  async searchImage(query, queryType = 'general', page = null) {
    try {
      await this.checkRateLimit();
      
      // If page is not provided, use a random page between 1 and 5
      if (!page) {
        page = Math.floor(Math.random() * 5) + 1;
      }
      
      console.log(`Searching Unsplash for "${query}" (page ${page})`);
      
      const response = await axios.get(`${this.baseURL}/search/photos`, {
        headers: {
          'Authorization': `Client-ID ${this.apiKey}`
        },
        params: {
          query: query,
          per_page: 15, // Increase results per page
          orientation: 'landscape',
          page: page
        }
      });
      
      if (response.data && response.data.results && response.data.results.length > 0) {
        // Filter out already used images
        const unusedImages = [];
        
        for (const image of response.data.results) {
          const isUsed = await this.isImageUsed(image.id);
          if (!isUsed) {
            unusedImages.push(image);
          }
        }
        
        if (unusedImages.length > 0) {
          // Select a random image from unused results
          const randomIndex = Math.floor(Math.random() * unusedImages.length);
          const image = unusedImages[randomIndex];
          
          // Mark this image as used
          await this.markImageAsUsed(image.id, queryType, image.urls.regular);
          
          return {
            id: image.id,
            url: image.urls.regular,
            thumb: image.urls.thumb,
            width: image.width,
            height: image.height,
            description: image.description || query,
            credit: `Photo by ${image.user.name} on Unsplash`,
            downloadUrl: image.links.download_location
          };
        } else if (page < 5) {
          // Try next page if all images on this page are used
          console.log(`All images on page ${page} already used, trying next page...`);
          return this.searchImage(query, queryType, page + 1);
        } else {
          // Try with a slightly modified query if we've gone through 5 pages
          console.log('All images in first 5 pages used, modifying query...');
          const randomSuffix = ['unique', 'special', 'hidden gem', 'undiscovered', 'authentic'];
          const modifiedQuery = `${query} ${randomSuffix[Math.floor(Math.random() * randomSuffix.length)]}`;
          return this.searchImage(modifiedQuery, queryType, 1);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error searching Unsplash: ${error.message}`);
      return null;
    }
  }

  // Download and save image
  async downloadImage(imageInfo, filename) {
    try {
      await this.checkRateLimit();
      
      // First get the download URL
      const downloadResponse = await axios.get(imageInfo.downloadUrl, {
        headers: {
          'Authorization': `Client-ID ${this.apiKey}`
        }
      });
      
      // Download the image
      const imageResponse = await axios.get(downloadResponse.data.url, {
        responseType: 'arraybuffer'
      });
      
      // Save to file
      const filePath = path.join(this.imagePath, filename);
      fs.writeFileSync(filePath, Buffer.from(imageResponse.data));
      
      return {
        path: filePath,
        width: imageInfo.width,
        height: imageInfo.height,
        credit: imageInfo.credit,
        unsplash_id: imageInfo.id
      };
    } catch (error) {
      console.error(`Error downloading image: ${error.message}`);
      return null;
    }
  }

  // Check rate limit
  async checkRateLimit() {
    const now = Date.now();
    
    // Reset counter if time has passed
    if (now > this.requestResetTime) {
      this.requestCount = 0;
      this.requestResetTime = now + 3600000; // 1 hour from now
    }
    
    // If limit reached, wait until reset
    if (this.requestCount >= 45) { // Leave some buffer
      const waitTime = this.requestResetTime - now;
      console.log(`Unsplash rate limit reached. Waiting ${waitTime}ms before next request.`);
      return new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.requestCount++;
    return Promise.resolve();
  }

  // Get location image
  async getLocationImage(location, filename) {
    try {
      // If filename not provided, generate one
      if (!filename) {
        const hash = crypto.createHash('md5').update(`location_${location.name}_${Date.now()}`).digest('hex');
        filename = `location_${hash.substring(0, 10)}.jpg`;
      }
      
      const query = this.generateLocationQuery(location.name, location.country);
      console.log(`Generated location query: "${query}"`);
      
      // Search for image
      const imageInfo = await this.searchImage(query, 'location');
      if (!imageInfo) {
        throw new Error(`No location images found for: ${location.name}`);
      }
      
      // Download and save image
      const savedImage = await this.downloadImage(imageInfo, filename);
      if (!savedImage) {
        throw new Error(`Failed to download location image for: ${location.name}`);
      }
      
      return savedImage;
    } catch (error) {
      console.error(`Error getting location image: ${error.message}`);
      return this.createPlaceholderImage(filename, 'location');
    }
  }

  // Get accommodation image
  async getAccommodationImage(accommodation, country, filename) {
    try {
      // If filename not provided, generate one
      if (!filename) {
        const hash = crypto.createHash('md5').update(`accommodation_${accommodation.name}_${Date.now()}`).digest('hex');
        filename = `accommodation_${hash.substring(0, 10)}.jpg`;
      }
      
      const query = this.generateAccommodationQuery(country);
      console.log(`Generated accommodation query: "${query}"`);
      
      // Search for image
      const imageInfo = await this.searchImage(query, 'accommodation');
      if (!imageInfo) {
        throw new Error(`No accommodation images found for: ${accommodation.name}`);
      }
      
      // Download and save image
      const savedImage = await this.downloadImage(imageInfo, filename);
      if (!savedImage) {
        throw new Error(`Failed to download accommodation image for: ${accommodation.name}`);
      }
      
      return savedImage;
    } catch (error) {
      console.error(`Error getting accommodation image: ${error.message}`);
      return this.createPlaceholderImage(filename, 'accommodation');
    }
  }

  // Get food image
  async getFoodImage(restaurant, location, filename) {
    try {
      // If filename not provided, generate one
      if (!filename) {
        const hash = crypto.createHash('md5').update(`food_${restaurant.name}_${Date.now()}`).digest('hex');
        filename = `food_${hash.substring(0, 10)}.jpg`;
      }
      
      const cuisine = restaurant.type || 'traditional';
      const query = this.generateFoodQuery(cuisine, location.country);
      console.log(`Generated food query: "${query}"`);
      
      // Search for image
      const imageInfo = await this.searchImage(query, 'food');
      if (!imageInfo) {
        throw new Error(`No food images found for: ${restaurant.name}`);
      }
      
      // Download and save image
      const savedImage = await this.downloadImage(imageInfo, filename);
      if (!savedImage) {
        throw new Error(`Failed to download food image for: ${restaurant.name}`);
      }
      
      return savedImage;
    } catch (error) {
      console.error(`Error getting food image: ${error.message}`);
      return this.createPlaceholderImage(filename, 'food');
    }
  }

  // Get attraction image
  async getAttractionImage(attraction, location, filename) {
    try {
      // If filename not provided, generate one
      if (!filename) {
        const hash = crypto.createHash('md5').update(`attraction_${attraction.name}_${Date.now()}`).digest('hex');
        filename = `attraction_${hash.substring(0, 10)}.jpg`;
      }
      
      // More specific query for attractions
      const query = `${attraction.name} ${location.name} ${location.country}`;
      
      // Search for image
      const imageInfo = await this.searchImage(query, 'attraction');
      if (!imageInfo) {
        throw new Error(`No attraction images found for: ${attraction.name}`);
      }
      
      // Download and save image
      const savedImage = await this.downloadImage(imageInfo, filename);
      if (!savedImage) {
        throw new Error(`Failed to download attraction image for: ${attraction.name}`);
      }
      
      return savedImage;
    } catch (error) {
      console.error(`Error getting attraction image: ${error.message}`);
      return this.createPlaceholderImage(filename, 'attraction');
    }
  }

  // Create a placeholder image if all else fails
  createPlaceholderImage(filename, type = 'placeholder') {
    console.log(`Creating placeholder image for ${type}`);
    const placeholderPath = path.join(this.imagePath, filename);
    
    // Create a simple placeholder image (1x1 pixel)
    const placeholderData = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
      0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
      0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x14,
      0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x37, 0xff, 0xd9
    ]);
    
    fs.writeFileSync(placeholderPath, placeholderData);
    
    return {
      path: placeholderPath,
      width: 1,
      height: 1,
      credit: `Placeholder ${type} image`
    };
  }

  // Old method for backward compatibility
  async getAndSaveImage(query, filename) {
    console.log('WARNING: Using deprecated getAndSaveImage method');
    try {
      // If filename not provided, generate one
      if (!filename) {
        const hash = crypto.createHash('md5').update(query + Date.now()).digest('hex');
        filename = `unsplash_${hash.substring(0, 10)}.jpg`;
      }
      
      // Search for image
      const imageInfo = await this.searchImage(query, 'general');
      if (!imageInfo) {
        throw new Error(`No images found for query: ${query}`);
      }
      
      // Download and save image
      const savedImage = await this.downloadImage(imageInfo, filename);
      if (!savedImage) {
        throw new Error(`Failed to download image for query: ${query}`);
      }
      
      return savedImage;
    } catch (error) {
      console.error(`Error in getAndSaveImage: ${error.message}`);
      return this.createPlaceholderImage(filename);
    }
  }
}

module.exports = new UnsplashService();
