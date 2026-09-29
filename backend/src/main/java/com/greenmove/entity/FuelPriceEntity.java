package com.greenmove.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "fuel_prices")
public class FuelPriceEntity {

    @Id
    private String id; // petrol, diesel, cng, ev_electricity

    @Column(name = "fuel_type", nullable = false)
    private String fuelType;

    @Column(nullable = false)
    private Double price;

    @Column(nullable = false)
    private String unit; // per litre, per kg, per kWh

    @Column(nullable = false)
    private String source;

    @Column(name = "updated_at")
    private String updatedAt;

    @Column(name = "updated_by")
    private String updatedBy;

    public FuelPriceEntity() {}

    public FuelPriceEntity(String id, String fuelType, Double price, String unit, String source, String updatedAt, String updatedBy) {
        this.id = id;
        this.fuelType = fuelType;
        this.price = price;
        this.unit = unit;
        this.source = source;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getFuelType() { return fuelType; }
    public void setFuelType(String fuelType) { this.fuelType = fuelType; }

    public Double getPrice() { return price; }
    public void setPrice(Double price) { this.price = price; }

    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
}
