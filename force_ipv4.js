// Force IPv4 configuration for Node.js
// This should be required at the top of main scripts to force IPv4 usage

const dns = require('dns');

// Force IPv4 for all DNS lookups
dns.setDefaultResultOrder('ipv4first');

// Override axios defaults if axios is available
try {
  const axios = require('axios');
  axios.defaults.family = 4; // Force IPv4
  axios.defaults.timeout = 30000; // 30 second timeout
  console.log('✅ Forced IPv4 for axios requests');
} catch (e) {
  // axios not installed yet, skip
}

module.exports = {
  forceIPv4: true,
  timeout: 30000
}; 