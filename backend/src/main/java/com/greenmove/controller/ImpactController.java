package com.greenmove.controller;

import com.greenmove.entity.VehiclePoolEntity;
import com.greenmove.entity.VehiclePoolMemberEntity;
import com.greenmove.repository.VehiclePoolMemberRepository;
import com.greenmove.repository.VehiclePoolRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

@RestController
@RequestMapping("/api/v1/impact")
public class ImpactController {

    private final VehiclePoolMemberRepository memberRepository;
    private final VehiclePoolRepository poolRepository;

    public ImpactController(VehiclePoolMemberRepository memberRepository, VehiclePoolRepository poolRepository) {
        this.memberRepository = memberRepository;
        this.poolRepository = poolRepository;
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getMyImpact(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(401).build();
        }
        String userId = authentication.getName();

        // 1. PASSENGER IMPACT (for CREDITED memberships)
        List<VehiclePoolMemberEntity> members = memberRepository.findByUserId(userId);
        double totalMoneySaved = 0.0;
        double totalCo2Saved = 0.0;
        int passengerCompletedTrips = 0;
        double passengerSharedDistanceKm = 0.0;
        double totalSoloCost = 0.0;
        double totalCarpoolCost = 0.0;

        List<Double> tripEcoPointsList = new ArrayList<>();

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime monday = now.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).withHour(0).withMinute(0).withSecond(0).withNano(0);
        LocalDateTime nextMonday = monday.plusDays(7);

        double[] weeklyCo2Saved = new double[7];

        for (VehiclePoolMemberEntity mem : members) {
            if ("CREDITED".equals(mem.getStatus())) {
                passengerCompletedTrips++;
                double tripSavedMoney = mem.getMoneySaved() != null ? mem.getMoneySaved() : 0.0;
                double tripSavedCo2 = mem.getCo2SavedKg() != null ? mem.getCo2SavedKg() : 0.0;
                double tripDistMeters = mem.getPassengerRouteDistanceMeters() != null ? mem.getPassengerRouteDistanceMeters() : 0.0;

                totalMoneySaved += tripSavedMoney;
                totalCo2Saved += tripSavedCo2;
                passengerSharedDistanceKm += (tripDistMeters / 1000.0);
                if (mem.getSoloCost() != null) totalSoloCost += mem.getSoloCost();

                VehiclePoolEntity pool = poolRepository.findById(mem.getPoolId()).orElse(null);
                if (pool != null && pool.getCostPerPassenger() != null) {
                    totalCarpoolCost += pool.getCostPerPassenger();
                }

                // Phase 2 Eco Score calculation for passenger trip
                double co2Score = Math.min(100.0, Math.max(0.0, (tripSavedCo2 / 3.0) * 100.0));
                double moneyScore = Math.min(100.0, Math.max(0.0, (tripSavedMoney / 100.0) * 100.0));
                double participationScore = 100.0;

                double tripQuality = (co2Score * 0.5) + (moneyScore * 0.3) + (participationScore * 0.2);
                double tripEcoPoints = (tripQuality / 100.0) * 30.0;
                tripEcoPointsList.add(tripEcoPoints);

                LocalDateTime completedAt = mem.getJoinedAt();
                if (completedAt != null && !completedAt.isBefore(monday) && completedAt.isBefore(nextMonday)) {
                    int dayIndex = completedAt.getDayOfWeek().getValue() - 1;
                    weeklyCo2Saved[dayIndex] += tripSavedCo2;
                }
            }
        }

        // 2. DRIVER IMPACT (for COMPLETED pools created by the user)
        List<VehiclePoolEntity> userPools = poolRepository.findByCreatorIdOrderByDepartureTimeAsc(userId);
        int driverCompletedPools = 0;
        double driverSharedDistanceKm = 0.0;
        int passengersServed = 0;
        double carpoolEarnings = 0.0;

        for (VehiclePoolEntity pool : userPools) {
            if ("COMPLETED".equals(pool.getStatus())) {
                driverCompletedPools++;
                if (pool.getRouteDistanceMeters() != null && pool.getRouteDistanceMeters() > 0) {
                    driverSharedDistanceKm += (pool.getRouteDistanceMeters() / 1000.0);
                }

                List<VehiclePoolMemberEntity> poolMembers = memberRepository.findByPoolId(pool.getId());
                for (VehiclePoolMemberEntity pm : poolMembers) {
                    if ("CREDITED".equals(pm.getStatus())) {
                        passengersServed++;
                        double fare = pool.getCostPerPassenger() != null ? pool.getCostPerPassenger() : 0.0;
                        carpoolEarnings += fare;

                        // Each credited passenger served counts as a successful driver shared trip
                        double co2Score = 100.0;
                        double moneyScore = Math.min(100.0, Math.max(0.0, (fare / 100.0) * 100.0));
                        double participationScore = 100.0;

                        double tripQuality = (co2Score * 0.5) + (moneyScore * 0.3) + (participationScore * 0.2);
                        double tripEcoPoints = (tripQuality / 100.0) * 30.0;
                        tripEcoPointsList.add(tripEcoPoints);
                    }
                }
            }
        }

        // 3. OVERALL METRICS & ECO SCORE
        int totalCompletedTrips = passengerCompletedTrips + driverCompletedPools;
        double totalSharedDistanceKm = passengerSharedDistanceKm + driverSharedDistanceKm;

        int ecoScore = 0;
        if (!tripEcoPointsList.isEmpty()) {
            double totalTripPoints = 0.0;
            for (double pts : tripEcoPointsList) {
                totalTripPoints += pts;
            }
            double averageTripPoints = totalTripPoints / tripEcoPointsList.size();
            double participationBonus = Math.min(70.0, totalCompletedTrips * 2.0);
            double rawScore = averageTripPoints + participationBonus;
            ecoScore = (int) Math.min(100, Math.max(0, Math.round(rawScore)));
        }

        List<Map<String, Object>> weeklyData = new ArrayList<>();
        String[] dayNames = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};
        int currentDayIndex = now.getDayOfWeek().getValue() - 1;
        for (int i = 0; i < 7; i++) {
            Map<String, Object> dayInfo = new HashMap<>();
            dayInfo.put("day", dayNames[i]);
            dayInfo.put("co2Saved", weeklyCo2Saved[i]);
            dayInfo.put("isToday", i == currentDayIndex);
            weeklyData.add(dayInfo);
        }

        Map<String, Object> resp = new HashMap<>();
        // Phase 1 response fields
        resp.put("moneySaved", totalMoneySaved);
        resp.put("co2SavedKg", totalCo2Saved);
        resp.put("completedTrips", totalCompletedTrips);
        resp.put("soloTripsAvoided", totalCompletedTrips);
        resp.put("sharedDistanceKm", totalSharedDistanceKm);
        resp.put("totalSoloCost", totalSoloCost);
        resp.put("totalCarpoolCost", totalCarpoolCost);
        resp.put("averageSavingPerTrip", passengerCompletedTrips > 0 ? totalMoneySaved / passengerCompletedTrips : 0.0);
        resp.put("realizedSavings", totalMoneySaved);

        // Phase 2 Driver & Eco Score fields
        resp.put("driverCompletedPools", driverCompletedPools);
        resp.put("driverSharedDistanceKm", driverSharedDistanceKm);
        resp.put("passengersServed", passengersServed);
        resp.put("carpoolEarnings", carpoolEarnings);
        resp.put("ecoScore", ecoScore);

        resp.put("weeklyData", weeklyData);
        return ResponseEntity.ok(resp);
    }
}
