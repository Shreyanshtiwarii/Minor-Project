package com.greenmove.dto;

import java.util.List;

public class EVRouteSearchRequest {
    private List<RoutingRequest.Coordinate> waypoints;
    private Double corridorKm = 5.0;

    public EVRouteSearchRequest() {}

    public EVRouteSearchRequest(List<RoutingRequest.Coordinate> waypoints, Double corridorKm) {
        this.waypoints = waypoints;
        this.corridorKm = corridorKm;
    }

    public List<RoutingRequest.Coordinate> getWaypoints() { return waypoints; }
    public void setWaypoints(List<RoutingRequest.Coordinate> waypoints) { this.waypoints = waypoints; }

    public Double getCorridorKm() { return corridorKm; }
    public void setCorridorKm(Double corridorKm) { this.corridorKm = corridorKm; }
}
