const fs = require('fs');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const OpenAIService = require('./OpenAIService');
require('dotenv').config();

class TravelPlannerService {
  constructor() {
    this.dbPath = process.env.DB_PATH;
    this.openAIService = require('./OpenAIService');
  }

  // Get database connection
  async getDatabase() {
    return open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
  }

  // Safely parse JSON with error handling
  safeJsonParse(jsonString) {
    try {
      // First attempt: try to parse as is
      return JSON.parse(jsonString);
    } catch (e) {
      console.error("JSON parse error, attempting to fix...");
      try {
        // Second attempt: try to extract JSON from the response
        // Look for what might be JSON content between brackets
        const jsonPattern = /\[[\s\S]*\]|\{[\s\S]*\}/g;
        const match = jsonString.match(jsonPattern);
        if (match && match[0]) {
          return JSON.parse(match[0]);
        }
        
        // If no JSON found, throw the original error
        throw e;
      } catch (innerError) {
        console.error("Failed to parse JSON: ", innerError.message);
        // Return an empty array as fallback
        return [];
      }
    }
  }

  /**
   * Get a list of all cities that have already been visited
   * @returns {Promise<Array>} Array of city names that have been visited
   */
  async getVisitedCities() {
    const db = await this.getDatabase();
    try {
      const cities = await db.all(`
        SELECT name, country FROM locations 
        WHERE is_visited = 1 OR is_current = 1
      `);
      
      await db.close();
      return cities.map(city => ({ 
        name: city.name.toLowerCase(), 
        country: city.country.toLowerCase() 
      }));
    } catch (error) {
      console.error(`Error getting visited cities: ${error.message}`);
      await db.close();
      return [];
    }
  }

  // Generate a list of suitable cities in the specified country
  async generatePotentialCities(country, count = 5) {
    const prompt = `
Provide a list of ${count} small hidden-gem towns in ${country} that meet these criteria:
- NOT the capital city
- Population preferably under 100,000
- Has a historic old town with pre-1930s architecture
- Not a major tourist destination
- Similar to towns like Sopron (Hungary) or Viterbo (Italy)

Format each city as a JSON object with these properties:
- name: Town name in English
- description: 2-3 sentence description
- population: Approximate number
- coordinates: {latitude: number, longitude: number}
- advantages: List of 2-3 benefits for travelers
- transportHubs: Array of nearby major cities or transport hubs

Provide your full answer as a valid JSON array of these objects.
`;

    try {
      const response = await this.openAIService.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 2000
      });
      
      // Safely parse JSON response with error handling
      const citiesData = this.safeJsonParse(response);
      
      // Ensure we have an array
      const citiesArray = Array.isArray(citiesData) ? citiesData : [];
      console.log(`Generated ${citiesArray.length} potential cities in ${country}`);
      return citiesArray;
    } catch (error) {
      console.error(`Error generating potential cities: ${error.message}`);
      return [];
    }
  }

  // Select the next city for travel
  async selectNextCity(currentCountry) {
    // Determine the next country (can use OpenAI to select)
    const nextCountry = await this.determineNextCountry(currentCountry);
    console.log(`Selected next country: ${nextCountry}`);
    
    // Generate list of cities in the selected country
    let potentialCities = await this.generatePotentialCities(nextCountry);
    
    // Get previously visited cities to avoid duplicates
    const visitedCities = await this.getVisitedCities();
    console.log(`Found ${visitedCities.length} previously visited cities to avoid`);
    
    // Filter out cities that have already been visited
    if (potentialCities.length > 0 && visitedCities.length > 0) {
      const filteredCities = potentialCities.filter(city => {
        const cityName = city.name.toLowerCase();
        const cityCountry = (city.country || nextCountry).toLowerCase();
        return !visitedCities.some(visited => 
          visited.name === cityName && visited.country === cityCountry
        );
      });
      
      console.log(`Filtered from ${potentialCities.length} to ${filteredCities.length} cities to avoid duplicates`);
      
      // If we still have cities after filtering, use those
      if (filteredCities.length > 0) {
        potentialCities = filteredCities;
      } else {
        console.log("All potential cities have been visited before, generating new ones");
        // Try generating more cities with a different prompt
        const moreCities = await this.generatePotentialCities(nextCountry, 8);
        if (moreCities && moreCities.length > 0) {
          // Filter these new cities too
          const newFilteredCities = moreCities.filter(city => {
            const cityName = city.name.toLowerCase();
            const cityCountry = (city.country || nextCountry).toLowerCase();
            return !visitedCities.some(visited => 
              visited.name === cityName && visited.country === cityCountry
            );
          });
          
          if (newFilteredCities.length > 0) {
            potentialCities = newFilteredCities;
            console.log(`Generated ${newFilteredCities.length} new unvisited cities`);
          }
        }
      }
    }
    
    // If the list is empty, use a backup option
    if (!potentialCities || potentialCities.length === 0) {
      console.log("Using backup city due to empty potential cities list");
      return this.getBackupCity(nextCountry);
    }
    
    // Select a random city from the list
    const selectedCity = potentialCities[Math.floor(Math.random() * potentialCities.length)];
    console.log(`Selected city: ${selectedCity.name}`);
    
    // Safety check for coordinates
    if (!selectedCity.coordinates) {
      selectedCity.coordinates = { latitude: 0, longitude: 0 };
    }
    
    // Format data for saving
    return {
      name: selectedCity.name || 'Unknown Town',
      country: nextCountry,
      region: selectedCity.region || '',
      lat: selectedCity.coordinates.latitude || 0,
      lng: selectedCity.coordinates.longitude || 0,
      population: selectedCity.population || 0,
      description: selectedCity.description || '',
      timezone: this.getTimezoneForCountry(nextCountry),
      currency: this.getCurrencyForCountry(nextCountry),
      language: this.getLanguageForCountry(nextCountry),
      transportHubs: selectedCity.transportHubs || []
    };
  }

  // Determine the next country for the journey
  async determineNextCountry(currentCountry) {
    if (!currentCountry) return 'Serbia'; // Start with Serbia
    
    const priorityCountries = [
      'Serbia', 'Croatia', 'Italy', 'Montenegro', 'Bulgaria', 
      'Hungary', 'Greece', 'Romania', 'North Macedonia', 'Czech Republic'
    ];
    
    const secondaryCountries = [
      'Austria', 'Slovenia', 'Albania', 'Poland', 'Slovakia'
    ];
    
    const prompt = `
Giovanni is currently in ${currentCountry}. Given the geographical location and transportation options, 
which neighboring or nearby country would be the logical next destination for his journey through Eastern and Southern Europe?

Priority countries: ${priorityCountries.join(', ')}
Secondary countries: ${secondaryCountries.join(', ')}

The answer should contain only the country name in English.
`;

    try {
      const response = await this.openAIService.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 100
      });
      
      // Clean up and return country name
      return response.trim();
    } catch (error) {
      console.error(`Error determining next country: ${error.message}`);
      // Select a random country from the priority list
      const availableCountries = priorityCountries.filter(c => c !== currentCountry);
      return availableCountries[Math.floor(Math.random() * availableCountries.length)];
    }
  }

  // Generate a list of attractions for a city
  async generateAttractions(cityName, country, count = 5) {
    const prompt = `
Create a JSON array of ${count} tourist attractions in ${cityName}, ${country}.
Include a mix of historical sites, museums, churches, parks, and scenic viewpoints.

Each attraction should be a JSON object with these properties:
- name: Attraction name in English (and local language if different)
- type: Type of attraction (museum, church, park, etc)
- description: 2-3 sentence description
- visitTime: Approximate hours needed for visit
- weekdayHours: Typical opening hours Mon-Fri (e.g. "9:00-17:00")
- weekendHours: Typical opening hours Sat-Sun
- entranceFee: Cost or "Free"
- interestingFacts: Array of 2-3 interesting facts
- website: Official website URL if known (just provide your best guess based on the attraction name)

Provide your full answer as a valid JSON array of these objects. Do not include any other text.
`;

    try {
      const response = await this.openAIService.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 2000
      });
      
      // Safely parse JSON response
      const attractionsData = this.safeJsonParse(response);
      
      // Ensure we have an array
      const attractionsArray = Array.isArray(attractionsData) ? attractionsData : [];
      console.log(`Generated ${attractionsArray.length} attractions for ${cityName}`);
      return attractionsArray;
    } catch (error) {
      console.error(`Error generating attractions: ${error.message}`);
      return [];
    }
  }

  // Generate a list of restaurants for a city
  async generateRestaurants(cityName, country, count = 5) {
    const prompt = `
Create a JSON array of ${count} authentic local restaurants in ${cityName}, ${country}.
Focus on places that serve local cuisine and provide a good dining experience for travelers.

Each restaurant should be a JSON object with these properties:
- name: Restaurant name in English (and local language if different)
- cuisine: Type of cuisine
- priceCategory: "€", "€€", or "€€€"
- description: 2-3 sentence description
- specialties: Array of 2-3 signature dishes
- weekdayHours: Typical opening hours Mon-Fri (e.g. "12:00-22:00")
- weekendHours: Typical opening hours Sat-Sun
- address: Approximate location in the city center
- website: Official website URL if known (just provide your best guess based on the restaurant name)

Provide your full answer as a valid JSON array of these objects. Do not include any other text.
`;

    try {
      const response = await this.openAIService.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 2000
      });
      
      // Safely parse JSON response
      const restaurantsData = this.safeJsonParse(response);
      
      // Ensure we have an array
      const restaurantsArray = Array.isArray(restaurantsData) ? restaurantsData : [];
      console.log(`Generated ${restaurantsArray.length} restaurants for ${cityName}`);
      return restaurantsArray;
    } catch (error) {
      console.error(`Error generating restaurants: ${error.message}`);
      return [];
    }
  }

  // Check if a place is open at the specified time
  isPlaceOpen(place, date) {
    // Get day of week (0 - Sunday, 6 - Saturday)
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Determine opening hours for this day
    const hoursString = isWeekend ? place.weekendHours : place.weekdayHours;
    
    // If hours not specified or place is closed on this day
    if (!hoursString || hoursString.toLowerCase().includes('closed')) {
      return false;
    }
    
    // Parse opening hours (expected format "10:00-18:00")
    const hoursMatch = hoursString.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/);
    if (!hoursMatch) return true; // If format unclear, assume open
    
    const openHour = parseInt(hoursMatch[1]);
    const openMinute = parseInt(hoursMatch[2]);
    const closeHour = parseInt(hoursMatch[3]);
    const closeMinute = parseInt(hoursMatch[4]);
    
    // Current time on the specified date
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Check if current time falls within opening hours
    if (hours > openHour && hours < closeHour) {
      return true;
    } else if (hours === openHour && minutes >= openMinute) {
      return true;
    } else if (hours === closeHour && minutes < closeMinute) {
      return true;
    }
    
    return false;
  }

  // Select available places to visit on the specified date
  async selectPlacesToVisit(locationId, date) {
    const db = await this.getDatabase();
    try {
      // Get information about the current city
      const location = await db.get('SELECT * FROM locations WHERE id = ?', [locationId]);
      if (!location) {
        throw new Error(`Location with ID ${locationId} not found`);
      }
      
      // Get all attractions that haven't been visited
      const attractions = await db.all(`
        SELECT poi.* FROM points_of_interest poi
        LEFT JOIN visits v ON poi.id = v.poi_id
        WHERE poi.location_id = ? AND poi.type = 'attraction'
        AND (v.id IS NULL OR v.included_in_post = 0)
      `, [locationId]);
      
      // Get all restaurants that haven't been visited
      const restaurants = await db.all(`
        SELECT poi.* FROM points_of_interest poi
        LEFT JOIN visits v ON poi.id = v.poi_id
        WHERE poi.location_id = ? AND poi.type = 'restaurant'
        AND (v.id IS NULL OR v.included_in_post = 0)
      `, [locationId]);
      
      // If the list is empty, generate a new one
      if (!attractions || attractions.length === 0) {
        console.log(`Generating new attractions for ${location.name}...`);
        const newAttractions = await this.generateAttractions(location.name, location.country);
        
        // Safety check
        if (newAttractions && newAttractions.length > 0) {
          // Save new attractions to the database
          for (const attraction of newAttractions) {
            try {
              await db.run(`
                INSERT INTO points_of_interest (
                  location_id, name, type, description, highlights, opening_hours, website
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [
                locationId,
                attraction.name || `Attraction in ${location.name}`,
                'attraction',
                attraction.description || 'A local attraction',
                JSON.stringify(attraction.interestingFacts || []),
                JSON.stringify({
                  weekday: attraction.weekdayHours || '9:00-17:00',
                  weekend: attraction.weekendHours || '10:00-16:00'
                }),
                attraction.website || null
              ]);
            } catch (error) {
              console.error(`Error saving attraction: ${error.message}`);
            }
          }
          
          // Get updated list
          attractions.length = 0; // Clear the array
          (await db.all(`
            SELECT * FROM points_of_interest 
            WHERE location_id = ? AND type = 'attraction'
          `, [locationId])).forEach(a => attractions.push(a));
        }
      }
      
      // If the list is empty, generate a new one
      if (!restaurants || restaurants.length === 0) {
        console.log(`Generating new restaurants for ${location.name}...`);
        const newRestaurants = await this.generateRestaurants(location.name, location.country);
        
        // Safety check
        if (newRestaurants && newRestaurants.length > 0) {
          // Save new restaurants to the database
          for (const restaurant of newRestaurants) {
            try {
              await db.run(`
                INSERT INTO points_of_interest (
                  location_id, name, type, description, highlights, opening_hours, website
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [
                locationId,
                restaurant.name || `Restaurant in ${location.name}`,
                'restaurant',
                restaurant.description || 'A local restaurant',
                JSON.stringify(restaurant.specialties || []),
                JSON.stringify({
                  weekday: restaurant.weekdayHours || '12:00-22:00',
                  weekend: restaurant.weekendHours || '12:00-23:00'
                }),
                restaurant.website || null
              ]);
            } catch (error) {
              console.error(`Error saving restaurant: ${error.message}`);
            }
          }
          
          // Get updated list
          restaurants.length = 0; // Clear the array
          (await db.all(`
            SELECT * FROM points_of_interest 
            WHERE location_id = ? AND type = 'restaurant'
          `, [locationId])).forEach(r => restaurants.push(r));
        }
      }
      
      // If still no attractions or restaurants, create default ones
      if (!attractions || attractions.length === 0) {
        console.log("Creating default attractions...");
        const defaultAttraction = {
          name: `Historic Center of ${location.name}`,
          type: 'attraction',
          description: `The beautiful historic center of ${location.name} with its charming streets and buildings.`,
          highlights: JSON.stringify(['Architectural beauty', 'Local atmosphere']),
          opening_hours: JSON.stringify({
            weekday: '00:00-23:59',  // Always open
            weekend: '00:00-23:59'   // Always open
          }),
          website: null
        };
        
        const result = await db.run(`
          INSERT INTO points_of_interest (
            location_id, name, type, description, highlights, opening_hours, website
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          locationId,
          defaultAttraction.name,
          defaultAttraction.type,
          defaultAttraction.description,
          defaultAttraction.highlights,
          defaultAttraction.opening_hours,
          defaultAttraction.website
        ]);
        
        attractions.push({
          id: result.lastID,
          ...defaultAttraction,
          location_id: locationId
        });
      }
      
      if (!restaurants || restaurants.length === 0) {
        console.log("Creating default restaurants...");
        const defaultRestaurant = {
          name: `Local Restaurant in ${location.name}`,
          type: 'restaurant',
          description: `A cozy restaurant serving authentic local cuisine in ${location.name}.`,
          highlights: JSON.stringify(['Traditional dishes', 'Local ingredients']),
          opening_hours: JSON.stringify({
            weekday: '12:00-22:00',
            weekend: '12:00-23:00'
          }),
          website: null
        };
        
        const result = await db.run(`
          INSERT INTO points_of_interest (
            location_id, name, type, description, highlights, opening_hours, website
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          locationId,
          defaultRestaurant.name,
          defaultRestaurant.type,
          defaultRestaurant.description,
          defaultRestaurant.highlights,
          defaultRestaurant.opening_hours,
          defaultRestaurant.website
        ]);
        
        restaurants.push({
          id: result.lastID,
          ...defaultRestaurant,
          location_id: locationId
        });
      }
      
      // Filter by opening hours (check if the place was open "yesterday")
      const visitDate = new Date(date);
      visitDate.setDate(visitDate.getDate() - 1); // Yesterday
      
      // Filter attractions with safe checks to prevent errors
      const openAttractions = attractions.filter(a => {
        try {
          if (!a || !a.opening_hours) return true; // If no data, consider open
          
          const hours = typeof a.opening_hours === 'string' ? 
            JSON.parse(a.opening_hours) : a.opening_hours;
            
          if (!hours) return true;
          
          const isWeekend = visitDate.getDay() === 0 || visitDate.getDay() === 6;
          const hoursToCheck = isWeekend ? hours.weekend : hours.weekday;
          
          return !hoursToCheck || !hoursToCheck.toLowerCase().includes('closed');
        } catch (e) {
          console.error(`Error checking attraction opening hours: ${e.message}`);
          return true; // If error, consider open
        }
      });
      
      // Filter restaurants with safe checks to prevent errors
      const openRestaurants = restaurants.filter(r => {
        try {
          if (!r || !r.opening_hours) return true; // If no data, consider open
          
          const hours = typeof r.opening_hours === 'string' ? 
            JSON.parse(r.opening_hours) : r.opening_hours;
            
          if (!hours) return true;
          
          const isWeekend = visitDate.getDay() === 0 || visitDate.getDay() === 6;
          const hoursToCheck = isWeekend ? hours.weekend : hours.weekday;
          
          return !hoursToCheck || !hoursToCheck.toLowerCase().includes('closed');
        } catch (e) {
          console.error(`Error checking restaurant opening hours: ${e.message}`);
          return true; // If error, consider open
        }
      });
      
      // Select random places from the open ones
      const selectedAttraction = openAttractions && openAttractions.length > 0 
        ? openAttractions[Math.floor(Math.random() * openAttractions.length)]
        : (attractions.length > 0 ? attractions[0] : null);
        
      const selectedRestaurant = openRestaurants && openRestaurants.length > 0
        ? openRestaurants[Math.floor(Math.random() * openRestaurants.length)]
        : (restaurants.length > 0 ? restaurants[0] : null);
      
      return {
        attraction: selectedAttraction,
        restaurant: selectedRestaurant
      };
    } catch (error) {
      console.error(`Error selecting places to visit: ${error.message}`);
      return { attraction: null, restaurant: null };
    } finally {
      await db.close();
    }
  }

  // Helper methods
  getTimezoneForCountry(country) {
    const timezones = {
      'Serbia': 'Europe/Belgrade',
      'Croatia': 'Europe/Zagreb',
      'Italy': 'Europe/Rome',
      'Montenegro': 'Europe/Podgorica',
      'Bulgaria': 'Europe/Sofia',
      'Hungary': 'Europe/Budapest',
      'Greece': 'Europe/Athens',
      'Romania': 'Europe/Bucharest',
      'North Macedonia': 'Europe/Skopje',
      'Czech Republic': 'Europe/Prague',
      'Austria': 'Europe/Vienna',
      'Slovenia': 'Europe/Ljubljana',
      'Albania': 'Europe/Tirane',
      'Poland': 'Europe/Warsaw',
      'Slovakia': 'Europe/Bratislava'
    };
    return timezones[country] || 'Europe/Belgrade';
  }
  
  getCurrencyForCountry(country) {
    const currencies = {
      'Serbia': 'RSD',
      'Croatia': 'EUR',
      'Italy': 'EUR',
      'Montenegro': 'EUR',
      'Bulgaria': 'BGN',
      'Hungary': 'HUF',
      'Greece': 'EUR',
      'Romania': 'RON',
      'North Macedonia': 'MKD',
      'Czech Republic': 'CZK',
      'Austria': 'EUR',
      'Slovenia': 'EUR',
      'Albania': 'ALL',
      'Poland': 'PLN',
      'Slovakia': 'EUR'
    };
    return currencies[country] || 'EUR';
  }
  
  getLanguageForCountry(country) {
    const languages = {
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
      'Austria': 'German',
      'Slovenia': 'Slovenian',
      'Albania': 'Albanian',
      'Poland': 'Polish',
      'Slovakia': 'Slovak'
    };
    return languages[country] || 'English';
  }
  
  // Backup city if generation fails
  async getBackupCity(country) {
    // First get all visited cities to avoid duplicates
    const visitedCities = await this.getVisitedCities();
    
    const backupCities = {
      "Serbia": [
        { name: "Novi Sad", lat: 45.2671, lng: 19.8335 },
        { name: "Subotica", lat: 46.1000, lng: 19.6667 },
        { name: "Niš", lat: 43.3200, lng: 21.9000 },
        { name: "Kragujevac", lat: 44.0167, lng: 20.9167 }
      ],
      "Croatia": [
        { name: "Rovinj", lat: 45.0811, lng: 13.6387 },
        { name: "Split", lat: 43.5081, lng: 16.4402 },
        { name: "Zadar", lat: 44.1197, lng: 15.2422 },
        { name: "Dubrovnik", lat: 42.6507, lng: 18.0944 }
      ],
      "Italy": [
        { name: "Orvieto", lat: 42.7173, lng: 12.1057 },
        { name: "Lucca", lat: 43.8429, lng: 10.5027 },
        { name: "Matera", lat: 40.6667, lng: 16.6000 },
        { name: "Siena", lat: 43.3186, lng: 11.3306 }
      ],
      "Montenegro": [
        { name: "Kotor", lat: 42.4246, lng: 18.7712 },
        { name: "Budva", lat: 42.2911, lng: 18.8400 },
        { name: "Herceg Novi", lat: 42.4531, lng: 18.5375 },
        { name: "Cetinje", lat: 42.3944, lng: 18.9147 }
      ],
      "Bulgaria": [
        { name: "Plovdiv", lat: 42.1421, lng: 24.7499 },
        { name: "Veliko Tarnovo", lat: 43.0822, lng: 25.6325 },
        { name: "Sozopol", lat: 42.4178, lng: 27.6953 },
        { name: "Nessebar", lat: 42.6609, lng: 27.7192 }
      ],
      "Hungary": [
        { name: "Sopron", lat: 47.6817, lng: 16.5845 },
        { name: "Eger", lat: 47.9025, lng: 20.3772 },
        { name: "Pécs", lat: 46.0727, lng: 18.2324 },
        { name: "Szeged", lat: 46.2530, lng: 20.1414 }
      ],
      "Greece": [
        { name: "Nafplio", lat: 37.5675, lng: 22.8016 },
        { name: "Ioannina", lat: 39.6650, lng: 20.8536 },
        { name: "Corfu Town", lat: 39.6243, lng: 19.9217 },
        { name: "Chania", lat: 35.5138, lng: 24.0180 }
      ],
      "Romania": [
        { name: "Sibiu", lat: 45.7983, lng: 24.1255 },
        { name: "Brașov", lat: 45.6427, lng: 25.5887 },
        { name: "Sighișoara", lat: 46.2197, lng: 24.7922 },
        { name: "Cluj-Napoca", lat: 46.7712, lng: 23.6236 }
      ],
      "North Macedonia": [
        { name: "Ohrid", lat: 41.1231, lng: 20.8016 },
        { name: "Bitola", lat: 41.0297, lng: 21.3292 },
        { name: "Prilep", lat: 41.3450, lng: 21.5500 },
        { name: "Kruševo", lat: 41.3689, lng: 21.2489 }
      ],
      "Czech Republic": [
        { name: "Český Krumlov", lat: 48.8127, lng: 14.3175 },
        { name: "Karlovy Vary", lat: 50.2333, lng: 12.8833 },
        { name: "Telč", lat: 49.1822, lng: 15.4536 },
        { name: "Kutná Hora", lat: 49.9481, lng: 15.2681 }
      ],
      "Austria": [
        { name: "Hallstatt", lat: 47.5622, lng: 13.6493 },
        { name: "Innsbruck", lat: 47.2692, lng: 11.4041 },
        { name: "Salzburg", lat: 47.8095, lng: 13.0550 },
        { name: "Graz", lat: 47.0707, lng: 15.4395 }
      ],
      "Slovenia": [
        { name: "Piran", lat: 45.5275, lng: 13.5647 },
        { name: "Ptuj", lat: 46.4200, lng: 15.8700 },
        { name: "Škofja Loka", lat: 46.1644, lng: 14.3047 },
        { name: "Maribor", lat: 46.5547, lng: 15.6467 }
      ],
      "Albania": [
        { name: "Gjirokastër", lat: 40.0758, lng: 20.1404 },
        { name: "Berat", lat: 40.7058, lng: 19.9522 },
        { name: "Korçë", lat: 40.6186, lng: 20.7808 },
        { name: "Shkodër", lat: 42.0686, lng: 19.5031 }
      ],
      "Poland": [
        { name: "Zamość", lat: 50.7192, lng: 23.2525 },
        { name: "Wrocław", lat: 51.1079, lng: 17.0385 },
        { name: "Toruń", lat: 53.0100, lng: 18.6167 },
        { name: "Gdańsk", lat: 54.3520, lng: 18.6466 }
      ],
      "Slovakia": [
        { name: "Banská Štiavnica", lat: 48.4598, lng: 18.8997 },
        { name: "Levoča", lat: 49.0217, lng: 20.5850 },
        { name: "Košice", lat: 48.7164, lng: 21.2611 },
        { name: "Bardejov", lat: 49.2944, lng: 21.2736 }
      ]
    };
    
    // Get backup cities for the country
    const citiesForCountry = backupCities[country] || backupCities["Serbia"];
    
    // Filter out cities that have been visited
    const availableCities = citiesForCountry.filter(city => {
      const cityName = city.name.toLowerCase();
      const cityCountry = country.toLowerCase();
      return !visitedCities.some(visited => 
        visited.name === cityName && visited.country === cityCountry
      );
    });
    
    // If all cities in this country have been visited, try another country
    if (availableCities.length === 0) {
      // Find countries with available cities
      for (const [countryName, cities] of Object.entries(backupCities)) {
        if (countryName === country) continue; // Skip current country
        
        const availableInCountry = cities.filter(city => {
          const cityName = city.name.toLowerCase();
          const cityCountry = countryName.toLowerCase();
          return !visitedCities.some(visited => 
            visited.name === cityName && visited.country === cityCountry
          );
        });
        
        if (availableInCountry.length > 0) {
          console.log(`No unvisited cities in ${country}, using backup from ${countryName}`);
          const city = availableInCountry[Math.floor(Math.random() * availableInCountry.length)];
          
          return {
            name: city.name,
            country: countryName, // Note we're changing the country
            region: "",
            lat: city.lat,
            lng: city.lng,
            timezone: this.getTimezoneForCountry(countryName),
            currency: this.getCurrencyForCountry(countryName),
            language: this.getLanguageForCountry(countryName)
          };
        }
      }
      
      // If we're here, all backup cities have been visited
      // Just pick any city from the original country with a modified name
      const city = citiesForCountry[0];
      console.log(`All backup cities have been visited. Using modified name for ${city.name}`);
      
      return {
        name: `${city.name} Outskirts`,
        country: country,
        region: "",
        lat: city.lat + (Math.random() * 0.05 - 0.025),
        lng: city.lng + (Math.random() * 0.05 - 0.025),
        timezone: this.getTimezoneForCountry(country),
        currency: this.getCurrencyForCountry(country),
        language: this.getLanguageForCountry(country)
      };
    }
    
    // Select a random unvisited city
    const city = availableCities[Math.floor(Math.random() * availableCities.length)];
    console.log(`Selected backup city: ${city.name}, ${country}`);
    
    return {
      name: city.name,
      country: country,
      region: "",
      lat: city.lat,
      lng: city.lng,
      timezone: this.getTimezoneForCountry(country),
      currency: this.getCurrencyForCountry(country),
      language: this.getLanguageForCountry(country)
    };
  }
}

module.exports = new TravelPlannerService();
