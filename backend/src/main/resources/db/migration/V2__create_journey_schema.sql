-- V2__create_journey_schema.sql
-- Table: journey for shared multi-user route persistence and carpool matching

CREATE TABLE journey (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    origin_name VARCHAR(255) NOT NULL,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    destination_name VARCHAR(255) NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lng DOUBLE PRECISION NOT NULL,
    mode VARCHAR(50) NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    duration_minutes VARCHAR(50),
    cost_inr INTEGER,
    co2_kg DOUBLE PRECISION,
    passengers INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'PLANNED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_journey_user ON journey (user_id);
CREATE INDEX idx_journey_status ON journey (status);
