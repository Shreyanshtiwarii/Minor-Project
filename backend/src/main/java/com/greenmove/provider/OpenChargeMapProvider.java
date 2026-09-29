package com.greenmove.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.greenmove.dto.EVConnectorDTO;
import com.greenmove.dto.EVStationDTO;
import com.greenmove.dto.RoutingRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;

@Component
public class OpenChargeMapProvider implements EVChargingProvider {

    private static final Logger log = LoggerFactory.getLogger(OpenChargeMapProvider.class);
    private static final String OCM_API_URL = "https://api.openchargemap.io/v3/poi/";

    @Value("${greenmove.ev.ocm-api-key:}")
    private String ocmApiKey;

    private final RestTemplate restTemplate = new RestTemplate();

    @Override
    public String getProviderName() {
        return "OpenChargeMap";
    }

    @Override
    public List<EVStationDTO> fetchRawStationsNearRoute(List<RoutingRequest.Coordinate> routeWaypoints, double searchRadiusKm) {
        List<EVStationDTO> stations = new ArrayList<>();
        if (routeWaypoints == null || routeWaypoints.isEmpty()) {
            return stations;
        }

        // Calculate route center & bounding box
        double minLat = 90.0, maxLat = -90.0, minLng = 180.0, maxLng = -180.0;
        for (RoutingRequest.Coordinate c : routeWaypoints) {
            if (c.getLat() < minLat) minLat = c.getLat();
            if (c.getLat() > maxLat) maxLat = c.getLat();
            if (c.getLng() < minLng) minLng = c.getLng();
            if (c.getLng() > maxLng) maxLng = c.getLng();
        }

        double centerLat = (minLat + maxLat) / 2.0;
        double centerLng = (minLng + maxLng) / 2.0;
        double radiusKm = Math.max(15.0, searchRadiusKm);

        try {
            String url = String.format("%s?latitude=%.6f&longitude=%.6f&distance=%.1f&distanceunit=KM&countrycode=IN&maxresults=100&compact=true&verbose=false",
                    OCM_API_URL, centerLat, centerLng, radiusKm);

            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GreenMove-EV-Route/1.0");
            headers.set("Accept", "application/json");
            if (ocmApiKey != null && !ocmApiKey.isBlank()) {
                headers.set("X-API-Key", ocmApiKey.trim());
            }

            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null && response.getBody().isArray()) {
                for (JsonNode poi : response.getBody()) {
                    EVStationDTO dto = parsePoiNode(poi);
                    if (dto != null) {
                        stations.add(dto);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to fetch OCM POIs from API: {}", e.getMessage());
        }

        return stations;
    }

    private EVStationDTO parsePoiNode(JsonNode poi) {
        try {
            JsonNode addressInfo = poi.path("AddressInfo");
            if (addressInfo.isMissingNode() || addressInfo.path("Latitude").isMissingNode()) {
                return null;
            }

            EVStationDTO station = new EVStationDTO();
            station.setId("ocm_" + poi.path("ID").asText());
            station.setName(addressInfo.path("Title").asText("EV Charging Station"));
            station.setLatitude(addressInfo.path("Latitude").asDouble());
            station.setLongitude(addressInfo.path("Longitude").asDouble());

            String addressLine = addressInfo.path("AddressLine1").asText("");
            String title = addressInfo.path("Title").asText("");
            station.setAddress(!addressLine.isBlank() ? addressLine : title);
            station.setCity(addressInfo.path("Town").asText("Indore"));
            station.setState(addressInfo.path("StateOrProvince").asText("Madhya Pradesh"));
            station.setCountry(addressInfo.path("Country").path("Title").asText("India"));

            JsonNode statusNode = poi.path("StatusType");
            station.setStatus(statusNode.path("Title").asText("Operational"));

            station.setNumberOfPoints(poi.path("NumberOfPoints").asInt(2));
            station.setIsRecentlyVerified(poi.hasNonNull("DateLastVerified"));
            station.setLastVerified(poi.path("DateLastVerified").asText("Recently Verified"));

            // Parse connectors
            JsonNode connections = poi.path("Connections");
            if (connections.isArray()) {
                for (JsonNode conn : connections) {
                    EVConnectorDTO cDto = new EVConnectorDTO();
                    cDto.setConnectorType(conn.path("ConnectionType").path("Title").asText("Standard EV Plug"));
                    cDto.setPowerKw(conn.path("PowerKW").asDouble(22.0));
                    cDto.setLevel(conn.path("Level").path("Title").asText("Fast Charger"));
                    cDto.setQuantity(conn.path("Quantity").asInt(1));
                    cDto.setCurrentType(conn.path("CurrentType").path("Title").asText("AC / DC"));
                    cDto.setStatus(conn.path("StatusType").path("Title").asText("Available"));
                    station.getConnectors().add(cDto);
                }
              }

            return station;
        } catch (Exception e) {
            log.warn("Error parsing OCM POI node: {}", e.getMessage());
            return null;
        }
    }
}
