# Zapkart Backend - Development Notes

## Project Overview
E-commerce backend API built with Node.js, Express, PostgreSQL, and Redis.

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Local Development
```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start with Docker
docker-compose up -d

# Run in development mode
npm run dev
```

### Running Tests
```bash
npm test
```

## Architecture Notes
- RESTful API design
- PostgreSQL for persistent data
- Redis for caching and sessions
- JWT for authentication

## Phase 0 Status

**Completed:**
- Core Express app with security middleware (helmet, rate-limit)
- Pino logging with pretty-print for development
- Error handler middleware
- `/health` and `/ready` endpoints implemented and tested
- Running locally without Docker for now

**Pending:**
- Redis integration disabled (`REDIS_ENABLED=false`); current cache calls use in-memory Map fallback
- Docker/docker-compose ready but not required for local dev
- PostgreSQL connection configured but migrations pending

**Cache Strategy:**
- `src/utils/cache.js` provides a unified interface (`get`, `set`, `del`)
- In development: uses in-memory Map with TTL support
- In production: set `REDIS_ENABLED=true` to use Redis

## TODO
- [x] Phase 0: Basic setup and health endpoints
- [ ] Phase 1: Database migrations
- [ ] Implement authentication
- [ ] Add product/cart/order endpoints
