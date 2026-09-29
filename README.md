# GreenMove

**Sustainable Multimodal Transportation & Mobility Platform**

> *IKIGAI 2026 — Problem IHSA5: Sustainable Transportation*

[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()
[![Backend](https://img.shields.io/badge/Backend-Spring%20Boot%203.4.2-blue.svg)](https://spring.io/projects/spring-boot)
[![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite%208-blue.svg)](https://vitejs.dev/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%2016%20%2B%20PostGIS-blue.svg)](https://postgis.net/)


---

## Live Demo

- **Live Application**: [https://green-move-delta.vercel.app/](https://green-move-delta.vercel.app/)
- **GitHub Repository**: [https://github.com/Nandini-Chourasiya/GreenMove](https://github.com/Nandini-Chourasiya/GreenMove)

---

## Overview

Modern urban transportation systems force commuters to use fragmented tools: traditional navigation engines optimize only for speed, carpooling services lack spatial route matching, and electric vehicle tools display charging infrastructure without evaluating trip feasibility.

**GreenMove** integrates these domains into a single transportation decision platform. By combining EV trip intelligence, PostGIS spatial carpool matching, multi-provider resilient route planning, and real-time environmental impact accounting, GreenMove enables commuters to evaluate travel choices across five dimensions: **Distance**, **Duration**, **Financial Cost**, **Occupancy**, and **Carbon Footprint ($\text{CO}_2$)**.

---

## System Architecture

![GreenMove System Architecture](docs/assets/system-architecture.png)

### Architectural Overview

1. **Client Layer (React 18 + Vite 8)**: Manages interactive GIS maps (MapLibre GL / Leaflet), multimodal route comparison, active carpool tracking, EV trip planning, and impact metrics.
2. **REST API Gateway & Security Layer (Spring Boot 3.4 + Spring Security)**: Handles stateless JWT authentication, Google OAuth 2.0 verification, input validation, and role-based access control (`USER`, `ADMIN`).
3. **Domain Service Layer**:
   - `EVChargingService`: Range feasibility calculation and OpenChargeMap corridor station discovery.
   - `VehiclePoolService`: PostGIS spatial matching (`ST_DWithin`), candidate filtering, direction verification, detour evaluation, and passenger fare calculation.
   - `GoogleRoutesService` & `RoutingService`: Multimodal routing, live traffic monitoring, and multi-provider fallback management.
   - `ImpactService`: Dynamic passenger savings, driver carpool earnings, fuel-based emission accounting, and Eco Score computation.
4. **Data Layer (PostgreSQL 16 + PostGIS 3.4)**: Stores user credentials, vehicle profiles, spatial route geometries (`LineString` SRID 4326), spatial candidate indexes, pool memberships, and verified impact ledger data.

---

## Core Capabilities & Workflows

### 1. EV Intelligence & Charging Corridor Discovery

Evaluates Electric Vehicle range feasibility and discovers relevant charging stations along planned travel corridors.

- **Range Feasibility Analysis**: Compares total trip distance against vehicle available range calculated from battery capacity (kWh), current charge level (%), and efficiency (km/kWh or kWh/100km):

$$R_{\text{available}} = \text{Battery Capacity (kWh)} \times \left(\frac{\text{Current Charge } \%}{100}\right) \times \text{Efficiency (km/kWh)}$$

- **Trip Feasibility Statuses**:
  - `SAFE`: Available range exceeds route distance with safety margin.
  - `CHARGING_REQUIRED`: Available range is insufficient; recommended charging stations along corridor are displayed.
  - `CRITICAL`: Battery charge is too low for the requested distance.
- **Corridor Charging Station Search**: Discovers charging stations within a $5.0\text{ km}$ buffer along the route polyline via the OpenChargeMap API, displaying verified connector types, power ratings (kW), and corridor offsets.

### 2. Vehicle Pool & Spatial Route Matching

Provides corridor-based spatial matching for shared commuting using PostGIS spatial indexing and geometric route-overlap logic.

```
Driver Creates Pool (Route Polyline Stored in PostGIS as SRID 4326)
                              ↓
      PostGIS Spatial Candidate Search (ST_DWithin 3000m Buffer)
                              ↓
  Direction Compatibility Check (Pickup Position < Dropoff Position)
                              ↓
      Driver Detour Evaluation (≤ 30% Max Detour Distance Limit)
                              ↓
            Composite Match Score Calculation (0 - 100)
                              ↓
       Passenger Joins Pool & Dynamic Fare Applied (Rate/km × Segment)
```

- **Spatial Indexing (`ST_DWithin`)**: Queries driver route geometries passing within $3,000\text{m}$ of passenger pickup and dropoff coordinates using PostGIS spatial GIST indexes.
- **Direction Compatibility**: Verifies that the passenger's pickup location appears before the dropoff location along the driver's travel line-string ($\text{pos}_{\text{pickup}} < \text{pos}_{\text{dropoff}}$).
- **Detour & Time Limits**: Enforces constraints requiring driver detour to remain $\le 30\%$ of original distance and $\le 10\text{ km}$ total deviation.
- **Dynamic Segment Pricing**: Calculates passenger fares based on actual shared passenger segment distance:

$$\text{Passenger Fare} = \text{RatePerKm} \times \text{Distance}_{\text{passenger\_segment}}$$

- **Resilient JTS Fallback**: Includes an in-memory Java Topology Suite (`LengthIndexedLine`) evaluation mode for non-PostGIS local development and testing environments.

### 3. Resilient Route Planning & Multimodal Engine

Computes multimodal routes while executing a multi-provider fallback strategy to ensure high availability.

```
Primary Provider: Google Routes API v2 (Traffic-Aware)
                          ↓ (If Unconfigured / Limit Exceeded)
Fallback Provider 1: OpenRouteService API
                          ↓ (If Unconfigured / Limit Exceeded)
Fallback Provider 2: Keyless OSRM (Open Source Routing Machine)
                          ↓ (If API Fails)
Fallback Provider 3: Geodesic Haversine Calculation
```

- **Multimodal Evaluation**: Simultaneously computes and displays metrics for Driving, Public Transit, Cycling, and Walking.
- **Live Traffic Monitoring**: Periodically checks traffic conditions on active driving routes and prompts commuters when faster reroutes are available.

### 4. Impact & Savings Accounting

Calculates environmental and financial metrics from completed shared journeys (`CREDITED` member status).

- **Solo Driving Cost**:
  $$\text{Solo Cost} = \left(\frac{\text{Distance (km)}}{\text{Vehicle Efficiency (km/l)}}\right) \times \text{Fuel Price (\text{₹}/l)}$$
- **Realized Money Saved (Passenger)**:
  $$\text{Money Saved} = \max(0, \text{Solo Cost} - \text{Passenger Fare})$$
- **$\text{CO}_2$ Emissions Saved**:
  $$\text{CO}_2 \text{ Saved (kg)} = \left(\frac{\text{Distance (km)}}{\text{Vehicle Efficiency}}\right) \times \text{Emission Factor}$$
  *(Fuel Emission Factors: Petrol $= 2.3\text{ kg/l}$, Diesel $= 2.7\text{ kg/l}$, CNG $= 1.8\text{ kg/l}$, EV Grid Electricity $= 0.8\text{ kg/kWh}$)*
- **Driver Earnings**: Carpool earnings are tracked independently as `carpoolEarnings` and explicitly distinguished from passenger savings.

---

## Technical Stack

| Component | Technology | Version / Specification |
| :--- | :--- | :--- |
| **Frontend Framework** | React | 18.3 |
| **Build Tool & Bundler** | Vite | 8.2 |
| **Styling** | Tailwind CSS | Custom design system tokens |
| **GIS & Mapping** | MapLibre GL / Leaflet | Vector tiles & marker rendering |
| **Backend Framework** | Java / Spring Boot | JDK 21 / Spring Boot 3.4.2 |
| **Security Layer** | Spring Security | JWT (Bearer tokens) & Google OAuth 2.0 |
| **ORM & Spatial dialect** | Spring Data JPA / Hibernate Spatial | JTS Precision Model (SRID 4326) |
| **Database Migrations** | Flyway | SQL Migrations `V1__` to `V15__` |
| **Production Database** | PostgreSQL + PostGIS | PostgreSQL 16 / PostGIS 3.4 |
| **Development Database** | H2 Database | In-memory with H2GIS dialect |
| **External Routing** | Google Routes v2 / ORS / OSRM | Traffic-aware driving & multimodal |
| **EV Infrastructure Data** | OpenChargeMap API | Corridor charging station search |
| **Geocoding** | MapTiler / OpenStreetMap Nominatim | Forward & Reverse geocoding |
| **Email Delivery** | Brevo API | Transactional verification emails |

---

## Database Migrations & Schema Structure

The database schema is managed via 15 sequential Flyway SQL migrations:

- `V1__create_transit_schema.sql` to `V3__create_admin_schema.sql`: Initial core domain tables.
- `V4__add_user_authentication.sql`: Auth fields, BCrypt password hash, user roles (`USER`, `ADMIN`).
- `V5__create_vehicle_pool_schema.sql` & `V6__vehicle_pool_lifecycle_status.sql`: Vehicle pool tables, available seats, lifecycle states (`ACTIVE`, `COMPLETED`, `TERMINATED`).
- `V7__add_profile_settings.sql` & `V8__add_email_verification.sql`: Vehicle parameters, fuel types, verification tokens.
- `V9__enable_postgis.sql` to `V13__create_functional_geography_index.sql`: PostGIS spatial extensions, `geography` columns, GIST spatial indexes on route geometries and endpoints.
- `V14__add_join_pool_phone_and_fare_fields.sql` & `V15__add_my_impact_savings_fields.sql`: Passenger phone validation, fare tracking, realized savings, and cumulative driver earnings.

---

## Security Architecture

- **Stateless Authentication**: Protected REST endpoints require a valid HTTP `Authorization: Bearer <JWT>` header.
- **Google OAuth 2.0 Integration**: Backend verifies ID tokens issued by Google using `GoogleTokenVerifierService`.
- **Password Encryption**: User passwords are encrypted with BCrypt (`BCryptPasswordEncoder`).
- **Input & Phone Validation**: Enforces strict validation rules (e.g. 10-digit numeric phone format `^[0-9]{10}$` for pool joins).
- **Environment Secret Isolation**: API keys (`GOOGLE_ROUTES_API_KEY`, `JWT_SECRET`, `VITE_MAPTILER_API_KEY`) are managed strictly via environment variables and never committed to version control.

---

## Local Development Setup

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Java JDK**: 21
- **Maven**: 3.8+ (or use included `.\mvnw.cmd`)

### 1. Clone the Repository

```bash
git clone https://github.com/Nandini-Chourasiya/GreenMove.git
cd GreenMove
```

### 2. Frontend Setup

```bash
# Install NPM dependencies
npm install

# Start Vite development server
npm run dev
```

The frontend will run locally at `http://localhost:5173` (or `http://localhost:5174`).

### 3. Backend Setup

```bash
cd backend

# Run Spring Boot server using local test profile (H2 in-memory DB)
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.arguments=--spring.profiles.active=test"
```

The backend API will run locally at `http://localhost:8080`.

### 4. Running Tests

```bash
# Frontend Unit Tests (Vitest)
npm run test

# Backend Unit Tests (JUnit 5 + Spring Boot Test)
cd backend
.\mvnw.cmd test
```

---

## System Resiliency & Technical Limitations

- **Routing Provider Redundancy**: If Google Routes API is unconfigured or rate-limited, the system automatically falls back to OpenRouteService, OSRM, and Haversine geodesic calculation without throwing unhandled exceptions to the user.
- **Spatial Fallback**: If PostGIS extensions are unavailable (e.g., local H2 test profile), the backend switches to Java Topology Suite (`LengthIndexedLine`) in-memory spatial matching.
- **Data Limitations**: Emission metrics are comparative estimations computed from standard fuel factor references rather than direct OBD-II hardware telemetry.

---

## Project & Event Information

- **Event**: IKIGAI 2026
- **Problem Statement**: IHSA5 — Sustainable Transportation
- **Repository**: [Nandini-Chourasiya/GreenMove](https://github.com/Nandini-Chourasiya/GreenMove)

