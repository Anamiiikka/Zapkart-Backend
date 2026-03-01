/**
 * Load-test benchmark script for Zapkart backend.
 *
 * Usage:  node scripts/benchmark.js
 *
 * Prerequisites:
 *   - Server running with RATE_LIMIT_MAX=0 (disabled) :
 *       RATE_LIMIT_MAX=0 node src/server.js
 *   - Redis + Postgres running
 *   - At least one product & store seeded
 */

const autocannon = require('autocannon');
const http = require('http');

const BASE = 'http://localhost:3000';

// ── helpers ─────────────────────────────────────────────────────────
function login(email, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password });
    const req = http.request(
      `${BASE}/api/v1/auth/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.data?.accessToken) resolve(parsed.data.accessToken);
            else reject(new Error(`Login failed: ${data}`));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

function runBench(title, opts) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${title}`);
    console.log('='.repeat(60));

    const instance = autocannon(opts, (err, result) => {
      if (err) console.error(err);
      resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: true });
  });
}

function summary(r) {
  console.log(`\n  Requests/sec  avg: ${r.requests.average}  | total: ${r.requests.total}`);
  console.log(`  Latency (ms)  avg: ${r.latency.average}  | p99: ${r.latency.p99}`);
  console.log(`  Throughput    avg: ${(r.throughput.average / 1024).toFixed(0)} KB/s`);
  console.log(`  Errors:       ${r.errors}  | Timeouts: ${r.timeouts}`);
  console.log(`  Non-2xx:      ${r.non2xx}\n`);
}

// ── main ────────────────────────────────────────────────────────────
(async () => {
  console.log('\n🏁 Zapkart Load-Test Benchmark');
  console.log('─'.repeat(40));

  // 1) Get tokens
  let customerToken;
  try {
    customerToken = await login('customer@example.com', 'Test@123');
    console.log('✔ Customer token acquired');
  } catch (e) {
    console.error('✖ Customer login failed:', e.message);
    process.exit(1);
  }

  let adminToken;
  try {
    adminToken = await login('admin@example.com', 'Admin@123');
    console.log('✔ Admin token acquired');
  } catch (e) {
    console.error('✖ Admin login failed:', e.message);
    process.exit(1);
  }

  // ── Benchmark 1: GET /health (no auth, no DB) ────────────────────
  const healthResult = await runBench('Benchmark 1 — GET /health  (baseline, no DB)', {
    url: `${BASE}/health`,
    connections: 100,
    pipelining: 10,
    duration: 10,
  });
  summary(healthResult);

  // ── Benchmark 2: GET /products (cached, auth required) ───────────
  const productsResult = await runBench('Benchmark 2 — GET /api/v1/products  (Redis-cached)', {
    url: `${BASE}/api/v1/products`,
    connections: 100,
    pipelining: 10,
    duration: 15,
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  summary(productsResult);

  // ── Benchmark 3: GET /stores (cached) ────────────────────────────
  const storesResult = await runBench('Benchmark 3 — GET /api/v1/stores  (Redis-cached)', {
    url: `${BASE}/api/v1/stores`,
    connections: 50,
    pipelining: 5,
    duration: 10,
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  summary(storesResult);

  // ── Benchmark 4: GET /admin/analytics (complex aggregation) ──────
  const analyticsResult = await runBench('Benchmark 4 — GET /admin/analytics  (DB aggregation)', {
    url: `${BASE}/api/v1/admin/analytics`,
    connections: 20,
    pipelining: 1,
    duration: 10,
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  summary(analyticsResult);

  // ── Benchmark 5: POST /orders (full write path) ──────────────────
  const orderBody = JSON.stringify({
    items: [{ productId: 1, quantity: 1 }],
    deliveryAddress: 'Bench Test Address',
    latitude: 28.6139,
    longitude: 77.209,
  });

  const ordersResult = await runBench('Benchmark 5 — POST /api/v1/orders  (write, full pipeline)', {
    url: `${BASE}/api/v1/orders`,
    method: 'POST',
    connections: 10,
    pipelining: 1,
    duration: 10,
    headers: {
      Authorization: `Bearer ${customerToken}`,
      'Content-Type': 'application/json',
    },
    body: orderBody,
  });
  summary(ordersResult);

  // ── Final Summary ────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  📊 BENCHMARK SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Health (baseline)     ${healthResult.requests.average} req/s   p99: ${healthResult.latency.p99} ms`);
  console.log(`  Products (cached)     ${productsResult.requests.average} req/s   p99: ${productsResult.latency.p99} ms`);
  console.log(`  Stores (cached)       ${storesResult.requests.average} req/s   p99: ${storesResult.latency.p99} ms`);
  console.log(`  Analytics (DB agg)    ${analyticsResult.requests.average} req/s   p99: ${analyticsResult.latency.p99} ms`);
  console.log(`  Orders (write)        ${ordersResult.requests.average} req/s   p99: ${ordersResult.latency.p99} ms`);
  console.log('═'.repeat(60));

  const totalErrors = healthResult.errors + productsResult.errors + storesResult.errors + analyticsResult.errors + ordersResult.errors;
  console.log(`  Total errors: ${totalErrors}`);
  console.log(`  Status: ${totalErrors === 0 ? '✅ PRODUCTION READY' : '⚠️  Errors detected'}`);
  console.log('═'.repeat(60) + '\n');

  process.exit(0);
})();
