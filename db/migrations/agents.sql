-- Migration: Replace delivery_agents with full agents table + user-agent linking
-- Run this on existing databases that already have init.sql applied

-- 1. Add agent_id and updated_at to users table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS agent_id BIGINT UNIQUE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Drop old delivery_agents table and related indexes
DROP INDEX IF EXISTS idx_delivery_agents_store_status;
DROP TABLE IF EXISTS delivery_agents;

-- 3. Create new agents table with full schema
CREATE TABLE IF NOT EXISTS agents (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    store_id          BIGINT NOT NULL REFERENCES dark_stores(id) ON DELETE CASCADE,
    name              VARCHAR(100) NOT NULL,
    phone             VARCHAR(20) NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'available',
    current_latitude  DOUBLE PRECISION,
    current_longitude DOUBLE PRECISION,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_agent_status CHECK (status IN ('available', 'busy', 'inactive'))
);

-- 4. Add FK from users.agent_id -> agents.id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_users_agent' AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT fk_users_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Indexes for agents
CREATE INDEX IF NOT EXISTS idx_agents_store_id ON agents(store_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
