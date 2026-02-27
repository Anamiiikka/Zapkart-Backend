-- Migration: Add agent_id to orders + extend status CHECK for 'assigned'
-- Run on existing databases after agents migration.

-- 1. Add agent_id column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_id BIGINT;

-- 2. Add FK: orders.agent_id → agents.id
DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT fk_orders_agent
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'fk_orders_agent already exists';
END $$;

-- 3. Drop old CHECK and re-add with 'assigned' included
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE orders ADD CONSTRAINT chk_order_status CHECK (status IN (
  'pending', 'confirmed', 'assigned', 'picking',
  'out_for_delivery', 'delivered', 'cancelled'
));

-- 4. Indexes for agent-based queries
CREATE INDEX IF NOT EXISTS idx_orders_agent_id ON orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_agent ON orders(status, agent_id);
