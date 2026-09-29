package com.greenmove.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request and response payloads for /api/v1/auth/**.
 * Grouped in a single file to mirror the project's existing lightweight DTO style.
 */
public class AuthDTOs {

    public static class RegisterRequest {
        @NotBlank(message = "Name is required")
        @Size(min = 2, max = 120, message = "Name must be between 2 and 120 characters")
        private String name;

        @NotBlank(message = "Email is required")
        @Email(message = "Enter a valid email address")
        private String email;

        @NotBlank(message = "Password is required")
        @Size(min = 8, max = 100, message = "Password must be at least 8 characters")
        private String password;

        @NotBlank(message = "Please confirm your password")
        private String confirmPassword;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getConfirmPassword() { return confirmPassword; }
        public void setConfirmPassword(String confirmPassword) { this.confirmPassword = confirmPassword; }
    }

    public static class LoginRequest {
        @NotBlank(message = "Email is required")
        @Email(message = "Enter a valid email address")
        private String email;

        @NotBlank(message = "Password is required")
        private String password;

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
    }

    public static class VerifyEmailRequest {
        @NotBlank(message = "Verification token is required")
        private String token;

        public String getToken() { return token; }
        public void setToken(String token) { this.token = token; }
    }

    public static class ResendVerificationRequest {
        @NotBlank(message = "Email is required")
        @Email(message = "Enter a valid email address")
        private String email;

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
    }

    public static class GoogleAuthRequest {
        @NotBlank(message = "Google credential token is required")
        private String idToken;

        public String getIdToken() { return idToken; }
        public void setIdToken(String idToken) { this.idToken = idToken; }
    }

    public static class UserSummary {
        private String id;
        private String name;
        private String email;
        private String role;
        private String authProvider;
        private boolean emailVerified;

        public UserSummary(String id, String name, String email, String role, String authProvider, boolean emailVerified) {
            this.id = id;
            this.name = name;
            this.email = email;
            this.role = role;
            this.authProvider = authProvider;
            this.emailVerified = emailVerified;
        }

        public String getId() { return id; }
        public String getName() { return name; }
        public String getEmail() { return email; }
        public String getRole() { return role; }
        public String getAuthProvider() { return authProvider; }
        public boolean isEmailVerified() { return emailVerified; }
    }

    public static class AuthResponse {
        private String token;
        private UserSummary user;

        public AuthResponse(String token, UserSummary user) {
            this.token = token;
            this.user = user;
        }

        public String getToken() { return token; }
        public UserSummary getUser() { return user; }
    }

    /**
     * Returned by POST /auth/register. Deliberately carries no JWT: the flow is
     * Signup -> unverified user created -> verification email sent -> user verifies -> user logs in,
     * so nobody is authenticated yet at this point.
     */
    public static class SignupResponse {
        private String message;
        private String email;

        public SignupResponse(String message, String email) {
            this.message = message;
            this.email = email;
        }

        public String getMessage() { return message; }
        public String getEmail() { return email; }
    }
}
