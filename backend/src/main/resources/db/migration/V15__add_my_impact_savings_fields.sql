ALTER TABLE vehicle_pool_member ADD COLUMN status VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE vehicle_pool_member ADD COLUMN money_saved DOUBLE PRECISION;
ALTER TABLE vehicle_pool_member ADD COLUMN co2_saved_kg DOUBLE PRECISION;

ALTER TABLE app_users ADD COLUMN vehicle_efficiency DOUBLE PRECISION;
ALTER TABLE app_users ADD COLUMN fuel_type VARCHAR(50);
ALTER TABLE vehicle_pool_member ADD COLUMN solo_cost DOUBLE PRECISION;
