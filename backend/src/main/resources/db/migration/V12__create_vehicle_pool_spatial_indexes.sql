-- V12__create_vehicle_pool_spatial_indexes.sql
-- Creates PostGIS GiST spatial indexes on vehicle_pool geometry columns for fast proximity and route matching.

CREATE INDEX idx_vehicle_pool_route_geom ON vehicle_pool USING GIST (route_geom);
CREATE INDEX idx_vehicle_pool_start_geom ON vehicle_pool USING GIST (start_geom);
CREATE INDEX idx_vehicle_pool_dest_geom ON vehicle_pool USING GIST (destination_geom);
