-- V10__extend_vehicle_pool_spatial_data.sql
-- Extends vehicle_pool with PostGIS spatial geometry, coordinate columns, and route metadata.

ALTER TABLE vehicle_pool
    ADD COLUMN start_lat DOUBLE PRECISION,
    ADD COLUMN start_lng DOUBLE PRECISION,
    ADD COLUMN start_geom geometry(Point, 4326),
    ADD COLUMN destination_lat DOUBLE PRECISION,
    ADD COLUMN destination_lng DOUBLE PRECISION,
    ADD COLUMN destination_geom geometry(Point, 4326),
    ADD COLUMN route_geom geometry(LineString, 4326),
    ADD COLUMN route_distance_meters DOUBLE PRECISION,
    ADD COLUMN route_duration_seconds INTEGER;
