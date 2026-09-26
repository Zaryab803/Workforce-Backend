const BASE = 'http://localhost:4000/api/v1';

async function run() {
  const loginRes = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' },
    body: JSON.stringify({ email: 'admin@workforce.com', password: 'admin123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.accessToken;
  if (!token) {
    console.error('Failed to log in:', loginData);
    process.exit(1);
  }
  console.log('Logged in successfully!');

  const headers = { 'Authorization': 'Bearer ' + token, 'X-CSRF-Protection': '1' };

  const endpoints = [
    { name: 'Auth Me', url: '/auth/me' },
    { name: 'Dashboard', url: '/dashboard' },
    { name: 'Tasks List', url: '/tasks' },
    { name: 'Teams List', url: '/teams' },
    { name: 'Users List', url: '/users' },
    { name: 'Audit Logs', url: '/audit-logs' },
    { name: 'Notifications', url: '/notifications' },
    { name: 'Lookups', url: '/lookups' },
  ];

  let sampleTaskId = null;
  let sampleTeamId = null;
  let sampleUserId = null;

  for (const ep of endpoints) {
    try {
      const res = await fetch(BASE + ep.url, { headers });
      const json = await res.json();
      const status = res.status;
      console.log(`${ep.name} (${ep.url}): status ${status}, success: ${json.success}`);
      if (!json.success) {
        console.error('  Error details:', json);
      }
      const items = Array.isArray(json.data) ? json.data : (json.data?.items || []);
      if (ep.url === '/tasks' && items[0]) sampleTaskId = items[0].id;
      if (ep.url === '/teams' && items[0]) sampleTeamId = items[0].id;
      if (ep.url === '/users' && items[0]) sampleUserId = items[0].id;
    } catch (e) {
      console.error(`${ep.name} (${ep.url}) FAILED:`, e.message);
    }
  }

  console.log('\nChecking Details routes:');
  if (sampleTaskId) {
    const res = await fetch(BASE + '/tasks/' + sampleTaskId, { headers });
    const json = await res.json();
    console.log(`Task Detail (${sampleTaskId}): status ${res.status}, success: ${json.success}`);
    if (!json.success) console.error('  Error:', json);
  }
  if (sampleTeamId) {
    const res = await fetch(BASE + '/teams/' + sampleTeamId, { headers });
    const json = await res.json();
    console.log(`Team Detail (${sampleTeamId}): status ${res.status}, success: ${json.success}`);
    if (!json.success) console.error('  Error:', json);
  }
  if (sampleUserId) {
    const res = await fetch(BASE + '/users/' + sampleUserId, { headers });
    const json = await res.json();
    console.log(`User Detail (${sampleUserId}): status ${res.status}, success: ${json.success}`);
    if (!json.success) console.error('  Error:', json);
  }
}

run();
