-- V11__extend_vehicle_pool_member_trip_data.sql
-- Extends vehicle_pool_member table with pickup and dropoff spatial locations.

ALTER TABLE vehicle_pool_member
    ADD COLUMN pickup_location VARCHAR(255),
    ADD COLUMN pickup_lat DOUBLE PRECISION,
    ADD COLUMN pickup_lng DOUBLE PRECISION,
    ADD COLUMN pickup_geom geometry(Point, 4326),
    ADD COLUMN dropoff_location VARCHAR(255),
    ADD COLUMN dropoff_lat DOUBLE PRECISION,
    ADD COLUMN dropoff_lng DOUBLE PRECISION,
    ADD COLUMN dropoff_geom geometry(Point, 4326);
