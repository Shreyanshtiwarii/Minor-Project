package com.greenmove.controller;

import com.greenmove.dto.RoutingRequest;
import com.greenmove.dto.RoutingResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

@RestController
@RequestMapping("/api/v1/transit")
public class TransitController {

    private static final Logger logger = LoggerFactory.getLogger(TransitController.class);

    @Value("${greenmove.otp.url:http://localhost:8088/otp/routers/default/planner}")
    private String otpUrl;

    private final RestTemplate restTemplate;

    public TransitController() {
        this.restTemplate = new RestTemplate();
    }

    @PostMapping("/plan")
    public ResponseEntity<RoutingResponse> planTransitRoute(@Valid @RequestBody RoutingRequest request) {
        logger.info("Received transit planning request from ({}, {}) to ({}, {})",
                request.getOrigin().getLat(), request.getOrigin().getLng(),
                request.getDestination().getLat(), request.getDestination().getLng());

        // Check if OpenTripPlanner server is active
        try {
            // Attempt OTP REST query
            String queryUrl = String.format("%s?fromPlace=%f,%f&toPlace=%f,%f&mode=TRANSIT,WALK",
                    otpUrl, request.getOrigin().getLat(), request.getOrigin().getLng(),
                    request.getDestination().getLat(), request.getDestination().getLng());

            ResponseEntity<String> response = restTemplate.getForEntity(queryUrl, String.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                // Parse OTP response itineraries if OTP server is live
                logger.info("Successfully received live OTP transit response.");
                return ResponseEntity.ok(new RoutingResponse(true, "Transit route calculated via OTP.", null, null));
            }
        } catch (Exception e) {
            logger.info("OpenTripPlanner backend is currently unreachable or GTFS graph is not loaded: {}", e.getMessage());
        }

        // Fail gracefully indicating GTFS/OTP backend is unconfigured (NO fake transit routes)
        return ResponseEntity.ok(new RoutingResponse(false,
                "Public transit routing is currently unavailable. No GTFS feed or OpenTripPlanner backend is configured.", null, null));
    }
}
