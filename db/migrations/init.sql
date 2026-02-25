-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- USERS
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    role            VARCHAR(20) NOT NULL DEFAULT 'customer', -- 'customer' | 'admin'
    delivery_address TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    -- optional: you can add location later if you want PostGIS for users too
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DARK STORES
CREATE TABLE dark_stores (
    id                   BIGSERIAL PRIMARY KEY,
    name                 VARCHAR(150) NOT NULL,
    area_name            VARCHAR(150),
    latitude             DOUBLE PRECISION NOT NULL,
    longitude            DOUBLE PRECISION NOT NULL,
    location             GEOGRAPHY(POINT, 4326) NOT NULL,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    max_orders_per_slot  INTEGER NOT NULL DEFAULT 100,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PRODUCTS
CREATE TABLE products (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    category            VARCHAR(100),
    image_url           TEXT,
    base_price          NUMERIC(10, 2) NOT NULL,
    weight_grams        INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ   -- for soft delete
);

-- INVENTORY
CREATE TABLE inventory (
    id                  BIGSERIAL PRIMARY KEY,
    store_id            BIGINT NOT NULL REFERENCES dark_stores(id),
    product_id          BIGINT NOT NULL REFERENCES products(id),
    quantity            INTEGER NOT NULL DEFAULT 0,
    reserved_quantity   INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 0,
    version             INTEGER NOT NULL DEFAULT 1, -- optimistic locking
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_id, product_id)
);

-- ORDERS
CREATE TABLE orders (
    id                         BIGSERIAL PRIMARY KEY,
    user_id                    BIGINT NOT NULL REFERENCES users(id),
    store_id                   BIGINT NOT NULL REFERENCES dark_stores(id),
    status                     VARCHAR(30) NOT NULL DEFAULT 'pending',
    total_amount               NUMERIC(10, 2) NOT NULL DEFAULT 0,
    delivery_fee               NUMERIC(10, 2) NOT NULL DEFAULT 0,
    surge_multiplier           NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
    delivery_address           TEXT,
    estimated_delivery_minutes INTEGER,
    placed_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at               TIMESTAMPTZ,
    deleted_at                 TIMESTAMPTZ,  -- soft delete
    CONSTRAINT chk_order_status CHECK (status IN (
        'pending',
        'confirmed',
        'picking',
        'out_for_delivery',
        'delivered',
        'cancelled'
    ))
);

-- ORDER ITEMS
CREATE TABLE order_items (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  BIGINT NOT NULL REFERENCES products(id),
    quantity    INTEGER NOT NULL,
    unit_price  NUMERIC(10, 2) NOT NULL,
    subtotal    NUMERIC(10, 2) NOT NULL
);

-- DELIVERY AGENTS
CREATE TABLE delivery_agents (
    id                BIGSERIAL PRIMARY KEY,
    name              VARCHAR(100) NOT NULL,
    phone             VARCHAR(20),
    store_id          BIGINT NOT NULL REFERENCES dark_stores(id),
    status            VARCHAR(20) NOT NULL DEFAULT 'available', -- 'available' | 'busy'
    current_latitude  DOUBLE PRECISION,
    current_longitude DOUBLE PRECISION,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_agent_status CHECK (status IN ('available', 'busy'))
);

-- REFRESH TOKENS (for JWT rotation)
CREATE TABLE refresh_tokens (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id),
    token        TEXT NOT NULL,
    is_revoked   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL
);

-- TRIGGER to keep dark_stores.location in sync with latitude/longitude
CREATE OR REPLACE FUNCTION set_dark_store_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_dark_store_location
BEFORE INSERT OR UPDATE ON dark_stores
FOR EACH ROW
EXECUTE FUNCTION set_dark_store_location();
