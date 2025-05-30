const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const WebsiteFinderService = require('./WebsiteFinderService');
const PromptLogger = require('../utils/PromptLogger');
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
    
    // Log the prompt
    PromptLogger.logOpenAIPrompt(prompt, {
      type: options.type || 'text_generation',
      model: model,
      temperature: temperature,
      maxTokens: maxTokens,
      location: options.location || 'unknown',
      day: options.day || 'unknown',
      section: options.section || 'unknown'
    });
    
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
Write an introduction for Giovanni's travel blog from ${data.location.name}, ${data.location.country} - day ${data.location.current_day} of my stay here.
Current weather: ${data.weather.description} at ${data.weather.temperature}°C.

TONE & VOICE:
- Write like I'm catching up with a friend - casual, warm, personal
- Use "I" and share genuine feelings about being in this place
- Include humor and personality - be conversational, not formal
- Show moderate enthusiasm - things are good/nice/interesting, not always "amazing" or "incredible"
- Be honest and balanced in observations

STRUCTURE & FLOW:
- Start with a friendly greeting like "Hey there!" or "Hello from [city]!" (this will be the ONLY greeting in the entire post)
- Share how I'm feeling about this place right now
- Use parenthetical asides to add personality and extra thoughts
- Let the writing flow naturally - no rigid structure
- Mix practical observations with emotional reactions

LOCAL EXPERTISE:
- Show I'm getting to know this neighborhood well
- Reference local atmosphere and culture naturally
- Include one phrase in the local language (with translation)
- Position myself as someone who's settling in, not just passing through

CONTENT:
- Share sensory details about the place and weather
- Mention what I'm discovering about the local vibe
- Include a personal observation or small interaction
- Set up anticipation for what I'm about to share about today's adventures

Keep it conversational and engaging, around 120-150 words. Make it feel like a genuine personal update from someone who's really living this experience. Use moderate enthusiasm - avoid excessive superlatives.
`;

    // Section 2: Accommodation (only for first day at location)
    let accommodationPrompt = '';
    if (data.location.current_day <= 1 && data.accommodation) {
      accommodationPrompt = `
Write about Giovanni's new accommodation in ${data.location.name} as someone who's been traveling through Eastern Europe for months.
Name: ${data.accommodation.name}
Address: ${data.accommodation.address || 'in the city center'}
Price: ${data.accommodation.price_per_night || '70'} ${data.accommodation.currency || 'EUR'} per night
Features: ${data.accommodation.amenities || 'cozy, comfortable apartment with a good location'}

TONE & VOICE:
- Write like I'm telling a friend about my new place - personal, honest
- Use "I" and share genuine reactions and feelings
- Include humor and personality - make jokes about quirky details
- Be honest about both the good and not-so-perfect aspects
- Show moderate enthusiasm - things are nice/comfortable/decent, not always "amazing" or "perfect"
- NO greetings or "Hey there" - continue the conversation naturally

STRUCTURE & FLOW:
- Tell the story of arriving and settling in, not just describe the space
- Use parenthetical comments to add personality (like "finally, a decent shower!")
- Let the narrative flow naturally from arrival to getting comfortable
- Mix practical details seamlessly into the personal story

LOCAL EXPERTISE:
- Show knowledge of the neighborhood and how this place fits in
- Reference local context and what makes this area special
- Mention nearby landmarks or districts naturally
- Position myself as someone who knows what to look for in accommodations

CONTENT:
- Share first impressions and feelings when I walked in
- Give specific details about the interior, layout, and atmosphere
- Describe the view and neighborhood vibe
- Include an interaction with the host or something that made me smile
- Explain why this feels like a good base for exploring
- Add a personal touch or detail that makes this place memorable

Keep it engaging and personal, around 250-300 words. Make it feel like genuine reactions about finding a good place to stay. Use moderate enthusiasm - avoid excessive superlatives.
`;
    }

    // Section 3: Food
    const restaurantWebsiteInfo = restaurantWebsite && restaurantWebsite.url ? 
      `\nRestaurant website: ${restaurantWebsite.url} (use this as reference for additional context)` : '';
    
    const foodPrompt = `
Write about my dining experience at ${data.restaurant.name} in ${data.location.name} as Giovanni, a travel blogger who's been exploring Eastern Europe for months.
Restaurant type: ${data.restaurant.type || 'local restaurant'}
Known for: ${data.restaurant.highlights || 'authentic local cuisine'}${restaurantWebsiteInfo}

TONE & VOICE:
- Write like I'm chatting with a friend over coffee - casual, friendly, personal
- Use "I" throughout and share personal anecdotes 
- Include humor and personality - make jokes, use casual expressions
- Be honest about what I loved AND what I didn't love
- Show moderate enthusiasm - things are good/tasty/solid, not always "amazing" or "incredible"
- NO greetings or "Hey there" - continue the conversation naturally

STRUCTURE & FLOW:
- Write exactly 2 paragraphs with a logical break between them
- First paragraph: Focus on the restaurant itself, atmosphere, arrival, first impressions
- Second paragraph: Focus on the food, specific dishes, interactions, and overall experience
- IMPORTANT: Separate the two paragraphs with a double line break (empty line between them)
- Use parenthetical asides to add personality (like this!)
- Let the writing flow naturally - mix practical info seamlessly into the narrative
- Include specific, actionable details (what to order, where exactly it's located)

LOCAL EXPERTISE:
- Show I know this neighborhood well - mention nearby landmarks or districts
- Reference local culture and context naturally
- Use some local terminology when appropriate (with translations)
- Position myself as someone who's tried everything and has genuine experience

CONTENT:
- Give specific dish recommendations with local names and translations
- Include sensory details about tastes, smells, presentation
- Mention interactions with staff or locals
- Share background stories about the place if interesting
- Be opinionated but fair - explain WHY I like or don't like something
- Include practical details like atmosphere, pricing hints, best times to visit

Keep it conversational, around 200-250 words total. Make it feel like genuine local expertise, not tourist observations. Use moderate enthusiasm - avoid excessive superlatives.
`;

    // Section 4: Attraction
    const attractionWebsiteInfo = attractionWebsite && attractionWebsite.url ? 
      `\nAttraction website: ${attractionWebsite.url} (use this as reference for additional context)` : '';
    
    const attractionPrompt = `
Write about my visit to ${data.attraction.name} in ${data.location.name} as Giovanni, a seasoned traveler who's been exploring Eastern Europe.
Attraction type: ${data.attraction.type || 'historical site'}
Description: ${data.attraction.description || 'a popular local attraction'}${attractionWebsiteInfo}

TONE & VOICE:
- Write like I'm sharing stories with a friend - casual, personal, engaging
- Use "I" and include personal anecdotes and observations
- Add humor and personality - don't be afraid to make jokes
- Share honest opinions, including any disappointments or surprises
- Show moderate enthusiasm - things are interesting/nice/solid, not always "breathtaking" or "incredible"
- NO greetings or "Hey there" - continue the conversation naturally

STRUCTURE & FLOW:
- Write exactly 2 paragraphs with a logical break between them
- First paragraph: Focus on arriving at the place, first impressions, the setting, atmosphere
- Second paragraph: Focus on the historical/cultural details, personal observations, practical advice
- IMPORTANT: Separate the two paragraphs with a double line break (empty line between them)
- Use parenthetical comments to add personality and extra thoughts
- Mix historical/cultural information naturally into my personal narrative
- Include practical information (directions, timing, costs) seamlessly

LOCAL EXPERTISE:
- Show deep knowledge of the area - mention specific districts, nearby spots
- Reference local history and culture naturally, not like a guidebook
- Use local terminology when appropriate (with explanations)
- Position myself as someone who's been around and knows the real story

CONTENT:
- Share 1-2 interesting facts that most tourists don't know
- Include personal observations and interactions during my visit
- Give specific, actionable advice (best time to visit, what to bring, etc.)
- Mention connections to broader local culture or history
- Be opinionated but fair - explain what makes this place special or not
- Include sensory details and atmosphere descriptions

Keep it conversational and engaging, around 200-250 words total. Make it feel like insider knowledge from someone who really knows the place. Use moderate enthusiasm - avoid excessive superlatives.
`;

    // Section 5: Tomorrow plans and tips
    const closingPrompt = `
Write the closing sections for Giovanni's travel blog from ${data.location.name} as someone who's been exploring Eastern Europe for months.
Tomorrow's plan: ${data.tomorrow_type === 'poi' ? 'visiting ' + data.tomorrow_name : 'traveling to ' + data.tomorrow_name}

TONE & VOICE:
- Write like I'm wrapping up a conversation with a friend - warm, helpful, personal
- Use "I" and share genuine anticipation
- Include humor and personality - be conversational, not formal
- Show moderate enthusiasm for sharing knowledge with fellow travelers
- NO greetings or "Hey there" - continue the conversation naturally

STRUCTURE & FLOW:
- Start with tomorrow's plans in a natural way
- Use parenthetical asides to add personality and extra thoughts
- Transition smoothly into practical advice
- Make tips feel like insider knowledge, not a formal list

LOCAL EXPERTISE:
- Show deep knowledge of ${data.location.name} and how things really work here
- Reference local customs and culture naturally
- Use some local terminology when helpful (with explanations)
- Position myself as someone who's figured out the best ways to do things

CONTENT FOR TOMORROW'S PLANS:
- Share genuine anticipation about what's coming next
- Include a personal reason why I'm looking forward to this plan
- Mention any preparation or special considerations

CONTENT FOR TRAVEL TIPS (3-5 tips):
- Give specific, actionable advice that actually matters
- Include practical details about transportation, costs, timing
- Share local customs or etiquette that tourists should know
- Mention hidden gems or insider tricks I've discovered
- Be opinionated but helpful - explain WHY these tips matter

Keep it conversational and helpful, around 200-250 words total. Make it feel like genuine advice from a friend who really knows this place. Use moderate enthusiasm - avoid excessive superlatives.
`;

    // Generate each section
    try {
      results.introduction = await this.generateText(introPrompt, {
        ...options,
        type: 'blog_introduction',
        section: 'introduction',
        location: data.location.name,
        day: data.location.current_day
      });
      console.log('Introduction generated');
      
      if (accommodationPrompt) {
        results.accommodation = await this.generateText(accommodationPrompt, {
          ...options,
          type: 'blog_accommodation',
          section: 'accommodation',
          location: data.location.name,
          day: data.location.current_day
        });
        console.log('Accommodation section generated');
      }
      
      results.food = await this.generateText(foodPrompt, {
        ...options,
        type: 'blog_food',
        section: 'food',
        location: data.location.name,
        day: data.location.current_day
      });
      console.log('Food section generated');
      
      results.attraction = await this.generateText(attractionPrompt, {
        ...options,
        type: 'blog_attraction',
        section: 'attraction',
        location: data.location.name,
        day: data.location.current_day
      });
      console.log('Attraction section generated');
      
      results.closing = await this.generateText(closingPrompt, {
        ...options,
        type: 'blog_closing',
        section: 'closing',
        location: data.location.name,
        day: data.location.current_day
      });
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

  // Helper function to split text into WordPress paragraph blocks
  splitIntoParagraphs(text) {
    // Split by double line breaks (paragraph breaks)
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // If we have multiple paragraphs, format them as separate WordPress blocks
    if (paragraphs.length > 1) {
      return paragraphs.map(paragraph => 
        `<!-- wp:paragraph -->\n<p>${paragraph.trim()}</p>\n<!-- /wp:paragraph -->`
      ).join('\n');
    }
    
    // If only one paragraph, return as single block
    return `<!-- wp:paragraph -->\n<p>${text.trim()}</p>\n<!-- /wp:paragraph -->`;
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
${this.splitIntoParagraphs(sections.food)}
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
${this.splitIntoParagraphs(sections.attraction)}
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
