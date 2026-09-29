package com.greenmove.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.RuntimeMXBean;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class DeveloperService {

    @Autowired
    private AdminService adminService;

    @Value("${spring.profiles.active:default}")
    private String activeProfile;

    @Value("${server.port:8080}")
    private String serverPort;

    public Map<String, Object> getDeveloperDiagnostics() {
        Map<String, Object> diag = new HashMap<>();

        // Application & Build Version
        Map<String, Object> appInfo = new HashMap<>();
        appInfo.put("appName", "GreenMove Backend Core");
        appInfo.put("version", "2.0.0-SNAPSHOT");
        appInfo.put("framework", "Spring Boot v3.4.2");
        appInfo.put("frontendFramework", "React + Vite v8.2.2");
        appInfo.put("javaVersion", System.getProperty("java.version"));
        appInfo.put("activeProfile", activeProfile);
        appInfo.put("serverPort", serverPort);
        diag.put("application", appInfo);

        // JVM & Memory Diagnostics
        MemoryMXBean memoryMXBean = ManagementFactory.getMemoryMXBean();
        RuntimeMXBean runtimeMXBean = ManagementFactory.getRuntimeMXBean();

        Map<String, Object> jvmInfo = new HashMap<>();
        jvmInfo.put("uptimeMs", runtimeMXBean.getUptime());
        jvmInfo.put("uptimeFormatted", formatUptime(runtimeMXBean.getUptime()));
        jvmInfo.put("heapMemoryUsedMb", memoryMXBean.getHeapMemoryUsage().getUsed() / (1024 * 1024));
        jvmInfo.put("heapMemoryMaxMb", memoryMXBean.getHeapMemoryUsage().getMax() / (1024 * 1024));
        jvmInfo.put("threadCount", Thread.activeCount());
        diag.put("jvm", jvmInfo);

        // External API Connection Matrix
        diag.put("apiConnections", adminService.getIntegrations());

        // System Health Status
        diag.put("healthChecks", adminService.getSystemHealth());

        return diag;
    }

    public List<Map<String, String>> getDeveloperLogs() {
        List<Map<String, String>> logs = new ArrayList<>();
        String nowStr = DateTimeFormatter.ofPattern("HH:mm:ss.SSS").format(LocalDateTime.now());

        logs.add(createLogEntry(nowStr, "INFO", "com.greenmove.DeveloperService", "Developer Control Center diagnostics initialized."));
        logs.add(createLogEntry(nowStr, "DEBUG", "com.greenmove.service.GoogleRoutesService", "Google Routes API traffic routing proxy active."));
        logs.add(createLogEntry(nowStr, "DEBUG", "com.greenmove.provider.OpenChargeMapProvider", "OCM POI API connection pool active."));
        logs.add(createLogEntry(nowStr, "INFO", "com.greenmove.config.CorsConfig", "CORS policy allowing http://localhost:5173 origin."));
        logs.add(createLogEntry(nowStr, "WARN", "com.greenmove.provider.TomTomEVProvider", "TomTom EV Along Route endpoint in private preview mode. Status: PENDING_ACCESS."));

        return logs;
    }

    private Map<String, String> createLogEntry(String timestamp, String level, String loggerName, String message) {
        Map<String, String> entry = new HashMap<>();
        entry.put("timestamp", timestamp);
        entry.put("level", level);
        entry.put("logger", loggerName);
        entry.put("message", message);
        return entry;
    }

    private String formatUptime(long uptimeMs) {
        long seconds = uptimeMs / 1000;
        long minutes = seconds / 60;
        long hours = minutes / 60;
        return String.format("%d hr %d min %d sec", hours, minutes % 60, seconds % 60);
    }
}
