const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Path to database file
const dbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'giovanni.db');

console.log('🔄 Giovanni Travel Blog - Database Update v1.2.0');
console.log('📍 Database path:', dbPath);

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error('❌ Database file not found:', dbPath);
  console.log('💡 Make sure you\'re running this from the correct directory');
  process.exit(1);
}

// Create backup first
const backupPath = dbPath.replace('.db', `_backup_${new Date().toISOString().split('T')[0]}.db`);
console.log('💾 Creating backup:', backupPath);

try {
  fs.copyFileSync(dbPath, backupPath);
  console.log('✅ Backup created successfully');
} catch (error) {
  console.error('❌ Failed to create backup:', error.message);
  process.exit(1);
}

// Create database connection
const db = new sqlite3.Database(dbPath);

// SQL for adding new weather table (safe - won't affect existing data)
const updateSQL = `
-- Create daily_weather table for storing weather data locally
CREATE TABLE IF NOT EXISTS daily_weather (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  date TEXT NOT NULL,
  temperature INTEGER NOT NULL,
  feels_like INTEGER NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  humidity INTEGER NOT NULL,
  wind_speed REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index for daily weather (one record per city/country/date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_weather_location_date ON daily_weather(city, country, date);
`;

// Execute update
db.serialize(() => {
  console.log('🔧 Adding daily_weather table...');
  
  db.exec(updateSQL, (err) => {
    if (err) {
      console.error('❌ Error updating database:', err.message);
      console.log('🔄 You can restore from backup:', backupPath);
    } else {
      console.log('✅ Database updated successfully!');
      console.log('📊 New table "daily_weather" added');
      
      // Verify the update
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_weather'", (err, row) => {
        if (err) {
          console.error('❌ Error verifying update:', err.message);
        } else if (row) {
          console.log('✅ Verification: daily_weather table exists');
          
          // Show existing tables to confirm nothing was lost
          db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
            if (err) {
              console.error('❌ Error listing tables:', err.message);
            } else {
              console.log('📋 All tables in database:');
              tables.forEach(table => {
                console.log(`   - ${table.name}`);
              });
              
              console.log('\n🎉 Database update completed successfully!');
              console.log('💡 Your existing data is safe and unchanged');
              console.log('🗂️  Backup saved as:', backupPath);
            }
          });
        } else {
          console.error('❌ Verification failed: daily_weather table not found');
        }
      });
    }
  });
});

// Close connection after a delay to allow all operations to complete
setTimeout(() => {
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err.message);
    } else {
      console.log('🔒 Database connection closed');
    }
  });
}, 2000); 