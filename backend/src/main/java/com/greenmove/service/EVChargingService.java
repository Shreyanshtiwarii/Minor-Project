package com.greenmove.service;

import com.greenmove.dto.EVStationDTO;
import com.greenmove.dto.RoutingRequest;
import com.greenmove.provider.EVChargingProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class EVChargingService {

    private final EVChargingProvider activeProvider;

    @Value("${greenmove.ev.corridor-km:5.0}")
    private double defaultCorridorKm;

    public EVChargingService(EVChargingProvider openChargeMapProvider) {
        this.activeProvider = openChargeMapProvider;
    }

    /**
     * Calculates geodesic Haversine distance between two lat/lng coordinates in kilometers.
     */
    public static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6371; // Earth radius in km
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Finds charging stations along the calculated route within a configurable corridor (default 5.0 km).
     */
    public List<EVStationDTO> findStationsAlongRoute(List<RoutingRequest.Coordinate> waypoints, Double corridorKmInput) {
        double corridorKm = (corridorKmInput != null && corridorKmInput > 0) ? corridorKmInput : defaultCorridorKm;

        if (waypoints == null || waypoints.isEmpty()) {
            return new ArrayList<>();
        }

        // 1. Calculate search radius to fetch POIs around route bounding box
        double minLat = 90.0, maxLat = -90.0, minLng = 180.0, maxLng = -180.0;
        for (RoutingRequest.Coordinate c : waypoints) {
            if (c.getLat() < minLat) minLat = c.getLat();
            if (c.getLat() > maxLat) maxLat = c.getLat();
            if (c.getLng() < minLng) minLng = c.getLng();
            if (c.getLng() > maxLng) maxLng = c.getLng();
        }

        double diagonalKm = haversineKm(minLat, minLng, maxLat, maxLng);
        double searchRadiusKm = Math.max(15.0, (diagonalKm / 2.0) + corridorKm + 5.0);

        // 2. Fetch raw POIs from OCM provider
        List<EVStationDTO> rawStations = activeProvider.fetchRawStationsNearRoute(waypoints, searchRadiusKm);

        // 3. Filter stations by exact minimum distance to any route waypoint
        Map<String, EVStationDTO> filteredMap = new LinkedHashMap<>();

        for (EVStationDTO st : rawStations) {
            if (st.getLatitude() == null || st.getLongitude() == null) continue;

            double minDistToRoute = Double.MAX_VALUE;
            for (RoutingRequest.Coordinate wp : waypoints) {
                double dist = haversineKm(st.getLatitude(), st.getLongitude(), wp.getLat(), wp.getLng());
                if (dist < minDistToRoute) {
                    minDistToRoute = dist;
                }
            }

            // Strictly enforce corridor constraint (e.g. <= 5.0 km from route)
            if (minDistToRoute <= corridorKm) {
                st.setDistanceFromRouteKm(Math.round(minDistToRoute * 10.0) / 10.0);
                if (!filteredMap.containsKey(st.getId())) {
                    filteredMap.put(st.getId(), st);
                }
            }
        }

        List<EVStationDTO> filteredList = new ArrayList<>(filteredMap.values());
        filteredList.sort(Comparator.comparingDouble(EVStationDTO::getDistanceFromRouteKm));

        return filteredList;
    }
}
