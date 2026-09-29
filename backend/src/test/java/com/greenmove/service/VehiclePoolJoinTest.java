package com.greenmove.service;

import com.greenmove.dto.VehiclePoolDTOs.JoinPoolRequest;
import com.greenmove.dto.VehiclePoolDTOs.PoolResponse;
import com.greenmove.entity.UserEntity;
import com.greenmove.entity.VehiclePoolEntity;
import com.greenmove.entity.VehiclePoolMemberEntity;
import com.greenmove.repository.UserRepository;
import com.greenmove.repository.VehiclePoolMemberRepository;
import com.greenmove.repository.VehiclePoolRepository;
import com.greenmove.service.VehiclePoolService.PoolException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VehiclePoolJoinTest {

    @Mock
    private UserRepository userRepository;
    
    @Mock
    private VehiclePoolRepository poolRepository;
    
    @Mock
    private VehiclePoolMemberRepository memberRepository;

    @Mock
    private GoogleRoutesService googleRoutesService;

    @Mock
    private javax.sql.DataSource dataSource;

    @InjectMocks
    private VehiclePoolService vehiclePoolService;

    private UserEntity testPassenger;
    private VehiclePoolEntity testPool;

    @BeforeEach
    void setUp() {
        testPassenger = new UserEntity();
        testPassenger.setId("user_passenger");
        testPassenger.setName("Passenger Name");

        testPool = new VehiclePoolEntity();
        testPool.setId("pool_123");
        testPool.setCreatorId("user_driver");
        testPool.setStatus("ACTIVE");
        testPool.setAvailableSeats(3);
        testPool.setTotalSeats(3);
        testPool.setDepartureTime(LocalDateTime.now().plusDays(1));
        
        ReflectionTestUtils.setField(vehiclePoolService, "maxDepartureTimeDifferenceMinutes", 30.0);
    }

    @Test
    void testSuccessfulJoin_WithSpatialData() {
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLocation("A");
        req.setPickupLatitude(10.0);
        req.setPickupLongitude(20.0);
        req.setDropoffLocation("B");
        req.setDropoffLatitude(30.0);
        req.setDropoffLongitude(40.0);

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolResponse res = vehiclePoolService.joinPool("user_passenger", "pool_123", req);

        // Verify availableSeats decreased by 1
        assertEquals(2, res.getAvailableSeats());
        assertEquals(1, res.getOccupiedSeats());
        assertEquals(3, res.getTotalSeats());
        assertEquals("AVAILABLE", res.getStatus());

        // Verify member was saved with spatial fields
        ArgumentCaptor<VehiclePoolMemberEntity> memberCaptor = ArgumentCaptor.forClass(VehiclePoolMemberEntity.class);
        verify(memberRepository).save(memberCaptor.capture());
        
        VehiclePoolMemberEntity savedMember = memberCaptor.getValue();
        assertEquals("pool_123", savedMember.getPoolId());
        assertEquals("user_passenger", savedMember.getUserId());
        assertEquals("A", savedMember.getPickupLocation());
        assertEquals(10.0, savedMember.getPickupLat());
        assertEquals(20.0, savedMember.getPickupLng());
        assertNotNull(savedMember.getPickupGeom());
        assertEquals("B", savedMember.getDropoffLocation());
        assertEquals(30.0, savedMember.getDropoffLat());
        assertEquals(40.0, savedMember.getDropoffLng());
        assertNotNull(savedMember.getDropoffGeom());
    }
    
    @Test
    void testSuccessfulJoin_LegacyNoSpatialData() {
        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        // Call without JoinPoolRequest (or null) to simulate legacy UI
        PoolResponse res = vehiclePoolService.joinPool("user_passenger", "pool_123", null);

        assertEquals(2, res.getAvailableSeats());
        
        ArgumentCaptor<VehiclePoolMemberEntity> memberCaptor = ArgumentCaptor.forClass(VehiclePoolMemberEntity.class);
        verify(memberRepository).save(memberCaptor.capture());
        
        VehiclePoolMemberEntity savedMember = memberCaptor.getValue();
        assertNull(savedMember.getPickupLat());
        assertNull(savedMember.getPickupGeom());
    }

    @Test
    void testJoin_PoolNotFound() {
        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("missing_pool")).thenReturn(Optional.empty());

        PoolException ex = assertThrows(PoolException.class, () -> 
            vehiclePoolService.joinPool("user_passenger", "missing_pool", null));
        assertEquals(404, ex.getStatus());
    }

    @Test
    void testJoin_DriverAttemptsToJoinOwnPool() {
        testPassenger.setId("user_driver"); // Passenger is driver
        
        when(userRepository.findById("user_driver")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));

        PoolException ex = assertThrows(PoolException.class, () -> 
            vehiclePoolService.joinPool("user_driver", "pool_123", null));
        assertEquals(400, ex.getStatus());
        assertTrue(ex.getMessage().contains("can't join a pool you created"));
    }

    @Test
    void testJoin_ZeroAvailableSeats() {
        testPool.setAvailableSeats(0);
        
        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));

        PoolException ex = assertThrows(PoolException.class, () -> 
            vehiclePoolService.joinPool("user_passenger", "pool_123", null));
        assertEquals(400, ex.getStatus());
        assertTrue(ex.getMessage().contains("full"));
    }

    @Test
    void testJoin_FinalSeatConsumption() {
        testPool.setAvailableSeats(1);
        testPool.setTotalSeats(3);
        
        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolResponse res = vehiclePoolService.joinPool("user_passenger", "pool_123", null);

        assertEquals(0, res.getAvailableSeats());
        assertEquals(3, res.getOccupiedSeats()); // 3 - 0 = 3
        assertEquals(3, res.getTotalSeats()); // total remains unchanged
        // Existing pool lifecycle says remain ACTIVE but show full
        assertTrue(res.isFull());
    }

    @Test
    void testJoin_ExpiredDepartedPool() {
        testPool.setDepartureTime(LocalDateTime.now().minusHours(1));
        
        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));

        PoolException ex = assertThrows(PoolException.class, () -> 
            vehiclePoolService.joinPool("user_passenger", "pool_123", null));
        assertEquals(400, ex.getStatus());
        assertTrue(ex.getMessage().contains("departed"));
    }

    @Test
    void testJoin_DuplicateMembership() {
        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        
        VehiclePoolMemberEntity existingMember = new VehiclePoolMemberEntity();
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.of(existingMember));

        PoolException ex = assertThrows(PoolException.class, () -> 
            vehiclePoolService.joinPool("user_passenger", "pool_123", null));
        assertEquals(409, ex.getStatus());
        assertTrue(ex.getMessage().contains("already joined"));
    }

    @Test
    void testJoin_InvalidPickupCoordinates() {
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLatitude(91.0); // Invalid lat
        req.setPickupLongitude(20.0);

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolException ex = assertThrows(PoolException.class, () -> 
            vehiclePoolService.joinPool("user_passenger", "pool_123", req));
        assertEquals(400, ex.getStatus());
        assertTrue(ex.getMessage().contains("Invalid pickup"));
    }
    
    @Test
    void testJoin_InvalidDropoffCoordinates() {
        JoinPoolRequest req = new JoinPoolRequest();
        req.setDropoffLatitude(30.0);
        req.setDropoffLongitude(200.0); // Invalid lng

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolException ex = assertThrows(PoolException.class, () -> 
            vehiclePoolService.joinPool("user_passenger", "pool_123", req));
        assertEquals(400, ex.getStatus());
        assertTrue(ex.getMessage().contains("Invalid dropoff"));
    }

    // =========================================================================
    //  Phase 2 - Passenger Join flow (confirmation modal)
    // =========================================================================

    @Test
    void testJoin_Valid10DigitPhoneNumberIsStored() {
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLocation("A");
        req.setPickupLatitude(10.0);
        req.setPickupLongitude(20.0);
        req.setDropoffLocation("B");
        req.setDropoffLatitude(10.05);
        req.setDropoffLongitude(20.05);
        req.setPhoneNumber("9876543210");

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        vehiclePoolService.joinPool("user_passenger", "pool_123", req);

        ArgumentCaptor<VehiclePoolMemberEntity> memberCaptor = ArgumentCaptor.forClass(VehiclePoolMemberEntity.class);
        verify(memberRepository).save(memberCaptor.capture());
        assertEquals("9876543210", memberCaptor.getValue().getPhoneNumber());
    }

    @Test
    void testJoin_Plus91PhoneNumberRejected() {
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLatitude(10.0);
        req.setPickupLongitude(20.0);
        req.setPhoneNumber("+919876543210"); // +91 prefix not allowed

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolException ex = assertThrows(PoolException.class, () ->
            vehiclePoolService.joinPool("user_passenger", "pool_123", req));
        assertEquals(400, ex.getStatus());
        verify(memberRepository, never()).save(any());
    }

    @Test
    void testJoin_SpacesInPhoneNumberRejected() {
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLatitude(10.0);
        req.setPickupLongitude(20.0);
        req.setPhoneNumber("987 654 3210"); // spaces not allowed

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolException ex = assertThrows(PoolException.class, () ->
            vehiclePoolService.joinPool("user_passenger", "pool_123", req));
        assertEquals(400, ex.getStatus());
    }

    @Test
    void testJoin_TooShortPhoneNumberRejected() {
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPhoneNumber("123456789"); // 9 digits

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolException ex = assertThrows(PoolException.class, () ->
            vehiclePoolService.joinPool("user_passenger", "pool_123", req));
        assertEquals(400, ex.getStatus());
    }

    @Test
    void testJoin_ElevenDigitsPhoneNumberRejected() {
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPhoneNumber("98765432101"); // 11 digits

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolException ex = assertThrows(PoolException.class, () ->
            vehiclePoolService.joinPool("user_passenger", "pool_123", req));
        assertEquals(400, ex.getStatus());
    }

    @Test
    void testJoin_MissingPhoneNumberStillAllowed_LegacyCompatibility() {
        // No phone number at all (legacy caller / pre-Phase-2 client) must still succeed.
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLatitude(10.0);
        req.setPickupLongitude(20.0);

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolResponse res = vehiclePoolService.joinPool("user_passenger", "pool_123", req);
        assertEquals(2, res.getAvailableSeats());

        ArgumentCaptor<VehiclePoolMemberEntity> memberCaptor = ArgumentCaptor.forClass(VehiclePoolMemberEntity.class);
        verify(memberRepository).save(memberCaptor.capture());
        assertNull(memberCaptor.getValue().getPhoneNumber());
    }

    @Test
    void testJoin_ManipulatedFrontendFareIsIgnored() {
        // Driver's real rate: costPerPassenger 100 over a 10km route -> 10/km.
        testPool.setCostPerPassenger(100.0);
        testPool.setRouteDistanceMeters(10000.0);

        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLatitude(0.0);
        req.setPickupLongitude(0.0);
        req.setDropoffLatitude(0.0);
        req.setDropoffLongitude(0.1); // ~11.12km at the equator
        // Passenger/attacker tries to make the server believe the fare is basically free.
        req.setClientCalculatedFare(0.01);

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolResponse res = vehiclePoolService.joinPool("user_passenger", "pool_123", req);

        // Backend must have recalculated its own fare/rate, never the client's 0.01.
        assertEquals(10.0, res.getRatePerKm());
        assertNotNull(res.getPassengerFare());
        assertTrue(res.getPassengerFare() > 50.0, "Recalculated fare should reflect the real ~11km distance, not the manipulated client value");

        ArgumentCaptor<VehiclePoolMemberEntity> memberCaptor = ArgumentCaptor.forClass(VehiclePoolMemberEntity.class);
        verify(memberRepository).save(memberCaptor.capture());
        VehiclePoolMemberEntity saved = memberCaptor.getValue();
        assertEquals(10.0, saved.getRatePerKm());
        assertNotEquals(0.01, saved.getPassengerFare());
        assertTrue(saved.getPassengerFare() > 50.0);
    }

    @Test
    void testJoin_FareNotComputedWithoutBothCoordinates() {
        // Only pickup provided (no dropoff) -- e.g. a legacy caller -- must not produce a
        // bogus fare/distance.
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLatitude(10.0);
        req.setPickupLongitude(20.0);

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolResponse res = vehiclePoolService.joinPool("user_passenger", "pool_123", req);
        assertNull(res.getPassengerFare());
        assertNull(res.getPassengerRouteDistanceMeters());
    }

    @Test
    void testJoin_MemberResponseNeverExposesPhoneOrPickupToPublicSearch() {
        // PoolMemberResponse (used for the creator's member list) must only ever carry
        // userName + joinedAt -- never phone number or pickup coordinates.
        java.util.List<String> fieldNames = new java.util.ArrayList<>();
        for (java.lang.reflect.Field f : com.greenmove.dto.VehiclePoolDTOs.PoolMemberResponse.class.getDeclaredFields()) {
            fieldNames.add(f.getName().toLowerCase());
        }
        assertTrue(fieldNames.stream().noneMatch(n -> n.contains("phone")),
                "PoolMemberResponse must never expose a passenger's phone number");
        assertTrue(fieldNames.stream().noneMatch(n -> n.contains("pickup")),
                "PoolMemberResponse must never expose a passenger's pickup location");
    }

    // =========================================================================
    //  Phase 5 - Carpool operational integration (join confirmation notification)
    // =========================================================================

    @Test
    void testJoin_ApproxPickupTimeReturnedWhenRouteGeometryAvailable() {
        // Straight route (0,0) -> (0,1), one degree of longitude. JTS Coordinate order is (x=lng, y=lat).
        org.locationtech.jts.geom.GeometryFactory gf =
                new org.locationtech.jts.geom.GeometryFactory(new org.locationtech.jts.geom.PrecisionModel(), 4326);
        org.locationtech.jts.geom.LineString route = gf.createLineString(new org.locationtech.jts.geom.Coordinate[]{
                new org.locationtech.jts.geom.Coordinate(0.0, 0.0),
                new org.locationtech.jts.geom.Coordinate(1.0, 0.0)
        });
        testPool.setRouteGeom(route);
        testPool.setRouteDurationSeconds(1000);
        testPool.setDepartureTime(LocalDateTime.now().plusHours(2));

        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLatitude(0.0);
        req.setPickupLongitude(0.5); // halfway along the route -> ~50% of duration
        req.setDropoffLatitude(0.0);
        req.setDropoffLongitude(0.9);

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolResponse res = vehiclePoolService.joinPool("user_passenger", "pool_123", req);

        assertNotNull(res.getApproxPickupTime());
        assertTrue(res.isPickupTimeApproximate());
        LocalDateTime expectedApprox = testPool.getDepartureTime().plusSeconds(500);
        long diffSeconds = Math.abs(java.time.Duration.between(expectedApprox, res.getApproxPickupTime()).getSeconds());
        assertTrue(diffSeconds <= 5, "Expected approx pickup time near " + expectedApprox + " but was " + res.getApproxPickupTime());
    }

    @Test
    void testJoin_ApproxPickupTimeNullWithoutRouteGeometry_LegacyCompatibility() {
        // testPool (default setUp) has no routeGeom/routeDurationSeconds set -- must not crash,
        // and must not fabricate a pickup time out of nothing.
        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLatitude(10.0);
        req.setPickupLongitude(20.0);
        req.setDropoffLatitude(30.0);
        req.setDropoffLongitude(40.0);

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolResponse res = assertDoesNotThrow(() ->
                vehiclePoolService.joinPool("user_passenger", "pool_123", req));

        assertNull(res.getApproxPickupTime());
        assertFalse(res.isPickupTimeApproximate());
    }

    @Test
    void testJoin_ApproxPickupTimeNullWithoutPickupCoordinates() {
        org.locationtech.jts.geom.GeometryFactory gf =
                new org.locationtech.jts.geom.GeometryFactory(new org.locationtech.jts.geom.PrecisionModel(), 4326);
        org.locationtech.jts.geom.LineString route = gf.createLineString(new org.locationtech.jts.geom.Coordinate[]{
                new org.locationtech.jts.geom.Coordinate(0.0, 0.0),
                new org.locationtech.jts.geom.Coordinate(1.0, 0.0)
        });
        testPool.setRouteGeom(route);
        testPool.setRouteDurationSeconds(1000);
        testPool.setDepartureTime(LocalDateTime.now().plusHours(2));

        // No JoinPoolRequest at all -- e.g. legacy caller with no pickup coordinates.
        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        PoolResponse res = vehiclePoolService.joinPool("user_passenger", "pool_123", null);

        assertNull(res.getApproxPickupTime());
        assertFalse(res.isPickupTimeApproximate());
    }

    @Test
    void testJoin_ApproxPickupTimeDoesNotTriggerGoogleRoutesCall() {
        // The approx pickup time must be derived purely from data already stored on the pool
        // (route geometry + duration) -- joinPool() must never call GoogleRoutesService.
        org.locationtech.jts.geom.GeometryFactory gf =
                new org.locationtech.jts.geom.GeometryFactory(new org.locationtech.jts.geom.PrecisionModel(), 4326);
        org.locationtech.jts.geom.LineString route = gf.createLineString(new org.locationtech.jts.geom.Coordinate[]{
                new org.locationtech.jts.geom.Coordinate(0.0, 0.0),
                new org.locationtech.jts.geom.Coordinate(1.0, 0.0)
        });
        testPool.setRouteGeom(route);
        testPool.setRouteDurationSeconds(1000);
        testPool.setDepartureTime(LocalDateTime.now().plusHours(2));

        JoinPoolRequest req = new JoinPoolRequest();
        req.setPickupLatitude(0.0);
        req.setPickupLongitude(0.5);

        when(userRepository.findById("user_passenger")).thenReturn(Optional.of(testPassenger));
        when(poolRepository.findByIdForUpdate("pool_123")).thenReturn(Optional.of(testPool));
        when(memberRepository.findByPoolIdAndUserId("pool_123", "user_passenger")).thenReturn(Optional.empty());

        vehiclePoolService.joinPool("user_passenger", "pool_123", req);

        verifyNoInteractions(googleRoutesService);
    }
}
