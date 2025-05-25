const axios = require('axios');
require('dotenv').config();

class WeatherService {
  constructor() {
    this.apiKey = process.env.API_KEY_OPENWEATHER;
    this.baseURL = 'https://api.openweathermap.org/data/2.5';
  }

  // Get current weather by city and country
  async getWeatherByCity(city, country) {
    try {
      const response = await axios.get(`${this.baseURL}/weather`, {
        params: {
          q: `${city},${country}`,
          appid: this.apiKey,
          units: 'metric' // Use Celsius
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
        country: country,
        city: city
      };
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
}

module.exports = new WeatherService();
