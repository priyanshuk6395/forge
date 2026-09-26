const http = require('http');

const cookieJar = [];

function makeRequest(path, method = 'GET', data = null, cookie = '') {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const options = {
      hostname: 'localhost',
      port: 80,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Forge-Client': '1',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    };

    const req = http.request(options, (res) => {
      let cookieHeader = res.headers['set-cookie'];
      if (cookieHeader) {
        cookieJar.push(...cookieHeader);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data, cookie: cookieHeader });
      });
    });

    req.on('error', (e) => reject(e));
    if (postData) req.write(postData);
    req.end();
  });
}

async function test() {
  try {
    // 1. Login
    console.log('=== LOGIN ===');
    let res = await makeRequest('/api/auth/login', 'POST', { username: 'testuser', password: 'password123' });
    console.log('Login:', res.status, res.body);
    const cookie = res.cookie ? res.cookie[0].split(';')[0] : '';
    console.log('Cookie:', cookie);

    // 2. Check auth status
    console.log('\n=== STATUS ===');
    res = await makeRequest('/api/auth/status', 'GET', null, cookie);
    console.log('Status:', res.status, res.body);

    // 2b. Test debug endpoint
    console.log('\n=== DEBUG ===');
    res = await makeRequest('/api/auth/debug', 'GET', null, cookie);
    console.log('Debug:', res.status, res.body);

    // 3. Test dashboard
    console.log('\n=== DASHBOARD ===');
    res = await makeRequest('/api/dashboard', 'GET', null, cookie);
    console.log('Dashboard:', res.status, res.body);

    // 4. Test projects
    console.log('\n=== PROJECTS ===');
    res = await makeRequest('/api/projects', 'GET', null, cookie);
    console.log('Projects:', res.status, res.body);

    // 5. Test servers
    console.log('\n=== SERVERS ===');
    res = await makeRequest('/api/servers', 'GET', null, cookie);
    console.log('Servers:', res.status, res.body);

    // 6. Test settings
    console.log('\n=== SETTINGS ===');
    res = await makeRequest('/api/settings', 'GET', null, cookie);
    console.log('Settings:', res.status, res.body);

    // 7. Test audit
    console.log('\n=== AUDIT ===');
    res = await makeRequest('/api/audit', 'GET', null, cookie);
    console.log('Audit:', res.status, res.body);

    // 8. Test health
    console.log('\n=== HEALTH ===');
    res = await makeRequest('/api/health', 'GET');
    console.log('Health:', res.status, res.body);

    // 8b. Test auth/debug
    console.log('\n=== AUTH DEBUG ===');
    res = await makeRequest('/api/auth/debug', 'GET', null, cookie);
    console.log('Auth Debug:', res.status, res.body);

  } catch (err) {
    console.error('Error:', err);
  }
}

test();