-- V1__create_transit_schema.sql
-- Relational transit schema representing GTFS static specifications.
-- Preserves string IDs, composite primary keys, and integer seconds for times.

-- Table: transit_agency
CREATE TABLE transit_agency (
    agency_id VARCHAR(100) PRIMARY KEY,
    agency_name VARCHAR(255) NOT NULL,
    agency_url VARCHAR(255) NOT NULL,
    agency_timezone VARCHAR(100) NOT NULL,
    agency_lang VARCHAR(50),
    agency_phone VARCHAR(100),
    agency_fare_url VARCHAR(255),
    agency_email VARCHAR(255)
);

-- Table: transit_route
CREATE TABLE transit_route (
    route_id VARCHAR(100) PRIMARY KEY,
    agency_id VARCHAR(100) REFERENCES transit_agency(agency_id),
    route_short_name VARCHAR(100) NOT NULL,
    route_long_name VARCHAR(255) NOT NULL,
    route_desc TEXT,
    route_type INTEGER NOT NULL,
    route_url VARCHAR(255),
    route_color VARCHAR(50),
    route_text_color VARCHAR(50)
);

-- Table: transit_stop
CREATE TABLE transit_stop (
    stop_id VARCHAR(100) PRIMARY KEY,
    stop_code VARCHAR(100),
    stop_name VARCHAR(255) NOT NULL,
    stop_desc TEXT,
    stop_lat DOUBLE PRECISION NOT NULL,
    stop_lon DOUBLE PRECISION NOT NULL,
    zone_id VARCHAR(100),
    stop_url VARCHAR(255),
    location_type INTEGER DEFAULT 0,
    parent_station VARCHAR(100)
);

-- Table: transit_calendar
CREATE TABLE transit_calendar (
    service_id VARCHAR(100) PRIMARY KEY,
    monday BOOLEAN NOT NULL,
    tuesday BOOLEAN NOT NULL,
    wednesday BOOLEAN NOT NULL,
    thursday BOOLEAN NOT NULL,
    friday BOOLEAN NOT NULL,
    saturday BOOLEAN NOT NULL,
    sunday BOOLEAN NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL
);

-- Table: transit_calendar_date
CREATE TABLE transit_calendar_date (
    service_id VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    exception_type INTEGER NOT NULL,
    PRIMARY KEY (service_id, date)
);

-- Table: transit_trip
CREATE TABLE transit_trip (
    trip_id VARCHAR(100) PRIMARY KEY,
    route_id VARCHAR(100) REFERENCES transit_route(route_id),
    service_id VARCHAR(100) NOT NULL,
    trip_headsign VARCHAR(255),
    trip_short_name VARCHAR(255),
    direction_id INTEGER,
    block_id VARCHAR(100),
    shape_id VARCHAR(100)
);

-- Table: transit_stop_time
-- CRITICAL GTFS TIME RULE: arrival_seconds and departure_seconds are stored as integers
-- to preserve service-day durations exceeding 24:00:00 without date boundaries.
CREATE TABLE transit_stop_time (
    trip_id VARCHAR(100) NOT NULL REFERENCES transit_trip(trip_id) ON DELETE CASCADE,
    arrival_seconds INTEGER NOT NULL,
    departure_seconds INTEGER NOT NULL,
    stop_id VARCHAR(100) NOT NULL REFERENCES transit_stop(stop_id),
    stop_sequence INTEGER NOT NULL,
    stop_headsign VARCHAR(255),
    pickup_type INTEGER DEFAULT 0,
    drop_off_type INTEGER DEFAULT 0,
    shape_dist_traveled DOUBLE PRECISION,
    PRIMARY KEY (trip_id, stop_sequence)
);

-- Table: transit_shape
CREATE TABLE transit_shape (
    shape_id VARCHAR(100) NOT NULL,
    shape_pt_lat DOUBLE PRECISION NOT NULL,
    shape_pt_lon DOUBLE PRECISION NOT NULL,
    shape_pt_sequence INTEGER NOT NULL,
    shape_dist_traveled DOUBLE PRECISION,
    PRIMARY KEY (shape_id, shape_pt_sequence)
);

-- Optimization Indexes
-- Fast proximity query index for stops
CREATE INDEX idx_transit_stop_coords ON transit_stop (stop_lat, stop_lon);

-- Stop departures index for route departure lookups
CREATE INDEX idx_transit_stop_time_depart ON transit_stop_time (stop_id, departure_seconds);

-- Trips by stop index for transit stop connections
CREATE INDEX idx_transit_stop_time_stop ON transit_stop_time (stop_id);

-- Trips by route index
CREATE INDEX idx_transit_trip_route ON transit_trip (route_id);

-- Trips by service index
CREATE INDEX idx_transit_trip_service ON transit_trip (service_id);

-- Routes by agency index
CREATE INDEX idx_transit_route_agency ON transit_route (agency_id);

-- Shapes points index
CREATE INDEX idx_transit_shape_lookup ON transit_shape (shape_id, shape_pt_sequence);
