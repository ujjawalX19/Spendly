const http = require('http');

const API_BASE = 'http://localhost:5000/api';

const endpoints = [
  { method: 'GET', path: '/auth/me', name: 'Auth - Get Profile (Expect 401 unauth or 200)' },
  { method: 'GET', path: '/expenses', name: 'Expenses - Get All (Expect 401 unauth or 200)' },
  { method: 'GET', path: '/investments', name: 'Investments - Get Ideas (Expect 200)' },
  { method: 'GET', path: '/admin/users', name: 'Admin - Get Users (Expect 401/403 unauth or 200)' },
  { method: 'GET', path: '/groups', name: 'Groups - Get Pools (Expect 401 unauth or 200)' },
  { method: 'POST', path: '/chatbot/msg', name: 'Chatbot - Send Msg (Expect 401 unauth or 200)', body: { message: "Hello" } },
  { method: 'POST', path: '/ai/invest-advice', name: 'AI - Invest Advice (Expect 200)', body: { query: "Where to invest?" } }
];

console.log('🚀 Starting Spendly Backend Diagnostic Test...\n');

const testEndpoint = (endpoint) => {
  return new Promise((resolve) => {
    const url = new URL(API_BASE + endpoint.path);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const isSuccess = res.statusCode >= 200 && res.statusCode < 500;
        const color = isSuccess ? '\x1b[32m' : '\x1b[31m'; // Green or Red
        const reset = '\x1b[0m';
        
        console.log(`${color}[${res.statusCode}]${reset} ${endpoint.method.padEnd(5)} ${endpoint.path.padEnd(20)} => ${endpoint.name}`);
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log(`\x1b[31m[ERR]\x1b[0m ${endpoint.method.padEnd(5)} ${endpoint.path.padEnd(20)} => Connection failed. Is the server running?`);
      resolve();
    });

    if (endpoint.body) {
      req.write(JSON.stringify(endpoint.body));
    }
    
    req.end();
  });
};

const runTests = async () => {
  for (const ep of endpoints) {
    await testEndpoint(ep);
  }
  console.log('\n✅ Diagnostic run complete.');
  console.log('Note: 401/403 status codes are expected for protected endpoints when testing without a JWT token.');
};

runTests();
