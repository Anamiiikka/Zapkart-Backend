-- Migration: Add PostGIS geography column + GIST index to agents table
-- This enables O(log n) KNN spatial queries instead of sequential scans
-- with inline ST_MakePoint (which cannot use any spatial index).

-- 1. Add geography column (nullable — agents without coords are allowed)
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326);

-- 2. Backfill existing rows that have coordinates
UPDATE agents
SET location = ST_SetSRID(ST_MakePoint(current_longitude, current_latitude), 4326)::geography
WHERE current_latitude  IS NOT NULL
  AND current_longitude IS NOT NULL
  AND location IS NULL;

-- 3. Create GIST spatial index for KNN queries ( <-> operator )
CREATE INDEX IF NOT EXISTS idx_agents_location_gix
  ON agents USING GIST (location);

-- 4. Trigger to auto-sync location from current_latitude / current_longitude
CREATE OR REPLACE FUNCTION set_agent_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_latitude IS NOT NULL AND NEW.current_longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(
      ST_MakePoint(NEW.current_longitude, NEW.current_latitude), 4326
    )::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_set_agent_location
BEFORE INSERT OR UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION set_agent_location();
