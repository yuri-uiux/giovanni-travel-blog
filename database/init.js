const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Path to database file
const dbPath = process.env.DB_PATH || path.join(__dirname, 'giovanni.db');
const dbDir = path.dirname(dbPath);

// Check if directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create database connection
const db = new sqlite3.Database(dbPath);

// SQL for creating tables
const createTables = `
-- Create locations table
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  timezone TEXT,
  currency TEXT,
  language TEXT,
  is_current BOOLEAN DEFAULT 0,
  is_visited BOOLEAN DEFAULT 0,
  planned_arrival DATE,
  planned_departure DATE,
  planned_duration INTEGER,
  current_day INTEGER DEFAULT 1,
  order_in_journey INTEGER UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create accommodations table
CREATE TABLE IF NOT EXISTS accommodations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER,
  external_id TEXT,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  price_per_night REAL,
  currency TEXT,
  description TEXT,
  amenities TEXT,
  booking_url TEXT,
  image_urls TEXT,
  check_in_date DATE,
  check_out_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- Create points_of_interest table with website field
CREATE TABLE IF NOT EXISTS points_of_interest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER,
  external_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  description TEXT,
  highlights TEXT,
  opening_hours TEXT,
  website TEXT,
  google_maps_url TEXT,
  is_permanently_closed INTEGER DEFAULT 0,
  price_level INTEGER,
  rating REAL,
  image_urls TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- Create visits table
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poi_id INTEGER,
  visit_date DATE NOT NULL,
  notes TEXT,
  included_in_post BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poi_id) REFERENCES points_of_interest(id)
);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wp_post_id INTEGER,
  location_id INTEGER,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  type TEXT DEFAULT 'daily',
  day_number INTEGER,
  published_at TIMESTAMP,
  weather_temp REAL,
  weather_condition TEXT,
  featured_image_local_path TEXT,
  featured_image_wp_id INTEGER,
  image_credits TEXT,
  total_days INTEGER,
  total_distance INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- Create post_images table
CREATE TABLE IF NOT EXISTS post_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,
  image_local_path TEXT NOT NULL,
  image_wp_id INTEGER,
  image_wp_url TEXT,
  caption TEXT,
  alt_text TEXT,
  credit TEXT,
  display_order INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

-- Create transportation table
CREATE TABLE IF NOT EXISTS transportation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_location_id INTEGER,
  to_location_id INTEGER,
  type TEXT NOT NULL,
  company TEXT,
  departure_time TIMESTAMP,
  arrival_time TIMESTAMP,
  duration_minutes INTEGER,
  distance_km INTEGER,
  price REAL,
  currency TEXT,
  booking_reference TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_location_id) REFERENCES locations(id),
  FOREIGN KEY (to_location_id) REFERENCES locations(id)
);

-- Create api_cache table
CREATE TABLE IF NOT EXISTS api_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_name TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_data TEXT NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index for API cache
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_cache_request ON api_cache(api_name, request_hash);

-- Create used_images table for image tracking (supports both Unsplash and Freepik)
CREATE TABLE IF NOT EXISTS used_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unsplash_id TEXT,
  freepik_prompt_hash TEXT,
  freepik_prompt TEXT,
  query_type TEXT,
  url TEXT,
  image_provider TEXT DEFAULT 'unsplash',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial settings
INSERT OR IGNORE INTO settings (key, value, description)
VALUES
('journey_start_date', '2025-05-15', 'Start date of Giovanni''s journey'),
('daily_post_time', '09:00', 'Time for daily post publication'),
('posts_per_location', '14', 'Maximum number of posts per location before moving'),
('blog_title', 'Giovanni''s European Odyssey', 'Blog title'),
('blog_description', 'Journey through small towns of Eastern and Southern Europe', 'Blog description');
`;

// Execute SQL to create tables
db.serialize(() => {
  db.exec(createTables, (err) => {
    if (err) {
      console.error('Error creating tables:', err.message);
    } else {
      console.log('Tables created successfully.');
    }
  });
});

// Close connection
db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed.');
  }
});
