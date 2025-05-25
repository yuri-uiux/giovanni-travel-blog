#!/bin/bash
# giovanni.sh - Script for managing the Giovanni blog service

cd ~/giovanni-blog

case "$1" in
    start)
        pm2 start app.js --name giovanni-blog
        echo "Giovanni's blog service started"
        ;;
    stop)
        pm2 stop giovanni-blog
        echo "Giovanni's blog service stopped"
        ;;
    restart)
        pm2 restart giovanni-blog
        echo "Giovanni's blog service restarted"
        ;;
    status)
        pm2 status giovanni-blog
        ;;
    logs)
        pm2 logs giovanni-blog
        ;;
    post)
        node test.js
        echo "Creating new post..."
        ;;
    move)
        node move_to_next_location.js
        echo "Moving to a new location..."
        ;;
    backup)
        ./backup.sh
        echo "Backup created"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|post|move|backup}"
        exit 1
        ;;
esac

exit 0
