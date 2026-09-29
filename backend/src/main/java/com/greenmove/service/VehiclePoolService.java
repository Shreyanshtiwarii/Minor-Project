package com.greenmove.service;

import com.fasterxml.jackson.databind.JsonNode;
import javax.sql.DataSource;
import com.greenmove.dto.RoutingRequest;
import com.greenmove.dto.RoutingResponse;
import com.greenmove.dto.RoutingResponse.RouteDTO;
import com.greenmove.dto.VehiclePoolDTOs.CreatePoolRequest;
import com.greenmove.dto.VehiclePoolDTOs.PoolMemberResponse;
import com.greenmove.dto.VehiclePoolDTOs.PoolResponse;
import com.greenmove.entity.UserEntity;
import com.greenmove.entity.VehiclePoolEntity;
import com.greenmove.entity.VehiclePoolMemberEntity;
import com.greenmove.repository.UserRepository;
import com.greenmove.repository.VehiclePoolMemberRepository;
import com.greenmove.repository.VehiclePoolRepository;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.locationtech.jts.linearref.LengthIndexedLine;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Core business logic for the "Vehicle Pool" feature: creating pools, listing them,
 * joining/leaving with safe, race-free seat accounting, and letting a pool's creator
 * manage (and manually end) the pools they created.
 *
 * Lifecycle: every pool is persisted with a lifecycle status of ACTIVE, COMPLETED, or
 * TERMINATED. "Full"/"Available" are NOT persisted lifecycle states -- they are derived
 * at read time from the live seat count, so a pool never gets stuck showing "Full" after
 * a member leaves and frees up a seat. The four statuses shown to users (Available, Full,
 * Completed, Terminated) are computed by {@link #computeDisplayStatus}.
 */
@Service
public class VehiclePoolService {

    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String STATUS_TERMINATED = "TERMINATED";

    /** Thrown for any client-facing failure (validation, conflict, not found, etc). */
    public static class PoolException extends RuntimeException {
        private final int status;
        public PoolException(int status, String message) {
            super(message);
            this.status = status;
        }
        public int getStatus() { return status; }
    }

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.max-detour-candidates:10}")
    private int maxDetourCandidates;

    /**
     * Phase 3 spatial candidate radius (metres). Applied identically to BOTH the
     * PostGIS ST_DWithin predicates (pickup and dropoff) and to the H2/JTS in-memory
     * fallback used only in non-PostgreSQL (test) environments. 3000m is inclusive on
     * both ends (a point exactly on the boundary is a candidate).
     */
    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.max-spatial-distance-meters:3000}")
    private double maxSpatialDistanceMeters;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.max-detour-distance-meters:3000}")
    private double maxDetourDistanceMeters;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.max-detour-percentage:20.0}")
    private double maxDetourPercentage;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.min-route-overlap-percentage:50.0}")
    private double minRouteOverlapPercentage;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.route-overlap-tolerance-meters:100}")
    private double routeOverlapToleranceMeters;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.scoring.overlap-weight:0.35}")
    private double overlapWeight;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.scoring.pickup-weight:0.20}")
    private double pickupWeight;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.scoring.dropoff-weight:0.15}")
    private double dropoffWeight;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.scoring.detour-weight:0.15}")
    private double detourWeight;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.scoring.time-weight:0.15}")
    private double timeWeight;

    @org.springframework.beans.factory.annotation.Value("${greenmove.vehicle-pool.matching.scoring.max-departure-time-difference-minutes:30}")
    private double maxDepartureTimeDifferenceMinutes;

    @jakarta.annotation.PostConstruct
    public void validateScoringWeights() {
        double sum = overlapWeight + pickupWeight + dropoffWeight + detourWeight + timeWeight;
        if (Math.abs(sum - 1.0) > 0.0001) {
            throw new IllegalStateException("Vehicle pool scoring weights must sum to exactly 1.0. Found: " + sum);
        }
    }

    private final VehiclePoolRepository poolRepository;
    private final VehiclePoolMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final GoogleRoutesService googleRoutesService;
    private final DataSource dataSource;
    private final com.greenmove.repository.FuelPriceRepository fuelPriceRepository;
    private final com.greenmove.repository.EmissionFactorRepository emissionFactorRepository;

    public VehiclePoolService(VehiclePoolRepository poolRepository,
                               VehiclePoolMemberRepository memberRepository,
                               UserRepository userRepository,
                               GoogleRoutesService googleRoutesService,
                               DataSource dataSource,
                               com.greenmove.repository.FuelPriceRepository fuelPriceRepository,
                               com.greenmove.repository.EmissionFactorRepository emissionFactorRepository) {
        this.poolRepository = poolRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
        this.googleRoutesService = googleRoutesService;
        this.dataSource = dataSource;
        this.fuelPriceRepository = fuelPriceRepository;
        this.emissionFactorRepository = emissionFactorRepository;
    }

    public UserEntity requireUser(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new PoolException(401, "Not authenticated");
        }
        return userRepository.findById(userId)
                .orElseThrow(() -> new PoolException(401, "Not authenticated"));
    }

    @Transactional(readOnly = true)
    public List<PoolResponse> listPools(String currentUserId) {
        List<VehiclePoolEntity> pools = poolRepository.findAllByOrderByDepartureTimeAsc();
        Set<String> joinedPoolIds = joinedPoolIdsFor(currentUserId);

        return pools.stream()
                .filter(p -> isVisibleInBrowse(p, currentUserId, joinedPoolIds))
                .map(p -> toResponse(p, currentUserId, joinedPoolIds.contains(p.getId()), false))
                .collect(Collectors.toList());
    }

    /**
     * Public "Browse Pools" visibility rule. ACTIVE pools are visible to everyone, same
     * as before. Once a pool has been ended by its creator (COMPLETED or TERMINATED), it
     * is removed from the public browse listing for unrelated users -- but it stays
     * visible to the pool's creator and to any user who had already joined it, so they
     * keep a record of a ride they were part of. This is enforced here, server-side, so
     * it can't be bypassed by a client that skips frontend filtering.
     */
    private boolean isVisibleInBrowse(VehiclePoolEntity p, String currentUserId, Set<String> joinedPoolIds) {
        if (STATUS_ACTIVE.equals(p.getStatus())) {
            return true;
        }
        if (currentUserId == null || currentUserId.isBlank()) {
            return false;
        }
        return currentUserId.equals(p.getCreatorId()) || joinedPoolIds.contains(p.getId());
    }

    /**
     * Route-based pool discovery (Phase 2). Unlike {@link #listPools}, this does NOT
     * return the full browse list -- the caller must supply an origin and a destination,
     * and only pools that (a) are in the ACTIVE lifecycle state, (b) still have at least
     * one open seat, (c) haven't already departed, and (d) match both the origin and the
     * destination (case/whitespace-insensitive) are returned. Terminated, completed, full,
     * departed, and route-mismatched pools are never returned here, regardless of who's
     * asking -- this is a strict subset of the Phase 1 browse-visibility rules, enforced
     * entirely server-side so a client can't get unrelated-route or ended pools by calling
     * the API directly.
     */
    @Transactional(readOnly = true)
    public List<PoolResponse> searchPools(String currentUserId, String origin, String destination) {
        if (origin == null || origin.isBlank()) {
            throw new PoolException(400, "Please enter your current location / origin");
        }
        if (destination == null || destination.isBlank()) {
            throw new PoolException(400, "Please enter your destination");
        }

        String normalizedOrigin = normalizeRouteText(origin);
        String normalizedDestination = normalizeRouteText(destination);
        LocalDateTime now = LocalDateTime.now();

        List<VehiclePoolEntity> candidates =
                poolRepository.findByStatusAndAvailableSeatsGreaterThanOrderByDepartureTimeAsc(STATUS_ACTIVE, 0);
        Set<String> joinedPoolIds = joinedPoolIdsFor(currentUserId);

        return candidates.stream()
                .filter(p -> normalizeRouteText(p.getStartLocation()).equals(normalizedOrigin))
                .filter(p -> normalizeRouteText(p.getDestination()).equals(normalizedDestination))
                .filter(p -> p.getDepartureTime() != null && p.getDepartureTime().isAfter(now))
                .map(p -> toResponse(p, currentUserId, joinedPoolIds.contains(p.getId()), false))
                .collect(Collectors.toList());
    }

    /**
     * Phase 3 – PostGIS spatial candidate search.
     *
     * Finds ACTIVE Vehicle Pools whose stored route_geom (a road-aligned LineString,
     * SRID 4326) lies within maxSpatialDistanceMeters (configurable, default 3000m) of
     * BOTH the passenger's pickup point AND the passenger's dropoff point. All filtering
     * is done in PostgreSQL/PostGIS via ST_DWithin so the existing GiST index on
     * route_geom is used.
     *
     *
     * Falls back to the legacy text-based searchPools when coordinates are absent, so
     * existing callers that only send origin/destination strings keep working unchanged.
     */

    private static class CandidatePair {
        VehiclePoolEntity entity;
        PoolResponse response;
        CandidatePair(VehiclePoolEntity entity, PoolResponse response) {
            this.entity = entity;
            this.response = response;
        }
    }

    /** Minimum distance (metres) below which pickup and dropoff are considered the same location. */
    private static final double MIN_PICKUP_DROPOFF_SEPARATION_METERS = 50.0;

    @Transactional(readOnly = true, noRollbackFor = Exception.class)
    public List<PoolResponse> searchPoolsSpatial(
            String currentUserId,
            String originName,
            Double originLatitude,
            Double originLongitude,
            String destinationName,
            Double destinationLatitude,
            Double destinationLongitude) {

        // If no coordinates are provided at all, fall back to the legacy text-match search
        // so existing callers (and existing tests) are unaffected.
        boolean hasCoordinates =
                originLatitude != null || originLongitude != null
                        || destinationLatitude != null || destinationLongitude != null;

        if (!hasCoordinates) {
            return searchPools(currentUserId, originName, destinationName);
        }

        // ---- Coordinate validation ----
        validateCoordinateBounds(originLatitude, originLongitude, "pickup");
        validateCoordinateBounds(destinationLatitude, destinationLongitude, "dropoff");

        // ---- Same-location guard (geographic tolerance, no DB round-trip needed) ----
        double separationMeters = haversineMeters(
                originLatitude, originLongitude,
                destinationLatitude, destinationLongitude);
        if (separationMeters < MIN_PICKUP_DROPOFF_SEPARATION_METERS) {
            throw new PoolException(400,
                    "Pickup and dropoff locations are effectively the same (within "
                            + (int) MIN_PICKUP_DROPOFF_SEPARATION_METERS + " m). "
                            + "Please choose distinct locations.");
        }

        // ---- PostGIS candidate query (indexed, done in DB) ----
        LocalDateTime now = LocalDateTime.now();
        List<VehiclePoolRepository.SpatialCandidateProjection> projections;
        boolean useFallback = false;
        try {
            projections = poolRepository.findSpatialCandidates(
                    originLatitude, originLongitude,
                    destinationLatitude, destinationLongitude,
                    maxSpatialDistanceMeters,
                    now);
        } catch (Exception e) {
            if (isH2Database()) {
                System.err.println("PostgreSQL native spatial query failed. Falling back to Java/JTS in-memory search: " + e.getMessage());
                projections = List.of();
                useFallback = true;
            } else {
                System.err.println("Database spatial query failed in production PostgreSQL environment: " + e.getMessage());
                throw new PoolException(500, "Database spatial query failed. Please verify PostGIS extensions and indexes.");
            }
        }

        List<CandidatePair> phase4Pairs;
        if (useFallback) {
            List<VehiclePoolEntity> activePools = poolRepository
                    .findByStatusAndAvailableSeatsGreaterThanOrderByDepartureTimeAsc(STATUS_ACTIVE, 0);
            Set<String> joinedPoolIds = joinedPoolIdsFor(currentUserId);
            phase4Pairs = activePools.stream()
                    .filter(p -> p.getRouteGeom() != null)
                    .filter(p -> p.getDepartureTime() != null && p.getDepartureTime().isAfter(now))
                    .map(p -> {
                        if (p.getRouteGeom().getNumPoints() < 2) {
                            return null;
                        }
                        double pickupDist = distancePointToLineStringMeters(originLatitude, originLongitude, p.getRouteGeom());
                        double dropoffDist = distancePointToLineStringMeters(destinationLatitude, destinationLongitude, p.getRouteGeom());
                        if (pickupDist <= maxSpatialDistanceMeters && dropoffDist <= maxSpatialDistanceMeters) {
                            Point pickupPt = createPoint(originLatitude, originLongitude);
                            Point dropoffPt = createPoint(destinationLatitude, destinationLongitude);
                            double pickupPos = locatePointOnLineString(pickupPt, p.getRouteGeom());
                            double dropoffPos = locatePointOnLineString(dropoffPt, p.getRouteGeom());
                            
                            // Direction compatibility check
                            if (pickupPos < dropoffPos && Math.abs(pickupPos - dropoffPos) >= 0.000001) {
                                PoolResponse r = toResponse(p, currentUserId, joinedPoolIds.contains(p.getId()), false);
                                r.setPickupDistanceMeters(roundDistance(pickupDist));
                                r.setDropoffDistanceMeters(roundDistance(dropoffDist));
                                r.setPickupRoutePosition(pickupPos);
                                r.setDropoffRoutePosition(dropoffPos);
                                r.setDirectionCompatible(true);
                                r.setCandidate(true);
                                return new CandidatePair(p, r);
                            }
                        }
                        return null;
                    })
                    .filter(r -> r != null)
                    .collect(Collectors.toList());
        } else {
            if (projections.isEmpty()) {
                return List.of();
            }

            // Fetch full entities for the matching IDs (small candidate list)
            List<String> candidateIds = projections.stream()
                    .map(VehiclePoolRepository.SpatialCandidateProjection::getPoolId)
                    .collect(Collectors.toList());

            Map<String, VehiclePoolEntity> entityMap = poolRepository.findAllById(candidateIds)
                    .stream()
                    .collect(Collectors.toMap(VehiclePoolEntity::getId, e -> e));

            Map<String, VehiclePoolRepository.SpatialCandidateProjection> distanceMap =
                    projections.stream()
                            .collect(Collectors.toMap(
                                    VehiclePoolRepository.SpatialCandidateProjection::getPoolId,
                                    p -> p));

            Set<String> joinedPoolIds = joinedPoolIdsFor(currentUserId);

            phase4Pairs = candidateIds.stream()
                .map(entityMap::get)
                .filter(e -> e != null)
                .map(e -> {
                    VehiclePoolRepository.SpatialCandidateProjection dist = distanceMap.get(e.getId());
                    if (dist != null) {
                        Double pickupPos = dist.getPickupRoutePosition();
                        Double dropoffPos = dist.getDropoffRoutePosition();
                        if (pickupPos != null && dropoffPos != null) {
                            // Direction compatibility check
                            if (pickupPos < dropoffPos && Math.abs(pickupPos - dropoffPos) >= 0.000001) {
                                PoolResponse r = toResponse(e, currentUserId, joinedPoolIds.contains(e.getId()), false);
                                r.setPickupDistanceMeters(roundDistance(dist.getPickupDistanceMeters()));
                                r.setDropoffDistanceMeters(roundDistance(dist.getDropoffDistanceMeters()));
                                r.setPickupRoutePosition(pickupPos);
                                r.setDropoffRoutePosition(dropoffPos);
                                r.setDirectionCompatible(true);
                                r.setCandidate(true);
                                return new CandidatePair(e, r);
                            }
                        }
                    }
                    return null;
                })
                .filter(r -> r != null)
                .collect(Collectors.toList());
        }

        if (phase4Pairs.isEmpty()) {
            return List.of();
        }
        
        return processPhase5(phase4Pairs, originLatitude, originLongitude, destinationLatitude, destinationLongitude);
    }
    
    private List<PoolResponse> processPhase5(List<CandidatePair> candidates, 
                                             Double pickupLat, Double pickupLng, 
                                             Double dropoffLat, Double dropoffLng) {
        
        candidates = candidates.stream().limit(maxDetourCandidates).collect(Collectors.toList());
        
        // 1. Passenger route C -> D
        RoutingRequest passReq = new RoutingRequest(
            new RoutingRequest.Coordinate(pickupLat, pickupLng),
            new RoutingRequest.Coordinate(dropoffLat, dropoffLng),
            "DRIVING", false);
            
        RoutingResponse passResp = googleRoutesService.computeTrafficRoutes(passReq);
        if (!passResp.isSuccess() || passResp.getPrimaryRoute() == null || passResp.getPrimaryRoute().getGeometry() == null) {
            throw new PoolException(500, "Passenger route calculation failed. Unable to evaluate candidate detours.");
        }
        
        RouteDTO passRoute = passResp.getPrimaryRoute();
        Double passDistMeters = passRoute.getDistanceMeters();
        Integer passDurationSecs = passRoute.getDurationSeconds() != null ? passRoute.getDurationSeconds().intValue() : 0;
        
        if (passDistMeters == null || passDistMeters <= 0) {
            throw new PoolException(500, "Passenger route calculation returned invalid distance.");
        }
        
        LineString passengerLineString = buildLineStringFromRouteDTO(passRoute);
        if (passengerLineString == null || passengerLineString.getNumPoints() < 2) {
            throw new PoolException(500, "Passenger route geometry missing or invalid.");
        }
        
        org.locationtech.jts.io.WKTReader wktReader = new org.locationtech.jts.io.WKTReader(new GeometryFactory(new PrecisionModel(), 4326));
        
        List<PoolResponse> finalResults = new ArrayList<>();
        
        for (CandidatePair pair : candidates) {
            VehiclePoolEntity entity = pair.entity;
            PoolResponse res = pair.response;
            
            res.setPassengerRouteDistanceMeters(passDistMeters);
            res.setPassengerRouteDurationSeconds(passDurationSecs);
            // Phase 1 - Dynamic carpool pricing: reuse the driver's ratePerKm (already computed
            // in toResponse from existing driver data) and the Phase 5 passenger C->D distance
            // computed once above -- no additional Google Routes call is made for pricing.
            res.setPassengerFare(computePassengerFare(res.getRatePerKm(), passDistMeters));
            
            try {
                // 2. Driver Segment
                double startFrac = res.getPickupRoutePosition();
                double endFrac = res.getDropoffRoutePosition();
                
                Double segmentDist = 0.0;
                LineString driverSegmentGeom = null;
                
                if (isH2Database()) {
                    LengthIndexedLine indexedLine = new LengthIndexedLine(entity.getRouteGeom());
                    double len = entity.getRouteGeom().getLength();
                    org.locationtech.jts.geom.Geometry ext = indexedLine.extractLine(startFrac * len, endFrac * len);
                    if (ext instanceof LineString) {
                        driverSegmentGeom = (LineString) ext;
                        segmentDist = calculateHaversineLength(driverSegmentGeom);
                    }
                } else {
                    VehiclePoolRepository.SegmentProjection segProj = poolRepository.getDriverSegment(entity.getId(), startFrac, endFrac);
                    if (segProj != null && segProj.getSegmentGeomWkt() != null) {
                        segmentDist = segProj.getSegmentDistanceMeters();
                        driverSegmentGeom = (LineString) wktReader.read(segProj.getSegmentGeomWkt());
                    }
                }
                
                if (driverSegmentGeom == null) {
                    continue; // Failed to extract segment
                }
                
                res.setDriverSegmentDistanceMeters(Math.round(segmentDist * 10.0) / 10.0);
                
                // 3. Overlap
                double overlapPct = calculateLengthBasedOverlap(passengerLineString, driverSegmentGeom, routeOverlapToleranceMeters);
                res.setRouteOverlapPercentage(Math.round(overlapPct * 10.0) / 10.0);
                
                boolean overlapCompatible = overlapPct >= minRouteOverlapPercentage;
                res.setRouteOverlapCompatible(overlapCompatible);
                
                if (!overlapCompatible) {
                    res.setPhase5Compatible(false);
                    finalResults.add(res);
                    continue;
                }
                
                // 4. Detour
                Double origDist = entity.getRouteDistanceMeters();
                Integer origDur = entity.getRouteDurationSeconds() != null ? entity.getRouteDurationSeconds() : 0;
                
                res.setOriginalDriverDistanceMeters(origDist);
                res.setOriginalDriverDurationSeconds(origDur);
                
                // A -> C
                Double acDist = 0.0;
                Integer acDur = 0;
                if (haversineMeters(entity.getStartLat(), entity.getStartLng(), pickupLat, pickupLng) > 50) {
                    RoutingRequest acReq = new RoutingRequest(
                        new RoutingRequest.Coordinate(entity.getStartLat(), entity.getStartLng()),
                        new RoutingRequest.Coordinate(pickupLat, pickupLng), "DRIVING", false);
                    RoutingResponse acResp = googleRoutesService.computeTrafficRoutes(acReq);
                    if (acResp.isSuccess() && acResp.getPrimaryRoute() != null) {
                        acDist = acResp.getPrimaryRoute().getDistanceMeters();
                        acDur = acResp.getPrimaryRoute().getDurationSeconds() != null ? acResp.getPrimaryRoute().getDurationSeconds().intValue() : 0;
                    } else {
                        System.err.println("Failed A->C route for pool " + entity.getId());
                        continue;
                    }
                }
                
                // D -> B
                Double dbDist = 0.0;
                Integer dbDur = 0;
                if (haversineMeters(dropoffLat, dropoffLng, entity.getDestinationLat(), entity.getDestinationLng()) > 50) {
                    RoutingRequest dbReq = new RoutingRequest(
                        new RoutingRequest.Coordinate(dropoffLat, dropoffLng),
                        new RoutingRequest.Coordinate(entity.getDestinationLat(), entity.getDestinationLng()), "DRIVING", false);
                    RoutingResponse dbResp = googleRoutesService.computeTrafficRoutes(dbReq);
                    if (dbResp.isSuccess() && dbResp.getPrimaryRoute() != null) {
                        dbDist = dbResp.getPrimaryRoute().getDistanceMeters();
                        dbDur = dbResp.getPrimaryRoute().getDurationSeconds() != null ? dbResp.getPrimaryRoute().getDurationSeconds().intValue() : 0;
                    } else {
                        System.err.println("Failed D->B route for pool " + entity.getId());
                        continue;
                    }
                }
                
                Double newDist = acDist + passDistMeters + dbDist;
                Integer newDur = acDur + passDurationSecs + dbDur;
                
                res.setNewDriverDistanceMeters(newDist);
                res.setNewDriverDurationSeconds(newDur);
                
                double detourDist = Math.max(0.0, newDist - origDist);
                double detourPct = origDist > 0 ? (detourDist / origDist) * 100.0 : 0.0;
                int detourDur = Math.max(0, newDur - origDur);
                
                res.setDetourDistanceMeters(Math.round(detourDist * 10.0) / 10.0);
                res.setDetourPercentage(Math.round(detourPct * 10.0) / 10.0);
                res.setDetourDurationSeconds(detourDur);
                
                boolean detourComp = detourDist <= maxDetourDistanceMeters && detourPct <= maxDetourPercentage;
                res.setDetourCompatible(detourComp);
                
                res.setPhase5Compatible(overlapCompatible && detourComp);
                finalResults.add(res);
                
            } catch (Exception e) {
                System.err.println("Error evaluating phase 5 for candidate " + entity.getId() + ": " + e.getMessage());
            }
        }
        
        processPhase6(finalResults);
        return finalResults;
    }
    
    private LineString buildLineStringFromRouteDTO(RouteDTO route) {
        if (route.getGeometry() == null || !(route.getGeometry() instanceof Map)) return null;
        Map<?, ?> geomMap = (Map<?, ?>) route.getGeometry();
        if (!geomMap.containsKey("coordinates")) return null;
        Object coordsObj = geomMap.get("coordinates");
        if (coordsObj instanceof List) {
            List<?> coordsList = (List<?>) coordsObj;
            Coordinate[] jtsCoords = new Coordinate[coordsList.size()];
            for (int i = 0; i < coordsList.size(); i++) {
                Object ptObj = coordsList.get(i);
                if (ptObj instanceof double[]) {
                    double[] pt = (double[]) ptObj;
                    jtsCoords[i] = new Coordinate(pt[0], pt[1]);
                } else if (ptObj instanceof List) {
                    List<?> pt = (List<?>) ptObj;
                    jtsCoords[i] = new Coordinate(((Number)pt.get(0)).doubleValue(), ((Number)pt.get(1)).doubleValue());
                }
            }
            if (jtsCoords.length >= 2) {
                return new GeometryFactory(new PrecisionModel(), 4326).createLineString(jtsCoords);
            }
        }
        return null;
    }
    
    private double calculateHaversineLength(LineString ls) {
        double dist = 0.0;
        Coordinate[] coords = ls.getCoordinates();
        for (int i = 0; i < coords.length - 1; i++) {
            dist += haversineMeters(coords[i].y, coords[i].x, coords[i+1].y, coords[i+1].x);
        }
        return dist;
    }
    
    private double clampScore(double score) {
        if (Double.isNaN(score) || Double.isInfinite(score)) {
            return 0.0;
        }
        return Math.max(0.0, Math.min(100.0, score));
    }

    private double normalizeInverseDistance(Double distance, double maxDistance) {
        if (distance == null || Double.isNaN(distance) || Double.isInfinite(distance)) return 0.0;
        if (distance >= maxDistance) return 0.0;
        if (distance <= 0.0) return 100.0;
        return clampScore(100.0 * (1.0 - (distance / maxDistance)));
    }

    private double normalizeInversePercentage(Double percentage, double maxPercentage) {
        if (percentage == null || Double.isNaN(percentage) || Double.isInfinite(percentage)) return 0.0;
        if (percentage >= maxPercentage) return 0.0;
        if (percentage <= 0.0) return 100.0;
        return clampScore(100.0 * (1.0 - (percentage / maxPercentage)));
    }

    private void processPhase6(List<PoolResponse> phase5Results) {
        phase5Results.removeIf(res -> !res.isPhase5Compatible());
        if (phase5Results.isEmpty()) {
            return;
        }
        
        for (PoolResponse res : phase5Results) {
            double oScore = clampScore(res.getRouteOverlapPercentage() != null ? res.getRouteOverlapPercentage() : 0.0);
            res.setOverlapScore(Math.round(oScore * 10.0) / 10.0);
            
            double pScore = normalizeInverseDistance(res.getPickupDistanceMeters(), maxSpatialDistanceMeters);
            res.setPickupScore(Math.round(pScore * 10.0) / 10.0);
            
            double dScore = normalizeInverseDistance(res.getDropoffDistanceMeters(), maxSpatialDistanceMeters);
            res.setDropoffScore(Math.round(dScore * 10.0) / 10.0);
            
            double dtScore = normalizeInversePercentage(res.getDetourPercentage(), maxDetourPercentage);
            res.setDetourScore(Math.round(dtScore * 10.0) / 10.0);
            
            // Passenger requested time is NOT currently passed into searchPoolsSpatial
            // Using a clearly documented neutral score of 100 for backward compatibility.
            double tScore = 100.0;
            res.setTimeScore(tScore);
            
            double finalScore = (oScore * overlapWeight) +
                                (pScore * pickupWeight) +
                                (dScore * dropoffWeight) +
                                (dtScore * detourWeight) +
                                (tScore * timeWeight);
            
            res.setMatchScore(Math.round(finalScore * 10.0) / 10.0);
        }
        
        phase5Results.sort(Comparator
            .comparing(PoolResponse::getMatchScore, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(PoolResponse::getRouteOverlapPercentage, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(PoolResponse::getDetourPercentage, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(PoolResponse::getPickupDistanceMeters, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(PoolResponse::getDepartureTime, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(PoolResponse::getId));
            
        int rank = 1;
        for (PoolResponse res : phase5Results) {
            res.setMatchRank(rank++);
        }
    }

    private double calculateLengthBasedOverlap(LineString passLs, LineString driverSegment, double toleranceMeters) {
        double totalPassLen = 0.0;
        double overlappingPassLen = 0.0;
        
        Coordinate[] pCoords = passLs.getCoordinates();
        for (int i = 0; i < pCoords.length - 1; i++) {
            double segLen = haversineMeters(pCoords[i].y, pCoords[i].x, pCoords[i+1].y, pCoords[i+1].x);
            totalPassLen += segLen;
            
            // Subdivide segment if > 25m for better accuracy
            int steps = Math.max(1, (int) Math.ceil(segLen / 25.0));
            double stepLen = segLen / steps;
            
            double dx = pCoords[i+1].x - pCoords[i].x;
            double dy = pCoords[i+1].y - pCoords[i].y;
            
            for (int j = 0; j < steps; j++) {
                double mx = pCoords[i].x + (dx * (j + 0.5) / steps);
                double my = pCoords[i].y + (dy * (j + 0.5) / steps);
                
                double distToDriver = distancePointToLineStringMeters(my, mx, driverSegment);
                if (distToDriver <= toleranceMeters) {
                    overlappingPassLen += stepLen;
                }
            }
        }
        
        if (totalPassLen == 0) return 100.0;
        return (overlappingPassLen / totalPassLen) * 100.0;
    }

    /**
     * Haversine great-circle distance between two WGS-84 points, in metres.
     * Used only for the same-location guard (50 m threshold); PostGIS handles
     * all production distance calculations.
     */
    static double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
        final double R = 6_371_000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private boolean isH2Database() {
        if (dataSource == null) {
            return false;
        }
        try (java.sql.Connection conn = dataSource.getConnection()) {
            String dbName = conn.getMetaData().getDatabaseProductName();
            return dbName != null && dbName.toLowerCase().contains("h2");
        } catch (Exception e) {
            return false;
        }
    }

    public static double locatePointOnLineString(Point pt, LineString lineString) {
        if (lineString == null || pt == null || lineString.getNumPoints() < 2) {
            return 0.0;
        }
        LengthIndexedLine indexedLine = new LengthIndexedLine(lineString);
        double index = indexedLine.indexOf(pt.getCoordinate());
        double totalLength = lineString.getLength();
        return totalLength > 0 ? index / totalLength : 0.0;
    }

    public static double distancePointToLineStringMeters(double lat, double lng, LineString lineString) {
        if (lineString == null || lineString.getNumPoints() < 2) {
            return Double.MAX_VALUE;
        }
        double minDistance = Double.MAX_VALUE;
        Coordinate[] coords = lineString.getCoordinates();
        for (int i = 0; i < coords.length - 1; i++) {
            Coordinate a = coords[i];
            Coordinate b = coords[i + 1];
            Coordinate closest = closestPointOnSegment(lng, lat, a.x, a.y, b.x, b.y);
            double dist = haversineMeters(lat, lng, closest.y, closest.x);
            if (dist < minDistance) {
                minDistance = dist;
            }
        }
        return minDistance;
    }

    private static Coordinate closestPointOnSegment(double px, double py, double ax, double ay, double bx, double by) {
        double dx = bx - ax;
        double dy = by - ay;
        if (dx == 0 && dy == 0) {
            return new Coordinate(ax, ay);
        }
        double t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
        t = Math.max(0.0, Math.min(1.0, t));
        return new Coordinate(ax + t * dx, ay + t * dy);
    }

    /** Round PostGIS distance result to centimetre precision for a clean API response. */
    private static double roundDistance(Double raw) {
        if (raw == null) return 0.0;
        return Math.round(raw * 100.0) / 100.0;
    }

    /** Case/whitespace-insensitive normalization used to match origin/destination text. */
    private String normalizeRouteText(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().replaceAll("\\s+", " ").toLowerCase();
    }

    /**
     * Pools created by the given user that are still ACTIVE, for their "My Pools"
     * management view. Unlike the public browse listing, each pool includes its
     * passenger list so the creator can see who has joined. Once a pool is marked
     * completed or terminated it drops out of this list -- it moves to
     * {@link #listPoolHistory} instead, so "My Pools" only ever shows pools the
     * creator is still actively managing.
     */
    @Transactional(readOnly = true)
    public List<PoolResponse> listMyPools(String creatorId) {
        UserEntity creator = requireUser(creatorId);
        List<VehiclePoolEntity> pools = poolRepository.findByCreatorIdOrderByDepartureTimeAsc(creator.getId());

        return pools.stream()
                .filter(p -> STATUS_ACTIVE.equals(p.getStatus()))
                .map(p -> toResponse(p, creator.getId(), false, true))
                .collect(Collectors.toList());
    }

    /**
     * Combined "Pool / Trip History" for the given user: every pool that has been
     * ended (COMPLETED or TERMINATED) where the user was either the creator or a
     * joined passenger. This is what a completed pool moves into once its creator
     * ends it -- it disappears from the active "My Pools" list and shows up here
     * instead, for both the creator and every passenger who rode with them.
     *
     * Each entry includes the full passenger list and cost breakdown, same as
     * {@link #listMyPools}, since this is always a private, personalized view (only
     * pools the caller was actually part of are ever returned) rather than the
     * public browse listing.
     */
    @Transactional(readOnly = true)
    public List<PoolResponse> listPoolHistory(String userId) {
        UserEntity user = requireUser(userId);

        // Pools this user created and has since ended.
        List<VehiclePoolEntity> ownEnded = poolRepository.findByCreatorIdOrderByDepartureTimeAsc(user.getId())
                .stream()
                .filter(p -> !STATUS_ACTIVE.equals(p.getStatus()))
                .collect(Collectors.toList());

        // Pools this user joined as a passenger that have since ended (a user can never
        // join their own pool, so there's no overlap with ownEnded above).
        Set<String> joinedPoolIds = joinedPoolIdsFor(user.getId());
        List<VehiclePoolEntity> joinedEnded = joinedPoolIds.isEmpty()
                ? List.of()
                : poolRepository.findAllById(joinedPoolIds).stream()
                        .filter(p -> !STATUS_ACTIVE.equals(p.getStatus()))
                        .collect(Collectors.toList());

        // Merge (de-duplicated by id) and show the most recently traveled trips first.
        Map<String, VehiclePoolEntity> merged = new LinkedHashMap<>();
        for (VehiclePoolEntity p : ownEnded) {
            merged.put(p.getId(), p);
        }
        for (VehiclePoolEntity p : joinedEnded) {
            merged.putIfAbsent(p.getId(), p);
        }

        return merged.values().stream()
                .sorted(Comparator.comparing(VehiclePoolEntity::getDepartureTime,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(p -> toResponse(p, user.getId(), joinedPoolIds.contains(p.getId()), true))
                .collect(Collectors.toList());
    }

    private static final GeometryFactory GEOMETRY_FACTORY = new GeometryFactory(new PrecisionModel(), 4326);

    private void validateCoordinateBounds(Double latitude, Double longitude, String fieldName) {
        if (latitude == null || !Double.isFinite(latitude) || latitude < -90.0 || latitude > 90.0) {
            throw new PoolException(400, "Invalid or missing " + fieldName + " latitude (must be between -90 and 90)");
        }
        if (longitude == null || !Double.isFinite(longitude) || longitude < -180.0 || longitude > 180.0) {
            throw new PoolException(400, "Invalid or missing " + fieldName + " longitude (must be between -180 and 180)");
        }
    }

    public static Point createPoint(Double latitude, Double longitude) {
        if (latitude == null || longitude == null) {
            return null;
        }
        // PostGIS / JTS coordinate order: x = longitude, y = latitude
        Coordinate coord = new Coordinate(longitude, latitude);
        Point point = GEOMETRY_FACTORY.createPoint(coord);
        point.setSRID(4326);
        return point;
    }

    public static LineString convertToLineString(Object geometryObj) {
        if (geometryObj == null) {
            return null;
        }

        List<Coordinate> coordinates = new ArrayList<>();

        if (geometryObj instanceof Map<?, ?> map) {
            Object coordsObj = map.get("coordinates");
            if (coordsObj instanceof List<?> list) {
                for (Object item : list) {
                    Coordinate c = parseCoordinateItem(item);
                    if (c != null) {
                        coordinates.add(c);
                    }
                }
            } else if (map.containsKey("encodedPolyline")) {
                Object polyObj = map.get("encodedPolyline");
                if (polyObj instanceof String polyStr) {
                    return polylineToLineString(polyStr);
                }
            }
        } else if (geometryObj instanceof JsonNode jsonNode) {
            if (jsonNode.has("coordinates") && jsonNode.get("coordinates").isArray()) {
                for (JsonNode pt : jsonNode.get("coordinates")) {
                    if (pt.isArray() && pt.size() >= 2) {
                        double lng = pt.get(0).asDouble();
                        double lat = pt.get(1).asDouble();
                        if (Double.isFinite(lng) && Double.isFinite(lat)) {
                            coordinates.add(new Coordinate(lng, lat));
                        }
                    }
                }
            } else if (jsonNode.has("encodedPolyline")) {
                return polylineToLineString(jsonNode.get("encodedPolyline").asText());
            }
        } else if (geometryObj instanceof String polyStr) {
            return polylineToLineString(polyStr);
        }

        if (coordinates.size() < 2) {
            return null;
        }

        LineString lineString = GEOMETRY_FACTORY.createLineString(coordinates.toArray(new Coordinate[0]));
        lineString.setSRID(4326);
        return lineString;
    }

    private static Coordinate parseCoordinateItem(Object item) {
        if (item instanceof double[] arr && arr.length >= 2) {
            double lng = arr[0];
            double lat = arr[1];
            if (Double.isFinite(lng) && Double.isFinite(lat)) {
                return new Coordinate(lng, lat);
            }
        } else if (item instanceof List<?> list && list.size() >= 2) {
            Object obj0 = list.get(0);
            Object obj1 = list.get(1);
            if (obj0 instanceof Number num0 && obj1 instanceof Number num1) {
                double lng = num0.doubleValue();
                double lat = num1.doubleValue();
                if (Double.isFinite(lng) && Double.isFinite(lat)) {
                    return new Coordinate(lng, lat);
                }
            }
        }
        return null;
    }

    public static LineString polylineToLineString(String encoded) {
        if (encoded == null || encoded.isEmpty()) {
            return null;
        }
        List<Coordinate> coordinates = new ArrayList<>();
        int index = 0, len = encoded.length();
        int lat = 0, lng = 0;

        while (index < len) {
            int b, shift = 0, result = 0;
            do {
                b = encoded.charAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            int dlat = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            shift = 0;
            result = 0;
            do {
                b = encoded.charAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            int dlng = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
            lng += dlng;

            double pLat = lat / 1E5;
            double pLng = lng / 1E5;
            if (Double.isFinite(pLat) && Double.isFinite(pLng)) {
                coordinates.add(new Coordinate(pLng, pLat));
            }
        }

        if (coordinates.size() < 2) {
            return null;
        }

        LineString lineString = GEOMETRY_FACTORY.createLineString(coordinates.toArray(new Coordinate[0]));
        lineString.setSRID(4326);
        return lineString;
    }

    @Transactional
    public PoolResponse createPool(String creatorId, CreatePoolRequest request) {
        UserEntity creator = requireUser(creatorId);

        validateCoordinateBounds(request.getStartLatitude(), request.getStartLongitude(), "start location");
        validateCoordinateBounds(request.getDestinationLatitude(), request.getDestinationLongitude(), "destination");

        if (request.getDepartureTime().isBefore(LocalDateTime.now())) {
            throw new PoolException(400, "Departure date/time must be in the future");
        }

        // Calculate driver road route using existing GoogleRoutesService
        RoutingRequest routingReq = new RoutingRequest(
                new RoutingRequest.Coordinate(request.getStartLatitude(), request.getStartLongitude()),
                new RoutingRequest.Coordinate(request.getDestinationLatitude(), request.getDestinationLongitude()),
                "DRIVING",
                false
        );

        RoutingResponse routingResp;
        try {
            routingResp = googleRoutesService.computeTrafficRoutes(routingReq);
        } catch (Exception e) {
            throw new PoolException(400, "Unable to calculate driver road route: " + e.getMessage());
        }

        if (routingResp == null || !routingResp.isSuccess() || routingResp.getPrimaryRoute() == null) {
            String errorMsg = routingResp != null && routingResp.getMessage() != null
                    ? routingResp.getMessage()
                    : "Routing calculation failed";
            throw new PoolException(400, "Unable to calculate driver road route: " + errorMsg);
        }

        RouteDTO primaryRoute = routingResp.getPrimaryRoute();

        // Validate route distance
        Double distanceMeters = primaryRoute.getDistanceMeters();
        if (distanceMeters == null || !Double.isFinite(distanceMeters) || distanceMeters <= 0.0) {
            throw new PoolException(400, "Route calculation returned invalid or non-positive distance");
        }

        // Validate route duration
        Double durationSec = primaryRoute.getDurationSeconds();
        if (durationSec == null || !Double.isFinite(durationSec) || durationSec <= 0.0) {
            throw new PoolException(400, "Route calculation returned invalid or non-positive duration");
        }
        int routeDurationSeconds = (int) Math.round(durationSec);

        // Convert and validate route geometry LineString (SRID 4326, longitude/latitude points)
        LineString routeLineString = convertToLineString(primaryRoute.getGeometry());
        if (routeLineString == null || routeLineString.getNumPoints() < 2) {
            throw new PoolException(400, "Route calculation returned incomplete or missing route geometry (fewer than 2 points)");
        }

        VehiclePoolEntity pool = new VehiclePoolEntity();
        pool.setId("pool_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8));
        pool.setCreatorId(creator.getId());
        pool.setCreatorName(creator.getName());
        pool.setStartLocation(request.getStartLocation().trim());
        pool.setStartLat(request.getStartLatitude());
        pool.setStartLng(request.getStartLongitude());
        pool.setStartGeom(createPoint(request.getStartLatitude(), request.getStartLongitude()));
        pool.setDestination(request.getDestination().trim());
        pool.setDestinationLat(request.getDestinationLatitude());
        pool.setDestinationLng(request.getDestinationLongitude());
        pool.setDestinationGeom(createPoint(request.getDestinationLatitude(), request.getDestinationLongitude()));
        pool.setRouteGeom(routeLineString);
        pool.setRouteDistanceMeters(distanceMeters);
        pool.setRouteDurationSeconds(routeDurationSeconds);
        pool.setDepartureTime(request.getDepartureTime());
        pool.setTotalSeats(request.getTotalSeats());
        pool.setAvailableSeats(request.getTotalSeats());
        pool.setCostPerPassenger(request.getCostPerPassenger());
        pool.setTotalCost(round2(request.getCostPerPassenger() * request.getTotalSeats()));
        pool.setStatus(STATUS_ACTIVE);
        pool.setCreatedAt(LocalDateTime.now());

        VehiclePoolEntity saved = poolRepository.save(pool);
        return toResponse(saved, creator.getId(), false, false);
    }

    @Transactional
    public PoolResponse joinPool(String userId, String poolId, com.greenmove.dto.VehiclePoolDTOs.JoinPoolRequest request) {
        UserEntity user = requireUser(userId);

        VehiclePoolEntity pool = poolRepository.findByIdForUpdate(poolId)
                .orElseThrow(() -> new PoolException(404, "Vehicle pool not found"));

        if (pool.getCreatorId().equals(user.getId())) {
            throw new PoolException(400, "You can't join a pool you created");
        }
        requireJoinable(pool);
        java.util.Optional<VehiclePoolMemberEntity> existingOpt = memberRepository.findByPoolIdAndUserId(poolId, user.getId());
        if (existingOpt.isPresent()) {
            if (!"CANCELLED".equals(existingOpt.get().getStatus())) {
                throw new PoolException(409, "You've already joined this pool");
            }
        }
        if (pool.getAvailableSeats() == null || pool.getAvailableSeats() <= 0) {
            throw new PoolException(400, "This pool is full");
        }

        Double pLat = null;
        Double pLng = null;
        Double dLat = null;
        Double dLng = null;
        String pLoc = null;
        String dLoc = null;
        String phoneNumber = null;
        org.locationtech.jts.geom.Point pGeom = null;
        org.locationtech.jts.geom.Point dGeom = null;

        if (request != null) {
            pLat = request.getPickupLatitude();
            pLng = request.getPickupLongitude();
            dLat = request.getDropoffLatitude();
            dLng = request.getDropoffLongitude();
            pLoc = request.getPickupLocation();
            dLoc = request.getDropoffLocation();

            if (pLat != null && pLng != null) {
                if (pLat < -90 || pLat > 90 || pLng < -180 || pLng > 180 || Double.isNaN(pLat) || Double.isNaN(pLng)) {
                    throw new PoolException(400, "Invalid pickup coordinates");
                }
                pGeom = createPoint(pLat, pLng);
            }
            if (dLat != null && dLng != null) {
                if (dLat < -90 || dLat > 90 || dLng < -180 || dLng > 180 || Double.isNaN(dLat) || Double.isNaN(dLng)) {
                    throw new PoolException(400, "Invalid dropoff coordinates");
                }
                dGeom = createPoint(dLat, dLng);
            }

            phoneNumber = request.getPhoneNumber();
            if (phoneNumber != null && !phoneNumber.trim().isEmpty()) {
                validatePhoneNumber(phoneNumber);
                phoneNumber = phoneNumber.trim();
            }
        }

        Double ratePerKm = computeRatePerKm(pool.getCostPerPassenger(), pool.getRouteDistanceMeters());
        Double passengerDistanceMeters = (pGeom != null && dGeom != null)
                ? roundDistance(haversineMeters(pLat, pLng, dLat, dLng))
                : null;
        Double passengerFare = computePassengerFare(ratePerKm, passengerDistanceMeters);

        pool.setAvailableSeats(pool.getAvailableSeats() - 1);
        poolRepository.save(pool);

        VehiclePoolMemberEntity member = existingOpt.orElseGet(VehiclePoolMemberEntity::new);
        if (member.getId() == null) {
            member.setId("poolmem_" + System.currentTimeMillis() + "_" + java.util.UUID.randomUUID().toString().substring(0, 8));
        }
        member.setPoolId(poolId);
        member.setUserId(user.getId());
        member.setUserName(user.getName());
        member.setJoinedAt(LocalDateTime.now());
        member.setStatus("PENDING");
        
        member.setPickupLocation(pLoc);
        member.setPickupLat(pLat);
        member.setPickupLng(pLng);
        member.setPickupGeom(pGeom);
        member.setDropoffLocation(dLoc);
        member.setDropoffLat(dLat);
        member.setDropoffLng(dLng);
        member.setDropoffGeom(dGeom);
        member.setPhoneNumber(phoneNumber);
        member.setRatePerKm(ratePerKm);
        member.setPassengerRouteDistanceMeters(passengerDistanceMeters);
        member.setPassengerFare(passengerFare);

        memberRepository.save(member);

        PoolResponse response = toResponse(pool, user.getId(), true, false);
        // Surface the authoritative, server-recalculated figures back to the passenger
        // so the UI can confirm what was actually charged (never the client's own value).
        response.setPassengerRouteDistanceMeters(passengerDistanceMeters);
        response.setPassengerFare(passengerFare);

        // Phase 5 - Carpool operational integration: surface an APPROXIMATE pickup time to
        // the joining passenger on the join response itself, so the "join succeeded"
        // notification can show it immediately without a second round trip. Reuses the
        // same estimate already computed for the driver's Active Pool Details (Phase 3) --
        // derived purely from the pool's existing stored route geometry/duration, never a
        // fresh Google Routes call.
        LocalDateTime approxPickupTime = computeApproxPickupTime(pool, member);
        response.setApproxPickupTime(approxPickupTime);
        response.setPickupTimeApproximate(approxPickupTime != null);

        return response;
    }

    // =========================================================================
    //  Phase 3 - Driver-only Active Pool Details
    // =========================================================================

    /**
     * Full operational view of one of the caller's own pools -- route geometry/distance/
     * duration, every joined passenger's pickup/dropoff coordinates & names, fare, phone
     * number, and an APPROXIMATE pickup time. Creator-only: throws 403 for anyone else.
     * Deliberately served by its own read model (rather than reusing {@link #toResponse})
     * so the public search/browse responses can never accidentally start carrying
     * passenger-private fields. Reuses only data already stored on the pool/members --
     * never triggers a fresh Google routing call.
     */
    @Transactional(readOnly = true)
    public com.greenmove.dto.VehiclePoolDTOs.ActivePoolDetailsResponse getActivePoolDetails(String userId, String poolId) {
        UserEntity user = requireUser(userId);

        VehiclePoolEntity pool = poolRepository.findById(poolId)
                .orElseThrow(() -> new PoolException(404, "Vehicle pool not found"));

        if (!pool.getCreatorId().equals(user.getId())) {
            throw new PoolException(403, "Only the pool creator can view passenger details");
        }

        com.greenmove.dto.VehiclePoolDTOs.ActivePoolDetailsResponse response =
                new com.greenmove.dto.VehiclePoolDTOs.ActivePoolDetailsResponse();
        response.setId(pool.getId());
        response.setStartLocation(pool.getStartLocation());
        response.setStartLatitude(pool.getStartLat());
        response.setStartLongitude(pool.getStartLng());
        response.setDestination(pool.getDestination());
        response.setDestinationLatitude(pool.getDestinationLat());
        response.setDestinationLongitude(pool.getDestinationLng());
        response.setRouteGeometry(lineStringToGeoJson(pool.getRouteGeom()));
        response.setRouteDistanceMeters(pool.getRouteDistanceMeters());
        response.setRouteDurationSeconds(pool.getRouteDurationSeconds());
        response.setDepartureTime(pool.getDepartureTime());
        response.setStatus(computeDisplayStatus(pool));
        response.setRatePerKm(computeRatePerKm(pool.getCostPerPassenger(), pool.getRouteDistanceMeters()));

        List<VehiclePoolMemberEntity> members = memberRepository.findByPoolId(pool.getId()).stream()
                .filter(m -> !"CANCELLED".equals(m.getStatus()))
                .collect(Collectors.toList());

        List<com.greenmove.dto.VehiclePoolDTOs.PassengerDetailResponse> passengers = new ArrayList<>();
        for (VehiclePoolMemberEntity member : members) {
            com.greenmove.dto.VehiclePoolDTOs.PassengerDetailResponse pd =
                    new com.greenmove.dto.VehiclePoolDTOs.PassengerDetailResponse();
            pd.setUserId(member.getUserId());
            pd.setUserName(member.getUserName());
            pd.setPickupLocation(member.getPickupLocation());
            pd.setPickupLatitude(member.getPickupLat());
            pd.setPickupLongitude(member.getPickupLng());
            pd.setDropoffLocation(member.getDropoffLocation());
            pd.setDropoffLatitude(member.getDropoffLat());
            pd.setDropoffLongitude(member.getDropoffLng());
            pd.setPhoneNumber(member.getPhoneNumber());
            pd.setFare(member.getPassengerFare());
            pd.setPassengerDistanceMeters(member.getPassengerRouteDistanceMeters());
            pd.setJoinedAt(member.getJoinedAt());

            LocalDateTime approxPickupTime = computeApproxPickupTime(pool, member);
            pd.setApproxPickupTime(approxPickupTime);
            pd.setPickupTimeApproximate(approxPickupTime != null);

            passengers.add(pd);
        }
        response.setPassengers(passengers);

        computeAndSetDisplayRoute(pool, members, response);

        return response;
    }

    private static class RouteStopItem {
        double lat;
        double lng;
        boolean isPickup;
        double fraction;

        RouteStopItem(double lat, double lng, boolean isPickup, double fraction) {
            this.lat = lat;
            this.lng = lng;
            this.isPickup = isPickup;
            this.fraction = fraction;
        }
    }

    private void computeAndSetDisplayRoute(VehiclePoolEntity pool,
                                           List<VehiclePoolMemberEntity> members,
                                           com.greenmove.dto.VehiclePoolDTOs.ActivePoolDetailsResponse response) {
        LineString driverRouteGeom = pool.getRouteGeom();
        if (driverRouteGeom == null || members.isEmpty()) {
            response.setRouteGeometry(lineStringToGeoJson(driverRouteGeom));
            return;
        }

        List<RouteStopItem> stops = new ArrayList<>();
        for (VehiclePoolMemberEntity m : members) {
            if (m.getPickupLat() != null && m.getPickupLng() != null) {
                double f = locatePointOnLineString(createPoint(m.getPickupLat(), m.getPickupLng()), driverRouteGeom);
                stops.add(new RouteStopItem(m.getPickupLat(), m.getPickupLng(), true, f));
            }
            if (m.getDropoffLat() != null && m.getDropoffLng() != null) {
                double f = locatePointOnLineString(createPoint(m.getDropoffLat(), m.getDropoffLng()), driverRouteGeom);
                stops.add(new RouteStopItem(m.getDropoffLat(), m.getDropoffLng(), false, f));
            }
        }

        if (stops.isEmpty()) {
            response.setRouteGeometry(lineStringToGeoJson(driverRouteGeom));
            return;
        }

        stops.sort(Comparator.comparingDouble((RouteStopItem s) -> s.fraction)
                .thenComparing((s1, s2) -> Boolean.compare(!s1.isPickup, !s2.isPickup)));

        List<RoutingRequest.Coordinate> intermediateCoords = new ArrayList<>();
        for (RouteStopItem s : stops) {
            intermediateCoords.add(new RoutingRequest.Coordinate(s.lat, s.lng));
        }

        RoutingRequest req = new RoutingRequest(
                new RoutingRequest.Coordinate(pool.getStartLat(), pool.getStartLng()),
                new RoutingRequest.Coordinate(pool.getDestinationLat(), pool.getDestinationLng()),
                "DRIVING",
                false
        );
        req.setIntermediates(intermediateCoords);

        try {
            RoutingResponse resp = googleRoutesService.computeTrafficRoutes(req);
            if (resp != null && resp.isSuccess() && resp.getPrimaryRoute() != null) {
                RouteDTO primary = resp.getPrimaryRoute();
                response.setRouteGeometry(primary.getGeometry());
                if (primary.getDistanceMeters() != null && primary.getDistanceMeters() > 0) {
                    response.setRouteDistanceMeters(primary.getDistanceMeters());
                }
                if (primary.getDurationSeconds() != null && primary.getDurationSeconds() > 0) {
                    response.setRouteDurationSeconds(primary.getDurationSeconds().intValue());
                }
                return;
            }
        } catch (Exception e) {
            // Fallback
        }

        response.setRouteGeometry(lineStringToGeoJson(driverRouteGeom));
    }

    private LocalDateTime computeApproxPickupTime(VehiclePoolEntity pool, VehiclePoolMemberEntity member) {
        if (pool.getDepartureTime() == null) {
            return null;
        }
        Long acDurationSeconds = estimateDriverToPickupDurationSeconds(pool, member);
        if (acDurationSeconds == null) {
            return null;
        }
        return pool.getDepartureTime().plusSeconds(acDurationSeconds);
    }

    private Long estimateDriverToPickupDurationSeconds(VehiclePoolEntity pool, VehiclePoolMemberEntity member) {
        LineString routeGeom = pool.getRouteGeom();
        Integer totalDurationSeconds = pool.getRouteDurationSeconds();
        Double pickupLat = member.getPickupLat();
        Double pickupLng = member.getPickupLng();

        if (routeGeom == null || routeGeom.getNumPoints() < 2) return null;
        if (totalDurationSeconds == null || totalDurationSeconds <= 0) return null;
        if (pickupLat == null || pickupLng == null) return null;
        if (pickupLat < -90 || pickupLat > 90 || pickupLng < -180 || pickupLng > 180) return null;

        Point pickupPoint = createPoint(pickupLat, pickupLng);
        double fraction = locatePointOnLineString(pickupPoint, routeGeom);
        fraction = Math.max(0.0, Math.min(1.0, fraction));

        return Math.round(fraction * totalDurationSeconds);
    }

    private static Map<String, Object> lineStringToGeoJson(LineString lineString) {
        if (lineString == null || lineString.getNumPoints() < 2) {
            return null;
        }
        List<double[]> coordinates = new ArrayList<>();
        for (Coordinate c : lineString.getCoordinates()) {
            coordinates.add(new double[]{c.x, c.y});
        }
        Map<String, Object> geoJson = new LinkedHashMap<>();
        geoJson.put("type", "LineString");
        geoJson.put("coordinates", coordinates);
        return geoJson;
    }

    @Transactional
    public PoolResponse removePassenger(String creatorId, String poolId, String passengerUserId) {
        UserEntity creator = requireUser(creatorId);

        VehiclePoolEntity pool = poolRepository.findByIdForUpdate(poolId)
                .orElseThrow(() -> new PoolException(404, "Vehicle pool not found"));

        if (!pool.getCreatorId().equals(creator.getId())) {
            throw new PoolException(403, "Only the pool creator can remove passengers");
        }

        if (STATUS_COMPLETED.equals(pool.getStatus()) || STATUS_TERMINATED.equals(pool.getStatus())) {
            throw new PoolException(400, "Cannot remove passenger after pool is completed or terminated");
        }

        VehiclePoolMemberEntity member = memberRepository.findByPoolIdAndUserId(poolId, passengerUserId)
                .orElseThrow(() -> new PoolException(404, "Passenger membership not found in this pool"));

        if ("CANCELLED".equals(member.getStatus())) {
            throw new PoolException(400, "Passenger has already been removed or cancelled");
        }

        member.setStatus("CANCELLED");
        memberRepository.save(member);

        int newAvailableSeats = Math.min(pool.getTotalSeats(), (pool.getAvailableSeats() != null ? pool.getAvailableSeats() : 0) + 1);
        pool.setAvailableSeats(newAvailableSeats);
        poolRepository.save(pool);

        return toResponse(pool, creator.getId(), false, true);
    }

    /** Phone validation: must be exactly 10 numeric digits. */
    private static final java.util.regex.Pattern PHONE_PATTERN = java.util.regex.Pattern.compile("^[0-9]{10}$");

    private void validatePhoneNumber(String rawPhone) {
        if (rawPhone == null || !PHONE_PATTERN.matcher(rawPhone.trim()).matches()) {
            throw new PoolException(400, "Phone number must be exactly 10 digits");
        }
    }

    @Transactional
    public PoolResponse leavePool(String userId, String poolId) {
        UserEntity user = requireUser(userId);

        VehiclePoolEntity pool = poolRepository.findByIdForUpdate(poolId)
                .orElseThrow(() -> new PoolException(404, "Vehicle pool not found"));

        if (!STATUS_ACTIVE.equals(pool.getStatus())) {
            throw new PoolException(409, "This pool has already ended and can no longer be modified");
        }

        VehiclePoolMemberEntity membership = memberRepository.findByPoolIdAndUserId(poolId, user.getId())
                .orElseThrow(() -> new PoolException(409, "You haven't joined this pool"));

        membership.setStatus("CANCELLED");
        memberRepository.save(membership);

        int restored = Math.min(pool.getTotalSeats(), pool.getAvailableSeats() + 1);
        pool.setAvailableSeats(restored);
        poolRepository.save(pool);

        return toResponse(pool, user.getId(), false, false);
    }

    /**
     * Creator marks their pool as completed -- e.g. once they've reached the final
     * destination and the shared ride is over. Creator-only; can only be done once,
     * from an ACTIVE pool.
     */
    @Transactional
    public PoolResponse completePool(String userId, String poolId) {
        return endPool(userId, poolId, STATUS_COMPLETED);
    }

    /**
     * Creator terminates their pool early -- e.g. once it's full and no more passengers
     * should be able to join, or because the trip is being called off. Creator-only;
     * can only be done once, from an ACTIVE pool.
     */
    @Transactional
    public PoolResponse terminatePool(String userId, String poolId) {
        return endPool(userId, poolId, STATUS_TERMINATED);
    }

    private PoolResponse endPool(String userId, String poolId, String targetStatus) {
        UserEntity user = requireUser(userId);

        VehiclePoolEntity pool = poolRepository.findByIdForUpdate(poolId)
                .orElseThrow(() -> new PoolException(404, "Vehicle pool not found"));

        if (!pool.getCreatorId().equals(user.getId())) {
            throw new PoolException(403, "Only the pool creator can end this pool");
        }
        if (!STATUS_ACTIVE.equals(pool.getStatus())) {
            throw new PoolException(409, "This pool has already been "
                    + (STATUS_COMPLETED.equals(pool.getStatus()) ? "completed" : "terminated"));
        }

        pool.setStatus(targetStatus);
        poolRepository.save(pool);

        List<VehiclePoolMemberEntity> members = memberRepository.findByPoolId(pool.getId());
        for (VehiclePoolMemberEntity mem : members) {
            if ("PENDING".equals(mem.getStatus())) {
                if (STATUS_COMPLETED.equals(targetStatus)) {
                    mem.setStatus("CREDITED");
                    
                    Double passengerDistMeters = mem.getPassengerRouteDistanceMeters();
                    if (passengerDistMeters == null || passengerDistMeters <= 0) {
                        passengerDistMeters = pool.getRouteDistanceMeters();
                    }
                    if (passengerDistMeters == null || passengerDistMeters <= 0) {
                        passengerDistMeters = 10000.0;
                    }
                    mem.setPassengerRouteDistanceMeters(passengerDistMeters);

                    double distanceKm = passengerDistMeters / 1000.0;

                    UserEntity passengerUser = userRepository.findById(mem.getUserId()).orElse(null);
                    double vehicleEfficiency = (passengerUser != null && passengerUser.getVehicleEfficiency() != null && passengerUser.getVehicleEfficiency() > 0)
                            ? passengerUser.getVehicleEfficiency()
                            : 15.0;

                    String fuelType = (passengerUser != null && passengerUser.getFuelType() != null && !passengerUser.getFuelType().isBlank())
                            ? passengerUser.getFuelType()
                            : "petrol";

                    double fuelPrice = 100.0;
                    if (fuelPriceRepository != null) {
                        com.greenmove.entity.FuelPriceEntity fpe = fuelPriceRepository.findById(fuelType.toLowerCase()).orElse(null);
                        if (fpe != null && fpe.getPrice() != null && fpe.getPrice() > 0) {
                            fuelPrice = fpe.getPrice();
                        } else if ("petrol".equalsIgnoreCase(fuelType)) {
                            fuelPrice = 104.50;
                        } else if ("diesel".equalsIgnoreCase(fuelType)) {
                            fuelPrice = 92.30;
                        } else if ("cng".equalsIgnoreCase(fuelType)) {
                            fuelPrice = 78.00;
                        } else if ("ev_electricity".equalsIgnoreCase(fuelType)) {
                            fuelPrice = 18.00;
                        }
                    }

                    double fuelUsed = distanceKm / vehicleEfficiency;
                    double soloCost = fuelUsed * fuelPrice;
                    double carpoolCost = (pool.getCostPerPassenger() != null) ? pool.getCostPerPassenger() : 0.0;
                    double moneySaved = Math.max(0.0, soloCost - carpoolCost);

                    double emissionFactor = 2.3;
                    if ("diesel".equalsIgnoreCase(fuelType)) {
                        emissionFactor = 2.7;
                    } else if ("cng".equalsIgnoreCase(fuelType)) {
                        emissionFactor = 1.8;
                    } else if ("ev_electricity".equalsIgnoreCase(fuelType)) {
                        emissionFactor = 0.8;
                    }

                    if (emissionFactorRepository != null) {
                        String emissionId = "car_" + fuelType.toLowerCase();
                        com.greenmove.entity.EmissionFactorEntity ef = emissionFactorRepository.findById(emissionId).orElse(null);
                        if (ef == null && "ev_electricity".equalsIgnoreCase(fuelType)) {
                            ef = emissionFactorRepository.findById("ev_grid").orElse(null);
                        }
                        if (ef != null && ef.getFactor() != null && ef.getFactor() > 0) {
                            if (ef.getUnit() != null && ef.getUnit().contains("km")) {
                                emissionFactor = ef.getFactor() * vehicleEfficiency;
                            } else {
                                emissionFactor = ef.getFactor();
                            }
                        }
                    }

                    double co2SavedKg = fuelUsed * emissionFactor;

                    mem.setSoloCost(soloCost);
                    mem.setMoneySaved(moneySaved);
                    mem.setCo2SavedKg(co2SavedKg);
                } else if (STATUS_TERMINATED.equals(targetStatus)) {
                    mem.setStatus("CANCELLED");
                }
                memberRepository.save(mem);
            }
        }

        return toResponse(pool, user.getId(), false, true);
    }

    /** Guard shared by join: pools that are ended, departed, or otherwise closed reject new joins. */
    private void requireJoinable(VehiclePoolEntity pool) {
        if (STATUS_COMPLETED.equals(pool.getStatus())) {
            throw new PoolException(409, "This pool has already been completed");
        }
        if (STATUS_TERMINATED.equals(pool.getStatus())) {
            throw new PoolException(409, "This pool has been terminated by its creator");
        }
        if (pool.getDepartureTime().isBefore(LocalDateTime.now())) {
            throw new PoolException(400, "This pool has already departed");
        }
    }

    private Set<String> joinedPoolIdsFor(String currentUserId) {
        if (currentUserId == null || currentUserId.isBlank()) {
            return Set.of();
        }
        return memberRepository.findByUserId(currentUserId).stream()
                .map(VehiclePoolMemberEntity::getPoolId)
                .collect(Collectors.toSet());
    }

    private PoolResponse toResponse(VehiclePoolEntity p, String currentUserId, boolean joined, boolean includeMembers) {
        PoolResponse r = new PoolResponse();
        r.setId(p.getId());
        r.setCreatorId(p.getCreatorId());
        r.setCreatorName(p.getCreatorName());
        r.setStartLocation(p.getStartLocation());
        r.setStartLatitude(p.getStartLat());
        r.setStartLongitude(p.getStartLng());
        r.setDestination(p.getDestination());
        r.setDestinationLatitude(p.getDestinationLat());
        r.setDestinationLongitude(p.getDestinationLng());
        r.setRouteDistanceMeters(p.getRouteDistanceMeters());
        r.setRouteDurationSeconds(p.getRouteDurationSeconds());
        // Phase 1 - Dynamic carpool pricing: rate/km derived purely from data the driver
        // already has (no extra routing calls). costPerPassenger remains the untouched
        // full A->B reference price stored on the entity.
        r.setRatePerKm(computeRatePerKm(p.getCostPerPassenger(), p.getRouteDistanceMeters()));
        r.setDepartureTime(p.getDepartureTime());
        r.setTotalSeats(p.getTotalSeats());
        r.setAvailableSeats(p.getAvailableSeats());
        r.setOccupiedSeats(p.getTotalSeats() - p.getAvailableSeats());
        r.setCostPerPassenger(p.getCostPerPassenger());
        r.setTotalCost(p.getTotalCost());
        r.setStatus(computeDisplayStatus(p));
        r.setCreatedAt(p.getCreatedAt());
        r.setFull(p.getAvailableSeats() == null || p.getAvailableSeats() <= 0);
        r.setPast(p.getDepartureTime() != null && p.getDepartureTime().isBefore(LocalDateTime.now()));
        boolean own = currentUserId != null && currentUserId.equals(p.getCreatorId());
        r.setOwn(own);
        r.setJoined(joined);
        r.setCanEnd(own && STATUS_ACTIVE.equals(p.getStatus()));

        if (includeMembers) {
            List<PoolMemberResponse> members = memberRepository.findByPoolId(p.getId()).stream()
                    .map(m -> new PoolMemberResponse(m.getUserName(), m.getJoinedAt()))
                    .collect(Collectors.toList());
            r.setMembers(members);
        }
        return r;
    }

    /**
     * The single source of truth for the four user-facing statuses (Available / Full /
     * Completed / Terminated). Completed/Terminated are persisted lifecycle states set by
     * the creator; Full/Available are always derived live from the current seat count so
     * they can never go stale.
     */
    private String computeDisplayStatus(VehiclePoolEntity p) {
        if (STATUS_TERMINATED.equals(p.getStatus())) {
            return "TERMINATED";
        }
        if (STATUS_COMPLETED.equals(p.getStatus())) {
            return "COMPLETED";
        }
        if (p.getAvailableSeats() == null || p.getAvailableSeats() <= 0) {
            return "FULL";
        }
        return "AVAILABLE";
    }

    private double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    // =========================================================================
    //  Phase 1 - Dynamic carpool pricing
    // =========================================================================

    /** Decimal places used when rounding money (rate/km, passenger fare). */
    private static final int MONEY_SCALE = 2;

    /**
     * ratePerKm = costPerPassenger / (routeDistanceMeters / 1000)
     *
     * Uses only data the driver's pool already has (existing costPerPassenger as the
     * full A->B reference price, and the existing routeDistanceMeters) -- never triggers
     * a routing call. Computed entirely on the backend so the frontend can never
     * influence pricing.
     *
     * Returns null (rather than throwing) when costPerPassenger or routeDistanceMeters is
     * missing, zero, or negative, so a single malformed/legacy pool never breaks the rest
     * of a pool list/search response; callers simply omit the rate for that pool.
     */
    private Double computeRatePerKm(Double costPerPassenger, Double routeDistanceMeters) {
        if (costPerPassenger == null || routeDistanceMeters == null) return null;
        if (costPerPassenger <= 0 || routeDistanceMeters <= 0) return null;

        BigDecimal cost = BigDecimal.valueOf(costPerPassenger);
        BigDecimal distanceKm = BigDecimal.valueOf(routeDistanceMeters)
                .divide(BigDecimal.valueOf(1000), 10, RoundingMode.HALF_UP);
        if (distanceKm.signum() <= 0) return null;

        return cost.divide(distanceKm, MONEY_SCALE, RoundingMode.HALF_UP).doubleValue();
    }

    /**
     * passengerFare = ratePerKm * passengerRouteDistanceKm
     *
     * passengerRouteDistanceMeters MUST be the Phase 5 C->D passenger route distance that
     * was already fetched once per search from Google Routes; this method performs no
     * routing calls of its own and never trusts a frontend-supplied fare.
     *
     * Returns null when ratePerKm is unavailable/non-positive or the passenger distance is
     * missing/zero/negative, so invalid inputs are handled safely instead of surfacing a
     * bogus fare.
     */
    private Double computePassengerFare(Double ratePerKm, Double passengerRouteDistanceMeters) {
        if (ratePerKm == null || ratePerKm <= 0) return null;
        if (passengerRouteDistanceMeters == null || passengerRouteDistanceMeters <= 0) return null;

        BigDecimal rate = BigDecimal.valueOf(ratePerKm);
        BigDecimal distanceKm = BigDecimal.valueOf(passengerRouteDistanceMeters)
                .divide(BigDecimal.valueOf(1000), 10, RoundingMode.HALF_UP);

        return rate.multiply(distanceKm).setScale(MONEY_SCALE, RoundingMode.HALF_UP).doubleValue();
    }
}
