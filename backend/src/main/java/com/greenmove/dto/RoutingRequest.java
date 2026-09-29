package com.greenmove.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;

public class RoutingRequest {

    public static class Coordinate {
        @NotNull
        private Double lat;
        @NotNull
        private Double lng;

        public Coordinate() {}

        public Coordinate(Double lat, Double lng) {
            this.lat = lat;
            this.lng = lng;
        }

        public Double getLat() {
            return lat;
        }

        public void setLat(Double lat) {
            this.lat = lat;
        }

        public Double getLng() {
            return lng;
        }

        public void setLng(Double lng) {
            this.lng = lng;
        }
    }

    @NotNull
    private Coordinate origin;

    @NotNull
    private Coordinate destination;

    private String profile = "DRIVING";
    private boolean avoidTolls = false;
    private List<Coordinate> intermediates;

    public RoutingRequest() {}

    public RoutingRequest(Coordinate origin, Coordinate destination, String profile, boolean avoidTolls) {
        this.origin = origin;
        this.destination = destination;
        this.profile = profile;
        this.avoidTolls = avoidTolls;
    }

    public Coordinate getOrigin() {
        return origin;
    }

    public void setOrigin(Coordinate origin) {
        this.origin = origin;
    }

    public Coordinate getDestination() {
        return destination;
    }

    public void setDestination(Coordinate destination) {
        this.destination = destination;
    }

    public String getProfile() {
        return profile;
    }

    public void setProfile(String profile) {
        this.profile = profile;
    }

    public boolean isAvoidTolls() {
        return avoidTolls;
    }

    public void setAvoidTolls(boolean avoidTolls) {
        this.avoidTolls = avoidTolls;
    }

    public List<Coordinate> getIntermediates() {
        return intermediates;
    }

    public void setIntermediates(List<Coordinate> intermediates) {
        this.intermediates = intermediates;
    }
}
