# Giovanni's Travel Blog - Manual Raspberry Pi Installation

This guide provides step-by-step manual installation instructions for Raspberry Pi to avoid script issues.

## Prerequisites Verification

```bash
# Check Node.js version (must be 18+)
node --version
npm --version

# Check available memory and disk space
free -h
df -h

# Check current location
pwd  # Should be in ~/giovanni-travel-blog
```

## Step 1: Network Configuration (Fix IPv6 Issues)

```bash
# Configure npm to use IPv4 only (fixes timeout issues)
npm config set registry https://registry.npmjs.org/
npm config set prefer-online true

# Force IPv4 for npm
echo "registry=https://registry.npmjs.org/" > ~/.npmrc
echo "prefer-online=true" >> ~/.npmrc
```

## Step 2: Increase Swap Space

```bash
# Stop current swap
sudo dphys-swapfile swapoff

# Increase swap to 1GB for compilation
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile

# Recreate swap file
sudo dphys-swapfile setup
sudo dphys-swapfile swapon

# Verify swap is active
free -h
```

## Step 3: Clean Previous Installation Attempts

```bash
# Remove any partial installations
rm -rf node_modules package-lock.json

# Clean npm cache
npm cache clean --force

# Create necessary directories
mkdir -p logs temp/images temp/cache database

# Create .gitkeep files
touch temp/images/.gitkeep
touch temp/cache/.gitkeep  
touch logs/.gitkeep
```

## Step 4: Install Dependencies Manually (Core Packages)

Install packages one by one to avoid memory issues:

```bash
# Basic utility packages (quick installs)
npm install dotenv@16.3.1
npm install axios@1.6.2
npm install winston@3.11.0
npm install cron@3.1.6
npm install moment@2.29.4
npm install node-cache@5.1.2
npm install form-data@4.0.0
```

## Step 5: Install SQLite3 (Database)

```bash
# Try to install pre-compiled SQLite3 first
npm install sqlite3@5.1.6 --build-from-source=false

# If that fails, install from source (takes longer)
# npm install sqlite3@5.1.6

# Install SQLite wrapper
npm install sqlite@5.1.1
```

## Step 6: Install Sharp (Image Processing) - Most Problematic

```bash
# Option 1: Try Sharp 0.33 with platform specification
npm install sharp@0.33.0 --platform=linux --arch=arm64

# If Option 1 fails, try older version with better ARM support
npm install sharp@0.32.6

# If both fail, try without image optimization (temporary solution)
# npm install sharp@0.32.1 --ignore-engines
```

## Step 7: Install Remaining Packages

```bash
# Web scraping and utilities
npm install cheerio@1.0.0-rc.12
npm install axios-retry@3.5.0

# Built-in Node.js modules (usually quick)
npm install path@0.12.7
npm install crypto@1.0.1

# WordPress API client
npm install wpapi@1.2.2
```

## Step 8: Verify Installation

```bash
# Check if all packages installed
npm list --depth=0

# Look for any missing packages or errors
echo "Installation verification complete"
```

## Step 9: Initialize Database

```bash
# Run database initialization
node database/init.js

# Verify database was created
ls -la database/
```

## Step 10: Restore Original Swap

```bash
# Restore original swap size
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=100/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon

# Verify swap restored
free -h
```

## Step 11: Set Permissions

```bash
# Make scripts executable
chmod +x *.sh

# Set directory permissions
chmod 755 temp temp/images temp/cache logs database
```

## Step 12: Configure Environment

```bash
# Copy environment template
cp env.example .env

# Edit with your API keys
nano .env
```

### Required Configuration in .env:

```bash
# Database
DB_PATH=./database/giovanni.db

# Image Provider (start with Unsplash - easier)
IMAGE_PROVIDER=unsplash
API_KEY_UNSPLASH=your_unsplash_access_key_here

# OpenAI (required)
API_KEY_OPENAI=your_openai_api_key_here

# Google Places (required)
API_KEY_GOOGLE=your_google_api_key_here

# Weather (required)
API_KEY_OPENWEATHER=your_openweather_api_key_here

# WordPress (required)
WP_URL=https://your-blog-domain.com
WP_USERNAME=your_wordpress_username
WP_APPLICATION_PASSWORD=your_wordpress_app_password
AUTHOR_NAME=Giovanni

# Scheduling
POST_GENERATION_CRON=0 8 * * *
TZ=Europe/Belgrade

# Travel settings
MIN_DAYS_PER_LOCATION=7
MAX_DAYS_PER_LOCATION=21

# Environment
NODE_ENV=production
LOG_LEVEL=info
```

## Step 13: Initialize Journey

```bash
# Initialize Giovanni's journey
npm run init-journey

# This should output information about the first city
```

## Step 14: Test Installation

```bash
# Test manual post generation
npm start -- --generate-post

# Check logs for errors
tail -f logs/combined.log
```

## Step 15: Start Production Service

```bash
# Install PM2 if not already installed
sudo npm install -g pm2

# Start the service
pm2 start ecosystem.config.js

# Enable startup on boot
pm2 startup
pm2 save

# Check status
pm2 status
pm2 logs giovanni-blog
```

## Troubleshooting Common Issues

### 1. Sharp Installation Fails
```bash
# Use older Sharp version
npm uninstall sharp
npm install sharp@0.32.1 --ignore-engines

# Or skip Sharp optimization temporarily
# The system will work without image optimization
```

### 2. SQLite3 Compilation Fails
```bash
# Install system dependencies
sudo apt install build-essential python3-dev

# Try rebuilding
npm rebuild sqlite3
```

### 3. Network Timeouts
```bash
# Use different npm registry
npm config set registry https://registry.yarnpkg.com/

# Or use yarn instead
sudo npm install -g yarn
yarn install
```

### 4. Out of Memory During Installation
```bash
# Increase swap further if needed
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### 5. Permission Errors
```bash
# Fix npm permissions
sudo chown -R giovanni:giovanni ~/.npm
sudo chown -R giovanni:giovanni node_modules
```

## Expected Result

After successful installation:
- ✅ All dependencies installed
- ✅ Database initialized with first location
- ✅ PM2 service running
- ✅ System ready for automatic operation
- ✅ Posts will generate daily at 8:00 AM

Total installation time: **15-30 minutes** depending on internet speed and hardware. 