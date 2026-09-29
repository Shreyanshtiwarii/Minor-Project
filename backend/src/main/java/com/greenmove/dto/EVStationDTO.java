package com.greenmove.dto;

import java.util.ArrayList;
import java.util.List;

public class EVStationDTO {
    private String id;
    private String name;
    private Double latitude;
    private Double longitude;
    private String address;
    private String city;
    private String state;
    private String country;
    private String status;
    private Boolean isRecentlyVerified;
    private String lastVerified;
    private Integer numberOfPoints;
    private Double distanceFromRouteKm;
    private String attribution = "Data provided by Open Charge Map (openchargemap.io)";
    private List<EVConnectorDTO> connectors = new ArrayList<>();

    public EVStationDTO() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Boolean getIsRecentlyVerified() { return isRecentlyVerified; }
    public void setIsRecentlyVerified(Boolean isRecentlyVerified) { this.isRecentlyVerified = isRecentlyVerified; }

    public String getLastVerified() { return lastVerified; }
    public void setLastVerified(String lastVerified) { this.lastVerified = lastVerified; }

    public Integer getNumberOfPoints() { return numberOfPoints; }
    public void setNumberOfPoints(Integer numberOfPoints) { this.numberOfPoints = numberOfPoints; }

    public Double getDistanceFromRouteKm() { return distanceFromRouteKm; }
    public void setDistanceFromRouteKm(Double distanceFromRouteKm) { this.distanceFromRouteKm = distanceFromRouteKm; }

    public String getAttribution() { return attribution; }
    public void setAttribution(String attribution) { this.attribution = attribution; }

    public List<EVConnectorDTO> getConnectors() { return connectors; }
    public void setConnectors(List<EVConnectorDTO> connectors) { this.connectors = connectors; }
}
