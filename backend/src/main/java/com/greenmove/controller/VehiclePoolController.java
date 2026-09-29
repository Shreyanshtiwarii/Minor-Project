package com.greenmove.controller;

import com.greenmove.dto.VehiclePoolDTOs.CreatePoolRequest;
import com.greenmove.dto.VehiclePoolDTOs.PoolResponse;
import com.greenmove.service.VehiclePoolService;
import com.greenmove.service.VehiclePoolService.PoolException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import com.greenmove.config.RateLimitingService;
import io.github.bucket4j.Bucket;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST endpoints for the "Vehicle Pool" feature: browse pools, create a pool, and
 * join/leave one as an authenticated user.
 */
@RestController
@RequestMapping("/api/v1/pools")
public class VehiclePoolController {

    private final VehiclePoolService vehiclePoolService;
    private final RateLimitingService rateLimitingService;

    public VehiclePoolController(VehiclePoolService vehiclePoolService, RateLimitingService rateLimitingService) {
        this.vehiclePoolService = vehiclePoolService;
        this.rateLimitingService = rateLimitingService;
    }

    @GetMapping
    public ResponseEntity<List<PoolResponse>> listPools(Authentication authentication) {
        String currentUserId = authentication != null ? authentication.getName() : null;
        return ResponseEntity.ok(vehiclePoolService.listPools(currentUserId));
    }

    /**
     * Route-based discovery (Phase 2): returns only ACTIVE pools with an open seat whose
     * origin AND destination match the supplied route. Never returns the full pool list --
     * callers must supply both {@code origin} and {@code destination}. Public, like the
     * browse listing, but the {@code joined}/{@code own} flags on each result are still
     * personalized when the caller is authenticated.
     */
    @GetMapping("/search")
    public ResponseEntity<?> searchPools(Authentication authentication,
                                          @RequestParam(name = "origin", required = false) String origin,
                                          @RequestParam(name = "originLatitude", required = false) Double originLatitude,
                                          @RequestParam(name = "originLongitude", required = false) Double originLongitude,
                                          @RequestParam(name = "destination", required = false) String destination,
                                          @RequestParam(name = "destinationLatitude", required = false) Double destinationLatitude,
                                          @RequestParam(name = "destinationLongitude", required = false) Double destinationLongitude) {
        String currentUserId = authentication != null ? authentication.getName() : "anonymous";
        Bucket bucket = rateLimitingService.resolveSearchBucket(currentUserId);
        if (!bucket.tryConsume(1)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("message", "Rate limit exceeded. Please try again later."));
        }
        try {
            return ResponseEntity.ok(vehiclePoolService.searchPoolsSpatial(
                    currentUserId, origin, originLatitude, originLongitude,
                    destination, destinationLatitude, destinationLongitude));
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    /** Pools created by the current user that are still ACTIVE, for their "My Pools" management view. */
    @GetMapping("/mine")
    public ResponseEntity<?> listMyPools(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            return ResponseEntity.ok(vehiclePoolService.listMyPools(authentication.getName()));
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    /**
     * Pool / Trip History: every pool the current user created or joined that has since
     * been ended (completed or terminated), for their "Trip History" view.
     */
    @GetMapping("/history")
    public ResponseEntity<?> listPoolHistory(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            return ResponseEntity.ok(vehiclePoolService.listPoolHistory(authentication.getName()));
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> createPool(Authentication authentication, @Valid @RequestBody CreatePoolRequest request) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            PoolResponse pool = vehiclePoolService.createPool(authentication.getName(), request);
            return ResponseEntity.status(HttpStatus.CREATED).body(pool);
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/{id}/join")
    public ResponseEntity<?> joinPool(Authentication authentication, @PathVariable String id, @RequestBody(required = false) com.greenmove.dto.VehiclePoolDTOs.JoinPoolRequest request) {
        if (authentication == null) {
            return unauthenticated();
        }
        Bucket bucket = rateLimitingService.resolveJoinBucket(authentication.getName());
        if (!bucket.tryConsume(1)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("message", "Rate limit exceeded. Please try again later."));
        }
        try {
            PoolResponse pool = vehiclePoolService.joinPool(authentication.getName(), id, request);
            return ResponseEntity.ok(pool);
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    /**
     * Phase 3 - Driver-only Active Pool Details. Full operational view of one of the
     * caller's own pools (route geometry/distance/duration, every joined passenger's
     * pickup/dropoff coordinates & names, fare, phone number, and an APPROXIMATE pickup
     * time). Dedicated endpoint, separate from the public search/browse APIs, so passenger-
     * private data (phone number, exact coordinates/names) is never exposed there.
     * Creator-only: returns 403 for any other caller, including other joined passengers.
     */
    @GetMapping("/{id}/active-details")
    public ResponseEntity<?> getActivePoolDetails(Authentication authentication, @PathVariable("id") String id) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            return ResponseEntity.ok(vehiclePoolService.getActivePoolDetails(authentication.getName(), id));
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/{id}/leave")
    public ResponseEntity<?> leavePool(Authentication authentication, @PathVariable("id") String id) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            PoolResponse pool = vehiclePoolService.leavePool(authentication.getName(), id);
            return ResponseEntity.ok(pool);
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    /**
     * Creator manually marks the pool as completed (e.g. they've reached the final
     * destination and the shared ride is over). Creator-only.
     */
    @PostMapping("/{id}/complete")
    public ResponseEntity<?> completePool(Authentication authentication, @PathVariable("id") String id) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            PoolResponse pool = vehiclePoolService.completePool(authentication.getName(), id);
            return ResponseEntity.ok(pool);
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    /**
     * Creator manually terminates the pool early (e.g. it's full and ready to depart, or
     * the trip is being called off). Terminated pools can no longer accept new members.
     * Creator-only.
     */
    @PostMapping("/{id}/terminate")
    public ResponseEntity<?> terminatePool(Authentication authentication, @PathVariable("id") String id) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            PoolResponse pool = vehiclePoolService.terminatePool(authentication.getName(), id);
            return ResponseEntity.ok(pool);
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    /**
     * Creator-only: remove a passenger from the pool.
     * Marks membership CANCELLED, restores 1 seat, and prevents contribution to savings/CO2/impact.
     * Throws 403 for non-creators and 400 after completion/termination.
     */
    @DeleteMapping("/{id}/passengers/{passengerUserId}")
    public ResponseEntity<?> removePassenger(Authentication authentication,
                                             @PathVariable("id") String poolId,
                                             @PathVariable("passengerUserId") String passengerUserId) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            PoolResponse pool = vehiclePoolService.removePassenger(authentication.getName(), poolId, passengerUserId);
            return ResponseEntity.ok(pool);
        } catch (PoolException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    @DeleteMapping("/{id}/members/{passengerUserId}")
    public ResponseEntity<?> removePassengerMember(Authentication authentication,
                                                   @PathVariable("id") String poolId,
                                                   @PathVariable("passengerUserId") String passengerUserId) {
        return removePassenger(authentication, poolId, passengerUserId);
    }

    private ResponseEntity<?> unauthenticated() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Please sign in to continue"));
    }
}
