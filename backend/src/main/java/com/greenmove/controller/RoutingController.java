package com.greenmove.controller;

import com.greenmove.dto.RoutingRequest;
import com.greenmove.dto.RoutingResponse;
import com.greenmove.service.GoogleRoutesService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/routing")
public class RoutingController {

    private final GoogleRoutesService googleRoutesService;

    public RoutingController(GoogleRoutesService googleRoutesService) {
        this.googleRoutesService = googleRoutesService;
    }

    @PostMapping("/directions")
    public ResponseEntity<RoutingResponse> calculateDirections(@Valid @RequestBody RoutingRequest request) {
        RoutingResponse response = googleRoutesService.computeTrafficRoutes(request);
        return ResponseEntity.ok(response);
    }
}
