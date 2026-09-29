package com.greenmove.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "emission_factors")
public class EmissionFactorEntity {

    @Id
    private String id; // car_petrol, car_diesel, car_cng, ev_grid, public_bus, motorcycle

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private Double factor;

    @Column(nullable = false)
    private String unit; // kg CO2e / km, kg CO2e / p.km

    @Column(nullable = false)
    private String source;

    @Column(name = "updated_at")
    private String updatedAt;

    @Column(name = "updated_by")
    private String updatedBy;

    public EmissionFactorEntity() {}

    public EmissionFactorEntity(String id, String category, Double factor, String unit, String source, String updatedAt, String updatedBy) {
        this.id = id;
        this.category = category;
        this.factor = factor;
        this.unit = unit;
        this.source = source;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public Double getFactor() { return factor; }
    public void setFactor(Double factor) { this.factor = factor; }

    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
}
