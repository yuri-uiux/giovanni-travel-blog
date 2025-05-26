/**
 * CitySpecialtyService.js
 * 
 * This service finds city-specific characteristics, landmarks, and unique features
 * using Google Places API and other data sources.
 */

const axios = require('axios');
const NodeCache = require('node-cache');
const TripAdvisorService = require('./TripAdvisorService');
require('dotenv').config();

class CitySpecialtyService {
  constructor() {
    // Cache to store city specialty data
    this.cache = new NodeCache({ stdTTL: 60 * 60 * 24 * 30 }); // 30 days cache
    this.apiKey = process.env.API_KEY_GOOGLE;
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 200; // 200ms between requests
    
    // Known city specialties database
    this.knownSpecialties = {
      // Italy
      'Alberobello': {
        specialty: 'trulli houses',
        description: 'unique cone-shaped limestone dwellings with conical roofs',
        keywords: ['trulli', 'cone-shaped houses', 'limestone dwellings', 'UNESCO World Heritage']
      },
      'Venice': {
        specialty: 'canals and gondolas',
        description: 'historic city built on water with intricate canal system',
        keywords: ['canals', 'gondolas', 'bridges', 'water city', 'floating city']
      },
      'Matera': {
        specialty: 'sassi cave dwellings',
        description: 'ancient cave dwellings carved into limestone cliffs',
        keywords: ['sassi', 'cave houses', 'limestone caves', 'ancient dwellings']
      },
      'Cinque Terre': {
        specialty: 'colorful cliffside villages',
        description: 'five picturesque villages perched on Mediterranean cliffs',
        keywords: ['colorful houses', 'cliffside', 'terraced vineyards', 'coastal villages']
      },
      
      // Croatia
      'Dubrovnik': {
        specialty: 'medieval city walls',
        description: 'perfectly preserved medieval fortifications surrounding old town',
        keywords: ['city walls', 'medieval fortifications', 'old town', 'limestone walls']
      },
      'Plitvice': {
        specialty: 'cascading lakes and waterfalls',
        description: 'series of terraced lakes connected by waterfalls',
        keywords: ['waterfalls', 'terraced lakes', 'wooden walkways', 'turquoise water']
      },
      'Rovinj': {
        specialty: 'Venetian architecture',
        description: 'colorful Venetian-style buildings along the Adriatic coast',
        keywords: ['Venetian architecture', 'colorful facades', 'coastal town', 'bell tower']
      },
      
      // Serbia
      'Novi Sad': {
        specialty: 'Petrovaradin Fortress',
        description: 'massive baroque fortress overlooking the Danube River',
        keywords: ['fortress', 'baroque architecture', 'Danube views', 'underground tunnels']
      },
      'Subotica': {
        specialty: 'Art Nouveau architecture',
        description: 'stunning examples of Hungarian Art Nouveau buildings',
        keywords: ['Art Nouveau', 'Hungarian architecture', 'colorful facades', 'ornate details']
      },
      
      // Greece
      'Santorini': {
        specialty: 'white-washed buildings with blue domes',
        description: 'iconic Cycladic architecture perched on volcanic cliffs',
        keywords: ['white buildings', 'blue domes', 'volcanic cliffs', 'Cycladic architecture']
      },
      'Meteora': {
        specialty: 'monasteries on rock pillars',
        description: 'ancient monasteries built atop towering rock formations',
        keywords: ['rock monasteries', 'stone pillars', 'Byzantine monasteries', 'cliff-top buildings']
      },
      
      // Czech Republic
      'Český Krumlov': {
        specialty: 'medieval castle and old town',
        description: 'perfectly preserved medieval town with Gothic castle',
        keywords: ['medieval castle', 'Gothic architecture', 'cobblestone streets', 'river bend']
      },
      'Kutná Hora': {
        specialty: 'bone church and silver mining heritage',
        description: 'historic silver mining town with famous ossuary chapel',
        keywords: ['bone church', 'ossuary', 'silver mining', 'Gothic cathedral']
      },
      
      // Hungary
      'Eger': {
        specialty: 'baroque architecture and thermal baths',
        description: 'historic town famous for wine cellars and thermal springs',
        keywords: ['baroque buildings', 'thermal baths', 'wine cellars', 'castle fortress']
      },
      'Pécs': {
        specialty: 'early Christian necropolis',
        description: 'ancient Roman and early Christian archaeological sites',
        keywords: ['Roman ruins', 'early Christian tombs', 'UNESCO site', 'ancient mosaics']
      },
      
      // Bulgaria
      'Plovdiv': {
        specialty: 'Roman theater and old town',
        description: 'ancient Roman amphitheater and colorful Revival architecture',
        keywords: ['Roman theater', 'Revival architecture', 'colorful houses', 'ancient ruins']
      },
      'Veliko Tarnovo': {
        specialty: 'medieval fortress on hills',
        description: 'former Bulgarian capital with fortress ruins on steep hills',
        keywords: ['medieval fortress', 'hilltop castle', 'Tsarevets fortress', 'river valley']
      },
      
      // Romania
      'Brașov': {
        specialty: 'Saxon architecture and Black Church',
        description: 'medieval Saxon town with Gothic Black Church',
        keywords: ['Saxon architecture', 'Gothic church', 'medieval walls', 'mountain setting']
      },
      'Sighișoara': {
        specialty: 'medieval citadel',
        description: 'best-preserved medieval town in Transylvania',
        keywords: ['medieval citadel', 'clock tower', 'cobblestone streets', 'fortified walls']
      }
    };
  }

  // Rate limiting helper
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
  }

  // Get city specialty information
  async getCitySpecialty(cityName, country, enhanceWithTripAdvisor = true) {
    const cacheKey = `specialty_${cityName}_${country}_${enhanceWithTripAdvisor}`.toLowerCase();
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`Using cached specialty data for ${cityName}`);
      return cached;
    }

    try {
      // Check known specialties first
      const knownSpecialty = this.knownSpecialties[cityName];
      let baseSpecialty = null;
      
      if (knownSpecialty) {
        console.log(`Found known specialty for ${cityName}: ${knownSpecialty.specialty}`);
        baseSpecialty = knownSpecialty;
      } else {
        // If not in known database, try to discover via Google Places API
        const discoveredSpecialty = await this.discoverCitySpecialty(cityName, country);
        
        if (discoveredSpecialty) {
          baseSpecialty = discoveredSpecialty;
        } else {
          // Return generic result if nothing found
          baseSpecialty = {
            specialty: 'historic architecture',
            description: `traditional ${country} architecture and local heritage`,
            keywords: ['historic buildings', 'local architecture', 'cultural heritage']
          };
        }
      }

      // Enhance with TripAdvisor data if requested and API key is available
      let finalSpecialty = baseSpecialty;
      if (enhanceWithTripAdvisor && process.env.API_KEY_TRIPADVISOR) {
        try {
          finalSpecialty = await this.enhanceCitySpecialtyWithTripAdvisor(cityName, country, baseSpecialty);
        } catch (tripAdvisorError) {
          console.warn(`TripAdvisor enhancement failed for ${cityName}: ${tripAdvisorError.message}`);
          // Continue with base specialty if TripAdvisor fails
        }
      }
      
      this.cache.set(cacheKey, finalSpecialty);
      return finalSpecialty;

    } catch (error) {
      console.error(`Error getting city specialty for ${cityName}: ${error.message}`);
      
      // Return fallback
      const fallback = {
        specialty: 'historic charm',
        description: 'traditional European architecture and local character',
        keywords: ['historic buildings', 'traditional architecture', 'local culture']
      };
      
      this.cache.set(cacheKey, fallback);
      return fallback;
    }
  }

  // Discover city specialty using Google Places API
  async discoverCitySpecialty(cityName, country) {
    try {
      await this.waitForRateLimit();

      // Search for notable places in the city
      const searchResponse = await axios.get(
        'https://maps.googleapis.com/maps/api/place/textsearch/json',
        {
          params: {
            query: `${cityName} ${country} landmarks attractions`,
            key: this.apiKey,
            type: 'tourist_attraction'
          },
          timeout: 5000
        }
      );

      this.lastRequestTime = Date.now();

      if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
        return null;
      }

      // Analyze the top results to identify patterns
      const places = searchResponse.data.results.slice(0, 5);
      const keywords = [];
      const types = [];

      places.forEach(place => {
        if (place.types) {
          types.push(...place.types);
        }
        if (place.name) {
          keywords.push(place.name.toLowerCase());
        }
      });

      // Look for patterns in place types and names
      const specialty = this.analyzeDiscoveredData(types, keywords, cityName);
      
      if (specialty) {
        console.log(`Discovered specialty for ${cityName}: ${specialty.specialty}`);
        return specialty;
      }

      return null;

    } catch (error) {
      console.error(`Error discovering city specialty: ${error.message}`);
      return null;
    }
  }

  // Analyze discovered data to identify city specialty
  analyzeDiscoveredData(types, keywords, cityName) {
    const typePatterns = {
      'castle': {
        specialty: 'medieval castle',
        description: 'historic castle and medieval architecture',
        keywords: ['castle', 'medieval', 'fortress', 'historic walls']
      },
      'church': {
        specialty: 'religious architecture',
        description: 'notable churches and religious buildings',
        keywords: ['churches', 'religious architecture', 'cathedral', 'monastery']
      },
      'museum': {
        specialty: 'cultural heritage',
        description: 'rich cultural and historical heritage',
        keywords: ['museums', 'cultural sites', 'historical artifacts', 'heritage']
      },
      'park': {
        specialty: 'natural beauty',
        description: 'beautiful parks and natural landscapes',
        keywords: ['parks', 'gardens', 'natural beauty', 'green spaces']
      }
    };

    // Check for specific architectural or cultural patterns
    const joinedKeywords = keywords.join(' ');
    
    if (joinedKeywords.includes('castle') || joinedKeywords.includes('fortress')) {
      return typePatterns.castle;
    }
    if (joinedKeywords.includes('church') || joinedKeywords.includes('cathedral')) {
      return typePatterns.church;
    }
    if (joinedKeywords.includes('museum') || joinedKeywords.includes('gallery')) {
      return typePatterns.museum;
    }
    if (joinedKeywords.includes('park') || joinedKeywords.includes('garden')) {
      return typePatterns.park;
    }

    // Check place types
    if (types.includes('castle') || types.includes('establishment')) {
      return typePatterns.castle;
    }
    if (types.includes('church') || types.includes('place_of_worship')) {
      return typePatterns.church;
    }
    if (types.includes('museum')) {
      return typePatterns.museum;
    }
    if (types.includes('park')) {
      return typePatterns.park;
    }

    return null;
  }

  // Get enhanced location prompt with city specialty
  getEnhancedLocationPrompt(cityName, country, specialty, season, weather = null) {
    if (!specialty) {
      return null;
    }

    let weatherDescription = '';
    if (weather && weather.description) {
      weatherDescription = `, ${weather.description} weather`;
    }

    // Build enhanced prompt with city specialty
    const specialtyKeywords = specialty.keywords ? specialty.keywords.slice(0, 2).join(', ') : specialty.specialty;
    
    return `${specialty.description} in ${cityName}, ${country}, featuring ${specialtyKeywords}, ${season}${weatherDescription} atmosphere, professional travel photography style`;
  }

  // Enhance city specialty with TripAdvisor data
  async enhanceCitySpecialtyWithTripAdvisor(cityName, country, baseSpecialty) {
    try {
      console.log(`Enhancing ${cityName} specialty data with TripAdvisor information`);
      
      // Get top attractions from TripAdvisor
      const topAttractions = await TripAdvisorService.getCityTopAttractions(cityName, country, 5);
      
      if (!topAttractions || topAttractions.length === 0) {
        console.log(`No TripAdvisor attractions found for ${cityName}, using base specialty`);
        return baseSpecialty;
      }

      // Analyze attraction types to enhance specialty description
      const attractionTypes = this.analyzeAttractionTypes(topAttractions);
      
      // Enhance the specialty with TripAdvisor insights
      const enhanced = {
        ...baseSpecialty,
        tripadvisor: {
          topAttractions: topAttractions.slice(0, 3), // Top 3 attractions
          attractionTypes: attractionTypes,
          totalAttractions: topAttractions.length,
          averageRating: this.calculateAverageRating(topAttractions)
        }
      };

      // Update description with TripAdvisor insights
      if (attractionTypes.length > 0) {
        const typeDescriptions = attractionTypes.slice(0, 2).join(' and ');
        enhanced.description = `${baseSpecialty.description}, known for ${typeDescriptions}`;
        
        // Add TripAdvisor keywords
        const tripAdvisorKeywords = attractionTypes.slice(0, 3);
        enhanced.keywords = [...(baseSpecialty.keywords || []), ...tripAdvisorKeywords];
      }

      console.log(`Enhanced ${cityName} specialty: ${enhanced.specialty} (${topAttractions.length} attractions found)`);
      return enhanced;

    } catch (error) {
      console.error(`Error enhancing city specialty with TripAdvisor: ${error.message}`);
      return baseSpecialty; // Return base specialty on error
    }
  }

  // Analyze attraction types from TripAdvisor data
  analyzeAttractionTypes(attractions) {
    const typeMap = new Map();
    
    attractions.forEach(attraction => {
      // Analyze attraction groups/categories
      if (attraction.groups) {
        attraction.groups.forEach(group => {
          if (group.categories) {
            group.categories.forEach(category => {
              const typeName = category.name.toLowerCase();
              typeMap.set(typeName, (typeMap.get(typeName) || 0) + 1);
            });
          }
        });
      }
      
      // Also analyze from attraction names for common patterns
      const name = attraction.name.toLowerCase();
      if (name.includes('museum')) typeMap.set('museums', (typeMap.get('museums') || 0) + 1);
      if (name.includes('church') || name.includes('cathedral')) typeMap.set('religious sites', (typeMap.get('religious sites') || 0) + 1);
      if (name.includes('castle') || name.includes('fortress')) typeMap.set('historic fortifications', (typeMap.get('historic fortifications') || 0) + 1);
      if (name.includes('park') || name.includes('garden')) typeMap.set('parks and gardens', (typeMap.get('parks and gardens') || 0) + 1);
    });

    // Return most common types
    return Array.from(typeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([type]) => type);
  }

  // Calculate average rating from attractions
  calculateAverageRating(attractions) {
    const validRatings = attractions
      .map(a => parseFloat(a.rating))
      .filter(rating => !isNaN(rating));
    
    if (validRatings.length === 0) return null;
    
    const average = validRatings.reduce((sum, rating) => sum + rating, 0) / validRatings.length;
    return Math.round(average * 10) / 10; // Round to 1 decimal place
  }
}

module.exports = new CitySpecialtyService(); 