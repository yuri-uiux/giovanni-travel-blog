# Giovanni's Travel Blog

Automatic travel blog generator for Giovanni's journey through small towns of Eastern and Southern Europe.

## Features

- 🤖 **Fully Automated**: Runs completely autonomously with daily posts and automatic travel
- 📅 **Smart Scheduling**: Posts daily, travels every 2-3 weeks or when content runs out
- ✈️ **Intelligent Travel**: OpenAI selects next destinations with realistic transportation
- 🏰 **Smart City Selection**: Automatically selects small, historic towns with unique architecture
- 🏨 **Real Accommodations**: Finds actual places to stay using Google Places API
- 🍽️ **Local Cuisine**: Discovers authentic restaurants and local dishes
- 🎯 **Attractions**: Locates historical sites, museums, and points of interest
- 🔗 **Smart Links**: Automatically includes links to restaurants and attractions using Google Places API
- 📸 **Photography**: Automatically adds relevant travel images from Unsplash or generates custom images with Freepik AI
- 🌤️ **Weather Integration**: Includes real weather data in posts
- 📝 **AI Content**: Generates engaging, personal travel stories using OpenAI
- 🔄 **WordPress Publishing**: Automatically publishes to WordPress with proper formatting

## System Architecture

- **Raspberry Pi**: Runs the blog generation service
- **WordPress**: Hosted on external provider (Hostinger recommended)
- **Multiple APIs**: OpenAI, Google Places, Unsplash/Freepik, OpenWeatherMap
- **SQLite Database**: Tracks journey, posts, and visited places
- **Image Processing**: JPG format optimization for WordPress compatibility

## Installation

For Raspberry Pi deployment, see [RASPBERRY_PI_SETUP.md](RASPBERRY_PI_SETUP.md) for complete setup instructions.

### Quick Start (Development)

1. Clone this repository
2. Run the installation script: `./install.sh`
3. Configure your API keys in `.env`
4. Initialize the journey: `npm run init-journey`
5. Start the service: `npm start`

### Production Deployment (Raspberry Pi)

For production deployment on Raspberry Pi with full automation:
- See [RASPBERRY_PI_SETUP.md](RASPBERRY_PI_SETUP.md) for automated installation
- See [MANUAL_RASPBERRY_PI_INSTALL.md](MANUAL_RASPBERRY_PI_INSTALL.md) if automated install fails
- See [AUTOMATION_GUIDE.md](AUTOMATION_GUIDE.md) for automation details

## Usage

### Automatic Operation
Once configured, the system runs fully automatically:
- Posts are generated daily at 8:00 AM (configurable)
- Travels automatically every 2-3 weeks or when content runs out
- No manual intervention required

### Manual Commands (for testing/debugging)
- **Generate a post**: `npm start -- --generate-post`
- **Move to new city**: `npm run move-next`
- **Create travel post**: `npm run travel-post`
- **Check status**: `pm2 status giovanni-blog`

### Full Automation Guide
See [AUTOMATION_GUIDE.md](AUTOMATION_GUIDE.md) for complete automation details.

## API Keys Required

- OpenAI API (for content generation)
- Google Places API (for finding real places)
- **Image Provider** (choose one):
  - Unsplash API (for photo search) OR
  - Freepik API (for AI image generation)
- OpenWeatherMap API (for weather data)

## Image Provider Configuration

You can choose between Unsplash and Freepik for images by setting the `IMAGE_PROVIDER` environment variable:

### Unsplash (Default)
```bash
IMAGE_PROVIDER=unsplash
API_KEY_UNSPLASH=your_unsplash_access_key
```

### Freepik AI Generation
```bash
IMAGE_PROVIDER=freepik
API_KEY_FREEPIK=your_freepik_api_key
```

**Unsplash** searches for existing photos, while **Freepik** generates custom AI images based on text prompts. Freepik often provides more relevant and unique images for your specific travel content.

## Network Connectivity

The system includes automatic IPv4 optimization for Raspberry Pi environments. If you experience connection issues:
- IPv4 is automatically prioritized over IPv6
- 30-second timeouts for API requests
- Raspberry Pi DNS optimization included

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions welcome! Please read the contributing guidelines before submitting PRs.
