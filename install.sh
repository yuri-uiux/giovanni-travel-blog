#!/bin/bash

# Giovanni's Travel Blog - Installation Script
# This script automates the installation process

echo "==== Giovanni's Travel Blog Installer ===="
echo "This script will install all necessary components for Giovanni's Travel Blog system"

# Check if running on Raspberry Pi
if [ ! -f /etc/rpi-issue ] && [ ! -f /proc/device-tree/model ]; then
    echo "Warning: This system does not appear to be a Raspberry Pi."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "Node.js is already installed."
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "Node.js version is below 16. Upgrading..."
    curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 process manager..."
    sudo npm install -g pm2
else
    echo "PM2 is already installed."
fi

# Create project directory
PROJECT_DIR="$HOME/giovanni-blog"
echo "Creating project directory: $PROJECT_DIR"
mkdir -p $PROJECT_DIR

# Clone files from the current directory to project directory
echo "Copying project files..."
cp -r ./* $PROJECT_DIR/

# Set executable permissions
echo "Setting execute permissions..."
chmod +x $PROJECT_DIR/*.sh
chmod +x $PROJECT_DIR/*.js

# Navigate to project directory
cd $PROJECT_DIR

# Create necessary directories
echo "Creating directory structure..."
mkdir -p {logs,temp/images,temp/cache,database}

# Install dependencies
echo "Installing Node.js dependencies..."
npm install

# Create .env file from template if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating initial .env file..."
    cp .env.template .env
    echo "Please edit the .env file to add your API keys and WordPress credentials"
fi

# Initialize database
echo "Initializing database..."
node database/init.js

echo "==== Installation Complete ===="
echo ""
echo "Next steps:"
echo "1. Edit the .env file with your API keys and WordPress credentials:"
echo "   nano $PROJECT_DIR/.env"
echo ""
echo "2. Initialize the journey:"
echo "   cd $PROJECT_DIR && node src/utils/initJourneyDynamic.js"
echo ""
echo "3. Run a test post:"
echo "   cd $PROJECT_DIR && node test.js"
echo ""
echo "4. Set up the service to start automatically:"
echo "   cd $PROJECT_DIR && pm2 start app.js --name giovanni-blog"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "Documentation is available in the docs directory."
