package com.greenmove.dto;

public class EVConnectorDTO {
    private String connectorType;
    private Double powerKw;
    private String level;
    private Integer quantity;
    private String currentType;
    private String status;

    public EVConnectorDTO() {}

    public EVConnectorDTO(String connectorType, Double powerKw, String level, Integer quantity, String currentType, String status) {
        this.connectorType = connectorType;
        this.powerKw = powerKw;
        this.level = level;
        this.quantity = quantity;
        this.currentType = currentType;
        this.status = status;
    }

    public String getConnectorType() { return connectorType; }
    public void setConnectorType(String connectorType) { this.connectorType = connectorType; }

    public Double getPowerKw() { return powerKw; }
    public void setPowerKw(Double powerKw) { this.powerKw = powerKw; }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }

    public String getCurrentType() { return currentType; }
    public void setCurrentType(String currentType) { this.currentType = currentType; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
