/**
 * Giovanni's Travel Blog - Travel Post Generator
 * 
 * This script generates a post about the journey between two cities.
 * Run it right after moving to a new location.
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const OpenAIService = require('./src/services/OpenAIService');
const WordPressService = require('./src/services/WordPressService');
const ImageService = require('./src/services/ImageService');
require('dotenv').config();

async function createTravelPost() {
  console.log('Starting travel post generation...');

  // Connect to the database
  const db = await open({
    filename: process.env.DB_PATH || path.join(__dirname, 'database', 'giovanni.db'),
    driver: sqlite3.Database
  });

  try {
    // Get the current location
    const currentLocation = await db.get('SELECT * FROM locations WHERE is_current = 1');
    if (!currentLocation) {
      throw new Error('No current location found');
    }

    // Get the previous location (with highest order_in_journey less than current)
    const previousLocation = await db.get(`
      SELECT * FROM locations 
      WHERE order_in_journey < ? 
      ORDER BY order_in_journey DESC LIMIT 1
    `, [currentLocation.order_in_journey]);

    if (!previousLocation) {
      console.log('No previous location found. This must be the first location.');
      return false;
    }

    // Get transportation details
    const transportInfo = await db.get(`
      SELECT * FROM transportation
      WHERE from_location_id = ? AND to_location_id = ?
    `, [previousLocation.id, currentLocation.id]);

    if (!transportInfo) {
      console.log('No transportation information found.');
      return false;
    }

    console.log(`Found journey from ${previousLocation.name} to ${currentLocation.name} by ${transportInfo.type}`);

    // Initialize WordPress service
    await WordPressService.initialize();

    // Initialize unified image service
    const imageService = new ImageService();
    
    // Get a suitable image for transportation
    const imageQuery = getTransportImageQuery(transportInfo.type, previousLocation.country, currentLocation.country);
    const imageFileName = `journey_${previousLocation.name}_${currentLocation.name}_${Date.now()}.jpg`;
    
    console.log(`Getting journey image with query: "${imageQuery}"`);
    const imageInfo = await imageService.searchImage(imageQuery, 'transport');
    const imagePath = imageInfo ? 
      (await imageService.downloadImage(imageInfo, imageFileName)).path :
      imageService.createPlaceholderImage(imageFileName, 'transport').path;

    // Format transportation info for the prompt
    const departureDate = new Date(transportInfo.departure_time);
    const arrivalDate = new Date(transportInfo.arrival_time);
    const durationHours = Math.floor(transportInfo.duration_minutes / 60);
    const durationMinutes = transportInfo.duration_minutes % 60;

    // Generate travel post content with OpenAI
    const prompt = `
Write a travel blog post about my journey from ${previousLocation.name}, ${previousLocation.country} to ${currentLocation.name}, ${currentLocation.country}.
My journey was by ${transportInfo.type} and took ${durationHours} hours and ${durationMinutes} minutes.
The distance was approximately ${transportInfo.distance_km} kilometers.
I departed at ${departureDate.toLocaleTimeString()} and arrived at ${arrivalDate.toLocaleTimeString()}.
The cost was ${transportInfo.price} ${transportInfo.currency}.

Write in first person as Giovanni, a travel blogger exploring Eastern and Southern Europe.
Focus on the journey experience, things I saw along the way, and my anticipation of arriving in a new city.
Make it personal and descriptive, with sensory details.

Include these elements:
- Begin with a phrase like "From [city A] to [city B]..." describing the journey's start
- Describe scenery and landscapes I passed through
- A small observation or interaction during the trip (with staff or fellow travelers)
- Mention how I felt leaving the previous city
- End with my arrival and first impressions of the new city with a phrase like "And finally, I arrived in [city B]..."
- Include a paragraph about why I chose ${currentLocation.name} as my next destination

Keep the total length between 400-500 words and use a warm, personal tone.
`;

    console.log('Generating travel post content...');
    const content = await OpenAIService.generateText(prompt, {
      temperature: 0.7,
      maxTokens: 1000
    });

    // Create title and excerpt
    const title = `Journey: From ${previousLocation.name} to ${currentLocation.name}`;
    const excerpt = `Join Giovanni on his ${transportInfo.type} journey from ${previousLocation.name} to ${currentLocation.name}, traveling through the beautiful landscapes of ${previousLocation.country} and ${currentLocation.country}.`;

    // Get version from package.json
    let version = '1.0.0';
    try {
      const packageData = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
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

    // Format post content with WordPress blocks
    const postContent = `<!-- Generated by Giovanni Travel Blog v${version} on ${new Date().toISOString()} | Images: ${imageEngine} -->
<!-- wp:paragraph -->
<p>${content.split('\n\n').join('</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>')}</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Tomorrow I'll explore my new accommodation and get my first proper taste of ${currentLocation.name}. Stay tuned!</p>
<!-- /wp:paragraph -->

<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator is-style-wide"/>
<!-- /wp:separator -->
<!-- wp:paragraph -->
<p><a href="/?tag=${encodeURIComponent(previousLocation.country)}" rel="tag">${previousLocation.country}</a>, <a href="/?tag=${encodeURIComponent(currentLocation.country)}" rel="tag">${currentLocation.country}</a>, <a href="/?tag=${encodeURIComponent(previousLocation.name)}" rel="tag">${previousLocation.name}</a>, <a href="/?tag=${encodeURIComponent(currentLocation.name)}" rel="tag">${currentLocation.name}</a>, <a href="/?tag=${encodeURIComponent(transportInfo.type)}" rel="tag">${transportInfo.type}</a></p>
<!-- /wp:paragraph -->
`;

    // Prepare post data for WordPress
    const postData = {
      title: title,
      content: postContent,
      excerpt: excerpt,
      status: 'publish',
      featuredImagePath: imagePath,
      featuredImageCaption: `Journey from ${previousLocation.name} to ${currentLocation.name} by ${transportInfo.type}`,
      featuredImageAlt: `Traveling from ${previousLocation.name} to ${currentLocation.name}`,
      categories: ['travel'],
      tags: [
        previousLocation.country,
        currentLocation.country,
        previousLocation.name,
        currentLocation.name,
        transportInfo.type,
        'journey'
      ],
      images: []
    };

    console.log('Publishing travel post...');
    const result = await WordPressService.createTravelPost(postData);
    
    if (result && result.post) {
      console.log(`Travel post published successfully: ${result.post.link}`);
      
      // Save post to database
      await db.run(`
        INSERT INTO posts (
          wp_post_id, title, slug, content, excerpt, type, published_at, featured_image_local_path, 
          featured_image_wp_id, image_credits
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        result.post.id,
        title,
        result.post.slug,
        postContent,
        excerpt,
        'travel',
        new Date().toISOString(),
        imagePath,
        result.featuredImage ? result.featuredImage.id : null,
        JSON.stringify({ transport: imageInfo ? imageInfo.credit : 'Generated image' })
      ]);
      
      return true;
    } else {
      console.log('Failed to publish travel post');
      return false;
    }

  } catch (error) {
    console.error(`Error generating travel post: ${error.message}`);
    return false;
  } finally {
    await db.close();
  }
}

/**
 * Generate an appropriate image query for the transport type
 */
function getTransportImageQuery(transportType, fromCountry, toCountry) {
  switch (transportType.toLowerCase()) {
    case 'airplane':
      return `airplane window view sky clouds journey`;
    case 'train':
      return `train journey ${fromCountry} ${toCountry} travel scenery`;
    case 'bus':
      return `bus journey road travel ${toCountry} landscape`;
    default:
      return `journey travel road Europe ${fromCountry} ${toCountry}`;
  }
}

// Export the function for use in other modules
module.exports = { createTravelPost };

// Run the function only if this file is executed directly
if (require.main === module) {
  createTravelPost()
    .then(() => {
      console.log('Travel post generation completed.');
    })
    .catch(error => {
      console.error('Unhandled error:', error);
    });
}
