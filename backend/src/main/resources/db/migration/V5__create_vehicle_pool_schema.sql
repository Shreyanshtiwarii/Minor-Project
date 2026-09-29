-- V5__create_vehicle_pool_schema.sql
-- Tables backing the "Vehicle Pool" feature: pool creation, discovery, and seat joining.

CREATE TABLE vehicle_pool (
    id VARCHAR(100) PRIMARY KEY,
    creator_id VARCHAR(100) NOT NULL,
    creator_name VARCHAR(255) NOT NULL,
    start_location VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    departure_time TIMESTAMP NOT NULL,
    total_seats INTEGER NOT NULL,
    available_seats INTEGER NOT NULL,
    cost_per_passenger DOUBLE PRECISION NOT NULL,
    total_cost DOUBLE PRECISION NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vehicle_pool_member (
    id VARCHAR(100) PRIMARY KEY,
    pool_id VARCHAR(100) NOT NULL REFERENCES vehicle_pool(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_pool_member UNIQUE (pool_id, user_id)
);

CREATE INDEX idx_vehicle_pool_creator ON vehicle_pool (creator_id);
CREATE INDEX idx_vehicle_pool_departure ON vehicle_pool (departure_time);
CREATE INDEX idx_vehicle_pool_member_pool ON vehicle_pool_member (pool_id);
CREATE INDEX idx_vehicle_pool_member_user ON vehicle_pool_member (user_id);
