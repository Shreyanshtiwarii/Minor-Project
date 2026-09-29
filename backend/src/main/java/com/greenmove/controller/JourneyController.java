package com.greenmove.controller;

import com.greenmove.entity.JourneyEntity;
import com.greenmove.repository.JourneyRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class JourneyController {

    private final JourneyRepository journeyRepository;

    public JourneyController(JourneyRepository journeyRepository) {
        this.journeyRepository = journeyRepository;
    }

    @GetMapping("/journeys")
    public ResponseEntity<List<JourneyEntity>> getAllJourneys() {
        return ResponseEntity.ok(journeyRepository.findAll());
    }

    @PostMapping("/journeys")
    public ResponseEntity<?> saveJourney(@RequestBody JourneyEntity journey) {
        try {
            if (journey.getId() == null || journey.getId().isBlank()) {
                journey.setId("journey_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 5));
            }
            if (journey.getCreatedAt() == null) {
                journey.setCreatedAt(LocalDateTime.now());
            }
            JourneyEntity saved = journeyRepository.save(journey);
            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().body("Error saving journey: " + e.getMessage());
        }
    }

    @GetMapping("/carpools/matches")
    public ResponseEntity<List<JourneyEntity>> getCarpoolCandidates(@RequestParam(name = "userId", required = false, defaultValue = "") String userId) {
        if (userId == null || userId.isBlank()) {
            return ResponseEntity.ok(journeyRepository.findAll());
        }
        // Returns journeys belonging to OTHER users for true multi-user carpool discovery
        return ResponseEntity.ok(journeyRepository.findByUserIdNot(userId));
    }
}
