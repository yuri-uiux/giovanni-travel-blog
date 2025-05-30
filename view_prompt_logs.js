/**
 * View Prompt Logs
 * 
 * Script to view and analyze logged prompts from OpenAI and Freepik
 */

const PromptLogger = require('./src/utils/PromptLogger');
require('dotenv').config();

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function truncatePrompt(prompt, maxLength = 100) {
  if (prompt.length <= maxLength) return prompt;
  return prompt.substring(0, maxLength) + '...';
}

async function viewPromptLogs() {
  console.log('📝 Giovanni Travel Blog - Prompt Logs Viewer\n');
  
  // Get command line arguments
  const args = process.argv.slice(2);
  const command = args[0] || 'recent';
  const limit = parseInt(args[1]) || 20;
  const service = args[2] || null;
  
  try {
    switch (command) {
      case 'recent':
        console.log(`📋 Recent ${limit} prompts${service ? ` (${service} only)` : ''}:\n`);
        const recentPrompts = PromptLogger.getRecentPrompts(limit, service);
        
        if (recentPrompts.length === 0) {
          console.log('No prompts found in logs.');
          return;
        }
        
        recentPrompts.forEach((prompt, index) => {
          console.log(`${index + 1}. [${formatTimestamp(prompt.timestamp)}] ${prompt.service}`);
          console.log(`   Type: ${prompt.type} | Location: ${prompt.location} | Day: ${prompt.day}`);
          
          if (prompt.service === 'OpenAI') {
            console.log(`   Model: ${prompt.model} | Section: ${prompt.section}`);
          } else if (prompt.service === 'Freepik') {
            console.log(`   Engine: ${prompt.engine} | Image: ${prompt.imageType} | Size: ${prompt.size}`);
          }
          
          console.log(`   Prompt: "${truncatePrompt(prompt.prompt)}"`);
          console.log(`   Length: ${prompt.promptLength} chars\n`);
        });
        break;
        
      case 'stats':
        const days = parseInt(args[1]) || 7;
        console.log(`📊 Prompt Statistics (Last ${days} days):\n`);
        
        const stats = PromptLogger.getPromptStats(days);
        if (!stats) {
          console.log('Error calculating statistics.');
          return;
        }
        
        console.log(`Total Prompts: ${stats.totalPrompts}`);
        console.log(`OpenAI Prompts: ${stats.openAIPrompts}`);
        console.log(`Freepik Prompts: ${stats.freepikPrompts}`);
        console.log(`Average Prompt Length: ${stats.averagePromptLength} characters\n`);
        
        console.log('📈 Prompt Types:');
        Object.entries(stats.promptTypes)
          .sort(([,a], [,b]) => b - a)
          .forEach(([type, count]) => {
            console.log(`   ${type}: ${count}`);
          });
        
        console.log('\n🌍 Locations:');
        Object.entries(stats.locations)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10) // Top 10 locations
          .forEach(([location, count]) => {
            console.log(`   ${location}: ${count}`);
          });
        
        console.log(`\n📅 Time Range: ${formatTimestamp(stats.timeRange.from)} to ${formatTimestamp(stats.timeRange.to)}`);
        break;
        
      case 'search':
        const searchTerm = args[1];
        if (!searchTerm) {
          console.log('Please provide a search term.');
          return;
        }
        
        console.log(`🔍 Searching for prompts containing: "${searchTerm}"\n`);
        const allPrompts = PromptLogger.getRecentPrompts(1000);
        const matchingPrompts = allPrompts.filter(prompt => 
          prompt.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
          prompt.location.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (matchingPrompts.length === 0) {
          console.log('No matching prompts found.');
          return;
        }
        
        matchingPrompts.slice(0, limit).forEach((prompt, index) => {
          console.log(`${index + 1}. [${formatTimestamp(prompt.timestamp)}] ${prompt.service} - ${prompt.type}`);
          console.log(`   Location: ${prompt.location} | Day: ${prompt.day}`);
          console.log(`   Prompt: "${truncatePrompt(prompt.prompt, 150)}"`);
          console.log('');
        });
        
        console.log(`Found ${matchingPrompts.length} matching prompts (showing first ${Math.min(limit, matchingPrompts.length)})`);
        break;
        
      case 'clean':
        const daysToKeep = parseInt(args[1]) || 30;
        console.log(`🧹 Cleaning old prompt logs (keeping last ${daysToKeep} days)...\n`);
        
        const cleanResult = PromptLogger.cleanOldLogs(daysToKeep);
        if (cleanResult) {
          console.log(`✅ Cleanup completed: removed ${cleanResult.removed} entries, kept ${cleanResult.kept} entries`);
        } else {
          console.log('❌ Error during cleanup');
        }
        break;
        
      case 'help':
      default:
        console.log('📖 Usage:');
        console.log('  node view_prompt_logs.js recent [limit] [service]  - View recent prompts');
        console.log('  node view_prompt_logs.js stats [days]             - Show statistics');
        console.log('  node view_prompt_logs.js search <term> [limit]    - Search prompts');
        console.log('  node view_prompt_logs.js clean [days]             - Clean old logs');
        console.log('  node view_prompt_logs.js help                     - Show this help');
        console.log('');
        console.log('Examples:');
        console.log('  node view_prompt_logs.js recent 10 openai        - Last 10 OpenAI prompts');
        console.log('  node view_prompt_logs.js stats 14                - Statistics for last 14 days');
        console.log('  node view_prompt_logs.js search "Belgrade"        - Search for Belgrade prompts');
        console.log('  node view_prompt_logs.js clean 7                 - Keep only last 7 days');
        break;
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

// Run the script
viewPromptLogs(); 