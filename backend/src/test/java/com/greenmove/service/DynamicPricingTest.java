package com.greenmove.service;

import com.greenmove.dto.RoutingResponse;
import com.greenmove.dto.RoutingResponse.RouteDTO;
import com.greenmove.dto.VehiclePoolDTOs.CreatePoolRequest;
import com.greenmove.dto.VehiclePoolDTOs.PoolResponse;
import com.greenmove.entity.UserEntity;
import com.greenmove.entity.VehiclePoolEntity;
import com.greenmove.repository.UserRepository;
import com.greenmove.repository.VehiclePoolMemberRepository;
import com.greenmove.repository.VehiclePoolRepository;
import com.greenmove.repository.VehiclePoolRepository.SpatialCandidateProjection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.PrecisionModel;
import org.mockito.Mock;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Phase 1 - Dynamic carpool pricing.
 *
 * ratePerKm = costPerPassenger / (routeDistanceMeters / 1000)
 * passengerFare = ratePerKm * passengerRouteDistanceKm
 *
 * These tests are isolated from the rest of the VehiclePoolServiceTest suite so Phase 1
 * can be verified (and re-run) independently of Phase 0-9 matching behaviour, which this
 * change must not alter.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DynamicPricingTest {

    private static final GeometryFactory GF = new GeometryFactory(new PrecisionModel(), 4326);

    @Mock private VehiclePoolRepository poolRepository;
    @Mock private VehiclePoolMemberRepository memberRepository;
    @Mock private UserRepository userRepository;
    @Mock private GoogleRoutesService googleRoutesService;
    @Mock private javax.sql.DataSource dataSource;

    @InjectMocks
    private VehiclePoolService vehiclePoolService;

    private UserEntity testUser;

    @BeforeEach
    void setUp() throws Exception {
        testUser = new UserEntity();
        testUser.setId("user_123");
        testUser.setName("Test Driver");
        testUser.setEmail("driver@test.com");

        java.sql.Connection mockConnection = mock(java.sql.Connection.class);
        java.sql.DatabaseMetaData mockMetaData = mock(java.sql.DatabaseMetaData.class);
        when(dataSource.getConnection()).thenReturn(mockConnection);
        when(mockConnection.getMetaData()).thenReturn(mockMetaData);
        when(mockMetaData.getDatabaseProductName()).thenReturn("H2");

        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "maxSpatialDistanceMeters", 3000.0);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "maxDetourDistanceMeters", 3000.0);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "maxDetourPercentage", 20.0);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "minRouteOverlapPercentage", 50.0);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "routeOverlapToleranceMeters", 100.0);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "maxDetourCandidates", 10);

        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "overlapWeight", 0.35);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "pickupWeight", 0.20);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "dropoffWeight", 0.15);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "detourWeight", 0.15);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "timeWeight", 0.15);
        org.springframework.test.util.ReflectionTestUtils.setField(vehiclePoolService, "maxDepartureTimeDifferenceMinutes", 30.0);
    }

    // =========================================================================
    //  Helpers (mirrors the conventions in VehiclePoolServiceTest)
    // =========================================================================

    private CreatePoolRequest createValidRequest(double costPerPassenger) {
        CreatePoolRequest req = new CreatePoolRequest();
        req.setStartLocation("Palasia Square, Indore");
        req.setStartLatitude(22.7244);
        req.setStartLongitude(75.8839);
        req.setDestination("Vijay Nagar, Indore");
        req.setDestinationLatitude(22.7533);
        req.setDestinationLongitude(75.8937);
        req.setDepartureTime(LocalDateTime.now().plusHours(2));
        req.setTotalSeats(3);
        req.setCostPerPassenger(costPerPassenger);
        return req;
    }

    private RouteDTO mockRoute(double distanceMeters, double durationSeconds) {
        RouteDTO dto = new RouteDTO();
        dto.setDistanceMeters(distanceMeters);
        dto.setDurationSeconds(durationSeconds);
        dto.setStaticDurationSeconds(durationSeconds);
        dto.setTrafficDurationSeconds(durationSeconds);
        List<double[]> coords = List.of(
                new double[]{75.8650, 22.7300},
                new double[]{75.8839, 22.7244},
                new double[]{75.8570, 22.7196});
        dto.setGeometry(Map.of("type", "LineString", "coordinates", coords));
        return dto;
    }

    private LineString sampleRouteLineString() {
        Coordinate[] coords = {
                new Coordinate(75.8650, 22.7300),
                new Coordinate(75.8839, 22.7244),
                new Coordinate(75.8570, 22.7196)
        };
        LineString ls = GF.createLineString(coords);
        ls.setSRID(4326);
        return ls;
    }

    private VehiclePoolEntity activePool(String id, Double routeDistanceMeters, Double costPerPassenger) {
        VehiclePoolEntity e = new VehiclePoolEntity();
        e.setId(id);
        e.setCreatorId("driver_1");
        e.setCreatorName("Driver One");
        e.setStartLocation("Bijasanagar, Indore");
        e.setStartLat(22.7300);
        e.setStartLng(75.8650);
        e.setStartGeom(VehiclePoolService.createPoint(22.7300, 75.8650));
        e.setDestination("Rajwada, Indore");
        e.setDestinationLat(22.7196);
        e.setDestinationLng(75.8570);
        e.setDestinationGeom(VehiclePoolService.createPoint(22.7196, 75.8570));
        e.setRouteGeom(sampleRouteLineString());
        e.setRouteDistanceMeters(routeDistanceMeters);
        e.setRouteDurationSeconds(900);
        e.setDepartureTime(LocalDateTime.now().plusHours(3));
        e.setTotalSeats(4);
        e.setAvailableSeats(3);
        e.setCostPerPassenger(costPerPassenger);
        e.setTotalCost(costPerPassenger == null ? null : costPerPassenger * 3);
        e.setStatus("ACTIVE");
        e.setCreatedAt(LocalDateTime.now());
        return e;
    }

    private SpatialCandidateProjection projection(String poolId, double pickupDist, double dropoffDist, double pickupPos, double dropoffPos) {
        return new SpatialCandidateProjection() {
            @Override public String getPoolId() { return poolId; }
            @Override public Double getPickupDistanceMeters() { return pickupDist; }
            @Override public Double getDropoffDistanceMeters() { return dropoffDist; }
            @Override public Double getPickupRoutePosition() { return pickupPos; }
            @Override public Double getDropoffRoutePosition() { return dropoffPos; }
        };
    }

    // =========================================================================
    //  ratePerKm - computed purely from the driver's own existing data
    // =========================================================================

    @Test
    @DisplayName("ratePerKm: ₹20 over 20km = ₹1/km")
    void testRatePerKm_20over20_equals1() {
        when(userRepository.findById("user_123")).thenReturn(Optional.of(testUser));
        when(poolRepository.save(any(VehiclePoolEntity.class))).thenAnswer(i -> i.getArgument(0));
        when(googleRoutesService.computeTrafficRoutes(any()))
                .thenReturn(new RoutingResponse(true, "Success", mockRoute(20000.0, 1200.0), List.of(mockRoute(20000.0, 1200.0))));

        PoolResponse response = vehiclePoolService.createPool("user_123", createValidRequest(20.0));

        assertNotNull(response.getRatePerKm());
        assertEquals(1.0, response.getRatePerKm(), 0.0001);
    }

    @Test
    @DisplayName("ratePerKm: ₹20 over 10km = ₹2/km")
    void testRatePerKm_20over10_equals2() {
        when(userRepository.findById("user_123")).thenReturn(Optional.of(testUser));
        when(poolRepository.save(any(VehiclePoolEntity.class))).thenAnswer(i -> i.getArgument(0));
        when(googleRoutesService.computeTrafficRoutes(any()))
                .thenReturn(new RoutingResponse(true, "Success", mockRoute(10000.0, 900.0), List.of(mockRoute(10000.0, 900.0))));

        PoolResponse response = vehiclePoolService.createPool("user_123", createValidRequest(20.0));

        assertNotNull(response.getRatePerKm());
        assertEquals(2.0, response.getRatePerKm(), 0.0001);
    }

    @Test
    @DisplayName("ratePerKm is null (safely omitted) when route distance is zero")
    void testRatePerKm_ZeroDistance_ReturnsNull() {
        VehiclePoolEntity pool = activePool("pool_zero_dist", 0.0, 40.0);
        PoolResponse r = invokeToResponse(pool);
        assertNull(r.getRatePerKm());
    }

    @Test
    @DisplayName("ratePerKm is null (safely omitted) when route distance is negative")
    void testRatePerKm_NegativeDistance_ReturnsNull() {
        VehiclePoolEntity pool = activePool("pool_neg_dist", -500.0, 40.0);
        PoolResponse r = invokeToResponse(pool);
        assertNull(r.getRatePerKm());
    }

    @Test
    @DisplayName("ratePerKm is null (safely omitted) when cost per passenger is zero")
    void testRatePerKm_ZeroPrice_ReturnsNull() {
        VehiclePoolEntity pool = activePool("pool_zero_price", 7500.0, 0.0);
        PoolResponse r = invokeToResponse(pool);
        assertNull(r.getRatePerKm());
    }

    @Test
    @DisplayName("ratePerKm is null (safely omitted) when cost per passenger is negative")
    void testRatePerKm_NegativePrice_ReturnsNull() {
        VehiclePoolEntity pool = activePool("pool_neg_price", 7500.0, -10.0);
        PoolResponse r = invokeToResponse(pool);
        assertNull(r.getRatePerKm());
    }

    /** Exercises the private toResponse() mapper via the public listMyPools() entry point. */
    private PoolResponse invokeToResponse(VehiclePoolEntity pool) {
        UserEntity creator = new UserEntity();
        creator.setId("driver_1");
        creator.setName("Driver One");
        creator.setEmail("driver1@test.com");
        when(userRepository.findById("driver_1")).thenReturn(Optional.of(creator));
        when(poolRepository.findByCreatorIdOrderByDepartureTimeAsc("driver_1")).thenReturn(List.of(pool));
        when(memberRepository.findByPoolId(pool.getId())).thenReturn(List.of());
        List<PoolResponse> results = vehiclePoolService.listMyPools("driver_1");
        assertEquals(1, results.size());
        return results.get(0);
    }

    // =========================================================================
    //  passengerFare - reuses Phase 5's already-fetched passenger C->D distance
    // =========================================================================

    @Test
    @DisplayName("passengerFare: 5km passenger at ₹1/km rate = ₹5, and no extra Google Routes call is made")
    void testPassengerFare_5kmAt1PerKm_equals5_noExtraRoutingCall() {
        // Driver: ₹20 over a 20km route -> ratePerKm = ₹1/km
        VehiclePoolEntity pool = activePool("pool_fare", 20000.0, 20.0);

        when(poolRepository.findSpatialCandidates(anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                anyDouble(), any(LocalDateTime.class)))
                .thenReturn(List.of(projection("pool_fare", 5.0, 5.0, 0.05, 0.95)));
        when(poolRepository.findAllById(List.of("pool_fare"))).thenReturn(List.of(pool));
        when(memberRepository.findByUserId(any())).thenReturn(List.of());

        // Passenger's own C->D route is exactly 5km. Pickup/dropoff coincide with the
        // driver's own start/end so A->C and D->B are skipped (0 extra routing calls),
        // leaving exactly ONE computeTrafficRoutes call for the whole search: the
        // passenger C->D route itself, which Phase 1 pricing reuses rather than duplicating.
        RouteDTO passengerRoute = mockRoute(5000.0, 400.0);
        when(googleRoutesService.computeTrafficRoutes(any()))
                .thenReturn(new RoutingResponse(true, "Mock", passengerRoute, List.of(passengerRoute)));

        List<PoolResponse> results = vehiclePoolService.searchPoolsSpatial(
                "user_p",
                "Bijasanagar, Indore", 22.7300, 75.8650,
                "Rajwada, Indore", 22.7196, 75.8570);

        assertEquals(1, results.size());
        PoolResponse r = results.get(0);

        assertNotNull(r.getRatePerKm());
        assertEquals(1.0, r.getRatePerKm(), 0.0001);

        assertNotNull(r.getPassengerFare());
        assertEquals(5.0, r.getPassengerFare(), 0.0001);

        // Exactly one Google Routes call for the entire search -> pricing added zero calls.
        verify(googleRoutesService, times(1)).computeTrafficRoutes(any());
    }

    @Test
    @DisplayName("passengerFare is null (safely omitted) when the driver's ratePerKm is invalid")
    void testPassengerFare_InvalidRatePerKm_ReturnsNull() {
        // Driver's own routeDistanceMeters is zero -> ratePerKm can't be computed.
        VehiclePoolEntity pool = activePool("pool_fare_bad_rate", 0.0, 20.0);

        when(poolRepository.findSpatialCandidates(anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                anyDouble(), any(LocalDateTime.class)))
                .thenReturn(List.of(projection("pool_fare_bad_rate", 5.0, 5.0, 0.05, 0.95)));
        when(poolRepository.findAllById(List.of("pool_fare_bad_rate"))).thenReturn(List.of(pool));
        when(memberRepository.findByUserId(any())).thenReturn(List.of());

        RouteDTO passengerRoute = mockRoute(2000.0, 200.0);
        when(googleRoutesService.computeTrafficRoutes(any()))
                .thenReturn(new RoutingResponse(true, "Mock", passengerRoute, List.of(passengerRoute)));

        List<PoolResponse> results = vehiclePoolService.searchPoolsSpatial(
                "user_p",
                "Bijasanagar, Indore", 22.7300, 75.8650,
                "Rajwada, Indore", 22.7196, 75.8570);

        assertEquals(1, results.size());
        assertNull(results.get(0).getRatePerKm());
        assertNull(results.get(0).getPassengerFare());
    }

    @Test
    @DisplayName("passengerFare: invalid (zero) passenger route distance is rejected safely -> 500 with no fare on any pool")
    void testPassengerFare_InvalidPassengerDistance_RejectedSafely() {
        VehiclePoolEntity pool = activePool("pool_fare_bad_dist", 20000.0, 20.0);

        when(poolRepository.findSpatialCandidates(anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                anyDouble(), any(LocalDateTime.class)))
                .thenReturn(List.of(projection("pool_fare_bad_dist", 5.0, 5.0, 0.05, 0.95)));
        when(poolRepository.findAllById(List.of("pool_fare_bad_dist"))).thenReturn(List.of(pool));
        when(memberRepository.findByUserId(any())).thenReturn(List.of());

        // Zero-distance passenger route is already rejected upstream (Phase 5 invariant,
        // unrelated to this change) with a 500 PoolException -- confirming Phase 1 does not
        // weaken or bypass that existing validation.
        RouteDTO zeroDistRoute = mockRoute(0.0, 0.0);
        when(googleRoutesService.computeTrafficRoutes(any()))
                .thenReturn(new RoutingResponse(true, "Mock", zeroDistRoute, List.of(zeroDistRoute)));

        VehiclePoolService.PoolException ex = assertThrows(
                VehiclePoolService.PoolException.class,
                () -> vehiclePoolService.searchPoolsSpatial(
                        "user_p",
                        "Bijasanagar, Indore", 22.7300, 75.8650,
                        "Rajwada, Indore", 22.7196, 75.8570));
        assertEquals(500, ex.getStatus());
    }
}
