const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
try {
  const content = fs.readFileSync(envPath, 'utf8');
  console.log('--- .env.local content ---');
  console.log(content);
  console.log('--------------------------');
} catch (e) {
  console.error('Error reading .env.local:', e.message);
}
