/* ============================================================
   Zapkart · Dark-Store Operations Simulator — client logic
   Plain ES module, no build step. Talks to the real backend API,
   logs every request, and drives the full order lifecycle live.
   ============================================================ */

const API = '/api/v1';
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STAGES = [
  { key: 'pending',          label: 'Pending',          color: '#b9c2cf' },
  { key: 'confirmed',        label: 'Confirmed',        color: '#57b6ff' },
  { key: 'assigned',         label: 'Assigned',         color: '#9b8cff' },
  { key: 'picking',          label: 'Picking',          color: '#e7b53c' },
  { key: 'out_for_delivery', label: 'Out for delivery', color: '#c6f135' },
  { key: 'delivered',        label: 'Delivered',        color: '#4bbf87' },
];
const STAGE_COLOR = Object.fromEntries(STAGES.map((s) => [s.key, s.color]));

const ACCOUNTS = {
  customer: { email: 'customer@example.com', password: 'password123' },
  admin:    { email: 'admin@example.com',    password: 'password123' },
  agent:    { email: 'agent@example.com',    password: 'password123' },
};

const state = {
  tokens: { customer: null, admin: null, agent: null },
  users:  { customer: null, admin: null, agent: null },
  products: [],
  orders: [],
  agents: [],
  prevStatus: {},
  throughput: [],
  running: false,
};

/* ─────────────── API + activity log ─────────────── */

const logEntries = [];
let logSeq = 0;

async function api(method, path, { token, body, silent } = {}) {
  const url = /^\/(api|health|ready)\b/.test(path) ? path : API + path;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    if (!silent) pushLog(method, url, 0, Math.round(performance.now() - t0));
    throw new Error('Network error — backend unreachable');
  }
  const ms = Math.round(performance.now() - t0);
  let payload = null;
  try { payload = await res.json(); } catch { /* no body */ }
  if (!silent) pushLog(method, url, res.status, ms, res.headers.get('X-Cache'));

  if (!res.ok) {
    const err = (payload && payload.error) || {};
    const e = new Error(err.message || `HTTP ${res.status}`);
    e.status = res.status; e.code = err.code;
    throw e;
  }
  return payload;
}

function pushLog(method, url, status, ms, cache) {
  logSeq += 1;
  logEntries.unshift({ id: logSeq, method, url, status, ms, cache });
  if (logEntries.length > 160) logEntries.pop();
  renderLog();
}

function renderLog() {
  const body = $('logBody');
  if (!logEntries.length) return;
  const rows = logEntries.map((e) => {
    const p = e.url.replace(/^\/api\/v1/, '').replace(/^\/api/, '') || '/';
    const sc = e.status ? String(e.status)[0] : '0';
    return `<div class="logline">
      <span class="verb ${e.method}">${e.method}</span>
      <span class="lp" title="${esc(e.url)}">${esc(p)}</span>
      <span class="lms">${e.ms}ms${e.cache ? ' · ' + e.cache : ''}</span>
      <span class="lst s${sc}">${e.status || 'ERR'}</span>
    </div>`;
  }).join('');
  body.innerHTML = rows;

  const total = logEntries.length;
  const ok = logEntries.filter((e) => e.status >= 200 && e.status < 400).length;
  const avg = Math.round(logEntries.reduce((a, e) => a + e.ms, 0) / total);
  $('logTotal').textContent = total;
  $('logOk').textContent = ok;
  $('logAvg').textContent = avg + 'ms';
}

$('clearLogBtn').onclick = () => {
  logEntries.length = 0;
  $('logBody').innerHTML = '<div class="log-empty">Cleared.<br/>New requests will stream in here.</div>';
  $('logTotal').textContent = 0; $('logOk').textContent = 0; $('logAvg').textContent = '0ms';
};

/* ─────────────── toasts ─────────────── */
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="ic"></span>${esc(msg)}`;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

/* ─────────────── boot ─────────────── */
async function boot() {
  setEngine('warn', 'linking…');
  startClock();

  // 1. readiness
  try {
    const r = await api('GET', '/ready', { silent: true });
    setEngine(r.checks?.database ? 'ok' : 'warn', r.checks?.database ? 'online' : 'degraded');
  } catch {
    setEngine('bad', 'offline');
  }

  // 2. sign in the three seeded roles so the console can drive every flow
  try {
    for (const role of ['customer', 'admin', 'agent']) {
      const res = await api('POST', '/auth/login', { body: ACCOUNTS[role] });
      state.tokens[role] = res.data.accessToken;
      state.users[role] = res.data.user;
    }
  } catch (e) {
    banner(`Couldn't sign in the demo accounts (${esc(e.message)}). The database may not be seeded yet — run <span class="mono">npm run seed</span> against it.`);
    setEngine('bad', 'no auth');
    return;
  }
  banner(null);

  // 3. catalog
  try {
    const prods = await api('GET', '/products?pageSize=50', {});
    state.products = prods.data.items || [];
  } catch { /* non-fatal */ }

  // 4. first paint + polling
  await refresh();
  setInterval(() => { if (!state.running) refresh().catch(() => {}); }, 5000);
}

function banner(html) {
  const el = $('bootBanner');
  if (!html) { el.style.display = 'none'; return; }
  el.className = 'banner banner--err';
  el.innerHTML = html;
  el.style.display = 'flex';
}

/* ─────────────── data refresh + render ─────────────── */
async function refresh() {
  if (!state.tokens.admin) return;
  const [ordersRes, agentsRes] = await Promise.all([
    // /admin/orders returns a bare array enriched with customer_name, store_name
    // and agent_name (unlike /orders/admin/all which only carries agent_id).
    api('GET', '/admin/orders?pageSize=100', { token: state.tokens.admin }),
    api('GET', '/admin/agents', { token: state.tokens.admin }),
  ]);
  state.orders = Array.isArray(ordersRes.data) ? ordersRes.data : (ordersRes.data?.items || []);
  state.agents = Array.isArray(agentsRes.data) ? agentsRes.data : (agentsRes.data?.items || []);
  renderAll();
}

function renderAll() {
  renderBoard();
  renderFleet();
  renderKPIs();
  renderReadout();
  renderThroughput();
  // remember statuses for change-flash next render
  const map = {};
  for (const o of state.orders) map[o.id] = o.status;
  state.prevStatus = map;
}

function renderReadout() {
  const active = state.orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  const delivered = state.orders.filter((o) => o.status === 'delivered');
  const freeAgents = state.agents.filter((a) => a.status === 'available').length;
  const revenue = delivered.reduce((a, o) => a + Number(o.total_amount || 0), 0);
  const surge = active.reduce((m, o) => Math.max(m, Number(o.surge_multiplier || 1)), 1);

  $('mLive').textContent = active.length;
  $('mDelivered').textContent = delivered.length;
  $('mAgents').textContent = `${freeAgents}/${state.agents.length}`;
  $('mRevenue').textContent = '₹' + Math.round(revenue).toLocaleString('en-IN');
  $('mSurge').textContent = surge.toFixed(2).replace(/0$/, '') + '×';
}

function renderKPIs() {
  const total = state.orders.length;
  const active = state.orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;
  const delivered = state.orders.filter((o) => o.status === 'delivered').length;
  const revenue = state.orders.filter((o) => o.status === 'delivered').reduce((a, o) => a + Number(o.total_amount || 0), 0);
  const kpis = [
    { label: 'Orders placed', value: total, sub: 'all-time this session' },
    { label: 'In pipeline', value: active, sub: 'not yet delivered' },
    { label: 'Delivered', value: delivered, sub: 'completed runs' },
    { label: 'Revenue', value: '₹' + Math.round(revenue).toLocaleString('en-IN'), sub: 'delivered GMV', accent: true },
  ];
  $('kpis').innerHTML = kpis.map((k) => `
    <div class="kpi">
      <div class="label">${k.label}</div>
      <div class="value${k.accent ? ' accent' : ''}">${k.value}</div>
      <div class="sub">${k.sub}</div>
    </div>`).join('');
}

function renderBoard() {
  const byStage = Object.fromEntries(STAGES.map((s) => [s.key, []]));
  for (const o of state.orders) if (byStage[o.status]) byStage[o.status].push(o);

  const cancelled = state.orders.filter((o) => o.status === 'cancelled').length;
  $('boardSub').textContent = `${state.orders.length} orders${cancelled ? ` · ${cancelled} cancelled` : ''}`;

  $('board').innerHTML = STAGES.map((s) => {
    const items = byStage[s.key];
    const tickets = items.length
      ? items.map((o) => ticketHTML(o, s.color)).join('')
      : `<div class="lane-empty">—</div>`;
    return `<div class="lane">
      <div class="lane-head">
        <span class="sdot" style="background:${s.color}"></span>
        <span class="lt">${s.label}</span>
        <span class="ln">${items.length}</span>
      </div>
      <div class="lane-body">${tickets}</div>
    </div>`;
  }).join('');
}

function ticketHTML(o, color) {
  const changed = state.prevStatus[o.id] && state.prevStatus[o.id] !== o.status;
  const agent = o.agent_name
    ? `<span class="t-agent"><span class="adot"></span>${esc(o.agent_name)}</span>`
    : `<span class="t-noagent">unassigned</span>`;
  const eta = o.estimated_delivery_minutes ? `${o.estimated_delivery_minutes}m ETA` : '';
  return `<div class="ticket${changed ? ' flash' : ''}" style="--stage:${color}">
    <div class="t-top">
      <span class="t-id">#${o.id}</span>
      <span class="t-amt">₹${Math.round(Number(o.total_amount || 0))}</span>
    </div>
    <div class="t-meta">
      <span class="t-cust">${esc(o.customer_name || 'customer')}</span>
      ${eta ? `<span class="sep">·</span><span class="t-eta">${eta}</span>` : ''}
    </div>
    <div class="t-foot">${agent}</div>
  </div>`;
}

function renderFleet() {
  $('fleetSub').textContent = `${state.agents.length} agents`;
  if (!state.agents.length) { $('fleet').innerHTML = `<div class="lane-empty" style="padding:20px">No agents</div>`; return; }
  $('fleet').innerHTML = state.agents.map((a) => {
    const inits = (a.name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const load = a.active_orders ?? 0;
    return `<div class="fleet-row">
      <span class="fleet-av">${esc(inits)}</span>
      <div>
        <div class="fleet-name">${esc(a.name)}</div>
        <div class="fleet-store">${esc(a.store_name || 'store')}</div>
      </div>
      <span class="fleet-load">${load} active</span>
      <span class="pill ${a.status}"><span class="pd"></span>${esc(a.status)}</span>
    </div>`;
  }).join('');
}

function renderThroughput() {
  const active = state.orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;
  state.throughput.push(active);
  if (state.throughput.length > 28) state.throughput.shift();
  const max = Math.max(4, ...state.throughput);
  const bars = state.throughput.map((v, i) => {
    const h = Math.round((v / max) * 100);
    const hot = i === state.throughput.length - 1 ? ' hot' : '';
    return `<div class="bar${hot}" style="height:${Math.max(3, h)}%" title="${v} in pipeline"></div>`;
  }).join('');
  $('bars').innerHTML = bars || '';
  $('tpLegend').innerHTML = `<span>${state.throughput.length} ticks ago</span><span>now · ${active} active</span>`;
}

/* ─────────────── simulation actions ─────────────── */

function randomCart() {
  if (!state.products.length) return [{ productId: 1, quantity: 1 }];
  const pool = [...state.products];
  const n = 1 + Math.floor(Math.random() * 3);
  const items = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const p = pool.splice(idx, 1)[0];
    // API returns ids as strings; the order schema requires a numeric productId.
    items.push({ productId: Number(p.id), quantity: 1 + Math.floor(Math.random() * 3) });
  }
  return items;
}

async function placeOne() {
  const res = await api('POST', '/orders', { token: state.tokens.customer, body: { items: randomCart() } });
  return res.data;
}

async function placeWave(n) {
  let placed = 0, surge = 1;
  for (let i = 0; i < n; i++) {
    try {
      const o = await placeOne();
      placed++;
      surge = Math.max(surge, Number(o.surgeMultiplier || 1));
      await refresh();
      await sleep(160);
    } catch (e) {
      toast(`Order failed: ${e.message}`, 'err');
    }
  }
  return { placed, surge };
}

// Advance every order one step: pending→confirm, confirmed→auto-assign, else next status.
async function advanceOnePass() {
  const tasks = [];
  for (const o of state.orders) {
    if (o.status === 'pending') {
      tasks.push(api('PATCH', `/orders/${o.id}/status`, { token: state.tokens.admin, body: { status: 'confirmed' } }).catch(() => {}));
    } else if (o.status === 'confirmed') {
      tasks.push(api('POST', `/orders/${o.id}/auto-assign`, { token: state.tokens.admin, silent: false }).catch(() => {}));
    } else {
      const next = { assigned: 'picking', picking: 'out_for_delivery', out_for_delivery: 'delivered' }[o.status];
      if (next) tasks.push(api('PATCH', `/orders/${o.id}/status`, { token: state.tokens.admin, body: { status: next } }).catch(() => {}));
    }
  }
  await Promise.allSettled(tasks);
}

function setBusy(busy) {
  state.running = busy;
  ['runCycleBtn', 'placeWaveBtn', 'placeOneBtn', 'dispatchBtn', 'advanceBtn'].forEach((id) => { $(id).disabled = busy; });
}

$('placeOneBtn').onclick = async () => {
  setBusy(true);
  try { const o = await placeOne(); await refresh(); toast(`Order #${o.id} placed · matched to ${o.store?.name || 'store'}`); }
  catch (e) { toast(e.message, 'err'); }
  finally { setBusy(false); }
};

$('placeWaveBtn').onclick = async () => {
  const n = Math.max(1, Math.min(20, Number($('waveSize').value) || 6));
  setBusy(true);
  try { const { placed, surge } = await placeWave(n); toast(`Placed ${placed} orders · surge ${surge.toFixed(2)}×`); }
  finally { setBusy(false); }
};

$('dispatchBtn').onclick = async () => {
  setBusy(true);
  try {
    const targets = state.orders.filter((o) => o.status === 'pending' || o.status === 'confirmed');
    let done = 0;
    for (const o of targets) {
      if (o.status === 'pending') {
        await api('PATCH', `/orders/${o.id}/status`, { token: state.tokens.admin, body: { status: 'confirmed' } }).catch(() => {});
      }
      try { await api('POST', `/orders/${o.id}/auto-assign`, { token: state.tokens.admin }); done++; }
      catch { /* no free agent — expected under load */ }
    }
    await refresh();
    toast(done ? `Dispatched ${done} order(s) to agents` : 'No free agents to dispatch to', done ? 'ok' : 'info');
  } finally { setBusy(false); }
};

$('advanceBtn').onclick = async () => {
  setBusy(true);
  try { await advanceOnePass(); await refresh(); toast('Advanced pipeline by one stage'); }
  finally { setBusy(false); }
};

$('runCycleBtn').onclick = async () => {
  const n = Math.max(1, Math.min(20, Number($('waveSize').value) || 6));
  setBusy(true);
  try {
    toast(`Running full cycle · ${n} orders`, 'info');
    const { surge } = await placeWave(n);
    if (surge > 1) toast(`Surge pricing engaged at ${surge.toFixed(2)}×`, 'info');
    let guard = 0;
    while (guard++ < 50) {
      await refresh();
      const active = state.orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
      if (!active.length) break;
      await advanceOnePass();
      await sleep(700);
    }
    await refresh();
    const delivered = state.orders.filter((o) => o.status === 'delivered').length;
    toast(`Cycle complete · ${delivered} orders delivered`, 'ok');
  } catch (e) {
    toast(`Cycle stopped: ${e.message}`, 'err');
  } finally { setBusy(false); }
};

/* ─────────────── capability check ─────────────── */
const CHECKS = [
  { name: 'Readiness probe', run: async () => { const r = await api('GET', '/ready', {}); return r.checks?.database ? 'db online' : 'db degraded'; } },
  { name: 'Auth · login', run: async () => { const r = await api('POST', '/auth/login', { body: ACCOUNTS.customer }); return r.data.user.role; } },
  { name: 'Product catalog', run: async () => { const r = await api('GET', '/products?pageSize=50', {}); return `${r.data.pagination?.total ?? r.data.items.length} products`; } },
  { name: 'Store matching (PostGIS)', run: async () => { const u = state.users.customer; const r = await api('GET', `/stores/nearest?lat=${u.latitude}&lng=${u.longitude}`, {}); const dist = r.data.distance_meters ?? r.data.distanceMeters; return `${r.data.name}${dist != null ? ` · ${Math.round(dist)}m` : ''}`; } },
  { name: 'Place order + surge', run: async () => { const r = await api('POST', '/orders', { token: state.tokens.customer, body: { items: randomCart() } }); window.__lastOrder = r.data.id; return `#${r.data.id} · ${r.data.surgeMultiplier}× surge`; } },
  { name: 'Live tracking', run: async () => { const id = window.__lastOrder; const r = await api('GET', `/orders/${id}/track`, { token: state.tokens.customer }); return `status: ${r.data.status}`; } },
  { name: 'Auto-assign agent', run: async () => { const id = window.__lastOrder; const r = await api('POST', `/orders/${id}/auto-assign`, { token: state.tokens.admin }); return `→ ${r.data.assignedAgent?.name || 'agent'}`; } },
  { name: 'Agent dashboard', run: async () => { const r = await api('GET', '/agents/orders', { token: state.tokens.agent }); return `${r.count ?? (r.data?.length || 0)} assigned`; } },
  { name: 'Admin analytics', run: async () => { const r = await api('GET', '/admin/analytics', { token: state.tokens.admin }); return `${r.data.summary.total_orders} orders aggregated`; } },
];

$('checkBtn').onclick = async () => {
  const ul = $('checklist');
  $('checkBtn').disabled = true;
  ul.innerHTML = CHECKS.map((c, i) => `<li id="chk${i}" class="run"><span class="cbox">·</span>${esc(c.name)}<span class="cms"></span></li>`).join('');
  for (let i = 0; i < CHECKS.length; i++) {
    const li = $('chk' + i);
    const t0 = performance.now();
    try {
      const detail = await CHECKS[i].run();
      const ms = Math.round(performance.now() - t0);
      li.className = 'pass';
      li.querySelector('.cbox').textContent = '✓';
      li.querySelector('.cms').textContent = `${detail} · ${ms}ms`;
    } catch (e) {
      li.className = 'fail';
      li.querySelector('.cbox').textContent = '✕';
      li.querySelector('.cms').textContent = e.message;
    }
    await sleep(120);
  }
  const passed = ul.querySelectorAll('li.pass').length;
  toast(`Capability check · ${passed}/${CHECKS.length} passed`, passed === CHECKS.length ? 'ok' : 'err');
  $('checkBtn').disabled = false;
  await refresh();
};

/* ─────────────── engine + clock ─────────────── */
function setEngine(kind, label) {
  const led = $('engineLed');
  led.className = 'led ' + (kind === 'ok' ? 'ok pulse' : kind === 'bad' ? 'bad' : 'warn');
  $('engineLabel').textContent = label;
}
function startClock() {
  const tick = () => { $('clock').textContent = new Date().toLocaleTimeString('en-GB'); };
  tick(); setInterval(tick, 1000);
}

boot();
