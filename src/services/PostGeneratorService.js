const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const moment = require('moment');
const OpenAIService = require('./OpenAIService');
const WordPressService = require('./WordPressService');
const ImageService = require('./ImageService');
const WeatherService = require('./WeatherService');
const TravelPlannerService = require('./TravelPlannerService');
const AccommodationFinderService = require('./AccommodationFinderService');
require('dotenv').config();

class PostGeneratorService {
  constructor() {
    this.dbPath = process.env.DB_PATH;
    this.imageStoragePath = process.env.IMAGE_STORAGE_PATH || path.join(__dirname, '..', '..', 'temp', 'images');
    
    // Check if image directory exists
    if (!fs.existsSync(this.imageStoragePath)) {
      fs.mkdirSync(this.imageStoragePath, { recursive: true });
    }
  }

  // Get database connection
  async getDatabase() {
    return open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
  }

  // Get current location
  async getCurrentLocation() {
    const db = await this.getDatabase();
    try {
      return await db.get('SELECT * FROM locations WHERE is_current = 1');
    } catch (error) {
      console.error('Error getting current location:', error.message);
      return null;
    } finally {
      await db.close();
    }
  }

  // Get accommodation for current location
  async getAccommodation(locationId) {
    const db = await this.getDatabase();
    try {
      // First look for accommodation in the database
      const existingAccommodation = await db.get('SELECT * FROM accommodations WHERE location_id = ?', [locationId]);
      
      if (existingAccommodation) {
        return existingAccommodation;
      }
      
      // If no accommodation found, try to fetch real accommodation info
      const location = await db.get('SELECT * FROM locations WHERE id = ?', [locationId]);
      if (!location) {
        throw new Error(`Location with ID ${locationId} not found`);
      }
      
      console.log(`No accommodation found for ${location.name}, searching for real accommodation...`);
      
      // Try to find a real accommodation using AccommodationFinderService
      const realAccommodation = await AccommodationFinderService.findAccommodation(
        location.name, 
        location.country,
        {
          budget: 'medium',
          features: ['central', 'wifi'],
          maxPrice: 100,
          preferredSites: ['booking.com', 'airbnb.com'],
          currency: location.currency,
          city: location.name
        }
      );
      
      // Save the found accommodation to the database
      const checkInDate = new Date(location.planned_arrival);
      const checkOutDate = new Date(location.planned_departure || checkInDate);
      if (location.planned_duration) {
        checkOutDate.setDate(checkOutDate.getDate() + location.planned_duration);
      } else {
        checkOutDate.setDate(checkOutDate.getDate() + 14); // Default 14 days
      }
      
      const result = await db.run(`
        INSERT INTO accommodations (
          location_id, name, address, price_per_night, currency, description, 
          amenities, booking_url, check_in_date, check_out_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        locationId,
        realAccommodation.name,
        realAccommodation.address,
        realAccommodation.pricePerNight,
        realAccommodation.currency || location.currency,
        realAccommodation.description,
        realAccommodation.amenities,
        realAccommodation.bookingUrl,
        checkInDate.toISOString().split('T')[0],
        checkOutDate.toISOString().split('T')[0]
      ]);
      
      // Return the new accommodation with ID
      return {
        id: result.lastID,
        location_id: locationId,
        name: realAccommodation.name,
        address: realAccommodation.address,
        price_per_night: realAccommodation.pricePerNight,
        currency: realAccommodation.currency || location.currency,
        description: realAccommodation.description,
        amenities: realAccommodation.amenities,
        booking_url: realAccommodation.bookingUrl,
        check_in_date: checkInDate.toISOString().split('T')[0],
        check_out_date: checkOutDate.toISOString().split('T')[0],
        source: realAccommodation.source
      };
    } catch (error) {
      console.error('Error getting accommodation:', error.message);
      
      // Create and return default accommodation
      const location = await db.get('SELECT * FROM locations WHERE id = ?', [locationId]);
      if (!location) {
        return null;
      }
      
      const defaultAccommodation = {
        name: `${location.name} City Center Apartment`,
        address: `City Center, ${location.name}`,
        price_per_night: 70,
        currency: location.currency,
        description: `A cozy apartment in the heart of ${location.name}`,
        amenities: 'WiFi, Kitchen, Air conditioning, TV, Washing machine',
        booking_url: null
      };
      
      return defaultAccommodation;
    } finally {
      await db.close();
    }
  }

  // Plan tomorrow's activities
  async planTomorrowActivities(location) {
    const db = await this.getDatabase();
    try {
      // If last day, tomorrow will be travel to next location
      if (location.current_day >= location.planned_duration) {
        // Get next location
        const nextLocation = await db.get(`
          SELECT * FROM locations
          WHERE order_in_journey = ?
        `, [location.order_in_journey + 1]);
        
        if (nextLocation) {
          // Get transportation info to next location
          const transportInfo = await db.get(`
            SELECT * FROM transportation
            WHERE from_location_id = ? AND to_location_id = ?
          `, [location.id, nextLocation.id]);
          
          return {
            type: 'travel',
            destination: nextLocation,
            distance: transportInfo ? transportInfo.distance_km : 0
          };
        }
      }
      
      // Otherwise find a new attraction to visit
      const visitedAttractions = await db.all(`
        SELECT poi_id FROM visits
        WHERE poi_id IN (
          SELECT id FROM points_of_interest
          WHERE location_id = ? AND type = 'attraction'
        )
      `, [location.id]);
      
      const visitedIds = visitedAttractions.map(v => v.poi_id);
      
      // Find attraction not yet visited
      const tomorrowAttraction = await db.get(`
        SELECT * FROM points_of_interest
        WHERE location_id = ? AND type = 'attraction'
        ${visitedIds.length ? `AND id NOT IN (${visitedIds.join(',')})` : ''}
        ORDER BY RANDOM()
        LIMIT 1
      `, [location.id]);
      
      if (tomorrowAttraction) {
        return {
          type: 'poi',
          attraction: tomorrowAttraction
        };
      }
      
      // If all visited, just explore the city
      return {
        type: 'explore',
        description: 'exploring more of the city'
      };
    } catch (error) {
      console.error('Error planning tomorrow activities:', error.message);
      return {
        type: 'explore',
        description: 'exploring more of the city'
      };
    } finally {
      await db.close();
    }
  }

  // Get journey statistics
  async getJourneyStats() {
    const db = await this.getDatabase();
    try {
      // Get journey start date
      const startDateSetting = await db.get("SELECT value FROM settings WHERE key = 'journey_start_date'");
      const startDate = startDateSetting ? new Date(startDateSetting.value) : new Date();
      
      // Calculate days on the road
      const now = new Date();
      const diffTime = Math.abs(now - startDate);
      const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Calculate total distance
      const totalDistanceResult = await db.get(`
        SELECT SUM(distance_km) as total
        FROM transportation
        WHERE departure_time <= ?
      `, [now.toISOString()]);
      
      return {
        totalDays,
        totalDistance: totalDistanceResult && totalDistanceResult.total ? totalDistanceResult.total : 0
      };
    } catch (error) {
      console.error('Error getting journey stats:', error.message);
      return {
        totalDays: 1,
        totalDistance: 0
      };
    } finally {
      await db.close();
    }
  }

  // Prepare data for post generation
  async preparePostData() {
    try {
      // Get current location
      const location = await this.getCurrentLocation();
      if (!location) {
        throw new Error('No current location found');
      }
      
      // Get weather
      const weather = await WeatherService.getWeatherByCity(location.name, location.country);
      
      // Get yesterday's weather for image generation
      const yesterdayWeather = await WeatherService.getYesterdayWeatherByCity(location.name, location.country);
      
      // Get accommodation (if first day)
      const accommodation = location.current_day <= 1 
        ? await this.getAccommodation(location.id)
        : null;
      
      // Get restaurant and attraction using TravelPlannerService
      const today = new Date();
      const placesToVisit = await TravelPlannerService.selectPlacesToVisit(location.id, today);

      if (!placesToVisit.restaurant) {
        throw new Error("No suitable restaurant found for today. Consider moving to next location.");
      }

      if (!placesToVisit.attraction) {
        throw new Error("No suitable attraction found for today. Consider moving to next location.");
      }

      const restaurant = placesToVisit.restaurant;
      const attraction = placesToVisit.attraction;
      
      // Plan tomorrow
      const tomorrowPlans = await this.planTomorrowActivities(location);
      
      // Get journey statistics
      const journeyStats = await this.getJourneyStats();
      
      // Initialize ImageService (unified interface for Unsplash/Freepik)
      const imageService = new ImageService();
      
      // Load images using the unified image service
      // 1. Location image (with yesterday's weather context)
      const locationImage = await imageService.getLocationImage(
        location,
        `location_${location.id}_${Date.now()}.jpg`,
        yesterdayWeather
      );
      
      // 2. Accommodation image (if first day)
      let accommodationImage = null;
      if (accommodation) {
        accommodationImage = await imageService.getAccommodationImage(
          accommodation,
          location.country,
          `accommodation_${accommodation.id}_${Date.now()}.jpg`
        );
      }
      
      // 3. Food image
      const foodImage = await imageService.getFoodImage(
        restaurant,
        location,
        `food_${restaurant.id}_${Date.now()}.jpg`
      );
      
      // 4. Attraction image
      const attractionImage = await imageService.getAttractionImage(
        attraction,
        location,
        `attraction_${attraction.id}_${Date.now()}.jpg`
      );
      
      // Compile all data
      return {
        location,
        weather,
        yesterdayWeather,
        accommodation,
        restaurant,
        attraction,
        tomorrowPlans,
        tomorrow_type: tomorrowPlans.type,
        tomorrow_name: tomorrowPlans.type === 'poi' 
          ? tomorrowPlans.attraction.name 
          : (tomorrowPlans.type === 'travel' ? tomorrowPlans.destination.name : 'around the city'),
        totalDays: journeyStats.totalDays,
        total_distance: journeyStats.totalDistance,
        images: {
          location: locationImage,
          accommodation: accommodationImage,
          food: foodImage,
          attraction: attractionImage
        }
      };
    } catch (error) {
      console.error('Error preparing post data:', error.message);
      throw error;
    }
  }

  // Generate and publish post
  async generateAndPublishPost() {
    try {
      console.log('Starting post generation process...');
      
      // 1. Prepare data
      const postData = await this.preparePostData();
      console.log('Post data prepared successfully');
      
      // 2. Generate text sections with OpenAI
      const sections = await OpenAIService.generateBlogPostSections(postData, {
        temperature: 0.7,
        maxTokens: 700 // For each section
      });
      console.log('Content sections generated successfully');
      
      // 3. Assemble complete post
      const assembledPost = OpenAIService.assembleBlogPost(postData, sections);
      console.log('Post assembled successfully');
      
      // 4. Prepare WordPress data
      const wpPostData = {
        title: assembledPost.title,
        content: assembledPost.content,
        excerpt: assembledPost.excerpt,
        status: 'publish',
        featuredImagePath: postData.images.location.path,
        imageCaption: `View of ${postData.location.name}, ${postData.location.country}`,
        imageAlt: `${postData.location.name}, ${postData.location.country}`,
        categories: ['travel'], // Use base category
        tags: [
          postData.location.country,
          postData.location.name,
          'travel',
          'food',
          'culture'
        ],
        images: [
          // Accommodation image (if available)
          ...(postData.images.accommodation ? [{
            path: postData.images.accommodation.path,
            title: `Accommodation in ${postData.location.name}`,
            caption: `My stay at ${postData.accommodation.name}`,
            alt: `Accommodation in ${postData.location.name}`
          }] : []),
          // Food image
          {
            path: postData.images.food.path,
            title: `Food in ${postData.location.name}`,
            caption: `Local cuisine at ${postData.restaurant.name}`,
            alt: `Food in ${postData.location.name}`
          },
          // Attraction image
          {
            path: postData.images.attraction.path,
            title: postData.attraction.name,
            caption: `Visiting ${postData.attraction.name}`,
            alt: `${postData.attraction.name} in ${postData.location.name}`
          }
        ]
      };
      
      // 5. Publish to WordPress
      console.log('Publishing post to WordPress...');
      const publishedPost = await WordPressService.createTravelPost(wpPostData);
      console.log(`Post published successfully: ${publishedPost.post.link}`);
      
      // 6. Save post information to database
      await this.savePostInfoToDatabase(
        postData,
        assembledPost,
        publishedPost
      );
      
      // 7. Update current location status
      await this.updateLocationStatus(postData.location);
      
      // No need to clear usedQueries anymore, as tracking is now done in database
      // Image tracking now handled by database
      
      return {
        success: true,
        postUrl: publishedPost.post.link,
        postId: publishedPost.post.id,
      };
    } catch (error) {
      console.error('Error generating and publishing post:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Save post information to database
  async savePostInfoToDatabase(postData, assembledPost, publishedPost) {
    const db = await this.getDatabase();
    try {
      // Save post
      const result = await db.run(`
        INSERT INTO posts (
          wp_post_id,
          location_id,
          title,
          slug,
          content,
          excerpt,
          type,
          day_number,
          published_at,
          weather_temp,
          weather_condition,
          featured_image_local_path,
          featured_image_wp_id,
          image_credits,
          total_days,
          total_distance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        publishedPost.post.id,
        postData.location.id,
        assembledPost.title,
        publishedPost.post.slug,
        assembledPost.content,
        assembledPost.excerpt,
        'daily',
        postData.location.current_day,
        new Date().toISOString(),
        postData.weather.temperature,
        postData.weather.description,
        postData.images.location.path,
        publishedPost.featuredImage ? publishedPost.featuredImage.id : null,
        JSON.stringify({
          location: postData.images.location.credit,
          accommodation: postData.images.accommodation ? postData.images.accommodation.credit : null,
          food: postData.images.food.credit,
          attraction: postData.images.attraction.credit
        }),
        postData.totalDays,
        postData.total_distance
      ]);
      
      const postId = result.lastID;
      
      // Save images
      for (const image of publishedPost.uploadedImages) {
        await db.run(`
          INSERT INTO post_images (
            post_id,
            image_local_path,
            image_wp_id,
            image_wp_url,
            caption,
            alt_text,
            credit
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          postId,
          image.original.path,
          image.id,
          image.source_url,
          image.original.caption || '',
          image.original.alt || '',
          image.original.credit || ''
        ]);
      }
      
      // Mark visited places
      await db.run(`
        INSERT OR REPLACE INTO visits (poi_id, visit_date, included_in_post)
        VALUES (?, ?, 1)
      `, [postData.restaurant.id, new Date().toISOString().split('T')[0]]);
      
      await db.run(`
        INSERT OR REPLACE INTO visits (poi_id, visit_date, included_in_post)
        VALUES (?, ?, 1)
      `, [postData.attraction.id, new Date().toISOString().split('T')[0]]);
      
      console.log('Post information saved to database');
      return true;
    } catch (error) {
      console.error('Error saving post info to database:', error.message);
      return false;
    } finally {
      await db.close();
    }
  }

  // Update current location status
  async updateLocationStatus(location) {
    const db = await this.getDatabase();
    try {
      // Increment day counter
      await db.run(`
        UPDATE locations
        SET current_day = current_day + 1
        WHERE id = ?
      `, [location.id]);
      
      // If last day at location, prepare for move
      if (location.current_day >= location.planned_duration) {
        console.log(`Stay duration complete for ${location.name}. Planning move to next location.`);
        // In this version, just notify about the need to move
        // Actual move logic could be implemented in a separate method
      }
      
      return true;
    } catch (error) {
      console.error('Error updating location status:', error.message);
      return false;
    } finally {
      await db.close();
    }
  }
}

module.exports = new PostGeneratorService();
