// Force IPv4 first
require('./force_ipv4');

// Load environment variables
require('dotenv').config();

// Core dependencies
const path = require('path');
const fs = require('fs');
const cron = require('cron');
const winston = require('winston');

// Create logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, 'logs', 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(__dirname, 'logs', 'combined.log')
    })
  ]
});

// Check required directories
const directories = [
  path.join(__dirname, 'logs'),
  process.env.IMAGE_STORAGE_PATH || path.join(__dirname, 'temp', 'images'),
  process.env.CACHE_PATH || path.join(__dirname, 'temp', 'cache'),
  path.join(__dirname, 'database')
];
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
});

// Import services
const PostGeneratorService = require('./src/services/PostGeneratorService');
const WordPressService = require('./src/services/WordPressService');
const TravelPlannerService = require('./src/services/TravelPlannerService');
const { createTravelPost } = require('./travel-post-generator');
const { moveToNextLocation } = require('./move_to_next_location');

// Function to check if Giovanni should move to next location
async function checkLocationStatus() {
  logger.info('Checking if Giovanni needs to move to next location');
  
  const sqlite3 = require('sqlite3').verbose();
  const { open } = require('sqlite');
  
  const db = await open({
    filename: process.env.DB_PATH || path.join(__dirname, 'database', 'giovanni.db'),
    driver: sqlite3.Database
  });
  
  try {
    // Get current location
    const currentLocation = await db.get('SELECT * FROM locations WHERE is_current = 1');
    if (!currentLocation) {
      logger.error('No current location found');
      return false;
    }
    
    // Check if duration completed OR no more unvisited attractions
    const shouldMove = currentLocation.current_day >= currentLocation.planned_duration;
    
    // Also check if all attractions visited (no more content to generate)
    const unvisitedAttractions = await db.get(`
      SELECT COUNT(*) as count 
      FROM points_of_interest poi
      LEFT JOIN visits v ON poi.id = v.poi_id
      WHERE poi.location_id = ? AND poi.type = 'attraction' AND v.poi_id IS NULL
    `, [currentLocation.id]);
    
    const noMoreAttractions = unvisitedAttractions.count === 0;
    
    // Get settings from environment
    const minDays = parseInt(process.env.MIN_DAYS_PER_LOCATION) || 7;
    const maxDays = parseInt(process.env.MAX_DAYS_PER_LOCATION) || 21;
    
    // Check if we should move based on various conditions
    const reachedMinDuration = currentLocation.current_day >= currentLocation.planned_duration;
    const reachedMaxDuration = currentLocation.current_day >= maxDays;
    const noContentAndMinTime = noMoreAttractions && currentLocation.current_day >= minDays;
    
    if (reachedMinDuration || reachedMaxDuration || noContentAndMinTime) {
      const reason = reachedMaxDuration ? 'max duration' : 
                   reachedMinDuration ? 'planned duration' : 
                   'no attractions left';
      logger.info(`Giovanni should move (${reason}): day ${currentLocation.current_day}/${currentLocation.planned_duration}, attractions=${unvisitedAttractions.count}`);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Error checking location status: ${error.message}`);
    return false;
  } finally {
    await db.close();
  }
}

// Function to handle automatic travel
async function handleAutomaticTravel() {
  try {
    logger.info('Starting automatic travel process');
    
    // 1. Move to next location
    const moveSuccess = await moveToNextLocation();
    if (!moveSuccess) {
      logger.error('Failed to move to next location');
      return false;
    }
    
    // 2. Generate travel post
    const travelPostSuccess = await createTravelPost();
    if (!travelPostSuccess) {
      logger.error('Failed to generate travel post');
      return false;
    }
    
    logger.info('Automatic travel completed successfully');
    return true;
  } catch (error) {
    logger.error(`Error during automatic travel: ${error.message}`);
    return false;
  }
}

// Function to create post
async function generateDailyPost() {
  logger.info('Starting daily post generation');
  
  try {
    // First check if Giovanni needs to travel
    const shouldTravel = await checkLocationStatus();
    
    if (shouldTravel) {
      logger.info('Giovanni needs to travel to next location');
      return await handleAutomaticTravel();
    }
    
    // Normal daily post generation
    const wpConnection = await WordPressService.initialize();
    if (!wpConnection) {
      logger.error('Failed to connect to WordPress. Aborting post generation.');
      return false;
    }
    
    // Generate and publish post
    const result = await PostGeneratorService.generateAndPublishPost();
    if (result.success) {
      logger.info(`Post successfully published: ${result.postUrl}`);
      return true;
    } else {
      logger.error(`Failed to publish post: ${result.error}`);
      return false;
    }
  } catch (error) {
    logger.error(`Unhandled error during post generation: ${error.message}`);
    return false;
  }
}

// Task scheduler
function setupCronJobs() {
  // Schedule from config or default
  const postGenerationSchedule = process.env.POST_GENERATION_CRON || '0 8 * * *'; // Default at 8:00 AM every day
  
  // Create post generation task
  const postGenerationJob = new cron.CronJob(
    postGenerationSchedule,
    generateDailyPost,
    null, // onComplete
    true, // start
    'Europe/Moscow' // timezone (replace with yours)
  );
  
  logger.info(`Post generation job scheduled: ${postGenerationSchedule}`);
  
  // Start job
  postGenerationJob.start();
}

// Application startup function
async function startApp() {
  try {
    logger.info('Starting Giovanni\'s Travel Blog generation service');
    
    // Set up task scheduler
    setupCronJobs();
    
    // Run manual post generation if requested
    if (process.argv.includes('--generate-post')) {
      logger.info('Manual post generation requested');
      await generateDailyPost();
    }
    
    logger.info('Application started successfully');
  } catch (error) {
    logger.error(`Error starting application: ${error.message}`);
  }
}

// Start application
startApp();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`, { error });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection:', { reason });
});
