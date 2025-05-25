const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

class FreepikService {
  constructor() {
    this.apiKey = process.env.API_KEY_FREEPIK;
    this.baseURL = 'https://api.freepik.com/v1';
    this.imagePath = process.env.IMAGE_STORAGE_PATH || path.join(__dirname, '..', '..', 'temp', 'images');
    this.dbPath = process.env.DB_PATH;
    
    // Create image directory if it doesn't exist
    if (!fs.existsSync(this.imagePath)) {
      fs.mkdirSync(this.imagePath, { recursive: true });
    }
    
    // Rate limiting - Freepik free tier limits to 100 creations per day
    this.requestCount = 0;
    this.requestResetTime = Date.now() + 86400000; // 24 hours from now
    
    // Current season for seasonal prompts
    this.currentSeason = this.getCurrentSeason();
    
    // Image generation settings (configurable via env variables)
    this.defaultImageSize = process.env.FREEPIK_IMAGE_SIZE || 'classic_4_3'; // square_1_1, classic_4_3, traditional_3_4, widescreen_16_9, etc.
    this.defaultResolution = process.env.FREEPIK_IMAGE_RESOLUTION || '1k'; // 1k, 2k, 4k
    this.defaultEngine = process.env.FREEPIK_ENGINE || 'magnific_sharpy'; // magnific_sharpy, kandinsky, stable_diffusion
    this.defaultStyle = process.env.FREEPIK_IMAGE_STYLE || null; // Valid styles: anime, cartoon, painting, sketch, watercolor (or null for no style)
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

  // Generate diverse location prompts for AI image generation
  generateLocationPrompt(name, country) {
    const locationPrompts = [
      'charming old town street with historic buildings',
      'quaint village square in evening light',
      'traditional architecture with vintage charm',
      'peaceful town center with cobblestone streets',
      'old European town atmosphere',
      'historic district with traditional buildings'
    ];
    
    // Select random prompt variant
    const selectedPrompt = locationPrompts[Math.floor(Math.random() * locationPrompts.length)];
    
    // Build prompt with location context and season
    return `${selectedPrompt} in ${name}, ${country}, ${this.currentSeason} atmosphere, professional travel photography style`;
  }

  // Generate diverse accommodation prompts
  generateAccommodationPrompt(country) {
    const accommodationPrompts = [
      'cozy apartment interior with modern European design',
      'charming living room with warm lighting and comfortable furniture',
      'stylish accommodation interior with local cultural elements',
      'comfortable apartment space with natural light',
      'inviting home interior with traditional and modern mix',
      'welcoming accommodation with authentic local style'
    ];
    
    // Select random prompt variant
    const selectedPrompt = accommodationPrompts[Math.floor(Math.random() * accommodationPrompts.length)];
    
    return `${selectedPrompt}, ${country} style, warm and inviting atmosphere, professional interior photography`;
  }

  // Generate diverse food prompts
  generateFoodPrompt(cuisine, country) {
    const foodPrompts = [
      `traditional ${cuisine} cuisine beautifully presented`,
      'authentic local dining experience with traditional dishes',
      'delicious regional specialties on rustic table',
      'local food culture and culinary traditions',
      'traditional restaurant atmosphere with local cuisine',
      'authentic dining experience with cultural elements'
    ];
    
    // Select a random food prompt option
    const selectedPrompt = foodPrompts[Math.floor(Math.random() * foodPrompts.length)];
    
    return `${selectedPrompt}, ${country} culinary style, warm restaurant lighting, professional food photography`;
  }

  // Check if prompt has been used before to avoid duplicates
  async isPromptUsed(promptHash) {
    if (!promptHash) return false;
    
    const db = await this.getDatabase();
    try {
      const result = await db.get(
        'SELECT id FROM used_images WHERE freepik_prompt_hash = ?',
        [promptHash]
      );
      return !!result;
    } catch (error) {
      console.error(`Error checking if prompt is used: ${error.message}`);
      return false;
    } finally {
      await db.close();
    }
  }

  // Mark prompt as used in database
  async markPromptAsUsed(promptHash, promptType, prompt) {
    if (!promptHash) return;
    
    const db = await this.getDatabase();
    try {
      await db.run(
        'INSERT OR IGNORE INTO used_images (freepik_prompt_hash, query_type, freepik_prompt, created_at) VALUES (?, ?, ?, ?)',
        [promptHash, promptType, prompt, new Date().toISOString()]
      );
    } catch (error) {
      console.error(`Error marking prompt as used: ${error.message}`);
    } finally {
      await db.close();
    }
  }

  // Generate unique hash for prompt
  generatePromptHash(prompt) {
    return crypto.createHash('md5').update(prompt).digest('hex');
  }

  // Generate image using Freepik API
  async generateImage(prompt, promptType = 'general') {
    try {
      await this.checkRateLimit();
      
      // Create hash for prompt to track usage
      const promptHash = this.generatePromptHash(prompt);
      
      // Check if this prompt has been used before
      const isUsed = await this.isPromptUsed(promptHash);
      if (isUsed) {
        console.log(`Prompt already used, modifying: "${prompt}"`);
        // Add variation to the prompt
        prompt += `, ${this.currentSeason} lighting, unique perspective`;
      }
      
      console.log(`Generating image with Freepik for: "${prompt}"`);
      
      const requestBody = {
        prompt: prompt,
        num_images: 1,
        image: {
          size: this.defaultImageSize,
          resolution: this.defaultResolution
        },
        engine: this.defaultEngine,
        filter_nsfw: true,
        response_format: 'b64_json' // Ensure we get base64 JSON response
      };
      
      // Only add styling if we have a valid style (valid values: anime, photographic, digital_art)
      if (this.defaultStyle) {
        requestBody.styling = {
          style: this.defaultStyle
        };
      }
      
      const response = await axios.post(`${this.baseURL}/ai/text-to-image`, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-freepik-api-key': this.apiKey
        }
      });
      
      if (response.data && response.data.data && response.data.data.length > 0) {
        const imageData = response.data.data[0];
        
        if (imageData.base64) {
          // Mark this prompt as used
          await this.markPromptAsUsed(promptHash, promptType, prompt);
          
          return {
            id: promptHash, // Use prompt hash as ID
            base64: imageData.base64,
            width: response.data.meta?.image?.width || 1024,
            height: response.data.meta?.image?.height || 1024,
            description: prompt,
            credit: 'Generated by Freepik AI',
            prompt: prompt,
            style: this.defaultStyle
          };
        }
      }
      
      console.log('No image data received from Freepik API');
      return null;
      
    } catch (error) {
      console.error(`Error generating image with Freepik: ${error.message}`);
      if (error.response) {
        console.error('Freepik API Error:', error.response.status, error.response.data);
        
        // If styling error, try without style
        if (error.response.status === 400 && 
            error.response.data?.invalid_params?.some(param => param.name === 'styling.style')) {
          console.log('Retrying without styling parameter...');
          
          try {
            const retryRequestBody = {
              prompt: prompt,
              num_images: 1,
              image: {
                size: this.defaultImageSize,
                resolution: this.defaultResolution
              },
              engine: this.defaultEngine,
              filter_nsfw: true,
              response_format: 'b64_json'
            };
            
            const retryResponse = await axios.post(`${this.baseURL}/ai/text-to-image`, retryRequestBody, {
              headers: {
                'Content-Type': 'application/json',
                'x-freepik-api-key': this.apiKey
              }
            });
            
            if (retryResponse.data && retryResponse.data.data && retryResponse.data.data.length > 0) {
              const imageData = retryResponse.data.data[0];
              
              if (imageData.base64) {
                await this.markPromptAsUsed(this.generatePromptHash(prompt), promptType, prompt);
                
                return {
                  id: this.generatePromptHash(prompt),
                  base64: imageData.base64,
                  width: retryResponse.data.meta?.image?.width || 1024,
                  height: retryResponse.data.meta?.image?.height || 1024,
                  description: prompt,
                  credit: 'Generated by Freepik AI',
                  prompt: prompt,
                  style: 'default'
                };
              }
            }
          } catch (retryError) {
            console.error(`Retry also failed: ${retryError.message}`);
          }
        }
      }
      return null;
    }
  }

  // Save base64 image to file as JPG
  async saveBase64Image(base64Data, filename) {
    try {
      // Ensure filename has .jpg extension
      if (!filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        filename = `${nameWithoutExt}.jpg`;
      }
      
      // Remove data URL prefix if present
      const base64Image = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      
      const imagePath = path.join(this.imagePath, filename);
      
      // Convert base64 to buffer and save
      const buffer = Buffer.from(base64Image, 'base64');
      fs.writeFileSync(imagePath, buffer);
      
      console.log(`Image saved to: ${imagePath}`);
      
      return {
        path: imagePath,
        filename: filename
      };
      
    } catch (error) {
      console.error(`Error saving base64 image: ${error.message}`);
      throw error;
    }
  }

  // Check rate limiting
  async checkRateLimit() {
    const now = Date.now();
    
    // Reset counter if 24 hours have passed
    if (now > this.requestResetTime) {
      this.requestCount = 0;
      this.requestResetTime = now + 86400000; // Next 24 hours
    }
    
    // Check if we've exceeded the limit
    if (this.requestCount >= 100) { // Freepik free tier limit
      throw new Error('Freepik API rate limit exceeded. Please try again tomorrow.');
    }
    
    this.requestCount++;
  }

  // Get location image (main method for location images)
  async getLocationImage(location, filename) {
    try {
      // Ensure filename has .jpg extension
      if (!filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        filename = `${nameWithoutExt}.jpg`;
      }
      
      const prompt = this.generateLocationPrompt(location.name, location.country);
      const imageInfo = await this.generateImage(prompt, 'location');
      
      if (imageInfo && imageInfo.base64) {
        const result = await this.saveBase64Image(imageInfo.base64, filename);
        return {
          ...result,
          credit: imageInfo.credit,
          description: imageInfo.description
        };
      } else {
        // Return placeholder if generation fails
        return this.createPlaceholderImage(filename, 'location');
      }
      
    } catch (error) {
      console.error(`Error getting location image: ${error.message}`);
      return this.createPlaceholderImage(filename, 'location');
    }
  }

  // Get accommodation image
  async getAccommodationImage(accommodation, country, filename) {
    try {
      // Ensure filename has .jpg extension
      if (!filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        filename = `${nameWithoutExt}.jpg`;
      }
      
      const prompt = this.generateAccommodationPrompt(country);
      const imageInfo = await this.generateImage(prompt, 'accommodation');
      
      if (imageInfo && imageInfo.base64) {
        const result = await this.saveBase64Image(imageInfo.base64, filename);
        return {
          ...result,
          credit: imageInfo.credit,
          description: imageInfo.description
        };
      } else {
        return this.createPlaceholderImage(filename, 'accommodation');
      }
      
    } catch (error) {
      console.error(`Error getting accommodation image: ${error.message}`);
      return this.createPlaceholderImage(filename, 'accommodation');
    }
  }

  // Get food image
  async getFoodImage(restaurant, location, filename) {
    try {
      // Ensure filename has .jpg extension
      if (!filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        filename = `${nameWithoutExt}.jpg`;
      }
      
      // Extract cuisine type from restaurant data or use location-based cuisine
      const cuisine = restaurant.cuisine || this.getLocalCuisine(location.country);
      const prompt = this.generateFoodPrompt(cuisine, location.country);
      const imageInfo = await this.generateImage(prompt, 'food');
      
      if (imageInfo && imageInfo.base64) {
        const result = await this.saveBase64Image(imageInfo.base64, filename);
        return {
          ...result,
          credit: imageInfo.credit,
          description: imageInfo.description
        };
      } else {
        return this.createPlaceholderImage(filename, 'food');
      }
      
    } catch (error) {
      console.error(`Error getting food image: ${error.message}`);
      return this.createPlaceholderImage(filename, 'food');
    }
  }

  // Get attraction image
  async getAttractionImage(attraction, location, filename) {
    try {
      // Ensure filename has .jpg extension
      if (!filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        filename = `${nameWithoutExt}.jpg`;
      }
      
      const prompt = `${attraction.name} in ${location.name}, ${location.country}, historic landmark, ${this.currentSeason} atmosphere, professional travel photography, architectural details`;
      const imageInfo = await this.generateImage(prompt, 'attraction');
      
      if (imageInfo && imageInfo.base64) {
        const result = await this.saveBase64Image(imageInfo.base64, filename);
        return {
          ...result,
          credit: imageInfo.credit,
          description: imageInfo.description
        };
      } else {
        return this.createPlaceholderImage(filename, 'attraction');
      }
      
    } catch (error) {
      console.error(`Error getting attraction image: ${error.message}`);
      return this.createPlaceholderImage(filename, 'attraction');
    }
  }

  // Get local cuisine based on country
  getLocalCuisine(country) {
    const cuisineMap = {
      'Serbia': 'Serbian',
      'Croatia': 'Croatian',
      'Italy': 'Italian',
      'Montenegro': 'Montenegrin',
      'Bulgaria': 'Bulgarian',
      'Hungary': 'Hungarian',
      'Greece': 'Greek',
      'Romania': 'Romanian',
      'North Macedonia': 'Macedonian',
      'Czech Republic': 'Czech',
      'Austria': 'Austrian',
      'Slovenia': 'Slovenian',
      'Albania': 'Albanian',
      'Poland': 'Polish',
      'Slovakia': 'Slovak'
    };
    
    return cuisineMap[country] || 'European';
  }

  // Create placeholder image (same as UnsplashService with JPG format)
  createPlaceholderImage(filename, type = 'placeholder') {
    const placeholderPath = path.join(this.imagePath, filename);
    
    // Create a simple JPG placeholder image (1x1 pixel)
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
    
    try {
      fs.writeFileSync(placeholderPath, placeholderData);
      console.log(`Created placeholder image: ${placeholderPath}`);
      
      return {
        path: placeholderPath,
        width: 1,
        height: 1,
        credit: `Placeholder ${type} image`
      };
    } catch (error) {
      console.error(`Error creating placeholder image: ${error.message}`);
      throw error;
    }
  }

  // Generate and save image (wrapper method)
  async getAndSaveImage(prompt, filename) {
    try {
      const imageInfo = await this.generateImage(prompt);
      
      if (imageInfo && imageInfo.base64) {
        return this.saveBase64Image(imageInfo.base64, filename);
      } else {
        return this.createPlaceholderImage(filename);
      }
      
    } catch (error) {
      console.error(`Error in getAndSaveImage: ${error.message}`);
      return this.createPlaceholderImage(filename);
    }
  }
}

module.exports = FreepikService; 