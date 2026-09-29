package com.greenmove.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "app_users")
public class UserEntity {

    @Id
    private String id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String role; // USER or ADMIN

    @Column(nullable = false)
    private String status; // ACTIVE or DISABLED

    @Column(name = "joined_date")
    private String joinedDate;

    @Column(name = "last_active")
    private String lastActive;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "auth_provider", nullable = false)
    private String authProvider = "LOCAL"; // LOCAL or GOOGLE

    @Column(name = "google_id")
    private String googleId;

    @Column(name = "pending_email")
    private String pendingEmail;

    @Column(name = "email_change_token")
    private String emailChangeToken;

    @Column(name = "email_change_token_expires_at")
    private Instant emailChangeTokenExpiresAt;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified = false;

    @Column(name = "verification_token")
    private String verificationToken;

    @Column(name = "verification_token_expires_at")
    private Instant verificationTokenExpiresAt;

    @Column(name = "verification_sent_at")
    private Instant verificationSentAt;

    @Column(name = "vehicle_efficiency")
    private Double vehicleEfficiency;

    @Column(name = "fuel_type")
    private String fuelType;

    public UserEntity() {}

    public UserEntity(String id, String name, String email, String role, String status, String joinedDate, String lastActive) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.role = role;
        this.status = status;
        this.joinedDate = joinedDate;
        this.lastActive = lastActive;
    }

    public UserEntity(String id, String name, String email, String role, String status, String joinedDate,
                       String lastActive, String passwordHash, String authProvider, String googleId) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.role = role;
        this.status = status;
        this.joinedDate = joinedDate;
        this.lastActive = lastActive;
        this.passwordHash = passwordHash;
        this.authProvider = authProvider;
        this.googleId = googleId;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getJoinedDate() { return joinedDate; }
    public void setJoinedDate(String joinedDate) { this.joinedDate = joinedDate; }

    public String getLastActive() { return lastActive; }
    public void setLastActive(String lastActive) { this.lastActive = lastActive; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public String getAuthProvider() { return authProvider; }
    public void setAuthProvider(String authProvider) { this.authProvider = authProvider; }

    public String getGoogleId() { return googleId; }
    public void setGoogleId(String googleId) { this.googleId = googleId; }

    public String getPendingEmail() { return pendingEmail; }
    public void setPendingEmail(String pendingEmail) { this.pendingEmail = pendingEmail; }

    public String getEmailChangeToken() { return emailChangeToken; }
    public void setEmailChangeToken(String emailChangeToken) { this.emailChangeToken = emailChangeToken; }

    public Instant getEmailChangeTokenExpiresAt() { return emailChangeTokenExpiresAt; }
    public void setEmailChangeTokenExpiresAt(Instant emailChangeTokenExpiresAt) { this.emailChangeTokenExpiresAt = emailChangeTokenExpiresAt; }

    public boolean isEmailVerified() { return emailVerified; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }

    public String getVerificationToken() { return verificationToken; }
    public void setVerificationToken(String verificationToken) { this.verificationToken = verificationToken; }

    public Instant getVerificationTokenExpiresAt() { return verificationTokenExpiresAt; }
    public void setVerificationTokenExpiresAt(Instant verificationTokenExpiresAt) { this.verificationTokenExpiresAt = verificationTokenExpiresAt; }

    public Instant getVerificationSentAt() { return verificationSentAt; }
    public void setVerificationSentAt(Instant verificationSentAt) { this.verificationSentAt = verificationSentAt; }

    public Double getVehicleEfficiency() { return vehicleEfficiency; }
    public void setVehicleEfficiency(Double vehicleEfficiency) { this.vehicleEfficiency = vehicleEfficiency; }

    public String getFuelType() { return fuelType; }
    public void setFuelType(String fuelType) { this.fuelType = fuelType; }
}
