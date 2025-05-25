#!/bin/bash
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="$HOME/backups"
PROJECT_DIR="$HOME/giovanni-blog"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp $PROJECT_DIR/database/giovanni.db $BACKUP_DIR/giovanni-$DATE.db

# Delete old backups (keep only last 10)
ls -t $BACKUP_DIR/giovanni-*.db | tail -n +11 | xargs rm -f

# Clean logs if they're too large
find $PROJECT_DIR/logs -size +50M -exec truncate -s 1M {} \;

# Clean cache if files are older than 30 days
find $PROJECT_DIR/temp/cache -mtime +30 -exec rm {} \;

# Report
echo "Backup completed: $BACKUP_DIR/giovanni-$DATE.db"
echo "Old backups cleaned up, keeping 10 most recent"
echo "Large logs truncated"
echo "Old cache files removed"
