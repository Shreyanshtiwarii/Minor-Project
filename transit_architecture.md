# GreenMove Public Transit Architecture

This document describes the design, schema, and API boundaries required to support GTFS-based public transit routing in the **GreenMove** platform.

Since the current workspace is a pure React front-end application, this architecture is a design specification to guide the backend integration when PostgreSQL and OpenTripPlanner (OTP) are deployed.

---

## 1. System Topology & Routing Flow

```text
       [ React Frontend (MapLibre) ]
                    │
                    ▼  JSON API /POST
        [ GreenMove Backend API ]
                    │
                    ▼  GraphQL / REST
       [ OpenTripPlanner Engine ]
         ├── OpenStreetMap (OSM)
         └── GTFS Static Feeds (.zip)
                    │
           [ PostgreSQL DB ] (Data Store)
```

---

## 2. PostgreSQL Relational GTFS Schema

To query static schedule properties, agency contact data, and stop details, the database will maintain standard GTFS tables in a dedicated relational schema.

### Table: `transit_agency`
Stores information about the transit operators.
```sql
CREATE TABLE transit_agency (
    agency_id VARCHAR(100) PRIMARY KEY,
    agency_name VARCHAR(255) NOT NULL,
    agency_url VARCHAR(255) NOT NULL,
    agency_timezone VARCHAR(100) NOT NULL,
    agency_lang VARCHAR(10) NULL,
    agency_phone VARCHAR(50) NULL,
    agency_fare_url VARCHAR(255) NULL,
    agency_email VARCHAR(255) NULL
);
```

### Table: `transit_route`
Represents individual transit lines (e.g., Bus Route 4, Metro Green Line).
```sql
CREATE TABLE transit_route (
    route_id VARCHAR(100) PRIMARY KEY,
    agency_id VARCHAR(100) REFERENCES transit_agency(agency_id),
    route_short_name VARCHAR(50) NOT NULL,
    route_long_name VARCHAR(255) NOT NULL,
    route_desc TEXT NULL,
    route_type INTEGER NOT NULL, -- 0: Tram, 1: Subway/Metro, 3: Bus, etc.
    route_url VARCHAR(255) NULL,
    route_color VARCHAR(10) NULL,
    route_text_color VARCHAR(10) NULL
);
CREATE INDEX idx_transit_route_agency ON transit_route(agency_id);
```

### Table: `transit_stop`
Geographic coordinates of bus stops, subway stations, and platforms.
```sql
CREATE TABLE transit_stop (
    stop_id VARCHAR(100) PRIMARY KEY,
    stop_code VARCHAR(50) NULL,
    stop_name VARCHAR(255) NOT NULL,
    stop_desc TEXT NULL,
    stop_lon DOUBLE PRECISION NOT NULL, -- Stored as longitude
    stop_lat DOUBLE PRECISION NOT NULL, -- Stored as latitude
    zone_id VARCHAR(100) NULL,
    stop_url VARCHAR(255) NULL,
    location_type INTEGER DEFAULT 0, -- 0: Stop/Platform, 1: Station, 2: Entrance/Exit
    parent_station VARCHAR(100) NULL
);
-- Spatial Index for fast proximity search (using PostGIS if available)
CREATE INDEX idx_transit_stop_coords ON transit_stop(stop_lon, stop_lat);
```

### Table: `transit_calendar`
Defines service availability dates based on days of the week.
```sql
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
```

### Table: `transit_calendar_date`
Defines service exceptions (holidays or added service days).
```sql
CREATE TABLE transit_calendar_date (
    service_id VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    exception_type INTEGER NOT NULL, -- 1: Service added, 2: Service removed
    PRIMARY KEY (service_id, date)
);
```

### Table: `transit_trip`
Represents an individual journey on a route for a specific calendar service.
```sql
CREATE TABLE transit_trip (
    trip_id VARCHAR(100) PRIMARY KEY,
    route_id VARCHAR(100) REFERENCES transit_route(route_id),
    service_id VARCHAR(100) NOT NULL,
    trip_headsign VARCHAR(255) NULL,
    trip_short_name VARCHAR(100) NULL,
    direction_id INTEGER NULL, -- 0: Outbound, 1: Inbound
    block_id VARCHAR(100) NULL,
    shape_id VARCHAR(100) NULL
);
CREATE INDEX idx_transit_trip_route ON transit_trip(route_id);
CREATE INDEX idx_transit_trip_service ON transit_trip(service_id);
```

### Table: `transit_stop_time`
Maps stop sequences, arrivals, and departures to trips.
```sql
CREATE TABLE transit_stop_time (
    trip_id VARCHAR(100) REFERENCES transit_trip(trip_id) ON DELETE CASCADE,
    arrival_time_seconds INTEGER NOT NULL, -- Represented as seconds from midnight
    departure_time_seconds INTEGER NOT NULL,
    stop_id VARCHAR(100) REFERENCES transit_stop(stop_id),
    stop_sequence INTEGER NOT NULL,
    stop_headsign VARCHAR(255) NULL,
    pickup_type INTEGER DEFAULT 0,
    drop_off_type INTEGER DEFAULT 0,
    shape_dist_traveled DOUBLE PRECISION NULL,
    PRIMARY KEY (trip_id, stop_sequence)
);
CREATE INDEX idx_transit_stop_time_stop ON transit_stop_time(stop_id);
CREATE INDEX idx_transit_stop_time_trip ON transit_stop_time(trip_id);
```

---

## 3. GTFS Importer Architecture

The importer is a backend script (Node.js/Python/Go) that handles loading raw GTFS ZIP files into PostgreSQL.

### Key Parser Requirements:
1.  **ZIP Extraction**: Read streams from files within the ZIP archive without loading the entire archive into memory to protect server resources.
2.  **CSV Stream Parser**: Uses a streaming CSV reader capable of handling quotes, escape characters, and variable whitespace spacing safely.
3.  **Strict Transaction Boundaries**: Reads and processes each table row inside single PostgreSQL transactions. If a critical file fails validation, rolls back changes to prevent database corruption.
4.  **Time Handling**:
    *   GTFS schedules represent early morning service using times exceeding `24:00:00` (e.g., `24:30:00` for 12:30 AM next day).
    *   Do **NOT** store times as native PostgreSQL `TIME` (which errors out on values above 23:59:59).
    *   **Rule**: Convert GTFS times to absolute integer values representing `seconds_from_midnight` (e.g., `24:30:00` -> `(24 * 3600) + (30 * 60) = 88200` seconds).
5.  **Record Validation**:
    *   Ensure numeric parsing checks coordinates (lat/lng must be valid floating numbers).
    *   Log rows failing critical foreign keys, but allow optional fields (like `trip_headsign`) to fall back to null without halting the execution.

---

## 4. OpenTripPlanner (OTP) Integration

### Purpose
While database queries can check calendar details, calculating multimodal journeys involving transfers, walking walks, and bus transit requires a dedicated routing engine. OpenTripPlanner (OTP) is the standard open-source framework for this purpose.

### Graph Compiler Step:
OpenTripPlanner compiles two datasets into a unified spatial routing graph:
1.  **Street Network (OSM)**: OpenStreetMap `.pbf` road geometries.
2.  **Transit Network (GTFS)**: One or more static `.zip` feeds.

```text
[ indore-osm.pbf ]  ───┐
                       ├──▶ [ OTP Graph Compiler ] ──▶ [ graph-bin ]
[ indore-gtfs.zip ] ───┘
```

### Server API Call:
GreenMove's backend queries the OpenTripPlanner REST endpoint:
`POST /otp/routers/default/planner`
With request arguments:
*   `fromPlace`: `latitude,longitude`
*   `toPlace`: `latitude,longitude`
*   `mode`: `WALK,TRANSIT`
*   `time`: `08:30am`
*   `date`: `08-20-2026`

---

## 5. Normalized Transit Response Model

OTP's raw JSON response is complex. The GreenMove backend normalizes OTP itineraries into a standard interface format consumed by the frontend:

```json
{
  "id": "transit-route-1",
  "mode": "TRANSIT",
  "totalDurationSeconds": 3120,
  "totalDistanceMeters": 14200,
  "legs": [
    {
      "mode": "WALKING",
      "geometry": {
        "type": "LineString",
        "coordinates": [[77.5946, 12.9716], [77.5982, 12.9725]]
      },
      "durationSeconds": 360,
      "distanceMeters": 420
    },
    {
      "mode": "BUS",
      "routeId": "IND_BUS_4B",
      "routeName": "Indore Ring Road 4B",
      "fromStop": "Geeta Bhawan",
      "toStop": "Rajwada Gate",
      "geometry": {
        "type": "LineString",
        "coordinates": [[77.5982, 12.9725], [77.6045, 12.9810]]
      },
      "durationSeconds": 2400,
      "distanceMeters": 13200
    },
    {
      "mode": "WALKING",
      "geometry": {
        "type": "LineString",
        "coordinates": [[77.6045, 12.9810], [77.6070, 12.9822]]
      },
      "durationSeconds": 360,
      "distanceMeters": 580
    }
  ]
}
```

---

## 6. Frontend Integration Hooks (Future)

Once the backend is configured, the React client will consume:
1.  **Stops Layer**: `GET /api/transit/stops?lat={lat}&lng={lng}&radius={meters}` to draw nearby station icons on the MapLibre map.
2.  **Itinerary Planner**: `POST /api/transit/plan` to request transit directions, which will draw each individual walk/bus leg on the map using distinctive visual stylings.
