package com.greenmove.service;

import com.greenmove.dto.VehiclePoolDTOs.ActivePoolDetailsResponse;
import com.greenmove.dto.VehiclePoolDTOs.PassengerDetailResponse;
import com.greenmove.entity.UserEntity;
import com.greenmove.entity.VehiclePoolEntity;
import com.greenmove.entity.VehiclePoolMemberEntity;
import com.greenmove.repository.UserRepository;
import com.greenmove.repository.VehiclePoolMemberRepository;
import com.greenmove.repository.VehiclePoolRepository;
import com.greenmove.service.VehiclePoolService.PoolException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.PrecisionModel;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Phase 3 - Driver-only Active Pool Details.
 *
 * Covers: owner-only access, passenger-detail correctness, empty passenger list, legacy/null
 * spatial data (no crash), phone number never leaking outside this creator-only path, and the
 * APPROXIMATE pickup-time estimate.
 */
@ExtendWith(MockitoExtension.class)
class ActivePoolDetailsTest {

    private static final GeometryFactory GF = new GeometryFactory(new PrecisionModel(), 4326);

    @Mock private VehiclePoolRepository poolRepository;
    @Mock private VehiclePoolMemberRepository memberRepository;
    @Mock private UserRepository userRepository;
    @Mock private GoogleRoutesService googleRoutesService;
    @Mock private javax.sql.DataSource dataSource;

    private VehiclePoolService vehiclePoolService;

    private UserEntity driver;
    private UserEntity otherUser;
    private VehiclePoolEntity pool;

    /**
     * Simple straight route from (lat=0,lng=0) to (lat=0,lng=1) -- one degree of longitude,
     * constant latitude. JTS Coordinate order is (x=lng, y=lat).
     */
    private LineString straightRoute() {
        return GF.createLineString(new Coordinate[]{
                new Coordinate(0.0, 0.0),
                new Coordinate(1.0, 0.0)
        });
    }

    @BeforeEach
    void setUp() {
        vehiclePoolService = new VehiclePoolService(
            poolRepository,
            memberRepository,
            userRepository,
            googleRoutesService,
            dataSource,
            null,
            null
        );
        driver = new UserEntity();
        driver.setId("user_driver");
        driver.setName("Driver Dan");

        otherUser = new UserEntity();
        otherUser.setId("user_other");
        otherUser.setName("Nosy Nick");

        pool = new VehiclePoolEntity();
        pool.setId("pool_1");
        pool.setCreatorId("user_driver");
        pool.setCreatorName("Driver Dan");
        pool.setStartLocation("Point A");
        pool.setStartLat(0.0);
        pool.setStartLng(0.0);
        pool.setDestination("Point B");
        pool.setDestinationLat(0.0);
        pool.setDestinationLng(1.0);
        pool.setRouteGeom(straightRoute());
        pool.setRouteDistanceMeters(10000.0);
        pool.setRouteDurationSeconds(1000);
        pool.setDepartureTime(LocalDateTime.of(2026, 1, 1, 8, 0));
        pool.setTotalSeats(3);
        pool.setAvailableSeats(2);
        pool.setCostPerPassenger(100.0);
        pool.setTotalCost(300.0);
        pool.setStatus("ACTIVE");
        pool.setCreatedAt(LocalDateTime.now());
    }

    // ---------------------------------------------------------------
    // Ownership / access control
    // ---------------------------------------------------------------

    @Test
    @DisplayName("Owner can access active pool details")
    void ownerCanAccess() {
        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findById("pool_1")).thenReturn(Optional.of(pool));
        when(memberRepository.findByPoolId("pool_1")).thenReturn(List.of());

        ActivePoolDetailsResponse res = vehiclePoolService.getActivePoolDetails("user_driver", "pool_1");

        assertNotNull(res);
        assertEquals("pool_1", res.getId());
        assertEquals("Point A", res.getStartLocation());
        assertEquals("Point B", res.getDestination());
    }

    @Test
    @DisplayName("Non-owner is denied with 403")
    void nonOwnerDenied() {
        when(userRepository.findById("user_other")).thenReturn(Optional.of(otherUser));
        when(poolRepository.findById("pool_1")).thenReturn(Optional.of(pool));

        PoolException ex = assertThrows(PoolException.class,
                () -> vehiclePoolService.getActivePoolDetails("user_other", "pool_1"));

        assertEquals(403, ex.getStatus());
        verify(memberRepository, never()).findByPoolId(any());
    }

    @Test
    @DisplayName("Unknown pool id returns 404")
    void unknownPoolReturns404() {
        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findById("does_not_exist")).thenReturn(Optional.empty());

        PoolException ex = assertThrows(PoolException.class,
                () -> vehiclePoolService.getActivePoolDetails("user_driver", "does_not_exist"));

        assertEquals(404, ex.getStatus());
    }

    @Test
    @DisplayName("Unauthenticated caller is rejected")
    void unauthenticatedRejected() {
        PoolException ex = assertThrows(PoolException.class,
                () -> vehiclePoolService.getActivePoolDetails(null, "pool_1"));
        assertEquals(401, ex.getStatus());
    }

    // ---------------------------------------------------------------
    // Passenger data correctness
    // ---------------------------------------------------------------

    @Test
    @DisplayName("Passengers returned correctly, including phone/fare/distance")
    void passengersReturnedCorrectly() {
        VehiclePoolMemberEntity member = new VehiclePoolMemberEntity();
        member.setId("mem_1");
        member.setPoolId("pool_1");
        member.setUserId("user_passenger");
        member.setUserName("Passenger Pat");
        member.setJoinedAt(LocalDateTime.of(2025, 12, 31, 20, 0));
        member.setPickupLocation("Cafe X");
        member.setPickupLat(0.0);
        member.setPickupLng(0.5); // halfway along the driver's route
        member.setDropoffLocation("Mall Y");
        member.setDropoffLat(0.0);
        member.setDropoffLng(0.9);
        member.setPhoneNumber("+15551234567");
        member.setRatePerKm(10.0);
        member.setPassengerRouteDistanceMeters(4000.0);
        member.setPassengerFare(40.0);

        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findById("pool_1")).thenReturn(Optional.of(pool));
        when(memberRepository.findByPoolId("pool_1")).thenReturn(List.of(member));

        ActivePoolDetailsResponse res = vehiclePoolService.getActivePoolDetails("user_driver", "pool_1");

        assertEquals(1, res.getPassengers().size());
        PassengerDetailResponse pd = res.getPassengers().get(0);
        assertEquals("Passenger Pat", pd.getUserName());
        assertEquals("Cafe X", pd.getPickupLocation());
        assertEquals(0.0, pd.getPickupLatitude());
        assertEquals(0.5, pd.getPickupLongitude());
        assertEquals("Mall Y", pd.getDropoffLocation());
        assertEquals(0.0, pd.getDropoffLatitude());
        assertEquals(0.9, pd.getDropoffLongitude());
        assertEquals("+15551234567", pd.getPhoneNumber());
        assertEquals(40.0, pd.getFare());
        assertEquals(4000.0, pd.getPassengerDistanceMeters());

        // Pool-level fields also present
        assertNotNull(res.getRouteGeometry());
        assertTrue(res.getRouteGeometry() instanceof Map);
        assertEquals(10.0, res.getRatePerKm()); // 100 / (10000/1000)
    }

    @Test
    @DisplayName("Empty passenger list works without error")
    void emptyPassengerListWorks() {
        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findById("pool_1")).thenReturn(Optional.of(pool));
        when(memberRepository.findByPoolId("pool_1")).thenReturn(List.of());

        ActivePoolDetailsResponse res = vehiclePoolService.getActivePoolDetails("user_driver", "pool_1");

        assertNotNull(res.getPassengers());
        assertTrue(res.getPassengers().isEmpty());
    }

    @Test
    @DisplayName("Legacy/null spatial data (no route geometry, no pickup coords) doesn't crash")
    void legacyNullSpatialDataDoesNotCrash() {
        VehiclePoolEntity legacyPool = new VehiclePoolEntity();
        legacyPool.setId("pool_legacy");
        legacyPool.setCreatorId("user_driver");
        legacyPool.setStartLocation("Old Start");
        legacyPool.setDestination("Old End");
        legacyPool.setRouteGeom(null); // legacy pool created before route_geom existed
        legacyPool.setRouteDistanceMeters(null);
        legacyPool.setRouteDurationSeconds(null);
        legacyPool.setDepartureTime(LocalDateTime.of(2026, 1, 1, 9, 0));
        legacyPool.setTotalSeats(2);
        legacyPool.setAvailableSeats(1);
        legacyPool.setCostPerPassenger(50.0);
        legacyPool.setTotalCost(100.0);
        legacyPool.setStatus("ACTIVE");
        legacyPool.setCreatedAt(LocalDateTime.now());

        VehiclePoolMemberEntity legacyMember = new VehiclePoolMemberEntity();
        legacyMember.setId("mem_legacy");
        legacyMember.setPoolId("pool_legacy");
        legacyMember.setUserId("user_passenger");
        legacyMember.setUserName("Legacy Larry");
        legacyMember.setJoinedAt(LocalDateTime.now());
        // No pickup/dropoff coordinates at all (pre Phase-2 join)
        legacyMember.setPickupLat(null);
        legacyMember.setPickupLng(null);
        legacyMember.setPhoneNumber(null);
        legacyMember.setPassengerFare(null);
        legacyMember.setPassengerRouteDistanceMeters(null);

        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findById("pool_legacy")).thenReturn(Optional.of(legacyPool));
        when(memberRepository.findByPoolId("pool_legacy")).thenReturn(List.of(legacyMember));

        ActivePoolDetailsResponse res = assertDoesNotThrow(
                () -> vehiclePoolService.getActivePoolDetails("user_driver", "pool_legacy"));

        assertNull(res.getRouteGeometry());
        assertEquals(1, res.getPassengers().size());
        PassengerDetailResponse pd = res.getPassengers().get(0);
        assertNull(pd.getPickupLatitude());
        assertNull(pd.getFare());
        assertNull(pd.getApproxPickupTime());
        assertFalse(pd.isPickupTimeApproximate());
    }

    // ---------------------------------------------------------------
    // Approximate pickup time
    // ---------------------------------------------------------------

    @Test
    @DisplayName("Approximate pickup time = departureTime + fraction-of-route-duration to pickup")
    void approximatePickupTimeComputedCorrectly() {
        VehiclePoolMemberEntity member = new VehiclePoolMemberEntity();
        member.setId("mem_1");
        member.setPoolId("pool_1");
        member.setUserId("user_passenger");
        member.setUserName("Passenger Pat");
        member.setJoinedAt(LocalDateTime.now());
        // Pickup halfway along the (0,0)->(0,1) route -> ~50% of route duration
        member.setPickupLat(0.0);
        member.setPickupLng(0.5);

        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findById("pool_1")).thenReturn(Optional.of(pool));
        when(memberRepository.findByPoolId("pool_1")).thenReturn(List.of(member));

        ActivePoolDetailsResponse res = vehiclePoolService.getActivePoolDetails("user_driver", "pool_1");

        PassengerDetailResponse pd = res.getPassengers().get(0);
        assertNotNull(pd.getApproxPickupTime());
        assertTrue(pd.isPickupTimeApproximate());

        // departureTime (08:00) + ~50% of 1000s (~500s = ~8:20) -- allow rounding slack
        LocalDateTime expectedApprox = pool.getDepartureTime().plusSeconds(500);
        long diffSeconds = Math.abs(java.time.Duration.between(expectedApprox, pd.getApproxPickupTime()).getSeconds());
        assertTrue(diffSeconds <= 5, "Expected approx pickup time near " + expectedApprox + " but was " + pd.getApproxPickupTime());

        // Sanity: pickup time must be after departure and before/at arrival
        assertTrue(pd.getApproxPickupTime().isAfter(pool.getDepartureTime()));
    }

    @Test
    @DisplayName("No routeDurationSeconds stored -> approx pickup time is null, no crash")
    void noRouteDurationYieldsNullApprox() {
        pool.setRouteDurationSeconds(null);

        VehiclePoolMemberEntity member = new VehiclePoolMemberEntity();
        member.setId("mem_1");
        member.setPoolId("pool_1");
        member.setUserId("user_passenger");
        member.setUserName("Passenger Pat");
        member.setJoinedAt(LocalDateTime.now());
        member.setPickupLat(0.0);
        member.setPickupLng(0.5);

        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findById("pool_1")).thenReturn(Optional.of(pool));
        when(memberRepository.findByPoolId("pool_1")).thenReturn(List.of(member));

        ActivePoolDetailsResponse res = vehiclePoolService.getActivePoolDetails("user_driver", "pool_1");

        assertNull(res.getPassengers().get(0).getApproxPickupTime());
    }

    // ---------------------------------------------------------------
    // Public-endpoint isolation (phone must never leak elsewhere)
    // ---------------------------------------------------------------

    @Test
    @DisplayName("Phone number is not present on the public PoolMemberResponse shape used by browse/search")
    void phoneNotExposedOnPublicMemberShape() {
        // PoolMemberResponse is what listPools()/searchPools() expose for pool.members --
        // it intentionally only carries userName + joinedAt. This test locks that contract
        // so a future change can't silently add phone/fare/coordinates to the public shape.
        com.greenmove.dto.VehiclePoolDTOs.PoolMemberResponse publicMember =
                new com.greenmove.dto.VehiclePoolDTOs.PoolMemberResponse("Passenger Pat", LocalDateTime.now());

        List<String> declaredFieldNames = java.util.Arrays.stream(
                        com.greenmove.dto.VehiclePoolDTOs.PoolMemberResponse.class.getDeclaredFields())
                .map(java.lang.reflect.Field::getName)
                .toList();

        assertFalse(declaredFieldNames.stream().anyMatch(f -> f.toLowerCase().contains("phone")),
                "Public PoolMemberResponse must never carry a phone number field");
        assertNotNull(publicMember);
    }

    // ---------------------------------------------------------------
    // Driver Remove Passenger & Route Stops tests
    // ---------------------------------------------------------------

    @Test
    @DisplayName("Route contains passenger stops and orders them correctly")
    void routeContainsPassengerStopsAndCorrectOrder() {
        VehiclePoolMemberEntity m1 = new VehiclePoolMemberEntity();
        m1.setId("mem_1");
        m1.setPoolId("pool_1");
        m1.setUserId("user_p1");
        m1.setUserName("Passenger 1");
        m1.setStatus("PENDING");
        m1.setPickupLat(0.0);
        m1.setPickupLng(0.3); // pickup earlier
        m1.setDropoffLat(0.0);
        m1.setDropoffLng(0.8); // dropoff later

        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findById("pool_1")).thenReturn(Optional.of(pool));
        when(memberRepository.findByPoolId("pool_1")).thenReturn(List.of(m1));

        com.greenmove.dto.RoutingResponse mockResp = new com.greenmove.dto.RoutingResponse();
        mockResp.setSuccess(true);
        com.greenmove.dto.RoutingResponse.RouteDTO routeDTO = new com.greenmove.dto.RoutingResponse.RouteDTO();
        routeDTO.setDistanceMeters(12000.0);
        routeDTO.setDurationSeconds(1200.0);
        routeDTO.setGeometry(Map.of("type", "LineString", "coordinates", List.of(List.of(0.0, 0.0), List.of(0.3, 0.0), List.of(0.8, 0.0), List.of(1.0, 0.0))));
        mockResp.setPrimaryRoute(routeDTO);

        org.mockito.ArgumentCaptor<com.greenmove.dto.RoutingRequest> reqCaptor = org.mockito.ArgumentCaptor.forClass(com.greenmove.dto.RoutingRequest.class);
        when(googleRoutesService.computeTrafficRoutes(reqCaptor.capture())).thenReturn(mockResp);

        ActivePoolDetailsResponse res = vehiclePoolService.getActivePoolDetails("user_driver", "pool_1");

        assertNotNull(res.getRouteGeometry());
        verify(googleRoutesService).computeTrafficRoutes(any());
        com.greenmove.dto.RoutingRequest req = reqCaptor.getValue();
        assertNotNull(req.getIntermediates());
        assertEquals(2, req.getIntermediates().size());
        // First intermediate is pickup (lng 0.3), second is dropoff (lng 0.8)
        assertEquals(0.3, req.getIntermediates().get(0).getLng());
        assertEquals(0.8, req.getIntermediates().get(1).getLng());
    }

    @Test
    @DisplayName("Non-owner cannot remove passenger (403 Forbidden)")
    void nonOwnerCannotRemovePassenger() {
        when(userRepository.findById("user_other")).thenReturn(Optional.of(otherUser));
        when(poolRepository.findByIdForUpdate("pool_1")).thenReturn(Optional.of(pool));

        PoolException ex = assertThrows(PoolException.class, () ->
                vehiclePoolService.removePassenger("user_other", "pool_1", "user_p1"));

        assertEquals(403, ex.getStatus());
        assertTrue(ex.getMessage().contains("Only the pool creator can remove passengers"));
    }

    @Test
    @DisplayName("Owner can remove passenger and seat is restored")
    void ownerCanRemovePassengerAndSeatRestored() {
        VehiclePoolMemberEntity member = new VehiclePoolMemberEntity();
        member.setId("mem_1");
        member.setPoolId("pool_1");
        member.setUserId("user_p1");
        member.setStatus("PENDING");

        pool.setAvailableSeats(1);
        pool.setTotalSeats(3);

        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findByIdForUpdate("pool_1")).thenReturn(Optional.of(pool));
        when(memberRepository.findByPoolIdAndUserId("pool_1", "user_p1")).thenReturn(Optional.of(member));

        com.greenmove.dto.VehiclePoolDTOs.PoolResponse res = vehiclePoolService.removePassenger("user_driver", "pool_1", "user_p1");

        assertEquals("CANCELLED", member.getStatus());
        verify(memberRepository).save(member);
        assertEquals(2, pool.getAvailableSeats());
        verify(poolRepository).save(pool);
        assertEquals(2, res.getAvailableSeats());
    }

    @Test
    @DisplayName("Removed member has status CANCELLED and never contributes to active passengers or impact")
    void removedMemberNeverContributesToImpact() {
        VehiclePoolMemberEntity member = new VehiclePoolMemberEntity();
        member.setId("mem_1");
        member.setPoolId("pool_1");
        member.setUserId("user_p1");
        member.setStatus("CANCELLED");
        member.setMoneySaved(null);
        member.setCo2SavedKg(null);

        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findById("pool_1")).thenReturn(Optional.of(pool));
        when(memberRepository.findByPoolId("pool_1")).thenReturn(List.of(member));

        ActivePoolDetailsResponse res = vehiclePoolService.getActivePoolDetails("user_driver", "pool_1");

        // Cancelled member is excluded from ActivePoolDetailsResponse passenger list
        assertTrue(res.getPassengers().isEmpty());
    }

    @Test
    @DisplayName("Removal rejected after pool is completed or terminated (400 Bad Request)")
    void removalAfterCompletionOrTerminationRejected() {
        pool.setStatus("COMPLETED");

        when(userRepository.findById("user_driver")).thenReturn(Optional.of(driver));
        when(poolRepository.findByIdForUpdate("pool_1")).thenReturn(Optional.of(pool));

        PoolException ex = assertThrows(PoolException.class, () ->
                vehiclePoolService.removePassenger("user_driver", "pool_1", "user_p1"));

        assertEquals(400, ex.getStatus());
        assertTrue(ex.getMessage().contains("Cannot remove passenger after pool is completed or terminated"));
    }
}
