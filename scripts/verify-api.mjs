const BASE = "http://127.0.0.1:4000";

async function testAll() {
  console.log("=== Testing API Endpoints on " + BASE + " ===");
  const results = [];

  // 1. Health
  try {
    const res = await fetch(`${BASE}/health`);
    const data = await res.json();
    results.push({ endpoint: "GET /health", status: res.status, ok: res.ok, summary: JSON.stringify(data) });
  } catch (err) {
    results.push({ endpoint: "GET /health", status: "ERR", ok: false, summary: err.message });
  }

  // 2. Ready (tests DB query)
  try {
    const res = await fetch(`${BASE}/ready`);
    const data = await res.json();
    results.push({ endpoint: "GET /ready (DB connectivity)", status: res.status, ok: res.ok, summary: JSON.stringify(data) });
  } catch (err) {
    results.push({ endpoint: "GET /ready", status: "ERR", ok: false, summary: err.message });
  }

  // 3. Login
  let token = null;
  try {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Protection": "1",
        "Origin": "http://localhost:3000",
      },
      body: JSON.stringify({ email: "admin@orbit.demo", password: "Demo123!" }),
    });
    const data = await res.json();
    token = data?.data?.accessToken || data?.accessToken;
    results.push({
      endpoint: "POST /api/v1/auth/login",
      status: res.status,
      ok: res.ok && !!token,
      summary: token ? `Authenticated as ${data?.data?.user?.email || "Admin"}` : JSON.stringify(data),
    });
  } catch (err) {
    results.push({ endpoint: "POST /api/v1/auth/login", status: "ERR", ok: false, summary: err.message });
  }

  if (!token) {
    console.error("Login failed, aborting authenticated endpoint checks.");
    console.table(results);
    return;
  }

  const authHeaders = {
    "Authorization": `Bearer ${token}`,
    "X-CSRF-Protection": "1",
    "Origin": "http://localhost:3000",
  };

  const endpoints = [
    { method: "GET", path: "/api/v1/auth/me", label: "GET /api/v1/auth/me (Current User)" },
    { method: "GET", path: "/api/v1/lookups", label: "GET /api/v1/lookups (Dropdown & Filter Data)" },
    { method: "GET", path: "/api/v1/users", label: "GET /api/v1/users (Users List)" },
    { method: "GET", path: "/api/v1/employees", label: "GET /api/v1/employees (Employee Directory)" },
    { method: "GET", path: "/api/v1/teams", label: "GET /api/v1/teams (Teams)" },
    { method: "GET", path: "/api/v1/projects", label: "GET /api/v1/projects (Projects)" },
    { method: "GET", path: "/api/v1/tasks", label: "GET /api/v1/tasks (Tasks List)" },
    { method: "GET", path: "/api/v1/dashboard", label: "GET /api/v1/dashboard (Metrics & Summary)" },
    { method: "GET", path: "/api/v1/notifications", label: "GET /api/v1/notifications (Notifications)" },
    { method: "GET", path: "/api/v1/audit-logs", label: "GET /api/v1/audit-logs (Audit Trail)" },
    { method: "GET", path: "/api/v1/roles", label: "GET /api/v1/roles (Roles)" },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE}${ep.path}`, {
        method: ep.method,
        headers: authHeaders,
      });
      const data = await res.json();
      let summary = "";
      if (Array.isArray(data?.data)) {
        summary = `Array of ${data.data.length} items`;
      } else if (Array.isArray(data?.data?.items)) {
        summary = `Paginated: ${data.data.items.length} items (total ${data.data.total ?? "?"})`;
      } else if (data?.data && typeof data.data === "object") {
        summary = `Object keys: ${Object.keys(data.data).join(", ")}`;
      } else {
        summary = JSON.stringify(data).slice(0, 60);
      }
      results.push({
        endpoint: ep.label,
        status: res.status,
        ok: res.ok,
        summary,
      });
    } catch (err) {
      results.push({
        endpoint: ep.label,
        status: "ERR",
        ok: false,
        summary: err.message,
      });
    }
  }

  console.log("\n--- TEST RESULTS ---");
  for (const r of results) {
    const icon = r.ok ? "✓ [PASS]" : "✗ [FAIL]";
    console.log(`${icon} (${r.status}) ${r.endpoint.padEnd(45)} -> ${r.summary}`);
  }
}

testAll().catch(console.error);
