package com.greenmove.service;

import com.greenmove.dto.AuthDTOs.UserSummary;
import com.greenmove.entity.UserEntity;
import com.greenmove.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

/**
 * Business logic backing /api/v1/users/me/** (Profile Settings): change name, change password,
 * and request an email change. Mirrors the exception/status-code pattern already used by
 * VehiclePoolService (a typed runtime exception carrying an HTTP status).
 */
@Service
public class UserProfileService {

    public static class ProfileException extends RuntimeException {
        private final int status;
        public ProfileException(int status, String message) {
            super(message);
            this.status = status;
        }
        public int getStatus() { return status; }
    }

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    public UserProfileService(UserRepository userRepository, PasswordEncoder passwordEncoder, EmailService emailService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
    }

    public UserSummary updateName(String userId, String newName) {
        UserEntity user = getUserOrThrow(userId);
        user.setName(newName.trim());
        userRepository.save(user);
        return toSummary(user);
    }

    public void changePassword(String userId, String currentPassword, String newPassword, String confirmPassword) {
        UserEntity user = getUserOrThrow(userId);
        requireLocalAccount(user, "Password changes aren't available for Google-linked accounts.");

        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ProfileException(401, "Current password is incorrect");
        }
        if (!newPassword.equals(confirmPassword)) {
            throw new ProfileException(400, "New passwords do not match");
        }
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new ProfileException(400, "New password must be different from your current password");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        emailService.sendPasswordChangedNotification(user.getEmail(), user.getName());
    }

    public void requestEmailChange(String userId, String currentPassword, String newEmail) {
        UserEntity user = getUserOrThrow(userId);
        requireLocalAccount(user, "Email changes aren't available for Google-linked accounts.");

        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ProfileException(401, "Current password is incorrect");
        }

        String normalizedEmail = newEmail.trim().toLowerCase();
        if (normalizedEmail.equals(user.getEmail())) {
            throw new ProfileException(400, "That's already your current email address");
        }
        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new ProfileException(409, "An account with this email already exists");
        }

        // Stage the change - app_users.email is untouched until the link below is confirmed
        // (confirmEmailChange, below).
        String token = generateSecureToken();
        user.setPendingEmail(normalizedEmail);
        user.setEmailChangeToken(token);
        user.setEmailChangeTokenExpiresAt(Instant.now().plus(24, ChronoUnit.HOURS));
        userRepository.save(user);

        emailService.sendEmailChangeVerification(normalizedEmail, user.getName(), token);
    }

    /**
     * Completes the "Change Email" flow: confirms the token emailed to the *new* address and
     * swaps it onto the account, then notifies the *old* address that the change happened (in
     * case the request wasn't legitimate). Deliberately not scoped to the currently-authenticated
     * user - the token itself (delivered only to the new inbox) is the credential, same pattern
     * as signup email verification, since the browser session that requested the change may
     * have long since expired by the time the link is clicked.
     */
    public void confirmEmailChange(String token) {
        UserEntity user = userRepository.findByEmailChangeToken(token)
                .orElseThrow(() -> new ProfileException(400, "This link is invalid or has already been used."));

        if (user.getEmailChangeTokenExpiresAt() == null || user.getEmailChangeTokenExpiresAt().isBefore(Instant.now())) {
            throw new ProfileException(400, "This link has expired. Please request the email change again.");
        }

        String newEmail = user.getPendingEmail();
        if (newEmail == null) {
            throw new ProfileException(400, "This link is invalid or has already been used.");
        }
        // Re-check uniqueness in case someone else claimed this address in the meantime.
        if (userRepository.existsByEmailIgnoreCase(newEmail) && !newEmail.equalsIgnoreCase(user.getEmail())) {
            throw new ProfileException(409, "An account with this email already exists");
        }

        String oldEmail = user.getEmail();
        user.setEmail(newEmail);
        user.setPendingEmail(null);
        user.setEmailChangeToken(null);
        user.setEmailChangeTokenExpiresAt(null);
        userRepository.save(user);

        emailService.sendEmailChangedNotification(oldEmail, user.getName(), newEmail);
    }

    private String generateSecureToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private void requireLocalAccount(UserEntity user, String message) {
        if (!"LOCAL".equals(user.getAuthProvider()) || user.getPasswordHash() == null) {
            throw new ProfileException(400, message);
        }
    }

    private UserEntity getUserOrThrow(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ProfileException(404, "User not found"));
    }

    private UserSummary toSummary(UserEntity user) {
        return new UserSummary(user.getId(), user.getName(), user.getEmail(), user.getRole(), user.getAuthProvider(), user.isEmailVerified());
    }
}
