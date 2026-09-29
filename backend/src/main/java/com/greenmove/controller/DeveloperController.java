package com.greenmove.controller;

import com.greenmove.service.DeveloperService;
import com.greenmove.service.AdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/developer")
public class DeveloperController {

    @Autowired
    private DeveloperService developerService;

    @Autowired
    private AdminService adminService;

    public static class DeveloperLoginRequest {
        public String username;
        public String password;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody DeveloperLoginRequest request) {
        if (request != null && ("nandni".equalsIgnoreCase(request.username.trim()) || "nandini".equalsIgnoreCase(request.username.trim()))
                && ("nandni".equals(request.password.trim()) || "nandini".equals(request.password.trim()))) {

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("token", "dev_token_" + UUID.randomUUID().toString());
            response.put("username", request.username.trim());
            response.put("role", "DEVELOPER");
            response.put("name", "GreenMove Lead Developer");

            adminService.logAudit(request.username.trim(), "Developer Login", "Authentication", "Developer user authenticated successfully", "SUCCESS");
            return ResponseEntity.ok(response);
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("success", false, "message", "Invalid developer credentials"));
    }

    @GetMapping("/diagnostics")
    public ResponseEntity<Map<String, Object>> getDiagnostics() {
        return ResponseEntity.ok(developerService.getDeveloperDiagnostics());
    }

    @GetMapping("/logs")
    public ResponseEntity<List<Map<String, String>>> getLogs() {
        return ResponseEntity.ok(developerService.getDeveloperLogs());
    }
}
