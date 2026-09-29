package com.greenmove.controller;

import com.greenmove.dto.EVRouteSearchRequest;
import com.greenmove.dto.EVStationDTO;
import com.greenmove.dto.RoutingRequest;
import com.greenmove.service.EVChargingService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/ev-charging")
public class EVChargingController {

    private final EVChargingService evChargingService;

    public EVChargingController(EVChargingService evChargingService) {
        this.evChargingService = evChargingService;
    }

    @PostMapping("/stations-along-route")
    public ResponseEntity<List<EVStationDTO>> getStationsAlongRoute(@RequestBody EVRouteSearchRequest request) {
        if (request == null || request.getWaypoints() == null || request.getWaypoints().isEmpty()) {
            return ResponseEntity.ok(new ArrayList<>());
        }
        List<EVStationDTO> stations = evChargingService.findStationsAlongRoute(request.getWaypoints(), request.getCorridorKm());
        return ResponseEntity.ok(stations);
    }

    @GetMapping("/stations-near-location")
    public ResponseEntity<List<EVStationDTO>> getStationsNearLocation(
            @RequestParam(name = "lat") Double lat,
            @RequestParam(name = "lng") Double lng,
            @RequestParam(name = "radiusKm", required = false, defaultValue = "5.0") Double radiusKm) {

        List<RoutingRequest.Coordinate> waypoints = List.of(new RoutingRequest.Coordinate(lat, lng));
        List<EVStationDTO> stations = evChargingService.findStationsAlongRoute(waypoints, radiusKm);
        return ResponseEntity.ok(stations);
    }
}
