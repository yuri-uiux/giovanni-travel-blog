const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const WebsiteFinderService = require('./WebsiteFinderService');
require('dotenv').config();

class OpenAIService {
  constructor() {
    this.apiKey = process.env.API_KEY_OPENAI;
    this.baseURL = 'https://api.openai.com/v1';
    this.rateLimitPerMinute = parseInt(process.env.API_RATE_LIMIT_OPENAI) || 5;
    this.dbPath = process.env.DB_PATH;
    this.cachePath = process.env.CACHE_PATH || path.join(__dirname, '..', '..', 'temp', 'cache');
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cachePath)) {
      fs.mkdirSync(this.cachePath, { recursive: true });
    }
    
    // For rate limiting
    this.requestCount = 0;
    this.lastResetTime = Date.now();
    
    // Create HTTP client
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds timeout
    });
  }

  // Get database connection
  async getDatabase() {
    return open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
  }

  // Create request hash for caching
  createRequestHash(data) {
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  }

  // Check rate limit
  async checkRateLimit() {
    const now = Date.now();
    const elapsedMs = now - this.lastResetTime;
    
    // Reset counter if a minute has passed
    if (elapsedMs > 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }
    
    // If limit reached, wait
    if (this.requestCount >= this.rateLimitPerMinute) {
      const waitTime = 60000 - elapsedMs + 1000; // Add 1 second buffer
      console.log(`Rate limit reached for OpenAI API. Waiting ${waitTime}ms before next request.`);
      return new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.requestCount++;
    return Promise.resolve();
  }

  // Generate text using GPT
  async generateText(prompt, options = {}) {
    const model = options.model || 'gpt-3.5-turbo';
    const temperature = options.temperature || 0.7;
    const maxTokens = options.maxTokens || 1000;
    
    // Prepare request data
    const requestData = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens
    };
    
    // Check rate limit
    await this.checkRateLimit();
    
    try {
      console.log('Making OpenAI API request...');
      const response = await this.client.post('/chat/completions', requestData);
      
      // Extract generated text
      const generatedText = response.data.choices[0].message.content.trim();
      
      return generatedText;
    } catch (error) {
      console.error('Error generating text with OpenAI:', error.message);
      if (error.response) {
        console.error('API error details:', error.response.data);
      }
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  // Generate blog post sections (split into sections)
  async generateBlogPostSections(data, options = {}) {
    const results = {};
    
    // Get website links for restaurant and attraction
    let restaurantWebsite = null;
    let attractionWebsite = null;
    
    try {
      console.log(`Finding website for restaurant: ${data.restaurant.name}`);
      restaurantWebsite = await WebsiteFinderService.findWebsite(
        data.restaurant.name, 
        `${data.location.name}, ${data.location.country}`, 
        'restaurant'
      );
    } catch (error) {
      console.warn(`Could not find restaurant website: ${error.message}`);
    }
    
    try {
      console.log(`Finding website for attraction: ${data.attraction.name}`);
      attractionWebsite = await WebsiteFinderService.findWebsite(
        data.attraction.name, 
        `${data.location.name}, ${data.location.country}`, 
        'attraction'
      );
    } catch (error) {
      console.warn(`Could not find attraction website: ${error.message}`);
    }
    
    // Section 1: Introduction
    const introPrompt = `
Write an introduction paragraph for Giovanni's travel blog from ${data.location.name}, ${data.location.country}.
Day ${data.location.current_day} of his stay.
The weather is ${data.weather.description} at ${data.weather.temperature}°C.
Use a first-person perspective, include some sensory details, and one phrase in the local language.
Keep it under 150 words.
`;

    // Section 2: Accommodation (only for first day at location)
    let accommodationPrompt = '';
    if (data.location.current_day <= 1 && data.accommodation) {
      accommodationPrompt = `
Write a vivid and detailed description of Giovanni's new accommodation in ${data.location.name}.
Name: ${data.accommodation.name}
Address: ${data.accommodation.address || 'in the city center'}
Price: ${data.accommodation.price_per_night || '70'} ${data.accommodation.currency || 'EUR'} per night
Features: ${data.accommodation.amenities || 'cozy, comfortable apartment with a good location'}

Write in first person as a travel blogger, creating a detailed narrative that brings the place to life.
Include these elements:
- My first impressions and feelings when arriving at the place
- Detailed description of the interior (layout, furniture, colors, lighting)
- The view from windows or balcony if applicable
- The neighborhood and surrounding area
- An interaction with the host or reception staff
- Why this accommodation feels like a good base for exploring the city
- A small personal touch or detail that makes the place special

Keep it engaging, descriptive, and personal - as if sharing with a friend.
`;
    }

    // Section 3: Food
    const foodPrompt = `
Write a section about my dining experience at ${data.restaurant.name} in ${data.location.name}.
Restaurant type: ${data.restaurant.type || 'local restaurant'}
Known for: ${data.restaurant.highlights || 'authentic local cuisine'}
Write in first person, describe the atmosphere, the food I tried, and any interactions with staff or locals.
Include specific dish names in the local language with translations if possible.
Add sensory details about tastes, smells, and presentation.
Keep it under 200 words.
`;

    // Section 4: Attraction
    const attractionPrompt = `
Write a section about my visit to ${data.attraction.name} in ${data.location.name}.
Attraction type: ${data.attraction.type || 'historical site'}
Description: ${data.attraction.description || 'a popular local attraction'}
Write in first person, include historical or cultural information about the place,
and my personal observations or interactions while there.
Add 1-2 interesting facts that a casual visitor might not know.
Keep it under 200 words.
`;

    // Section 5: Tomorrow plans and tips
    const closingPrompt = `
Write two short concluding sections for Giovanni's travel blog from ${data.location.name}:
A paragraph about his plans for tomorrow (${data.tomorrow_type === 'poi' ? 'visiting ' + data.tomorrow_name : 'traveling to ' + data.tomorrow_name}).
A list of 3-5 travel tips specific to ${data.location.name} that would be helpful for other travelers.
Include practical advice about transportation, costs, or local customs.
Keep the total under 200 words.
`;

    // Generate each section
    try {
      results.introduction = await this.generateText(introPrompt, options);
      console.log('Introduction generated');
      
      if (accommodationPrompt) {
        results.accommodation = await this.generateText(accommodationPrompt, options);
        console.log('Accommodation section generated');
      }
      
      results.food = await this.generateText(foodPrompt, options);
      console.log('Food section generated');
      
      results.attraction = await this.generateText(attractionPrompt, options);
      console.log('Attraction section generated');
      
      results.closing = await this.generateText(closingPrompt, options);
      console.log('Closing sections generated');
      
      // Add website links to results for later use
      results.restaurantWebsite = restaurantWebsite;
      results.attractionWebsite = attractionWebsite;
      
      return results;
    } catch (error) {
      console.error('Error generating blog post sections:', error.message);
      throw error;
    }
  }

  // Assemble complete post from generated sections
  assembleBlogPost(data, sections) {
    // Get version from package.json
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    let version = '1.0.0';
    try {
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      version = packageData.version || '1.0.0';
    } catch (error) {
      console.warn('Could not read version from package.json');
    }
    
    // Get image provider info
    const imageProvider = process.env.IMAGE_PROVIDER || 'unsplash';
    let imageEngine = imageProvider;
    if (imageProvider === 'freepik') {
      imageEngine = `freepik:${process.env.FREEPIK_ENGINE || 'magnific_sharpy'}`;
    }
    
    // Form title
    const title = `${data.location.name}, ${data.location.country}: ${data.restaurant.name} and ${data.attraction.name}`;
    
    // Start building content with hidden version info
    let content = `<!-- Generated by Giovanni Travel Blog v${version} on ${new Date().toISOString()} | Images: ${imageEngine} -->
<!-- wp:paragraph -->
<p>${sections.introduction}</p>
<!-- /wp:paragraph -->
`;

    // Add accommodation section if present
    if (sections.accommodation) {
      content += `
<!-- wp:heading -->
<h2>My New Home in ${data.location.name}</h2>
<!-- /wp:heading -->
<!-- wp:image {"align":"center","sizeSlug":"large"} -->
<figure class="wp-block-image aligncenter size-large"><img src="IMAGE_PLACEHOLDER_1" alt="My accommodation in ${data.location.name}" /></figure>
<!-- /wp:image -->
<!-- wp:paragraph -->
<p>${sections.accommodation}</p>
<!-- /wp:paragraph -->
`;
    }

    // Add food section
    content += `
<!-- wp:heading -->
<h2>Local Cuisine Discoveries</h2>
<!-- /wp:heading -->
<!-- wp:image {"align":"center","sizeSlug":"large"} -->
<figure class="wp-block-image aligncenter size-large"><img src="IMAGE_PLACEHOLDER_${sections.accommodation ? '2' : '1'}" alt="Local food in ${data.location.name}" /></figure>
<!-- /wp:image -->
<!-- wp:paragraph -->
<p>${sections.food}</p>
<!-- /wp:paragraph -->
${sections.restaurantWebsite && sections.restaurantWebsite.url ? `
<!-- wp:paragraph -->
<p>📍 <a href="${sections.restaurantWebsite.url}" target="_blank" rel="noopener">${data.restaurant.name}</a> ${sections.restaurantWebsite.isOpen === false ? '(Note: May be temporarily closed)' : ''}</p>
<!-- /wp:paragraph -->` : ''}
`;

    // Add attraction section
    content += `
<!-- wp:heading -->
<h2>Exploring ${data.attraction.name}</h2>
<!-- /wp:heading -->
<!-- wp:image {"align":"center","sizeSlug":"large"} -->
<figure class="wp-block-image aligncenter size-large"><img src="IMAGE_PLACEHOLDER_${sections.accommodation ? '3' : '2'}" alt="${data.attraction.name}" /></figure>
<!-- /wp:image -->
<!-- wp:paragraph -->
<p>${sections.attraction}</p>
<!-- /wp:paragraph -->
${sections.attractionWebsite && sections.attractionWebsite.url ? `
<!-- wp:paragraph -->
<p>📍 <a href="${sections.attractionWebsite.url}" target="_blank" rel="noopener">${data.attraction.name}</a> ${sections.attractionWebsite.isOpen === false ? '(Note: May be temporarily closed)' : ''}</p>
<!-- /wp:paragraph -->` : ''}
`;

    // Split closing section into plans and tips
    const closingParts = sections.closing.split(/(?=Travel\sTips)/i);
    const tomorrowPlans = closingParts[0] || sections.closing;
    const travelTips = closingParts.length > 1 ? closingParts[1] : '';

    // Add tomorrow plans
    content += `
<!-- wp:heading -->
<h2>Tomorrow's Adventures</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>${tomorrowPlans}</p>
<!-- /wp:paragraph -->
`;

    // Add travel tips if available
    if (travelTips) {
      content += `
<!-- wp:heading -->
<h2>Travel Tips for ${data.location.name}</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>${travelTips}</p>
<!-- /wp:paragraph -->
`;
    }

    // Add country and city tags at the bottom
    content += `
<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator is-style-wide"/>
<!-- /wp:separator -->
<!-- wp:paragraph -->
<p><a href="/?tag=${encodeURIComponent(data.location.country)}" rel="tag">${data.location.country}</a>, <a href="/?tag=${encodeURIComponent(data.location.name)}" rel="tag">${data.location.name}</a></p>
<!-- /wp:paragraph -->
`;

    // Create excerpt
    const excerpt = `Join Giovanni on day ${data.location.current_day} of his journey through ${data.location.name}, ${data.location.country}, as he explores the city, enjoys local cuisine at ${data.restaurant.name}, and visits ${data.attraction.name}.`;

    return {
      title,
      content,
      excerpt
    };
  }
}

module.exports = new OpenAIService();
