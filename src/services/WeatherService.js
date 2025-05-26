const axios = require('axios');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

class WeatherService {
  constructor() {
    this.apiKey = process.env.API_KEY_OPENWEATHER;
    this.baseURL = 'https://api.openweathermap.org/data/2.5';
    this.dbPath = process.env.DB_PATH;
  }

  // Get database connection
  async getDatabase() {
    return open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
  }

  // Helper method to vary weather descriptions slightly
  getVariedWeatherDescription(description) {
    const variations = {
      'clear sky': ['clear sky', 'sunny', 'bright sunshine'],
      'few clouds': ['few clouds', 'partly cloudy', 'mostly sunny'],
      'scattered clouds': ['scattered clouds', 'partly cloudy', 'mixed clouds'],
      'broken clouds': ['broken clouds', 'mostly cloudy', 'overcast'],
      'shower rain': ['shower rain', 'light rain', 'drizzle'],
      'rain': ['rain', 'rainy', 'wet weather'],
      'thunderstorm': ['thunderstorm', 'stormy', 'thunder and lightning'],
      'snow': ['snow', 'snowy', 'snowfall'],
      'mist': ['mist', 'foggy', 'hazy']
    };
    
    const options = variations[description] || [description];
    return options[Math.floor(Math.random() * options.length)];
  }

  // Get current weather by city and country
  async getWeatherByCity(city, country) {
    try {
      const response = await axios.get(`${this.baseURL}/weather`, {
        params: {
          q: `${city},${country}`,
          appid: this.apiKey,
          units: 'metric'
        }
      });

      const data = response.data;
      const weatherData = {
        temperature: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        humidity: data.main.humidity,
        windSpeed: data.wind.speed,
        country: data.sys.country,
        city: data.name
      };

      // Store today's weather for tomorrow's use
      await this.storeTodaysWeather(city, country, weatherData);

      return weatherData;
    } catch (error) {
      console.error(`Error fetching weather: ${error.message}`);
      throw error;
    }
  }

  // Get weather by coordinates
  async getWeatherByCoordinates(lat, lon) {
    try {
      const response = await axios.get(`${this.baseURL}/weather`, {
        params: {
          lat: lat,
          lon: lon,
          appid: this.apiKey,
          units: 'metric'
        }
      });
      
      const data = response.data;
      
      return {
        temperature: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        humidity: data.main.humidity,
        windSpeed: data.wind.speed,
        country: data.sys.country,
        city: data.name
      };
    } catch (error) {
      console.error(`Error fetching weather: ${error.message}`);
      // Return default weather if API fails
      return {
        temperature: 20,
        feelsLike: 20,
        description: 'sunny',
        icon: '01d',
        humidity: 60,
        windSpeed: 5,
        country: 'Unknown',
        city: 'Unknown'
      };
    }
  }

  // Store today's weather for tomorrow's use
  async storeTodaysWeather(city, country, weatherData) {
    const db = await this.getDatabase();
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Store weather data for this location and date
      await db.run(`
        INSERT OR REPLACE INTO daily_weather (
          city, country, date, temperature, feels_like, description, 
          icon, humidity, wind_speed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        city,
        country,
        today,
        weatherData.temperature,
        weatherData.feelsLike,
        weatherData.description,
        weatherData.icon,
        weatherData.humidity,
        weatherData.windSpeed,
        new Date().toISOString()
      ]);
      
      console.log(`Stored today's weather for ${city}, ${country}: ${weatherData.description} ${weatherData.temperature}°C`);
      
      // Clean up old weather data (keep only last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];
      
      await db.run(`
        DELETE FROM daily_weather 
        WHERE date < ?
      `, [weekAgoStr]);
      
    } catch (error) {
      console.error(`Error storing weather data: ${error.message}`);
    } finally {
      await db.close();
    }
  }

  // Get yesterday's weather from local storage
  async getYesterdayWeatherByCity(city, country) {
    const db = await this.getDatabase();
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      console.log(`Looking for yesterday's weather (${yesterdayStr}) for ${city}, ${country}`);
      
      // Try to get yesterday's weather from local storage
      const storedWeather = await db.get(`
        SELECT * FROM daily_weather 
        WHERE city = ? AND country = ? AND date = ?
      `, [city, country, yesterdayStr]);
      
      if (storedWeather) {
        console.log(`Found stored weather for ${city}: ${storedWeather.description} ${storedWeather.temperature}°C`);
        return {
          temperature: storedWeather.temperature,
          feelsLike: storedWeather.feels_like,
          description: storedWeather.description,
          icon: storedWeather.icon,
          humidity: storedWeather.humidity,
          windSpeed: storedWeather.wind_speed,
          country: storedWeather.country,
          city: storedWeather.city
        };
      }
      
      console.log(`No stored weather found for ${city} on ${yesterdayStr}`);
      
      // Fallback: get current weather and modify it slightly for "yesterday"
      try {
        const currentWeather = await this.getWeatherByCity(city, country);
        console.log(`Using modified current weather as fallback for yesterday`);
        
        // Slightly modify current weather to simulate yesterday
        const fallbackWeather = {
          ...currentWeather,
          temperature: currentWeather.temperature + Math.floor(Math.random() * 6) - 3, // ±3°C variation
          description: this.getVariedWeatherDescription(currentWeather.description)
        };
        
        return fallbackWeather;
      } catch (fallbackError) {
        console.error(`Fallback weather also failed: ${fallbackError.message}`);
        // Return default weather if everything fails
        return {
          temperature: 18,
          feelsLike: 18,
          description: 'partly cloudy',
          icon: '02d',
          humidity: 65,
          windSpeed: 3,
          country: country,
          city: city
        };
      }
      
    } catch (error) {
      console.error(`Error getting yesterday's weather: ${error.message}`);
      
      // Return default weather on error
      return {
        temperature: 18,
        feelsLike: 18,
        description: 'partly cloudy',
        icon: '02d',
        humidity: 65,
        windSpeed: 3,
        country: country,
        city: city
      };
    } finally {
      await db.close();
    }
  }
}

module.exports = new WeatherService();
