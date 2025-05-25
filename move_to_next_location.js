/**
 * Giovanni's Travel Blog - Move to Next Location Script (v2.0.0)
 * 
 * This script moves Giovanni to the next location in his journey,
 * using OpenAI to dynamically select the next city.
 * It also creates a travel post about the journey.
 */

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const TravelPlannerService = require('./src/services/TravelPlannerService');
const AccommodationFinderService = require('./src/services/AccommodationFinderService');
require('dotenv').config();

async function moveToNextLocation() {
  console.log('Starting the process to move Giovanni to the next location...');
  
  // Connect to the database
  const db = await open({
    filename: process.env.DB_PATH || path.join(__dirname, 'database', 'giovanni.db'),
    driver: sqlite3.Database
  });
  
  try {
    // Get current location
    const currentLocation = await db.get('SELECT * FROM locations WHERE is_current = 1');
    if (!currentLocation) {
      throw new Error('No current location found. Check the database.');
    }
    
    console.log(`Current location: ${currentLocation.name}, ${currentLocation.country} (Day ${currentLocation.current_day}/${currentLocation.planned_duration})`);
    
    // Generate new city with OpenAI
    console.log(`Generating new destination with OpenAI...`);
    const nextCity = await TravelPlannerService.selectNextCity(currentLocation.country);
    
    console.log(`Selected next destination: ${nextCity.name}, ${nextCity.country}`);
    
    // Calculate approximate travel time
    const distanceKm = await calculateDistance(
      {lat: currentLocation.lat, lng: currentLocation.lng},
      {lat: nextCity.lat, lng: nextCity.lng}
    );
    
    // Determine transport type (train, bus, etc.)
    const transportType = determineTransportType(distanceKm);
    const durationMinutes = estimateTravelTime(distanceKm, transportType);
    
    // Calculate arrival date based on current date
    const departureDate = new Date();
    const arrivalDate = new Date(departureDate);
    arrivalDate.setMinutes(arrivalDate.getMinutes() + durationMinutes);
    
    // Set planned duration of stay (10-14 days)
    const plannedDuration = 10 + Math.floor(Math.random() * 5);
    
    // Calculate order in journey
    const orderInJourney = currentLocation.order_in_journey + 1;
    
    // Save new city to the database
    const result = await db.run(`
      INSERT INTO locations (
        name, country, region, lat, lng, timezone, currency, language,
        planned_arrival, planned_duration, order_in_journey
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      nextCity.name,
      nextCity.country,
      nextCity.region || '',
      nextCity.lat,
      nextCity.lng,
      nextCity.timezone,
      nextCity.currency,
      nextCity.language,
      arrivalDate.toISOString().split('T')[0],
      plannedDuration,
      orderInJourney
    ]);
    
    const newLocationId = result.lastID;
    
    // Save transportation information
    await db.run(`
      INSERT INTO transportation (
        from_location_id, to_location_id, type, departure_time, arrival_time,
        duration_minutes, distance_km, price, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      currentLocation.id,
      newLocationId,
      transportType,
      departureDate.toISOString(),
      arrivalDate.toISOString(),
      durationMinutes,
      Math.round(distanceKm),
      estimatePrice(distanceKm, transportType),
      nextCity.currency
    ]);
    
    // Update location statuses
    await db.run('UPDATE locations SET is_current = 0, is_visited = 1 WHERE id = ?', [currentLocation.id]);
    await db.run('UPDATE locations SET is_current = 1, current_day = 1 WHERE id = ?', [newLocationId]);
    
    console.log(`Giovanni has successfully moved to ${nextCity.name}, ${nextCity.country}!`);
    console.log('You can now generate a new post for this location.');
    
    return true;
  } catch (error) {
    console.error(`Error moving to next location: ${error.message}`);
    return false;
  } finally {
    await db.close();
  }
}

// Helper functions
async function calculateDistance(from, to) {
  // Simple straight-line distance calculation (using Haversine formula)
  const R = 6371; // Earth's radius in km
  const dLat = (to.lat - from.lat) * Math.PI / 180;
  const dLon = (to.lng - from.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c;
  
  // Apply a factor of 1.3 to account for non-direct routes
  return distance * 1.3;
}

function determineTransportType(distance) {
  if (distance > 700) return 'airplane';
  if (distance > 300) return 'train';
  return 'bus';
}

function estimateTravelTime(distance, transportType) {
  switch (transportType) {
    case 'airplane':
      return 60 + Math.ceil(distance / 700 * 60); // 1 hour + flight time
    case 'train':
      return Math.ceil(distance / 60 * 60); // Average speed 60 km/h
    case 'bus':
      return Math.ceil(distance / 50 * 60); // Average speed 50 km/h
    default:
      return Math.ceil(distance / 50 * 60);
  }
}

function estimatePrice(distance, transportType) {
  switch (transportType) {
    case 'airplane':
      return Math.round(50 + distance * 0.15); // Base price + per km rate
    case 'train':
      return Math.round(10 + distance * 0.1);
    case 'bus':
      return Math.round(5 + distance * 0.08);
    default:
      return Math.round(10 + distance * 0.1);
  }
}

// Export the function for use in other modules
module.exports = { moveToNextLocation };

// Run the function only if this file is executed directly
if (require.main === module) {
  moveToNextLocation()
    .then(() => {
      console.log('Move to next location script completed.');
    })
    .catch(error => {
      console.error('Unhandled error:', error);
    });
}
