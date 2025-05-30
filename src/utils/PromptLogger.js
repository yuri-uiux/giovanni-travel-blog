/**
 * PromptLogger.js
 * 
 * Utility for logging all prompts sent to AI services (OpenAI, Freepik)
 * Helps track and analyze prompt quality and effectiveness
 */

const fs = require('fs');
const path = require('path');

class PromptLogger {
  constructor() {
    this.logsDir = process.env.LOGS_PATH || path.join(__dirname, '..', '..', 'logs');
    this.promptLogFile = path.join(this.logsDir, 'prompts.log');
    
    // Ensure logs directory exists
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
    
    // Create prompt log file if it doesn't exist
    if (!fs.existsSync(this.promptLogFile)) {
      fs.writeFileSync(this.promptLogFile, '');
    }
  }

  // Log OpenAI prompt
  logOpenAIPrompt(prompt, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'OpenAI',
      type: context.type || 'text_generation',
      model: context.model || 'gpt-3.5-turbo',
      temperature: context.temperature || 0.7,
      maxTokens: context.maxTokens || 1000,
      location: context.location || 'unknown',
      day: context.day || 'unknown',
      section: context.section || 'unknown',
      prompt: prompt.trim(),
      promptLength: prompt.length
    };

    this.writeLogEntry(logEntry);
    console.log(`📝 OpenAI prompt logged: ${context.type || 'text'} for ${context.location || 'unknown location'}`);
  }

  // Log Freepik prompt
  logFreepikPrompt(prompt, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'Freepik',
      type: context.type || 'image_generation',
      engine: context.engine || 'magnific_sharpy',
      size: context.size || 'classic_4_3',
      resolution: context.resolution || '1k',
      style: context.style || 'none',
      realism: context.realism || 'default',
      creativeDetailing: context.creativeDetailing || 'default',
      location: context.location || 'unknown',
      day: context.day || 'unknown',
      imageType: context.imageType || 'unknown',
      prompt: prompt.trim(),
      promptLength: prompt.length
    };

    this.writeLogEntry(logEntry);
    console.log(`🎨 Freepik prompt logged: ${context.imageType || 'image'} for ${context.location || 'unknown location'}`);
  }

  // Write log entry to file
  writeLogEntry(logEntry) {
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.promptLogFile, logLine);
    } catch (error) {
      console.error(`Error writing prompt log: ${error.message}`);
    }
  }

  // Get recent prompts (for analysis)
  getRecentPrompts(limit = 50, service = null) {
    try {
      const logContent = fs.readFileSync(this.promptLogFile, 'utf8');
      const lines = logContent.trim().split('\n').filter(line => line.length > 0);
      
      let prompts = lines
        .slice(-limit * 2) // Get more lines to filter
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (error) {
            return null;
          }
        })
        .filter(entry => entry !== null);

      // Filter by service if specified
      if (service) {
        prompts = prompts.filter(entry => entry.service.toLowerCase() === service.toLowerCase());
      }

      return prompts.slice(-limit);
    } catch (error) {
      console.error(`Error reading prompt log: ${error.message}`);
      return [];
    }
  }

  // Get prompt statistics
  getPromptStats(days = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const recentPrompts = this.getRecentPrompts(1000);
      const filteredPrompts = recentPrompts.filter(entry => 
        new Date(entry.timestamp) >= cutoffDate
      );

      const stats = {
        totalPrompts: filteredPrompts.length,
        openAIPrompts: filteredPrompts.filter(p => p.service === 'OpenAI').length,
        freepikPrompts: filteredPrompts.filter(p => p.service === 'Freepik').length,
        averagePromptLength: 0,
        promptTypes: {},
        locations: {},
        timeRange: {
          from: cutoffDate.toISOString(),
          to: new Date().toISOString()
        }
      };

      // Calculate average prompt length
      if (filteredPrompts.length > 0) {
        const totalLength = filteredPrompts.reduce((sum, p) => sum + p.promptLength, 0);
        stats.averagePromptLength = Math.round(totalLength / filteredPrompts.length);
      }

      // Count prompt types
      filteredPrompts.forEach(prompt => {
        const type = prompt.type || 'unknown';
        stats.promptTypes[type] = (stats.promptTypes[type] || 0) + 1;

        const location = prompt.location || 'unknown';
        stats.locations[location] = (stats.locations[location] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error(`Error calculating prompt stats: ${error.message}`);
      return null;
    }
  }

  // Clear old logs (keep only last N days)
  cleanOldLogs(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const logContent = fs.readFileSync(this.promptLogFile, 'utf8');
      const lines = logContent.trim().split('\n').filter(line => line.length > 0);
      
      const filteredLines = lines.filter(line => {
        try {
          const entry = JSON.parse(line);
          return new Date(entry.timestamp) >= cutoffDate;
        } catch (error) {
          return false; // Remove malformed lines
        }
      });

      const newContent = filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : '');
      fs.writeFileSync(this.promptLogFile, newContent);

      const removedCount = lines.length - filteredLines.length;
      console.log(`🧹 Cleaned prompt logs: removed ${removedCount} old entries, kept ${filteredLines.length}`);
      
      return { removed: removedCount, kept: filteredLines.length };
    } catch (error) {
      console.error(`Error cleaning prompt logs: ${error.message}`);
      return null;
    }
  }
}

module.exports = new PromptLogger(); 