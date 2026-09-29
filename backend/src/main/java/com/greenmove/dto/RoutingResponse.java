package com.greenmove.dto;

import java.util.List;

public class RoutingResponse {

    public static class RouteDTO {
        private String id;
        private String mode;
        private Object geometry;
        private Double distanceMeters;
        private Double durationSeconds;
        private Double staticDurationSeconds;
        private Double trafficDurationSeconds;
        private Double trafficDelaySeconds;
        private boolean trafficAvailable;
        private String trafficStatus;
        private String trafficSeverity;
        private Double distanceKmNum;
        private String distanceKm;
        private String durationMinutes;

        public RouteDTO() {}

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }

        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }

        public Object getGeometry() { return geometry; }
        public void setGeometry(Object geometry) { this.geometry = geometry; }

        public Double getDistanceMeters() { return distanceMeters; }
        public void setDistanceMeters(Double distanceMeters) { this.distanceMeters = distanceMeters; }

        public Double getDurationSeconds() { return durationSeconds; }
        public void setDurationSeconds(Double durationSeconds) { this.durationSeconds = durationSeconds; }

        public Double getStaticDurationSeconds() { return staticDurationSeconds; }
        public void setStaticDurationSeconds(Double staticDurationSeconds) { this.staticDurationSeconds = staticDurationSeconds; }

        public Double getTrafficDurationSeconds() { return trafficDurationSeconds; }
        public void setTrafficDurationSeconds(Double trafficDurationSeconds) { this.trafficDurationSeconds = trafficDurationSeconds; }

        public Double getTrafficDelaySeconds() { return trafficDelaySeconds; }
        public void setTrafficDelaySeconds(Double trafficDelaySeconds) { this.trafficDelaySeconds = trafficDelaySeconds; }

        public boolean isTrafficAvailable() { return trafficAvailable; }
        public void setTrafficAvailable(boolean trafficAvailable) { this.trafficAvailable = trafficAvailable; }

        public String getTrafficStatus() { return trafficStatus; }
        public void setTrafficStatus(String trafficStatus) { this.trafficStatus = trafficStatus; }

        public String getTrafficSeverity() { return trafficSeverity; }
        public void setTrafficSeverity(String trafficSeverity) { this.trafficSeverity = trafficSeverity; }

        public Double getDistanceKmNum() { return distanceKmNum; }
        public void setDistanceKmNum(Double distanceKmNum) { this.distanceKmNum = distanceKmNum; }

        public String getDistanceKm() { return distanceKm; }
        public void setDistanceKm(String distanceKm) { this.distanceKm = distanceKm; }

        public String getDurationMinutes() { return durationMinutes; }
        public void setDurationMinutes(String durationMinutes) { this.durationMinutes = durationMinutes; }
    }

    private boolean success;
    private String message;
    private RouteDTO primaryRoute;
    private List<RouteDTO> allAlternatives;

    public RoutingResponse() {}

    public RoutingResponse(boolean success, String message, RouteDTO primaryRoute, List<RouteDTO> allAlternatives) {
        this.success = success;
        this.message = message;
        this.primaryRoute = primaryRoute;
        this.allAlternatives = allAlternatives;
    }

    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public RouteDTO getPrimaryRoute() { return primaryRoute; }
    public void setPrimaryRoute(RouteDTO primaryRoute) { this.primaryRoute = primaryRoute; }

    public List<RouteDTO> getAllAlternatives() { return allAlternatives; }
    public void setAllAlternatives(List<RouteDTO> allAlternatives) { this.allAlternatives = allAlternatives; }
}
