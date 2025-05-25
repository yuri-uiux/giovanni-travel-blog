/**
 * Giovanni's Travel Blog - Dynamic Journey Initialization Script
 * 
 * This script initializes Giovanni's journey with dynamically selected
 * cities and points of interest using OpenAI.
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const TravelPlannerService = require('../services/TravelPlannerService');

async function initializeDynamicJourney() {
  // Open database connection
  const db = await open({
    filename: process.env.DB_PATH || path.join(__dirname, '..', '..', 'database', 'giovanni.db'),
    driver: sqlite3.Database
  });
  
  try {
    // Check if journey is already initialized
    const existingLocations = await db.get('SELECT COUNT(*) as count FROM locations');
    if (existingLocations.count > 0) {
      console.log('Journey appears to be already initialized. Locations found in the database.');
      console.log('If you want to reinitialize, clear the database first.');
      return;
    }
    
    console.log('Initializing dynamic journey...');
    
    // Select first city (Serbia as starting country)
    const firstCity = await TravelPlannerService.selectNextCity(null);
    
    console.log(`Selected first destination: ${firstCity.name}, ${firstCity.country}`);
    
    // Set start date and duration
    const startDate = new Date();
    const plannedDuration = 14; // 2 weeks in first city
    const departureDate = new Date(startDate);
    departureDate.setDate(departureDate.getDate() + plannedDuration);
    
    // Save city to database
    await db.run(`
      INSERT INTO locations (
        name, country, region, lat, lng, timezone, currency, language,
        is_current, planned_arrival, planned_departure, planned_duration, current_day,
        order_in_journey
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      firstCity.name,
      firstCity.country,
      firstCity.region || '',
      firstCity.lat,
      firstCity.lng,
      firstCity.timezone,
      firstCity.currency,
      firstCity.language,
      1, // is_current = true
      startDate.toISOString().split('T')[0],
      departureDate.toISOString().split('T')[0],
      plannedDuration,
      1, // current_day = 1
      1  // order_in_journey = 1
    ]);
    
    console.log('Dynamic journey initialization completed successfully!');
    console.log(`Giovanni's journey begins in ${firstCity.name}, ${firstCity.country}`);
    
  } catch (error) {
    console.error('Error initializing dynamic journey:', error.message);
  } finally {
    await db.close();
  }
}

// Run initialization
initializeDynamicJourney()
  .then(() => {
    console.log('Dynamic journey initialization script finished.');
  })
  .catch(error => {
    console.error('Unhandled error:', error);
  });
