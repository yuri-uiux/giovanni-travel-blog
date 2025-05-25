module.exports = {
  apps: [
    {
      name: "giovanni-blog",
      script: "app.js",
      watch: false,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-output.log",
      restart_delay: 10000,
      max_restarts: 10,
      autorestart: true
    }
  ]
};
