-- V13__create_functional_geography_index.sql
-- The Phase 3 spatial candidate query uses ST_DWithin(p.route_geom::geography, ...).
-- Since route_geom is a geometry column, casting it to geography bypasses the existing
-- geometry GiST index (idx_vehicle_pool_route_geom) and causes a full table sequential scan.
-- This functional index guarantees index usage for geography-cast proximity searches.

CREATE INDEX idx_vehicle_pool_route_geog ON vehicle_pool USING GIST ((route_geom::geography));
