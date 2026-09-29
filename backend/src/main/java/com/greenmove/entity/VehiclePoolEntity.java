package com.greenmove.entity;

import jakarta.persistence.*;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.Point;
import java.time.LocalDateTime;

/**
 * A shared vehicle pool ("Vehicle Pool") created by a user, offering a fixed number
 * of seats to other authenticated users travelling the same route.
 */
@Entity
@Table(name = "vehicle_pool")
public class VehiclePoolEntity {

    @Id
    @Column(name = "id", length = 100, nullable = false)
    private String id;

    @Column(name = "creator_id", length = 100, nullable = false)
    private String creatorId;

    @Column(name = "creator_name", length = 255, nullable = false)
    private String creatorName;

    @Column(name = "start_location", length = 255, nullable = false)
    private String startLocation;

    @Column(name = "start_lat")
    private Double startLat;

    @Column(name = "start_lng")
    private Double startLng;

    @Column(name = "start_geom", columnDefinition = "geometry(Point, 4326)")
    private Point startGeom;

    @Column(name = "destination", length = 255, nullable = false)
    private String destination;

    @Column(name = "destination_lat")
    private Double destinationLat;

    @Column(name = "destination_lng")
    private Double destinationLng;

    @Column(name = "destination_geom", columnDefinition = "geometry(Point, 4326)")
    private Point destinationGeom;

    @Column(name = "route_geom", columnDefinition = "geometry(LineString, 4326)")
    private LineString routeGeom;

    @Column(name = "route_distance_meters")
    private Double routeDistanceMeters;

    @Column(name = "route_duration_seconds")
    private Integer routeDurationSeconds;

    @Column(name = "departure_time", nullable = false)
    private LocalDateTime departureTime;

    @Column(name = "total_seats", nullable = false)
    private Integer totalSeats;

    @Column(name = "available_seats", nullable = false)
    private Integer availableSeats;

    @Column(name = "cost_per_passenger", nullable = false)
    private Double costPerPassenger;

    @Column(name = "total_cost", nullable = false)
    private Double totalCost;

    @Column(name = "status", length = 50, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public VehiclePoolEntity() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getCreatorId() { return creatorId; }
    public void setCreatorId(String creatorId) { this.creatorId = creatorId; }

    public String getCreatorName() { return creatorName; }
    public void setCreatorName(String creatorName) { this.creatorName = creatorName; }

    public String getStartLocation() { return startLocation; }
    public void setStartLocation(String startLocation) { this.startLocation = startLocation; }

    public Double getStartLat() { return startLat; }
    public void setStartLat(Double startLat) { this.startLat = startLat; }

    public Double getStartLng() { return startLng; }
    public void setStartLng(Double startLng) { this.startLng = startLng; }

    public Point getStartGeom() { return startGeom; }
    public void setStartGeom(Point startGeom) { this.startGeom = startGeom; }

    public String getDestination() { return destination; }
    public void setDestination(String destination) { this.destination = destination; }

    public Double getDestinationLat() { return destinationLat; }
    public void setDestinationLat(Double destinationLat) { this.destinationLat = destinationLat; }

    public Double getDestinationLng() { return destinationLng; }
    public void setDestinationLng(Double destinationLng) { this.destinationLng = destinationLng; }

    public Point getDestinationGeom() { return destinationGeom; }
    public void setDestinationGeom(Point destinationGeom) { this.destinationGeom = destinationGeom; }

    public LineString getRouteGeom() { return routeGeom; }
    public void setRouteGeom(LineString routeGeom) { this.routeGeom = routeGeom; }

    public Double getRouteDistanceMeters() { return routeDistanceMeters; }
    public void setRouteDistanceMeters(Double routeDistanceMeters) { this.routeDistanceMeters = routeDistanceMeters; }

    public Integer getRouteDurationSeconds() { return routeDurationSeconds; }
    public void setRouteDurationSeconds(Integer routeDurationSeconds) { this.routeDurationSeconds = routeDurationSeconds; }

    public LocalDateTime getDepartureTime() { return departureTime; }
    public void setDepartureTime(LocalDateTime departureTime) { this.departureTime = departureTime; }

    public Integer getTotalSeats() { return totalSeats; }
    public void setTotalSeats(Integer totalSeats) { this.totalSeats = totalSeats; }

    public Integer getAvailableSeats() { return availableSeats; }
    public void setAvailableSeats(Integer availableSeats) { this.availableSeats = availableSeats; }

    public Double getCostPerPassenger() { return costPerPassenger; }
    public void setCostPerPassenger(Double costPerPassenger) { this.costPerPassenger = costPerPassenger; }

    public Double getTotalCost() { return totalCost; }
    public void setTotalCost(Double totalCost) { this.totalCost = totalCost; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
