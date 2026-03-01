# 🛒 Zapkart — Dark Store Delivery Platform

**High-performance quick-commerce backend powering instant grocery delivery with intelligent store matching, surge pricing, and zero inventory conflicts**

> Node.js &nbsp;|&nbsp; PostgreSQL + PostGIS &nbsp;|&nbsp; Redis &nbsp;|&nbsp; Docker &nbsp;|&nbsp; ISC License

---

## 📊 Performance Highlights

### Benchmark Results (autocannon · 10s · 10 connections)

| Endpoint | Requests/sec | Latency (avg) | Total Requests | Status |
|----------|-------------|---------------|----------------|--------|
| `GET /health` | **16,818** | 0.54ms | 168k+ | ✅ Baseline |
| `GET /api/v1/products` | **16,612** | 0.55ms | 166k+ | ✅ Redis cached |
| `GET /api/v1/stores` | **14,424** | 0.63ms | 144k+ | ✅ Redis cached |
| `GET /admin/analytics` | **8,606** | 1.10ms | 86k+ | ✅ DB aggregation |
| `POST /api/v1/orders` | **8,329** | 1.14ms | 83k+ | ✅ Full pipeline |

> **0 errors** across all stages. All non-2xx responses are from rate limiting (by design).

### System Capabilities

| Metric | Value | Status |
|--------|-------|--------|
| **Inventory Locking** | Optimistic (version field) | ✅ Zero oversells |
| **Store Matching** | PostGIS KNN + composite scoring | ✅ O(log n + k) |
| **Agent Assignment** | PostGIS GIST KNN + workload | ✅ O(log n) |
| **Surge Pricing** | Tiered (1.0×–1.5×) | ✅ Real-time |
| **Redis Caching** | Cache-aside with X-Cache headers | ✅ Sub-ms reads |
| **Rate Limiting** | 3-layer (global · auth · order) | ✅ DDoS-safe |
| **Connection Pool** | 20 max connections | ✅ Tuned |
| **Auth** | JWT + refresh token rotation | ✅ Secure |
| **Concurrency** | Row-level + optimistic locking | ✅ ACID-safe |

---

## 🎯 Project Overview

A **production-ready** backend API for a dark-store quick-commerce platform that:

- 🔍 **Matches customers to the best dark store** using PostGIS spatial queries with composite scoring (70% distance + 30% load)
- 📦 **Manages inventory** with optimistic locking — zero oversells, even under concurrent orders
- 🚴 **Auto-assigns delivery agents** via PostGIS proximity + workload balancing
- 💰 **Calculates dynamic surge pricing** based on real-time store order volume
- 🔐 **Secures all endpoints** with JWT authentication, role-based access control, and refresh token rotation
- 📈 **Scales horizontally** with Redis caching layer and connection pooling

---

## 🏗️ Tech Stack

### Backend
| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js 20.x |
| **Framework** | Express.js 4.19.2 |
| **Language** | JavaScript (ES6+, CommonJS) |
| **Validation** | Zod 4.x (schemas + env validation) |
| **Logging** | Pino (structured JSON, pino-pretty in dev) |
| **Security** | Helmet, express-rate-limit, bcrypt |

### Database
| Component | Technology |
|-----------|-----------|
| **Primary** | PostgreSQL 16 (Alpine) |
| **Extension** | PostGIS 3.x (spatial queries, KNN) |
| **Driver** | pg 8.18 + pg Pool |
| **Pool** | Max 20 connections, 30s idle timeout |

### Caching
| Component | Technology |
|-----------|-----------|
| **Primary** | Redis 7 (Alpine) via ioredis |
| **Fallback** | In-memory Map (dev/test mode) |
| **Toggle** | `REDIS_ENABLED` env flag |

### DevOps
| Component | Technology |
|-----------|-----------|
| **Containerization** | Docker + Docker Compose |
| **Testing** | Jest 30 + Supertest 7 |
| **Load Testing** | autocannon 8.x |
| **Process** | Graceful shutdown (SIGTERM/SIGINT) |

---

## 📁 Project Structure

```
zapkart-backend/
├── db/
│   ├── seed.js                          # Test data seeder
│   └── migrations/
│       ├── init.sql                     # Full schema + triggers
│       ├── add_indexes.sql              # Performance indexes
│       ├── agents.sql                   # Agent table extensions
│       ├── add_agent_to_orders.sql      # Agent-order linking
│       └── postgis_agents.sql           # Agent GIST spatial index + trigger
├── docs/
│   └── README-notes.md                  # Architecture notes
├── scripts/
│   ├── benchmark.js                     # autocannon load test suite (5-stage)
│   ├── migrate-status-history.js        # Status history migration
│   └── resetAdminPassword.js            # Admin password reset utility
├── src/
│   ├── app.js                           # Express app setup
│   ├── server.js                        # Server bootstrap + graceful shutdown
│   ├── config/
│   │   ├── db.js                        # PostgreSQL pool + query helper
│   │   ├── env.js                       # Zod-validated environment
│   │   ├── logger.js                    # Pino structured logger
│   │   └── redis.js                     # Redis client + health check
│   ├── controllers/
│   │   ├── authController.js            # Auth endpoints
│   │   ├── productController.js         # Product catalog
│   │   ├── storeController.js           # Dark store management
│   │   ├── inventoryController.js       # Inventory ops
│   │   ├── orderController.js           # Order lifecycle
│   │   └── agentController.js           # Agent management
│   ├── middleware/
│   │   ├── auth.js                      # JWT auth + RBAC
│   │   ├── validate.js                  # Zod request validation
│   │   ├── errorHandler.js              # Unified error responses
│   │   ├── requestLogger.js             # Request ID + duration logging
│   │   └── rateLimit.js                 # Route-specific rate limiters
│   ├── models/
│   │   ├── userModel.js                 # User CRUD + agent linking
│   │   ├── productModel.js              # Product catalog queries
│   │   ├── storeModel.js               # Store + PostGIS queries
│   │   ├── inventoryModel.js            # Inventory + optimistic locking
│   │   ├── orderModel.js               # Order + items + status history
│   │   ├── agentModel.js               # Agent CRUD + availability
│   │   └── refreshTokenModel.js         # Token storage + rotation
│   ├── routes/
│   │   ├── healthRoutes.js              # /health + /ready
│   │   ├── authRoutes.js                # Auth endpoints
│   │   ├── productRoutes.js             # Product endpoints
│   │   ├── storeRoutes.js               # Store endpoints
│   │   ├── inventoryRoutes.js           # Inventory endpoints
│   │   ├── orderRoutes.js               # Order endpoints
│   │   └── agentRoutes.js               # Agent endpoints
│   ├── services/
│   │   ├── authService.js               # Auth logic + token rotation
│   │   ├── productService.js            # Product search + pagination
│   │   ├── storeService.js              # Store CRUD + nearest lookup
│   │   ├── storeMatchingService.js      # Smart store matching engine
│   │   ├── inventoryService.js          # Stock management
│   │   ├── orderService.js              # Full order lifecycle
│   │   └── agentService.js              # Agent management
│   └── utils/
│       ├── errors.js                    # Error class hierarchy
│       ├── jwt.js                       # JWT sign/verify helpers
│       └── cache.js                     # Redis / in-memory cache
├── tests/
│   ├── health.test.js                   # Health endpoint tests
│   ├── auth/
│   │   ├── auth.integration.test.js     # Full auth flow tests
│   │   └── jwt.unit.test.js             # JWT utility tests
│   └── services/
│       ├── orderService.test.js         # Order service unit tests
│       └── storeMatching.service.test.js # Store matching tests
├── docker-compose.yml                   # App + Postgres + Redis
├── Dockerfile                           # Production container
├── jest.config.js                       # Test configuration
└── package.json
```

---

## 🚀 Quick Start

### One-Command Setup (Docker)

```bash
# Start everything — app, PostgreSQL, Redis
docker-compose up -d

# Wait for services to be healthy (~20s)
docker-compose ps

# Seed test data
npm run seed
```

### Manual Setup

```bash
# 1. Install dependencies
npm install

# 2. Start database + Redis
docker-compose up -d postgres redis

# Wait ~15 seconds for DB readiness

# 3. Initialize database schema
npm run db:migrate

# 4. Seed test data
npm run seed

# 5. Start development server
npm run dev
```

### Available Scripts

```bash
npm run start          # Production server
npm run dev            # Development with nodemon
npm run test           # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run seed           # Seed test data
npm run db:migrate     # Run SQL migrations
node scripts/benchmark.js  # Run load tests (autocannon)
```

---

## 🧪 API Reference

### Quick Test

```bash
# Health check
curl http://localhost:3000/health

# Readiness (DB + Redis)
curl http://localhost:3000/ready
```

### 🔐 Authentication — `/api/v1/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/auth/register` | — | Register new user |
| `POST` | `/api/v1/auth/login` | — | Login → access + refresh tokens |
| `POST` | `/api/v1/auth/refresh` | — | Rotate refresh token |
| `POST` | `/api/v1/auth/logout` | — | Revoke single refresh token |
| `POST` | `/api/v1/auth/logout-all` | 🔒 User | Revoke ALL refresh tokens |
| `GET` | `/api/v1/auth/me` | 🔒 User | Get current profile |

### 📦 Products — `/api/v1/products`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/products` | — | List products (search, category, pagination) |
| `GET` | `/api/v1/products/:id` | — | Get product by ID |

### 🏪 Dark Stores — `/api/v1/stores`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/stores/nearest` | — | Find nearest store (lat, lng) |
| `GET` | `/api/v1/stores/:id` | — | Get store by ID |
| `GET` | `/api/v1/stores` | 🔒 Admin | List all stores |
| `POST` | `/api/v1/stores` | 🔒 Admin | Create store |

### 📋 Inventory — `/api/v1/stores/:storeId/inventory`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/stores/:storeId/inventory` | — | Get store inventory |
| `PATCH` | `/api/v1/stores/:storeId/inventory/:productId` | 🔒 Admin | Restock product |

### 🛍️ Orders — `/api/v1/orders`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/orders` | 🔒 User | Place order (auto store matching + surge pricing) |
| `GET` | `/api/v1/orders` | 🔒 User | List my orders |
| `GET` | `/api/v1/orders/:id` | 🔒 User | Get order details |
| `POST` | `/api/v1/orders/:id/cancel` | 🔒 User | Cancel own order |
| `PATCH` | `/api/v1/orders/:id/status` | 🔒 Admin/Agent | Update order status |
| `PATCH` | `/api/v1/orders/:id/assign-agent` | 🔒 Admin | Manually assign agent |
| `POST` | `/api/v1/orders/:id/auto-assign` | 🔒 Admin | Auto-assign nearest agent |
| `PATCH` | `/api/v1/orders/:id/next-status` | 🔒 Agent | Advance to next status |
| `GET` | `/api/v1/orders/:id/agent-details` | 🔒 User | Get order with agent info |
| `GET` | `/api/v1/orders/agent/my-orders` | 🔒 Agent | Agent's assigned orders |
| `GET` | `/api/v1/orders/admin/all` | 🔒 Admin | All orders (filters + pagination) |

### 🚴 Agents — `/api/v1/agents`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/agents` | 🔒 Admin | Create agent |
| `POST` | `/api/v1/agents/with-user` | 🔒 Admin | Create agent + user account |
| `GET` | `/api/v1/agents` | 🔒 Admin | List agents (filters + pagination) |
| `GET` | `/api/v1/agents/me` | 🔒 Agent | Get own agent profile |
| `GET` | `/api/v1/agents/:id` | 🔒 Admin | Get agent by ID |
| `PATCH` | `/api/v1/agents/:id/status` | 🔒 Admin/Agent | Update agent status |
| `PATCH` | `/api/v1/agents/:id/location` | 🔒 Admin/Agent | Update agent location |

---

## 📮 Sample API Calls

```bash
# Register a customer
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepassword123456789012",
    "phone": "9876543210"
  }'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "securepassword123456789012"
  }'

# Find nearest store
curl "http://localhost:3000/api/v1/stores/nearest?lat=28.6139&lng=77.2090"

# Browse products
curl "http://localhost:3000/api/v1/products?search=milk&category=dairy&page=1&pageSize=10"

# Place an order (with Bearer token)
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "items": [
      { "productId": 1, "quantity": 2 },
      { "productId": 3, "quantity": 1 }
    ],
    "deliveryAddress": "123 Main St, New Delhi",
    "userLocation": { "latitude": 28.6139, "longitude": 77.2090 }
  }'

# Auto-assign agent to order (Admin)
curl -X POST http://localhost:3000/api/v1/orders/1/auto-assign \
  -H "Authorization: Bearer <admin_token>"

# Agent advances order status
curl -X PATCH http://localhost:3000/api/v1/orders/1/next-status \
  -H "Authorization: Bearer <agent_token>"
```

---

## 🏛️ Architecture

### System Design

```
┌──────────────────┐
│     Clients      │
│  (Mobile / Web)  │
└────────┬─────────┘
         │ HTTPS / REST
         ▼
┌──────────────────────────────────────────┐
│            Express.js API Server         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  Helmet  │ │Rate Limit│ │ Pino Log │ │
│  └──────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ JWT Auth │ │Zod Valid.│ │Error Hndl│ │
│  └──────────┘ └──────────┘ └──────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │         Service Layer               │ │
│  │  Auth · Orders · Store Matching     │ │
│  │  Inventory · Agents · Products      │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │         Model / Data Layer          │ │
│  │  Users · Products · Stores · Orders │ │
│  │  Inventory · Agents · Tokens        │ │
│  └─────────────────────────────────────┘ │
└──────┬────────────────────────────┬──────┘
       │                            │
       ▼                            ▼
┌──────────────┐          ┌──────────────┐
│ PostgreSQL   │          │    Redis     │
│  + PostGIS   │          │  (Cache)     │
│  16-Alpine   │          │  7-Alpine    │
└──────────────┘          └──────────────┘
```

### Key Algorithms & Features

#### 🔍 Smart Store Matching (`storeMatchingService.js`)

```
Score = 0.7 × f(customerDistance) + 0.3 × f(storeLoad)

Where:
  f(distance)  = 1 / (1 + distanceKm)     → closer = higher
  f(load)      = 1 - cappedLoadRatio       → less busy = higher
```

- **PostGIS KNN** query for K=10 nearest active stores (`<->` operator)
- **Batch queries**: 2 total DB calls for all K candidates (inventory + load)
- **Inventory check**: Verifies all requested items are in stock (`available = quantity - reserved`)
- **Complexity**: O(log n + k) where n = total stores, k = candidates

#### 💰 Dynamic Surge Pricing

| Active Orders (10-min window) | Surge Multiplier |
|-------------------------------|------------------|
| < 5 orders | 1.0× |
| 5–9 orders | 1.1× |
| 10–19 orders | 1.25× |
| 20+ orders | 1.5× |

- **Delivery Fee** = Base Fee (₹25) × Surge Multiplier
- **ETA** = ⌈10 + (distance_km × 3) + 5⌉ minutes

#### 🔒 Concurrency Control

| Mechanism | Where Used | Purpose |
|-----------|-----------|---------|
| **Optimistic Locking** (version field) | Inventory | Prevent oversells |
| **Row-Level Locking** (SELECT FOR UPDATE) | Agent assignment | Prevent double-assignment |
| **ACID Transactions** | Order placement | Atomic multi-table writes |
| **Check Constraints** | DB schema | Data integrity |
| **Unique Constraints** | Users, inventory | Duplicate prevention |

#### 📦 Order Lifecycle

```
                  ┌──────────┐
                  │ pending  │
                  └────┬─────┘
              ┌────────┼────────┐
              ▼                 ▼
        ┌───────────┐    ┌───────────┐
        │ confirmed │    │ cancelled │
        └─────┬─────┘    └───────────┘
              ▼
        ┌───────────┐
        │ assigned  │ ← agent auto/manual assigned
        └─────┬─────┘
              ▼
        ┌───────────┐
        │  picking  │ ← agent picks items in store
        └─────┬─────┘
              ▼
     ┌─────────────────┐
     │out_for_delivery  │ ← agent en route
     └────────┬────────┘
              ▼
        ┌───────────┐
        │ delivered │ ← inventory deducted, agent freed
        └───────────┘
```

**On Cancel**: Reserved inventory released back  
**On Deliver**: Inventory permanently deducted + low-stock alerts  
**Agent**: Auto-released to `available` status on delivery

---

## 🔐 Security

| Feature | Implementation |
|---------|---------------|
| **Password Hashing** | bcrypt (12 salt rounds) |
| **JWT Authentication** | Access token + refresh token rotation |
| **Role-Based Access** | `customer`, `admin`, `agent` roles |
| **Owner-or-Admin** | Resource-level authorization |
| **Rate Limiting (Global)** | 100 requests / 15 min per IP (configurable via `RATE_LIMIT_MAX`) |
| **Rate Limiting (Auth)** | 15 attempts / 15 min per IP (login + register) |
| **Rate Limiting (Orders)** | 5 orders / min per IP |
| **Helmet** | HTTP security headers |
| **Body Limit** | 10KB max JSON payload |
| **Input Validation** | Zod schemas on all endpoints |
| **Error Sanitization** | Internal errors hidden in production |
| **Request Tracing** | UUID-based `X-Request-Id` headers |

---

## 🚀 Redis Cache Layer

### Cache-Aside Pattern

All cached endpoints return `X-Cache: HIT` or `X-Cache: MISS` response headers.

| Resource | Cache Key Pattern | TTL | Bust Trigger |
|----------|------------------|-----|-------------|
| **Products List** | `products:list:{search}:{cat}:{page}:{size}` | 5 min | — |
| **Product by ID** | `products:{id}` | 5 min | — |
| **Stores List** | `stores:list` | 2 min | `POST /stores` |
| **Store by ID** | `stores:{id}` | 2 min | `POST /stores` |
| **Nearest Store** | `stores:nearest:{lat},{lng}` | 2 min | `POST /stores` |
| **Store Inventory** | `inventory:store:{storeId}` | 30 sec | Restock / Order |
| **Order Tracking** | `order:track:{orderId}` | 60 sec | Status change |

### Architecture

```
Request → Controller → Check Redis Cache
                           │
               ┌───────────┴───────────┐
               │ HIT                   │ MISS
               ▼                       ▼
         Return cached            Service → DB
         + X-Cache: HIT                │
                                  Cache result
                                  + X-Cache: MISS
```

### Fallback Strategy

- **Primary**: Redis 7 (Alpine) via ioredis
- **Fallback**: In-memory `Map` (automatic on Redis failure)
- **Toggle**: `REDIS_ENABLED=true|false` in `.env`
- **Graceful**: Redis errors are caught and logged — never crash the app

---

## 📐 Database Schema

```
users (id, name, email, password_hash, phone, role, delivery_address, lat, lng, agent_id)
  │ 1:1                         │ 1:N
  ▼                             ▼
agents (id, user_id,         orders (id, user_id, store_id, agent_id, status,
  store_id, name, phone,       total_amount, delivery_fee, surge_multiplier, ...)
  status, lat, lng)              │ 1:N                    │ 1:N
  │ N:1                         ▼                         ▼
  ▼                       order_items              order_status_history
dark_stores (id, name,    (id, order_id,           (id, order_id, from_status,
  area_name, lat, lng,     product_id, quantity,     to_status, changed_by)
  location[PostGIS],       unit_price, subtotal)
  is_active,                    ▲
  max_orders_per_slot)          │ N:1
  │ 1:N                        │
  ▼                       products (id, name, description,
inventory (id, store_id,    category, image_url, base_price,
  product_id, quantity,     weight_grams, deleted_at)
  reserved_quantity,
  low_stock_threshold,    refresh_tokens (id, user_id, token,
  version)                  is_revoked, expires_at)
```

### Indexes

| Index | Type | Purpose |
|-------|------|---------|
| `idx_dark_stores_location_gix` | **GIST** | PostGIS spatial KNN queries (stores) |
| `idx_agents_location_gix` | **GIST** | PostGIS spatial KNN queries (agents) |
| `idx_orders_store_id_status_placed_at` | B-Tree (composite) | Admin order filters + surge calc |
| `idx_orders_user_id_placed_at` | B-Tree (composite) | User order history |
| `idx_inventory_store_product` | B-Tree (composite) | Inventory lookups |
| `idx_agents_store_status` | B-Tree (composite) | Agent availability |
| `idx_agents_user_id` | B-Tree | User-agent linking |
| `idx_refresh_tokens_token` | B-Tree | Token lookup |

### Constraints

- **Foreign Keys**: All relationships enforced (CASCADE / SET NULL)
- **Check Constraints**: `chk_order_status`, `chk_agent_status`
- **Unique Constraints**: `users.email`, `inventory(store_id, product_id)`, `agents.user_id`
- **PostGIS Trigger**: Auto-syncs `dark_stores.location` from lat/lng on INSERT/UPDATE
- **PostGIS Trigger**: Auto-syncs `agents.location` from `current_lat`/`current_lng` on INSERT/UPDATE
- **GIST Spatial Index**: On both `dark_stores.location` and `agents.location` for KNN operator (`<->`)

---

## 🎯 Design Patterns

| Pattern | Usage |
|---------|-------|
| **Repository / Model Layer** | Data access abstraction (model files) |
| **Service Layer** | Business logic separation |
| **Singleton** | Database pool, Redis client |
| **Middleware Chain** | Request pipeline (auth → validate → handler) |
| **Strategy** | Cache backend (Redis vs. in-memory) |
| **Factory** | Error class hierarchy |
| **Optimistic Locking** | Inventory version field |
| **Token Rotation** | Refresh token security |

---

## ⚙️ Configuration

### Environment Variables (`.env`)

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zapkart
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-secret-key-minimum-32-characters-long
JWT_EXPIRES_IN=1d

# Logging
LOG_LEVEL=info
```

### Docker Commands

```bash
docker-compose up -d             # Start all services
docker-compose down              # Stop all services
docker-compose restart postgres  # Restart database
docker-compose logs -f app       # Follow app logs
docker-compose ps                # Check service health
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Suite

| Test File | Type | Coverage |
|-----------|------|----------|
| `health.test.js` | Integration | Health + readiness + 404 handling |
| `auth.integration.test.js` | Integration | Full auth flow (register, login, refresh, logout) |
| `jwt.unit.test.js` | Unit | JWT sign/verify (9 test cases) |
| `orderService.test.js` | Unit | Order placement, surge calc, ETA calc |
| `storeMatching.service.test.js` | Unit | Store matching, scoring, edge cases |

---

## 🧮 Algorithm Complexity

| Operation | Time | Space |
|-----------|------|-------|
| Store Matching (PostGIS KNN) | O(log n + k) | O(k) |
| Inventory Reservation | O(m) per order | O(m) items |
| Order Placement (full) | O(log n + k + m) | O(k + m) |
| Agent Auto-Assignment | O(log n) | O(1) |
| Product Search (ILIKE) | O(n) | O(p) page size |
| Nearest Store | O(log n) | O(1) |

Where: n = total records, k = candidate stores (10), m = items per order, p = page size

---

## 🐛 Troubleshooting

### Database Connection Error

```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database
docker-compose restart postgres

# Verify connection
docker exec -it zapkart-backend-postgres-1 psql -U postgres -d zapkart -c "SELECT 1;"
```

### Redis Connection Error

```bash
# Check Redis status
docker exec -it zapkart-backend-redis-1 redis-cli ping

# Disable Redis (use in-memory fallback)
# Set REDIS_ENABLED=false in .env
```

### Port Already in Use

```powershell
# Windows — check what's using port 3000
netstat -ano | findstr :3000

# Change port in .env
PORT=3001
```

### Migration Errors

```bash
# Re-run migrations
npm run db:migrate

# Check schema
docker exec -it zapkart-backend-postgres-1 psql -U postgres -d zapkart -c "\dt"
```

---

## ⚡ Load Testing

### Running Benchmarks

```bash
# Start Redis + server first
docker start redis
RATE_LIMIT_MAX=0 npm run dev   # Disable rate limits for benchmarking

# Run the 5-stage benchmark suite
node scripts/benchmark.js
```

### Benchmark Stages

| # | Stage | Endpoint | Method | What It Tests |
|---|-------|----------|--------|---------------|
| 1 | Baseline | `/health` | GET | Raw framework throughput |
| 2 | Cached Read | `/api/v1/products` | GET | Redis cache-aside performance |
| 3 | Cached Read | `/api/v1/stores` | GET | Redis cache-aside + PostGIS |
| 4 | DB Aggregation | `/api/v1/orders/admin/all` | GET | Complex SQL queries |
| 5 | Full Pipeline | `/api/v1/orders` | POST | Auth → Validate → Match → Reserve → Write |

### Configuration

Set `RATE_LIMIT_MAX=0` to disable global rate limiting during benchmarks. The benchmark script uses autocannon with 10 connections over 10 seconds per stage.

```bash
# Custom rate limit (e.g., 10,000 per window)
RATE_LIMIT_MAX=10000 npm run dev
```

---

## 🔮 Future Enhancements

### Phase 1 (3–6 months)
- WebSocket real-time order tracking
- Redis-based surge pricing (pub/sub)
- Payment gateway integration
- Push notification support
- Admin frontend dashboard

### Phase 2 (6–12 months)
- ML-based demand prediction
- Multi-region deployment
- Mobile app SDK
- Order batching / route optimization

---

## 🧪 Sample Test Data

After running `npm run seed`:

| Entity | Count | Details |
|--------|-------|---------|
| **Users** | 3 | Customer, Admin, Agent |
| **Agents** | 2 | John Delivery, Jane Runner (with PostGIS location) |
| **Dark Stores** | Seeded | With lat/lng + PostGIS GIST index in Delhi NCR |
| **Products** | Seeded | Various categories (dairy, snacks, beverages, etc.) |
| **Inventory** | Seeded | Stock per store per product |

### Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@example.com` | `Admin@123` |
| Customer | `customer@example.com` | `Test@123` |
| Agent | `agent1@test.com` | `Agent@123` |

---

## 🤝 Assumptions

- **Geographic Scope**: Single city (Delhi NCR) initially
- **User Base**: Registration-based (email + password)
- **Payment**: Fare calculation only (no payment integration in v1)
- **Delivery Radius**: 10km max from dark store
- **Surge Window**: 10-minute rolling window for order count
- **Candidate Stores**: Top 10 nearest stores evaluated per order
- **Inventory**: Optimistic locking — last writer wins with version check
- **Agent Scope**: 1 agent = 1 active delivery at a time
- **Real-time Tracking**: Not implemented (future WebSocket feature)

---

## 📝 Evaluation Checklist

### ✅ Implementation Correctness
- [x] All 30+ REST API endpoints working
- [x] Smart store matching with composite scoring
- [x] Dynamic surge pricing (tiered)
- [x] Full order lifecycle with status transitions
- [x] Inventory reservation, release, deduction
- [x] Agent auto-assignment via PostGIS
- [x] Comprehensive error handling with status codes

### ✅ Database Modeling
- [x] Normalized schema (3NF)
- [x] PostGIS spatial indexing (GIST) on stores AND agents
- [x] B-Tree indexes on key columns
- [x] Foreign key constraints with CASCADE
- [x] Check constraints on status enums
- [x] Optimistic locking (version field)
- [x] Soft deletes (products, orders)
- [x] PostGIS triggers auto-sync location from lat/lng

### ✅ Security
- [x] JWT authentication with refresh rotation
- [x] Role-based access control (customer/admin/agent)
- [x] bcrypt password hashing (12 rounds)
- [x] 3-layer rate limiting (global 100/15min, auth 15/15min, orders 5/min)
- [x] Helmet security headers
- [x] Zod input validation
- [x] SQL parameterized queries (injection-safe)

### ✅ Concurrency Safety
- [x] Optimistic locking on inventory
- [x] ACID transactions for order placement
- [x] Row-level locking for agent assignment
- [x] Version field conflict detection
- [x] Unique constraints for deduplication

### ✅ Architecture
- [x] Layered architecture (Routes → Controllers → Services → Models)
- [x] SOLID principles
- [x] Design patterns (Repository, Service, Singleton, Strategy)
- [x] Separation of concerns
- [x] Environment-based configuration (Zod-validated)

### ✅ Testability
- [x] Unit tests (JWT, store matching, order service)
- [x] Integration tests (auth flow, health endpoints)
- [x] Mocked dependencies for isolation
- [x] Jest + Supertest framework

### ✅ Maintainability
- [x] Structured logging (Pino)
- [x] Request tracing (X-Request-Id)
- [x] Graceful shutdown handling
- [x] Docker containerization
- [x] Clean code structure + JSDoc comments

### ✅ Performance & Caching
- [x] Redis cache-aside with automatic fallback to in-memory
- [x] `X-Cache: HIT/MISS` response headers on cached endpoints
- [x] TTL-based cache expiry (30s–5min per resource)
- [x] Cache busting on write operations
- [x] PostGIS GIST indexes on both stores and agents
- [x] KNN operator (`<->`) for indexed spatial queries

### ✅ Load Testing
- [x] autocannon 5-stage benchmark suite
- [x] 16,800+ req/s on health endpoint
- [x] 16,600+ req/s on cached product reads
- [x] 8,300+ req/s on full order pipeline
- [x] Zero errors across all benchmark stages
- [x] Configurable rate limits for test environments

---

## 👩‍💻 Author

**Anamika Singh**

- 🐙 GitHub: [@Anamiiikka](https://github.com/Anamiiikka)
- 💼 LinkedIn: [linkedin.com/in/anamikasingh20](https://www.linkedin.com/in/anamikasingh20/)
- 📧 Email: anamikasingh200205@gmail.com

---

## 📅 Project Timeline

| Milestone | Date | Status |
|-----------|------|--------|
| **Project Start** | February 2026 | ✅ Complete |
| **Phase 0**: Core setup | February 2026 | ✅ Complete |
| **Phase 1**: Auth + Products + Stores | February 2026 | ✅ Complete |
| **Phase 2**: Orders + Inventory + Agents | February 2026 | ✅ Complete |
| **Phase 9**: Agent Dashboard APIs | February 2026 | ✅ Complete |
| **Phase 10**: Admin Dashboard + Analytics APIs | February 2026 | ✅ Complete |
| **Phase 11**: Order Lifecycle APIs | February 2026 | ✅ Complete |
| **Phase 12**: Redis Cache Layer (cache-aside) | February 2026 | ✅ Complete |
| **Phase 13**: PostGIS Agent Optimization (GIST KNN) | February 2026 | ✅ Complete |
| **Phase 14**: Production Hardening (3-layer rate limit) | February 2026 | ✅ Complete |
| **Phase 15**: Load Testing + Benchmarks (autocannon) | February 2026 | ✅ Complete |
| **Status** | — | 🟢 **Production Ready** |

---

## 📄 License

ISC License — See [package.json](package.json) for details.

---

## 🙏 Acknowledgments

- PostgreSQL & PostGIS community
- Node.js & Express.js teams
- Zod validation library
- Pino logging framework

---


