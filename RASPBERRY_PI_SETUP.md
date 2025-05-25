# Giovanni's Travel Blog - Raspberry Pi Clean Installation Guide

## Prerequisites

- Raspberry Pi 4 (recommended) or Raspberry Pi 3B+
- MicroSD card (32GB+ recommended)
- Internet connection
- SSH access enabled

## Step 1: Fresh Raspberry Pi OS Installation

### 1.1 Flash Raspberry Pi OS
```bash
# Use Raspberry Pi Imager or flash Raspberry Pi OS Lite (64-bit)
# Enable SSH and set username/password during setup
```

### 1.2 First Boot Setup
```bash
# SSH into your Raspberry Pi
ssh pi@your-raspberry-pi-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y git curl wget nano htop
```

## Step 2: Install Node.js

### 2.1 Install Node.js 18+ (Required)
```bash
# Install Node.js using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be 18.x or higher
npm --version
```

### 2.2 Install PM2 Process Manager
```bash
sudo npm install -g pm2
pm2 startup
# Follow the instructions to enable PM2 on boot
```

## Step 3: Clone and Setup Project

### 3.1 Clone Repository
```bash
# Navigate to home directory
cd ~

# Clone the project
git clone https://github.com/yuri-uiux/giovanni-travel-blog.git
cd giovanni-travel-blog

# Make scripts executable
chmod +x install.sh giovanni.sh backup.sh
```

### 3.2 Run Raspberry Pi Optimized Installation Script
```bash
# IMPORTANT: Use the Raspberry Pi optimized script instead of install.sh
chmod +x install-raspberry-pi.sh
./install-raspberry-pi.sh

# This optimized script will:
# - Temporarily increase swap space for compilation
# - Install packages individually to avoid memory issues
# - Use pre-compiled binaries when possible
# - Handle Sharp and SQLite3 compilation issues
# - Restore swap configuration after installation
```

## Step 4: Configure Environment

### 4.1 Create Environment File
```bash
# Copy example configuration
cp env.example .env

# Edit configuration with your API keys
nano .env
```

### 4.2 Required API Keys Configuration

Fill in the following in your `.env` file:

```bash
# Database (default path is fine)
DB_PATH=./database/giovanni.db

# Image Storage (default paths are fine)
IMAGE_STORAGE_PATH=./temp/images
CACHE_PATH=./temp/cache

# Image Provider (choose one)
IMAGE_PROVIDER=unsplash
# IMAGE_PROVIDER=freepik

# API Keys (REQUIRED - get from respective services)
API_KEY_UNSPLASH=your_unsplash_access_key_here
# API_KEY_FREEPIK=your_freepik_api_key_here
API_KEY_OPENAI=your_openai_api_key_here
API_KEY_GOOGLE=your_google_api_key_here
API_KEY_OPENWEATHER=your_openweather_api_key_here

# WordPress Configuration (REQUIRED)
WP_URL=https://your-blog-domain.com
WP_USERNAME=your_wordpress_username
WP_APPLICATION_PASSWORD=your_wordpress_app_password
AUTHOR_NAME=Giovanni

# Scheduling (8 AM daily)
POST_GENERATION_CRON=0 8 * * *
TZ=Europe/Belgrade

# Travel Settings
MIN_DAYS_PER_LOCATION=7
MAX_DAYS_PER_LOCATION=21

# Blog Settings
BLOG_TITLE=Giovanni's European Odyssey
BLOG_DESCRIPTION=Journey through small towns of Eastern and Southern Europe

# Freepik Settings (if using Freepik)
FREEPIK_IMAGE_SIZE=classic_4_3
FREEPIK_IMAGE_RESOLUTION=1k
FREEPIK_ENGINE=magnific_sharpy

# Environment
NODE_ENV=production
LOG_LEVEL=info
```

## Step 5: Initialize Journey

### 5.1 Setup Database and First Location
```bash
# Initialize Giovanni's journey
npm run init-journey

# This will:
# - Create database tables
# - Generate first location in Serbia
# - Setup initial journey data
```

## Step 6: Test the System

### 6.1 Test WordPress Connection
```bash
# Test manual post generation
npm start -- --generate-post

# Check logs for any errors
tail -f logs/combined.log
```

### 6.2 Test Travel System
```bash
# Test moving to next location (optional)
npm run move-next

# Test travel post generation (optional)
npm run travel-post
```

## Step 7: Start Production Service

### 7.1 Start with PM2
```bash
# Start the service
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Check status
pm2 status
pm2 logs giovanni-blog
```

### 7.2 Monitor the System
```bash
# Check PM2 status
pm2 status

# View logs (real-time)
pm2 logs giovanni-blog

# View recent logs
pm2 logs giovanni-blog --lines 50

# Restart if needed
pm2 restart giovanni-blog
```

## Step 8: Verify Automation

### 8.1 Check Cron Schedule
```bash
# The system should automatically:
# - Generate posts daily at 8:00 AM
# - Check if Giovanni needs to move
# - Handle automatic travel when needed

# Monitor first automated run
pm2 logs giovanni-blog --lines 100
```

### 8.2 WordPress Verification
- Check your WordPress site
- Verify posts are being published
- Check that images are being uploaded
- Confirm proper categorization

## Troubleshooting

### Common Issues and Solutions

#### 1. NPM Installation Taking Too Long (45+ minutes)
```bash
# Stop the current installation
Ctrl+C

# Clean everything
rm -rf node_modules package-lock.json
npm cache clean --force

# Use the optimized Raspberry Pi script
./install-raspberry-pi.sh

# If still having issues, install packages one by one:
npm install dotenv axios winston cron
npm install sqlite3 --build-from-source=false
npm install sharp@0.32.6 --platform=linux --arch=arm64
```

#### 2. API Connection Issues
```bash
# Check network connectivity
ping google.com

# Test specific API endpoints
curl -I https://api.openai.com/v1/models
```

#### 3. WordPress Connection Problems
```bash
# Test WordPress API
curl -u "username:app_password" https://your-site.com/wp-json/wp/v2/posts
```

#### 4. Image Service Issues
```bash
# Check image directory permissions
ls -la temp/images/
sudo chown -R pi:pi temp/
```

#### 5. Database Issues
```bash
# Check database file
ls -la database/
# If needed, reinitialize
rm database/giovanni.db
npm run init-journey
```

#### 6. Service Won't Start
```bash
# Check logs
pm2 logs giovanni-blog

# Restart service
pm2 restart giovanni-blog

# Check system resources
htop
df -h
```

## Maintenance

### Daily Monitoring
```bash
# Check system status
pm2 status
df -h  # Check disk space
```

### Weekly Tasks
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Restart service (if needed)
pm2 restart giovanni-blog
```

### Backup
```bash
# Run backup script
./backup.sh

# Backup will be created in backup_YYYY-MM-DD/ directory
```

## Expected Behavior

After successful setup:

1. **8:00 AM Daily**: System automatically checks if Giovanni should move
2. **Regular Days**: Posts about accommodation, food, or attractions
3. **Travel Days**: Automatic relocation + travel post generation
4. **Duration**: 7-21 days per location depending on available content
5. **Route**: Intelligent selection of next cities in Eastern/Southern Europe

## System Requirements Met

- ✅ Fully automated operation
- ✅ Daily posts at 8:00 AM
- ✅ Automatic travel every 2-3 weeks
- ✅ Travel posts on moving days
- ✅ Realistic transportation routes
- ✅ No manual intervention required

The system will run autonomously for months, creating authentic travel content about Giovanni's journey through small towns of Eastern and Southern Europe. 