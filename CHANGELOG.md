# Changelog

All notable changes to Giovanni's Travel Blog will be documented in this file.

## [1.1.0] - 2025-05-25

### Added
- **Smart Links**: Automatic link generation for restaurants and attractions using Google Places API
- Links include official websites when available, or Google Maps links as fallback
- Status indicators for temporarily closed places
- Enhanced content with clickable location links

### Fixed
- Corrected data property references in OpenAIService (data.current_day → data.location.current_day)

### Documentation
- Updated README.md with Smart Links feature
- Cleaned up redundant documentation files

## [1.0.0] - 2025-05-24

### Initial Release
- ✅ Fully automated travel blog system
- ✅ Daily post generation with cron scheduling  
- ✅ Automatic city-to-city travel every 2-3 weeks
- ✅ Real accommodation finding via Google Places API
- ✅ Local restaurant and attraction discovery
- ✅ Dual image provider support (Unsplash/Freepik)
- ✅ Weather integration
- ✅ WordPress publishing with proper formatting
- ✅ SQLite database for journey tracking
- ✅ Raspberry Pi optimized deployment
- ✅ Complete automation with PM2 process management

### Features
- Smart city selection for Eastern/Southern Europe
- Realistic transportation routes
- IPv4 optimization for Raspberry Pi
- Comprehensive error handling and logging
- Manual override commands for testing
- Backup and restore functionality 