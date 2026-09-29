-- V14__add_join_pool_phone_and_fare_fields.sql
-- Phase 2 - Passenger Join flow: adds the passenger's contact phone number and the
-- server-recalculated rate/km, passenger route distance, and passenger fare captured
-- at join time. All columns are additive and nullable so existing rows/behavior are
-- unaffected.

ALTER TABLE vehicle_pool_member
    ADD COLUMN phone_number VARCHAR(32),
    ADD COLUMN rate_per_km DOUBLE PRECISION,
    ADD COLUMN passenger_route_distance_meters DOUBLE PRECISION,
    ADD COLUMN passenger_fare DOUBLE PRECISION;
