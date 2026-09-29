-- V6__vehicle_pool_lifecycle_status.sql
-- Documents and enforces the vehicle_pool lifecycle values used by the "Vehicle Pool"
-- feature's terminate/complete flow. "Full" and "Available" are derived at read time
-- from available_seats (see VehiclePoolService#computeDisplayStatus) and are never
-- persisted here -- only the three lifecycle states below are stored.

ALTER TABLE vehicle_pool
    ADD CONSTRAINT chk_vehicle_pool_status
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'TERMINATED'));
