# Giovanni's Travel Blog - Full Automation

## How the System Works

Giovanni's Travel Blog system is now **fully automated** and operates according to the following scheme:

### 🕒 Daily Cycle (every day at 8:00 AM)

1. **Location Status Check** - the system determines if Giovanni needs to move to a new location
2. **Decision Making**:
   - If needs to move → automatic relocation + travel post
   - If staying → regular post about current city

### 📍 Conditions for Moving

Giovanni moves to a new city if **any** of the following conditions are met:

1. **Planned duration expired** - `current_day >= planned_duration` (10-14 days)
2. **Maximum reached** - `current_day >= MAX_DAYS_PER_LOCATION` (21 days)
3. **Attractions exhausted** - all places visited and minimum `MIN_DAYS_PER_LOCATION` (7 days) passed

### 🚗 Relocation Process (fully automatic)

1. **City Selection** - OpenAI selects the next city from priority countries
2. **Route Calculation** - determines transport (bus/train/airplane) based on distance
3. **Database Update** - saves new location and transportation information
4. **Post Generation** - creates travel post describing the journey
5. **Publishing** - post is automatically published to WordPress

### 📝 Post Types

**Regular Posts** (most days):
- Accommodation (Booking.com/Airbnb)
- Local cuisine (restaurants and shops)
- Attractions
- Multiple images from Unsplash/Freepik

**Travel Posts** (travel days):
- Description of the journey from city to city
- Transportation impressions
- Landscapes along the way
- First impressions of the new city
- Single transportation/road image

## ⚙️ Automation Settings

In the `.env` file you can configure:

```bash
# Post generation schedule (cron format)
POST_GENERATION_CRON=0 8 * * *

# Minimum days of stay (even if attractions are exhausted)
MIN_DAYS_PER_LOCATION=7

# Maximum days of stay (forced relocation)
MAX_DAYS_PER_LOCATION=21
```

## 🗺️ Travel Route

**Priority Countries**: Serbia, Croatia, Italy, Montenegro, Bulgaria, Hungary, Greece, Romania, North Macedonia, Czech Republic

**Additional Countries**: Austria, Slovenia, Albania, Poland, Slovakia

OpenAI selects the next country logically (neighboring/nearby countries) considering transportation connections.

## 🚀 Launching Automation

### Initial Setup:

```bash
# 1. Initialize journey (once)
npm run init-journey

# 2. Start automatic system
npm start
# or via PM2
pm2 start ecosystem.config.js
```

### Testing Operations:

```bash
# Manual post generation (for testing)
npm start -- --generate-post

# Manual relocation (for testing)
npm run move-next

# Manual travel post (for testing)
npm run travel-post
```

## 📊 Monitoring

Logs are saved in:
- `logs/combined.log` - all logs
- `logs/error.log` - errors only
- `logs/pm2-output.log` - PM2 output
- `logs/pm2-error.log` - PM2 errors

Status checking:
```bash
pm2 status
pm2 logs giovanni-blog
```

## 🔄 Lifecycle

1. **Days 1-6**: Regular posts about the city
2. **Day 7+**: Check - if attractions are exhausted, move
3. **Days 10-14**: Planned relocation (random duration)
4. **Day 21**: Forced relocation (if stayed too long)

## 🛠️ Troubleshooting

### System stuck in one city:
```bash
npm run move-next
```

### No posts for several days:
```bash
pm2 restart giovanni-blog
npm start -- --generate-post
```

### Errors in logs:
```bash
pm2 logs giovanni-blog --lines 50
```

## ✅ Result

After setup, the system works **completely autonomously**:
- ✅ Daily posts without user intervention
- ✅ Automatic relocations every 2-3 weeks
- ✅ Travel posts on relocation days
- ✅ Realistic routes with real transportation
- ✅ Diverse content (accommodation, food, attractions)
- ✅ Adaptive logic (moves earlier if content is exhausted)

The system will work for months without intervention, creating an authentic travel blog about Giovanni's journey through Eastern and Southern Europe. 