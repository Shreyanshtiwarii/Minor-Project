package com.greenmove.service;

import com.greenmove.controller.ImpactController;
import com.greenmove.entity.EmissionFactorEntity;
import com.greenmove.entity.FuelPriceEntity;
import com.greenmove.entity.UserEntity;
import com.greenmove.entity.VehiclePoolEntity;
import com.greenmove.entity.VehiclePoolMemberEntity;
import com.greenmove.repository.EmissionFactorRepository;
import com.greenmove.repository.FuelPriceRepository;
import com.greenmove.repository.UserRepository;
import com.greenmove.repository.VehiclePoolMemberRepository;
import com.greenmove.repository.VehiclePoolRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TripCalculationTest {

    @Mock private VehiclePoolRepository poolRepository;
    @Mock private VehiclePoolMemberRepository memberRepository;
    @Mock private UserRepository userRepository;
    @Mock private FuelPriceRepository fuelPriceRepository;
    @Mock private EmissionFactorRepository emissionFactorRepository;
    @Mock private GoogleRoutesService googleRoutesService;
    @Mock private javax.sql.DataSource dataSource;

    @InjectMocks
    private VehiclePoolService vehiclePoolService;

    private ImpactController impactController;

    private UserEntity creator;
    private UserEntity passenger;
    private VehiclePoolEntity pool;
    private VehiclePoolMemberEntity member;

    @BeforeEach
    void setUp() throws Exception {
        impactController = new ImpactController(memberRepository, poolRepository);

        creator = new UserEntity();
        creator.setId("driver_1");
        creator.setName("Driver One");

        passenger = new UserEntity();
        passenger.setId("passenger_1");
        passenger.setName("Passenger One");
        passenger.setVehicleEfficiency(15.0);
        passenger.setFuelType("petrol");

        pool = new VehiclePoolEntity();
        pool.setId("pool_100");
        pool.setCreatorId("driver_1");
        pool.setStatus("ACTIVE");
        pool.setTotalSeats(4);
        pool.setAvailableSeats(3);
        pool.setCostPerPassenger(50.0);
        pool.setRouteDistanceMeters(15000.0);

        member = new VehiclePoolMemberEntity();
        member.setId("mem_100");
        member.setPoolId("pool_100");
        member.setUserId("passenger_1");
        member.setUserName("Passenger One");
        member.setStatus("PENDING");
        member.setPassengerRouteDistanceMeters(15000.0);

        when(userRepository.findById("driver_1")).thenReturn(Optional.of(creator));
        when(userRepository.findById("passenger_1")).thenReturn(Optional.of(passenger));
        when(poolRepository.findByIdForUpdate("pool_100")).thenReturn(Optional.of(pool));
        when(poolRepository.findById("pool_100")).thenReturn(Optional.of(pool));
        when(memberRepository.findByPoolId("pool_100")).thenReturn(List.of(member));

        FuelPriceEntity petrolPrice = new FuelPriceEntity();
        petrolPrice.setId("petrol");
        petrolPrice.setPrice(105.0);
        when(fuelPriceRepository.findById("petrol")).thenReturn(Optional.of(petrolPrice));

        EmissionFactorEntity ef = new EmissionFactorEntity();
        ef.setId("car_petrol");
        ef.setFactor(2.3);
        when(emissionFactorRepository.findById("car_petrol")).thenReturn(Optional.of(ef));
    }

    @Test
    @DisplayName("Verify Credited Trip Calculation Formulas")
    void testCreditedTripCalculations() {
        vehiclePoolService.completePool("driver_1", "pool_100");

        assertEquals("CREDITED", member.getStatus());

        // distanceKm = 15000 / 1000 = 15.0
        // fuelUsed = 15.0 / 15.0 = 1.0 L
        // soloCost = 1.0 * 105.0 = 105.0
        // carpoolCost = 50.0
        // moneySaved = max(0, 105.0 - 50.0) = 55.0
        // co2SavedKg = 1.0 * 2.3 = 2.3 kg

        assertEquals(105.0, member.getSoloCost(), 0.01);
        assertEquals(55.0, member.getMoneySaved(), 0.01);
        assertEquals(2.3, member.getCo2SavedKg(), 0.01);
    }

    @Test
    @DisplayName("Verify Terminated/Cancelled Pool Contributes Zero")
    void testTerminatedPoolZeroContribution() {
        vehiclePoolService.terminatePool("driver_1", "pool_100");

        assertEquals("CANCELLED", member.getStatus());
        assertNull(member.getSoloCost());
        assertNull(member.getMoneySaved());
        assertNull(member.getCo2SavedKg());
    }

    @Test
    @DisplayName("Verify Impact API Aggregates Only CREDITED Trips")
    void testImpactApiAggregatesCreditedOnly() {
        member.setStatus("CREDITED");
        member.setPassengerRouteDistanceMeters(15000.0);
        member.setSoloCost(105.0);
        member.setMoneySaved(55.0);
        member.setCo2SavedKg(2.3);

        VehiclePoolMemberEntity cancelledMem = new VehiclePoolMemberEntity();
        cancelledMem.setId("mem_101");
        cancelledMem.setPoolId("pool_100");
        cancelledMem.setUserId("passenger_1");
        cancelledMem.setStatus("CANCELLED");
        cancelledMem.setPassengerRouteDistanceMeters(10000.0);
        cancelledMem.setSoloCost(80.0);
        cancelledMem.setMoneySaved(40.0);
        cancelledMem.setCo2SavedKg(1.8);

        when(memberRepository.findByUserId("passenger_1")).thenReturn(List.of(member, cancelledMem));

        Authentication auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("passenger_1");

        ResponseEntity<Map<String, Object>> response = impactController.getMyImpact(auth);
        assertNotNull(response.getBody());

        Map<String, Object> body = response.getBody();
        assertEquals(1, body.get("completedTrips"));
        assertEquals(55.0, (Double) body.get("moneySaved"), 0.01);
        assertEquals(2.3, (Double) body.get("co2SavedKg"), 0.01);
        assertEquals(15.0, (Double) body.get("sharedDistanceKm"), 0.01);
        assertEquals(105.0, (Double) body.get("totalSoloCost"), 0.01);
        assertEquals(50.0, (Double) body.get("totalCarpoolCost"), 0.01);
        assertEquals(55.0, (Double) body.get("realizedSavings"), 0.01);
        assertEquals(55.0, (Double) body.get("averageSavingPerTrip"), 0.01);
    }

    @Test
    @DisplayName("Verify Impact API Returns Zeroes for User With No Completed Trips")
    void testImpactApiNoCompletedTrips() {
        when(memberRepository.findByUserId("passenger_2")).thenReturn(List.of());

        Authentication auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("passenger_2");

        ResponseEntity<Map<String, Object>> response = impactController.getMyImpact(auth);
        assertNotNull(response.getBody());

        Map<String, Object> body = response.getBody();
        assertEquals(0, body.get("completedTrips"));
        assertEquals(0.0, (Double) body.get("moneySaved"), 0.01);
        assertEquals(0.0, (Double) body.get("co2SavedKg"), 0.01);
        assertEquals(0.0, (Double) body.get("sharedDistanceKm"), 0.01);
        assertEquals(0.0, (Double) body.get("totalSoloCost"), 0.01);
        assertEquals(0.0, (Double) body.get("totalCarpoolCost"), 0.01);
        assertEquals(0.0, (Double) body.get("averageSavingPerTrip"), 0.01);
        assertEquals(0.0, (Double) body.get("realizedSavings"), 0.01);
        assertEquals(0, body.get("ecoScore"));
    }

    @Test
    @DisplayName("Verify Phase 2 Driver Impact Metrics for Completed Pools and Multiple Passengers")
    void testDriverImpactMetrics() {
        VehiclePoolEntity completedPool = new VehiclePoolEntity();
        completedPool.setId("pool_200");
        completedPool.setCreatorId("driver_1");
        completedPool.setStatus("COMPLETED");
        completedPool.setRouteDistanceMeters(20000.0); // 20 km
        completedPool.setCostPerPassenger(60.0);

        VehiclePoolMemberEntity pm1 = new VehiclePoolMemberEntity();
        pm1.setId("pm_1");
        pm1.setPoolId("pool_200");
        pm1.setUserId("p1");
        pm1.setStatus("CREDITED");

        VehiclePoolMemberEntity pm2 = new VehiclePoolMemberEntity();
        pm2.setId("pm_2");
        pm2.setPoolId("pool_200");
        pm2.setUserId("p2");
        pm2.setStatus("CREDITED");

        when(poolRepository.findByCreatorIdOrderByDepartureTimeAsc("driver_1")).thenReturn(List.of(completedPool));
        when(memberRepository.findByPoolId("pool_200")).thenReturn(List.of(pm1, pm2));
        when(memberRepository.findByUserId("driver_1")).thenReturn(List.of());

        Authentication auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("driver_1");

        ResponseEntity<Map<String, Object>> response = impactController.getMyImpact(auth);
        assertNotNull(response.getBody());

        Map<String, Object> body = response.getBody();
        assertEquals(1, body.get("driverCompletedPools"));
        assertEquals(20.0, (Double) body.get("driverSharedDistanceKm"), 0.01);
        assertEquals(2, body.get("passengersServed"));
        assertEquals(120.0, (Double) body.get("carpoolEarnings"), 0.01);
    }

    @Test
    @DisplayName("Verify Phase 2 Eco Score for 1 Normal Trip is Approximately 20-30")
    void testPhase2EcoScoreSingleNormalTrip() {
        member.setStatus("CREDITED");
        member.setPassengerRouteDistanceMeters(15000.0);
        member.setSoloCost(105.0);
        member.setMoneySaved(55.0);
        member.setCo2SavedKg(2.3);

        when(memberRepository.findByUserId("passenger_1")).thenReturn(List.of(member));

        Authentication auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("passenger_1");

        ResponseEntity<Map<String, Object>> response = impactController.getMyImpact(auth);
        assertNotNull(response.getBody());

        int score = (Integer) response.getBody().get("ecoScore");
        assertTrue(score >= 20 && score <= 30, "Single normal trip eco score should be ~20-30, got: " + score);
    }

    @Test
    @DisplayName("Verify Phase 2 Eco Score Gradual Growth and Upper Bounds (0 to 100)")
    void testPhase2EcoScoreGradualGrowthAndBounds() {
        List<VehiclePoolMemberEntity> tripList = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            VehiclePoolMemberEntity m = new VehiclePoolMemberEntity();
            m.setId("mem_" + i);
            m.setUserId("passenger_multi");
            m.setStatus("CREDITED");
            m.setMoneySaved(60.0);
            m.setCo2SavedKg(2.5);
            tripList.add(m);
        }

        when(memberRepository.findByUserId("passenger_multi")).thenReturn(tripList);

        Authentication auth = mock(Authentication.class);
        when(auth.getName()).thenReturn("passenger_multi");

        ResponseEntity<Map<String, Object>> response = impactController.getMyImpact(auth);
        assertNotNull(response.getBody());

        int score = (Integer) response.getBody().get("ecoScore");
        assertTrue(score >= 90 && score <= 100, "Eco score should grow gradually and cap at 100, got: " + score);
    }

    @Test
    @DisplayName("End-to-End Test Pool Flow: Vijay Nagar to Rajwada with Joined, Cancelled & Completed Passengers")
    void testEndToEndPoolFlow() {
        // 1. Driver creates test pool: Vijay Nagar -> Rajwada (12 km, ₹50/passenger)
        UserEntity driverVijay = new UserEntity();
        driverVijay.setId("driver_vijay");
        driverVijay.setName("Driver Vijay");

        VehiclePoolEntity vijayPool = new VehiclePoolEntity();
        vijayPool.setId("pool_vijay_rajwada");
        vijayPool.setCreatorId("driver_vijay");
        vijayPool.setStatus("ACTIVE");
        vijayPool.setTotalSeats(4);
        vijayPool.setAvailableSeats(2);
        vijayPool.setCostPerPassenger(50.0);
        vijayPool.setRouteDistanceMeters(12000.0); // 12 km

        // 2. Passenger 1 joins with intermediate pickup/dropoff (10 km)
        UserEntity passengerRaj = new UserEntity();
        passengerRaj.setId("passenger_raj");
        passengerRaj.setName("Passenger Raj");
        passengerRaj.setVehicleEfficiency(15.0);
        passengerRaj.setFuelType("petrol");

        VehiclePoolMemberEntity memberRaj = new VehiclePoolMemberEntity();
        memberRaj.setId("mem_raj");
        memberRaj.setPoolId("pool_vijay_rajwada");
        memberRaj.setUserId("passenger_raj");
        memberRaj.setUserName("Passenger Raj");
        memberRaj.setStatus("PENDING");
        memberRaj.setPassengerRouteDistanceMeters(10000.0); // 10 km

        // 3. Passenger 2 joins then cancels
        UserEntity passengerCancelled = new UserEntity();
        passengerCancelled.setId("passenger_cancelled");
        passengerCancelled.setName("Passenger Cancelled");

        VehiclePoolMemberEntity memberCancelled = new VehiclePoolMemberEntity();
        memberCancelled.setId("mem_cancelled");
        memberCancelled.setPoolId("pool_vijay_rajwada");
        memberCancelled.setUserId("passenger_cancelled");
        memberCancelled.setUserName("Passenger Cancelled");
        memberCancelled.setStatus("CANCELLED");
        memberCancelled.setPassengerRouteDistanceMeters(8000.0);

        // Setup repository mocks for end-to-end simulation
        when(userRepository.findById("driver_vijay")).thenReturn(Optional.of(driverVijay));
        when(userRepository.findById("passenger_raj")).thenReturn(Optional.of(passengerRaj));
        when(poolRepository.findByIdForUpdate("pool_vijay_rajwada")).thenReturn(Optional.of(vijayPool));
        when(poolRepository.findById("pool_vijay_rajwada")).thenReturn(Optional.of(vijayPool));
        when(memberRepository.findByPoolId("pool_vijay_rajwada")).thenReturn(List.of(memberRaj, memberCancelled));
        when(memberRepository.findByUserId("passenger_raj")).thenReturn(List.of(memberRaj));
        when(memberRepository.findByUserId("passenger_cancelled")).thenReturn(List.of(memberCancelled));
        when(poolRepository.findByCreatorIdOrderByDepartureTimeAsc("driver_vijay")).thenReturn(List.of(vijayPool));
        when(memberRepository.findByUserId("driver_vijay")).thenReturn(List.of());

        // 4. Complete the pool
        vehiclePoolService.completePool("driver_vijay", "pool_vijay_rajwada");

        // 5. Verify member state changes
        assertEquals("COMPLETED", vijayPool.getStatus());
        assertEquals("CREDITED", memberRaj.getStatus());
        assertEquals("CANCELLED", memberCancelled.getStatus());

        // Check Passenger Raj financial & CO2 fields:
        // distanceKm = 10.0 km
        // fuelUsed = 10.0 / 15.0 = 0.66667 L
        // soloCost = 0.66667 * 105.0 = 70.0
        // moneySaved = max(0, 70.0 - 50.0) = 20.0
        // co2SavedKg = 0.66667 * 2.3 = 1.5333 kg
        assertEquals(70.0, memberRaj.getSoloCost(), 0.01);
        assertEquals(20.0, memberRaj.getMoneySaved(), 0.01);
        assertEquals(1.533, memberRaj.getCo2SavedKg(), 0.01);

        // Cancelled passenger must have null/zero fields
        assertNull(memberCancelled.getMoneySaved());
        assertNull(memberCancelled.getCo2SavedKg());

        // 6. Verify GET /api/v1/impact/me for Passenger Raj
        Authentication authRaj = mock(Authentication.class);
        when(authRaj.getName()).thenReturn("passenger_raj");

        ResponseEntity<Map<String, Object>> responseRaj = impactController.getMyImpact(authRaj);
        assertNotNull(responseRaj.getBody());
        Map<String, Object> bodyRaj = responseRaj.getBody();

        assertEquals(1, bodyRaj.get("completedTrips"));
        assertEquals(20.0, (Double) bodyRaj.get("moneySaved"), 0.01);
        assertEquals(1.533, (Double) bodyRaj.get("co2SavedKg"), 0.001);
        assertEquals(10.0, (Double) bodyRaj.get("sharedDistanceKm"), 0.01);
        assertEquals(70.0, (Double) bodyRaj.get("totalSoloCost"), 0.01);
        assertEquals(50.0, (Double) bodyRaj.get("totalCarpoolCost"), 0.01);
        assertEquals(20.0, (Double) bodyRaj.get("realizedSavings"), 0.01);
        
        int ecoScoreRaj = (Integer) bodyRaj.get("ecoScore");
        assertEquals(17, ecoScoreRaj, "Passenger Raj eco score for 10km trip");

        // 7. Verify GET /api/v1/impact/me for Driver Vijay
        Authentication authVijay = mock(Authentication.class);
        when(authVijay.getName()).thenReturn("driver_vijay");

        ResponseEntity<Map<String, Object>> responseVijay = impactController.getMyImpact(authVijay);
        assertNotNull(responseVijay.getBody());
        Map<String, Object> bodyVijay = responseVijay.getBody();

        assertEquals(1, bodyVijay.get("driverCompletedPools"));
        assertEquals(12.0, (Double) bodyVijay.get("driverSharedDistanceKm"), 0.01);
        assertEquals(1, bodyVijay.get("passengersServed")); // Only CREDITED passenger_raj counted
        assertEquals(50.0, (Double) bodyVijay.get("carpoolEarnings"), 0.01);

        // 8. Verify GET /api/v1/impact/me for Cancelled Passenger
        Authentication authCancelled = mock(Authentication.class);
        when(authCancelled.getName()).thenReturn("passenger_cancelled");

        ResponseEntity<Map<String, Object>> responseCancelled = impactController.getMyImpact(authCancelled);
        assertNotNull(responseCancelled.getBody());
        Map<String, Object> bodyCancelled = responseCancelled.getBody();

        assertEquals(0, bodyCancelled.get("completedTrips"));
        assertEquals(0.0, (Double) bodyCancelled.get("moneySaved"), 0.01);
        assertEquals(0.0, (Double) bodyCancelled.get("co2SavedKg"), 0.01);
        assertEquals(0.0, (Double) bodyCancelled.get("realizedSavings"), 0.01);
        assertEquals(0, bodyCancelled.get("ecoScore"));
    }
}
