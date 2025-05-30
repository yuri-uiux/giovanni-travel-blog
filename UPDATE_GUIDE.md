# 🔄 Giovanni Travel Blog - Update Guide

## Manual Update Process

### 1. Stop System
```bash
cd ~/giovanni-travel-blog
pm2 stop giovanni-blog
# or if not using PM2
pkill -f "node app.js"
```

### 2. Backup Database
```bash
cp database/giovanni.db database/giovanni_backup_$(date +%Y%m%d_%H%M%S).db
```

### 3. Update Code
```bash
git stash
git pull origin main
npm install
```

### 4. Update Database (if needed)
```bash
node update_database_v1_2.js
```

### 5. Create Logs Directory
```bash
mkdir -p logs
```

### 6. Restart System
```bash
pm2 start ecosystem.config.js
# or if not using PM2
npm start
```

## New Features in v1.2.1

### 🎨 Enhanced Writing Style
Your blog posts will now be much more conversational and personal:
- Casual, friendly tone like talking to a friend
- Humor and personality in descriptions
- Honest opinions about places and food
- Local insider knowledge and tips

### 📊 Prompt Logging
Track all AI prompts sent to OpenAI and Freepik:
```bash
# View recent prompts
npm run view-logs recent 10

# See statistics
npm run view-logs stats 7

# Search for specific content
npm run view-logs search "Belgrade"

# Clean old logs
npm run view-logs clean 30
```

### 🔗 Website Integration
Restaurant and attraction prompts now include website URLs for better context and accuracy.

## Troubleshooting

### If Update Fails
1. Check you're in the right directory: `pwd` should show `~/giovanni-travel-blog`
2. Make sure Git is clean: `git status`
3. Check internet connection: `ping github.com`
4. Restore from backup if needed: `cp database/giovanni_backup_*.db database/giovanni.db`

### If System Won't Start
1. Check logs: `pm2 logs giovanni-blog` or `tail -f logs/app.log`
2. Test Node.js: `node -e "console.log('test')"`
3. Check .env file: `cat .env` (make sure all API keys are present)
4. Restart manually: `npm start`

## Support

If you encounter issues:
1. Check the logs first
2. Try the manual update process
3. Restore from database backup if needed
4. Contact support with error messages

---

**Happy blogging! 🌍✈️** 