package com.greenmove.controller;

import com.greenmove.entity.*;
import com.greenmove.service.AdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    @Autowired
    private AdminService adminService;

    // Request Payloads
    public static class AdminLoginRequest {
        public String username;
        public String password;
    }

    public static class PriceUpdateRequest {
        public Double price;
        public String source;
    }

    public static class FactorUpdateRequest {
        public Double factor;
        public String source;
    }

    public static class UserStatusUpdateRequest {
        public String status;
    }

    public static class UserRoleUpdateRequest {
        public String role;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AdminLoginRequest request) {
        if (request != null && "admin".equalsIgnoreCase(request.username) && "admin".equals(request.password)) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("token", "adm_token_" + UUID.randomUUID().toString());
            response.put("username", "admin");
            response.put("role", "ADMIN");
            response.put("name", "GreenMove Administrator");
            
            adminService.logAudit("admin", "Admin Login", "Authentication", "Admin user logged in successfully", "SUCCESS");
            return ResponseEntity.ok(response);
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("success", false, "message", "Invalid admin credentials. Use admin / admin"));
    }

    @GetMapping("/dashboard-stats")
    public ResponseEntity<Map<String, Object>> getDashboardStats() {
        return ResponseEntity.ok(adminService.getDashboardStats());
    }

    @GetMapping("/users")
    public ResponseEntity<List<UserEntity>> getUsers() {
        return ResponseEntity.ok(adminService.getAllUsers());
    }

    @PutMapping("/users/{id}/status")
    public ResponseEntity<?> updateUserStatus(@PathVariable String id, @RequestBody UserStatusUpdateRequest request,
                                               @RequestHeader(value = "X-Admin-Role", required = false) String adminRole) {
        try {
            UserEntity user = adminService.updateUserStatus(id, request.status, "admin");
            return ResponseEntity.ok(user);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/users/{id}/role")
    public ResponseEntity<?> updateUserRole(@PathVariable String id, @RequestBody UserRoleUpdateRequest request,
                                             @RequestHeader(value = "X-Admin-Role", required = false) String adminRole) {
        try {
            UserEntity user = adminService.updateUserRole(id, request.role, "admin");
            return ResponseEntity.ok(user);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/fuel-prices")
    public ResponseEntity<List<FuelPriceEntity>> getFuelPrices() {
        return ResponseEntity.ok(adminService.getAllFuelPrices());
    }

    @PutMapping("/fuel-prices/{id}")
    public ResponseEntity<?> updateFuelPrice(@PathVariable String id, @RequestBody PriceUpdateRequest request,
                                              @RequestHeader(value = "X-Admin-Role", required = false) String adminRole) {
        try {
            FuelPriceEntity updated = adminService.updateFuelPrice(id, request.price, request.source, "admin");
            return ResponseEntity.ok(updated);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/emission-factors")
    public ResponseEntity<List<EmissionFactorEntity>> getEmissionFactors() {
        return ResponseEntity.ok(adminService.getAllEmissionFactors());
    }

    @PutMapping("/emission-factors/{id}")
    public ResponseEntity<?> updateEmissionFactor(@PathVariable String id, @RequestBody FactorUpdateRequest request,
                                                   @RequestHeader(value = "X-Admin-Role", required = false) String adminRole) {
        try {
            EmissionFactorEntity updated = adminService.updateEmissionFactor(id, request.factor, request.source, "admin");
            return ResponseEntity.ok(updated);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/system-health")
    public ResponseEntity<List<Map<String, Object>>> getSystemHealth() {
        return ResponseEntity.ok(adminService.getSystemHealth());
    }

    @GetMapping("/integrations")
    public ResponseEntity<List<Map<String, Object>>> getIntegrations() {
        return ResponseEntity.ok(adminService.getIntegrations());
    }

    @GetMapping("/analytics")
    public ResponseEntity<Map<String, Object>> getAnalytics() {
        return ResponseEntity.ok(adminService.getAnalytics());
    }

    @GetMapping("/audit-logs")
    public ResponseEntity<List<AuditLogEntity>> getAuditLogs() {
        return ResponseEntity.ok(adminService.getAuditLogs());
    }
}
