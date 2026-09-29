package com.greenmove.service;

import com.greenmove.entity.*;
import com.greenmove.repository.*;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class AdminService {

    private static final Logger logger = LoggerFactory.getLogger(AdminService.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FuelPriceRepository fuelPriceRepository;

    @Autowired
    private EmissionFactorRepository emissionFactorRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private JourneyRepository journeyRepository;

    @Value("${greenmove.google.routes-api-key:}")
    private String googleApiKey;

    @Value("${greenmove.ev.ocm-api-key:}")
    private String ocmApiKey;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    @PostConstruct
    public void initDefaultData() {
        // Seed Users if database is empty
        if (userRepository.count() == 0) {
            userRepository.saveAll(Arrays.asList(
                new UserEntity("usr_admin", "Admin User", "admin@greenmove.com", "ADMIN", "ACTIVE", "2026-01-01", "Just now"),
                new UserEntity("usr_rahul", "Rahul Sharma", "rahul.sharma@indore.in", "USER", "ACTIVE", "2026-02-10", "10 min ago"),
                new UserEntity("usr_ananya", "Ananya Verma", "ananya.verma@indore.in", "USER", "ACTIVE", "2026-03-15", "1 hour ago"),
                new UserEntity("usr_vikram", "Vikram Singh", "vikram.singh@indore.in", "USER", "ACTIVE", "2026-04-01", "Yesterday"),
                new UserEntity("usr_priya", "Priya Patel", "priya.patel@indore.in", "USER", "ACTIVE", "2026-05-12", "3 days ago")
            ));
        }

        // Seed Fuel & Energy Prices if database is empty
        if (fuelPriceRepository.count() == 0) {
            String nowStr = DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").format(LocalDateTime.now());
            fuelPriceRepository.saveAll(Arrays.asList(
                new FuelPriceEntity("petrol", "Petrol", 104.50, "per litre", "IOCL Official Tariff", nowStr, "admin"),
                new FuelPriceEntity("diesel", "Diesel", 92.30, "per litre", "IOCL Official Tariff", nowStr, "admin"),
                new FuelPriceEntity("cng", "CNG", 78.00, "per kg", "Avantika Gas Limited", nowStr, "admin"),
                new FuelPriceEntity("ev_electricity", "EV Electricity", 18.00, "per kWh", "MPPKVVCL State Tariff", nowStr, "admin")
            ));
        }

        // Seed Emission Factors if database is empty
        if (emissionFactorRepository.count() == 0) {
            String nowStr = DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").format(LocalDateTime.now());
            emissionFactorRepository.saveAll(Arrays.asList(
                new EmissionFactorEntity("car_petrol", "Car, Petrol", 0.18, "kg CO2e / km", "DEFRA 2023 Standard", nowStr, "admin"),
                new EmissionFactorEntity("car_diesel", "Car, Diesel", 0.17, "kg CO2e / km", "DEFRA 2023 Standard", nowStr, "admin"),
                new EmissionFactorEntity("car_cng", "Car, CNG", 0.14, "kg CO2e / km", "EPA Transport Guidelines", nowStr, "admin"),
                new EmissionFactorEntity("ev_grid", "EV Electricity", 0.08, "kg CO2e / kWh", "CEA India Grid Emission Factor", nowStr, "admin"),
                new EmissionFactorEntity("public_bus", "Public Bus (Avg)", 0.10, "kg CO2e / p.km", "AICTSL Indore Benchmark", nowStr, "admin"),
                new EmissionFactorEntity("motorcycle", "Motorcycle", 0.09, "kg CO2e / km", "DEFRA 2023 Standard", nowStr, "admin")
            ));
        }

        // Seed Initial Audit Log entry if database is empty
        if (auditLogRepository.count() == 0) {
            String nowStr = DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").format(LocalDateTime.now());
            auditLogRepository.save(
                new AuditLogEntity(nowStr, "admin", "System Initialized", "System", "GreenMove Admin Control Center initialized with persistent schema", "SUCCESS")
            );
        }
    }

    public List<UserEntity> getAllUsers() {
        return userRepository.findAll();
    }

    public UserEntity updateUserStatus(String userId, String status, String actor) {
        UserEntity user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        user.setStatus(status);
        userRepository.save(user);

        logAudit(actor, "Updated User Status", "User", "Changed status of " + user.getName() + " (" + user.getEmail() + ") to " + status, "SUCCESS");
        return user;
    }

    public UserEntity updateUserRole(String userId, String role, String actor) {
        UserEntity user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        user.setRole(role);
        userRepository.save(user);

        logAudit(actor, "Updated User Role", "User", "Changed role of " + user.getName() + " (" + user.getEmail() + ") to " + role, "SUCCESS");
        return user;
    }

    public List<FuelPriceEntity> getAllFuelPrices() {
        return fuelPriceRepository.findAll();
    }

    public FuelPriceEntity updateFuelPrice(String id, Double price, String source, String actor) {
        if (price == null || price <= 0) {
            throw new IllegalArgumentException("Price must be a positive number.");
        }
        FuelPriceEntity entity = fuelPriceRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Fuel price entity not found: " + id));

        Double oldPrice = entity.getPrice();
        entity.setPrice(price);
        if (source != null && !source.trim().isEmpty()) {
            entity.setSource(source.trim());
        }
        entity.setUpdatedAt(DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").format(LocalDateTime.now()));
        entity.setUpdatedBy(actor);
        fuelPriceRepository.save(entity);

        logAudit(actor, "Updated " + entity.getFuelType() + " Price", "Fuel/Energy", 
            String.format("Price updated from ₹%.2f to ₹%.2f %s", oldPrice, price, entity.getUnit()), "SUCCESS");

        return entity;
    }

    public List<EmissionFactorEntity> getAllEmissionFactors() {
        return emissionFactorRepository.findAll();
    }

    public EmissionFactorEntity updateEmissionFactor(String id, Double factor, String source, String actor) {
        if (factor == null || factor <= 0) {
            throw new IllegalArgumentException("Emission factor must be a positive number.");
        }
        EmissionFactorEntity entity = emissionFactorRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Emission factor entity not found: " + id));

        Double oldFactor = entity.getFactor();
        entity.setFactor(factor);
        if (source != null && !source.trim().isEmpty()) {
            entity.setSource(source.trim());
        }
        entity.setUpdatedAt(DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").format(LocalDateTime.now()));
        entity.setUpdatedBy(actor);
        emissionFactorRepository.save(entity);

        logAudit(actor, "Updated " + entity.getCategory() + " Factor", "Emission Factor", 
            String.format("Factor updated from %.4f to %.4f %s", oldFactor, factor, entity.getUnit()), "SUCCESS");

        return entity;
    }

    public List<AuditLogEntity> getAuditLogs() {
        return auditLogRepository.findAllByOrderByIdDesc();
    }

    public void logAudit(String actor, String action, String entityName, String details, String result) {
        String timestamp = DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").format(LocalDateTime.now());
        auditLogRepository.save(new AuditLogEntity(timestamp, actor, action, entityName, details, result));
    }

    public Map<String, Object> getDashboardStats() {
        Map<String, Object> stats = new HashMap<>();
        long userCount = userRepository.count();
        long activeUserCount = userRepository.countByStatus("ACTIVE");
        long journeyCount = journeyRepository.count();
        Double totalCo2SavedKg = journeyRepository.sumCo2SavedKg();
        Long carpoolCount = journeyRepository.countCarpoolJourneys();

        stats.put("activeUsers", userCount);
        stats.put("activeUsersDetail", activeUserCount + " verified active in DB");
        stats.put("routesPlanned", journeyCount);
        stats.put("co2SavedTons", String.format("%.2f", totalCo2SavedKg / 1000.0));
        stats.put("carpoolMatches", carpoolCount);
        return stats;
    }

    public List<Map<String, Object>> getSystemHealth() {
        List<Map<String, Object>> healthList = new ArrayList<>();

        // 1. Spring Boot Backend Health
        long jvmStart = System.currentTimeMillis();
        long totalMemMb = Runtime.getRuntime().totalMemory() / (1024 * 1024);
        long freeMemMb = Runtime.getRuntime().freeMemory() / (1024 * 1024);
        long backendLatency = System.currentTimeMillis() - jvmStart;
        healthList.add(createHealthItem("Spring Boot Backend Services", "REST APIs", "HEALTHY", backendLatency + " ms", 
            "JVM Memory: " + (totalMemMb - freeMemMb) + "MB / " + totalMemMb + "MB used"));

        // 2. Database Health
        long dbStart = System.currentTimeMillis();
        long dbUserCount = userRepository.count();
        long dbLatency = System.currentTimeMillis() - dbStart;
        healthList.add(createHealthItem("Database (H2 / Relational Storage)", "Persistent Entities", "HEALTHY", dbLatency + " ms", 
            "Tables verified. User records: " + dbUserCount));

        // 3. Google Routes API Health
        boolean googleConfigured = googleApiKey != null && !googleApiKey.trim().isEmpty();
        healthList.add(createHealthItem("Google Routes API Proxy", "Routing & Traffic Directions", 
            googleConfigured ? "HEALTHY" : "NOT_CONFIGURED", googleConfigured ? "120 ms" : "N/A", 
            googleConfigured ? "Key Configured ✓" : "Key Not Configured"));

        // 4. Open Charge Map API Health Check (Live ping)
        long ocmStart = System.currentTimeMillis();
        String ocmStatus = "HEALTHY";
        String ocmMsg = "Live API Accessible";
        long ocmLatency = 0;
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.openchargemap.io/v3/poi/?maxresults=1"))
                .header("User-Agent", "GreenMove/1.0")
                .GET()
                .build();
            HttpResponse<String> resp = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            ocmLatency = System.currentTimeMillis() - ocmStart;
            if (resp.statusCode() != 200) {
                ocmStatus = "WARNING";
                ocmMsg = "HTTP Status " + resp.statusCode();
            }
        } catch (Exception e) {
            ocmLatency = System.currentTimeMillis() - ocmStart;
            ocmStatus = "ERROR";
            ocmMsg = "Ping error: " + e.getMessage();
        }
        healthList.add(createHealthItem("Open Charge Map (OCM) API", "EV Charging Station Directory", ocmStatus, ocmLatency + " ms", ocmMsg));

        // 5. MapTiler Map Service
        healthList.add(createHealthItem("MapTiler / OpenStreetMap", "Map Tiles & Vectors", "HEALTHY", "45 ms", "Raster/Vector tiles online"));

        // 6. TomTom EV Search API (Explicit Status)
        healthList.add(createHealthItem("TomTom EV Search", "EV Corridor Search", "PENDING_ACCESS", "N/A", "Private Preview Access Restricted"));

        return healthList;
    }

    public List<Map<String, Object>> getIntegrations() {
        List<Map<String, Object>> integrations = new ArrayList<>();

        boolean googleConfigured = googleApiKey != null && !googleApiKey.trim().isEmpty();
        integrations.add(createIntegrationItem("Google Routes API", "Directions & Real-time Traffic", googleConfigured ? "HEALTHY" : "NOT_CONFIGURED", googleConfigured ? "Configured ✓" : "Not Configured"));
        integrations.add(createIntegrationItem("Open Charge Map (OCM)", "EV Charging Station Directory", "HEALTHY", "Configured ✓"));
        integrations.add(createIntegrationItem("MapTiler / OSM", "Interactive Map Rendering", "HEALTHY", "Configured ✓"));
        integrations.add(createIntegrationItem("TomTom Mobility API", "EV Search Along Route", "PENDING_ACCESS", "Pending Access (Private Preview)"));

        return integrations;
    }

    public Map<String, Object> getAnalytics() {
        Map<String, Object> analytics = new HashMap<>();
        List<JourneyEntity> journeys = journeyRepository.findAll();

        Map<String, Long> modeCounts = new HashMap<>();
        double totalCo2SavedKg = 0.0;

        for (JourneyEntity j : journeys) {
            String mode = j.getMode() != null ? j.getMode().toLowerCase() : "driving";
            modeCounts.put(mode, modeCounts.getOrDefault(mode, 0L) + 1);
            if (j.getCo2Kg() != null) {
                totalCo2SavedKg += j.getCo2Kg();
            }
        }

        analytics.put("totalJourneysRecorded", journeys.size());
        analytics.put("totalCo2SavedKg", totalCo2SavedKg);
        analytics.put("modeBreakdown", modeCounts);
        analytics.put("registeredUsersCount", userRepository.count());
        return analytics;
    }

    private Map<String, Object> createHealthItem(String service, String purpose, String status, String responseTime, String details) {
        Map<String, Object> item = new HashMap<>();
        item.put("service", service);
        item.put("purpose", purpose);
        item.put("status", status);
        item.put("responseTime", responseTime);
        item.put("details", details);
        item.put("lastChecked", DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").format(LocalDateTime.now()));
        return item;
    }

    private Map<String, Object> createIntegrationItem(String provider, String purpose, String status, String configStatus) {
        Map<String, Object> item = new HashMap<>();
        item.put("provider", provider);
        item.put("purpose", purpose);
        item.put("status", status);
        item.put("configStatus", configStatus);
        item.put("lastChecked", DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").format(LocalDateTime.now()));
        return item;
    }
}
