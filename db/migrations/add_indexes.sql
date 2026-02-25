-- Indexes for USERS
CREATE INDEX idx_users_email ON users(email);

-- Dark stores spatial index for nearest-store queries
CREATE INDEX idx_dark_stores_location_gix
  ON dark_stores
  USING GIST (location);

-- Inventory lookups
CREATE INDEX idx_inventory_store_product
  ON inventory (store_id, product_id);

-- Orders: common filters (user history, admin filters, surge calc)
CREATE INDEX idx_orders_user_id_placed_at
  ON orders (user_id, placed_at DESC);

CREATE INDEX idx_orders_store_id_status_placed_at
  ON orders (store_id, status, placed_at DESC);

-- Order items: join by order
CREATE INDEX idx_order_items_order_id
  ON order_items (order_id);

-- Delivery agents: by store and status (for load/availability checks)
CREATE INDEX idx_delivery_agents_store_status
  ON delivery_agents (store_id, status);

-- Refresh tokens: by user and expiry
CREATE INDEX idx_refresh_tokens_user_id
  ON refresh_tokens (user_id);

CREATE INDEX idx_refresh_tokens_token
  ON refresh_tokens (token);
