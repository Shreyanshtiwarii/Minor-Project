package com.greenmove.controller;

import com.greenmove.dto.AuthDTOs.*;
import com.greenmove.entity.UserEntity;
import com.greenmove.repository.UserRepository;
import com.greenmove.security.JwtService;
import com.greenmove.service.EmailService;
import com.greenmove.service.GoogleTokenVerifierService;
import com.greenmove.service.GoogleTokenVerifierService.GoogleProfile;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final Logger logger = LoggerFactory.getLogger(AuthController.class);

    // Resend is throttled to avoid spamming a mailbox / being abused for enumeration+cost.
    private static final long RESEND_COOLDOWN_SECONDS = 60;

    // Email OTPs (signup verification + password reset).
    private static final long OTP_TTL_MINUTES = 10;
    private static final int OTP_MAX_ATTEMPTS = 5;
    private static final String PURPOSE_VERIFY = "VERIFY_EMAIL";
    private static final String PURPOSE_RESET = "RESET_PASSWORD";
    private static final String MAIL_FAILED_MESSAGE =
            "We couldn't send the email right now. Please try again in a minute.";

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private EmailService emailService;

    @Autowired
    private GoogleTokenVerifierService googleTokenVerifierService;

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        if (!request.getPassword().equals(request.getConfirmPassword())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Passwords do not match"));
        }
        String normalizedEmail = request.getEmail().trim().toLowerCase();

        Optional<UserEntity> existing = userRepository.findByEmailIgnoreCase(normalizedEmail);
        UserEntity user;

        if (existing.isPresent()) {
            UserEntity found = existing.get();
            boolean unverifiedLocal = "LOCAL".equals(found.getAuthProvider()) && !found.isEmailVerified();
            if (!unverifiedLocal) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "An account with this email already exists. Please sign in."));
            }
            // The email was never verified, so nobody owns this address yet: treat this as a fresh
            // sign-up. Overwrite the stale name/password and send a new OTP instead of blocking it.
            user = found;
            user.setName(request.getName().trim());
            user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        } else {
            user = new UserEntity(
                    "usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16),
                    request.getName().trim(),
                    normalizedEmail,
                    "USER",
                    "ACTIVE",
                    LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
                    "Just now",
                    passwordEncoder.encode(request.getPassword()),
                    "LOCAL",
                    null
            );
        }

        // Signup flow: create unverified user -> email a 6-digit OTP -> POST /auth/verify-otp (returns a JWT).
        user.setEmailVerified(false);
        boolean sent = issueAndSendOtp(user, PURPOSE_VERIFY);
        userRepository.save(user);

        if (!sent) {
            // The account exists (unverified), so the user can simply retry sign-up or tap "Resend OTP".
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("message", MAIL_FAILED_MESSAGE));
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(new SignupResponse(
                "Account created. We've sent a 6-digit OTP to " + normalizedEmail + ". Enter it to verify your account.",
                normalizedEmail));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase();

        return userRepository.findByEmailIgnoreCase(normalizedEmail)
                .map(user -> {
                    if (!"LOCAL".equals(user.getAuthProvider()) || user.getPasswordHash() == null) {
                        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                                .body((Object) Map.of("message", "This email is registered via Google Sign-In. Please continue with Google."));
                    }
                    if (!"ACTIVE".equalsIgnoreCase(user.getStatus())) {
                        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                                .body((Object) Map.of("message", "This account has been disabled. Contact support for help."));
                    }
                    if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
                        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                                .body((Object) Map.of("message", "Incorrect email or password"));
                    }
                    if (!user.isEmailVerified()) {
                        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                                .body((Object) Map.of(
                                        "message", "Please verify your email with the OTP before signing in.",
                                        "emailNotVerified", true));
                    }

                    user.setLastActive("Just now");
                    userRepository.save(user);

                    String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole());
                    return ResponseEntity.ok((Object) new AuthResponse(token, toSummary(user)));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message", "Incorrect email or password")));
    }

    @PostMapping("/verify-email")
    public ResponseEntity<?> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        String token = request.getToken().trim();

        UserEntity user = userRepository.findByVerificationToken(token).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "This verification link is invalid or has already been used."));
        }
        if (user.getVerificationTokenExpiresAt() == null || user.getVerificationTokenExpiresAt().isBefore(Instant.now())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "This verification link has expired. Please request a new one."));
        }

        user.setEmailVerified(true);
        // One-time use: clear the token so this link can't be replayed.
        user.setVerificationToken(null);
        user.setVerificationTokenExpiresAt(null);
        userRepository.save(user);

        return ResponseEntity.ok(Map.of("message", "Your email has been verified. You can now sign in."));
    }

    /** POST /auth/verify-otp - confirms the signup OTP and signs the user in (same payload as /login). */
    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@Valid @RequestBody VerifyOtpRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase();
        UserEntity user = userRepository.findByEmailIgnoreCase(normalizedEmail).orElse(null);

        String error = (user == null) ? INVALID_OTP_MESSAGE : validateOtp(user, PURPOSE_VERIFY, request.getOtp());
        if (error != null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", error));
        }
        if (!"ACTIVE".equalsIgnoreCase(user.getStatus())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "This account has been disabled. Contact support for help."));
        }

        user.setEmailVerified(true);
        clearOtp(user);
        user.setVerificationToken(null);
        user.setVerificationTokenExpiresAt(null);
        user.setLastActive("Just now");
        userRepository.save(user);

        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole());
        return ResponseEntity.ok(new AuthResponse(token, toSummary(user)));
    }

    /** POST /auth/resend-otp - new signup OTP for an unverified account (60 s cooldown). */
    @PostMapping("/resend-otp")
    public ResponseEntity<?> resendOtp(@Valid @RequestBody EmailOnlyRequest request) {
        return resendVerificationOtp(request.getEmail());
    }

    /** Legacy path kept so older app builds keep working; now sends an OTP instead of a link. */
    @PostMapping("/resend-verification")
    public ResponseEntity<?> resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        return resendVerificationOtp(request.getEmail());
    }

    private ResponseEntity<?> resendVerificationOtp(String email) {
        String normalizedEmail = email.trim().toLowerCase();
        // Same answer whether or not the account exists / is already verified (no account enumeration).
        String genericMessage = "If an account with that email exists and still needs verification, we've sent a new OTP.";

        UserEntity user = userRepository.findByEmailIgnoreCase(normalizedEmail).orElse(null);
        if (user == null || !"LOCAL".equals(user.getAuthProvider()) || user.isEmailVerified()) {
            return ResponseEntity.ok(Map.of("message", genericMessage));
        }
        if (otpThrottled(user)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "Please wait a minute before requesting another OTP."));
        }
        boolean sent = issueAndSendOtp(user, PURPOSE_VERIFY);
        userRepository.save(user);
        if (!sent) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("message", MAIL_FAILED_MESSAGE));
        }
        return ResponseEntity.ok(Map.of("message", genericMessage));
    }

    /** POST /auth/forgot-password - emails a password-reset OTP (only password-based, active accounts). */
    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@Valid @RequestBody EmailOnlyRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase();
        String genericMessage = "If an account exists for this email, we've sent a 6-digit OTP to reset your password.";

        UserEntity user = userRepository.findByEmailIgnoreCase(normalizedEmail).orElse(null);
        if (user == null || !"LOCAL".equals(user.getAuthProvider()) || user.getPasswordHash() == null
                || !"ACTIVE".equalsIgnoreCase(user.getStatus())) {
            return ResponseEntity.ok(Map.of("message", genericMessage));
        }
        if (otpThrottled(user)) {
            logger.info("Forgot-password throttled for {} (cooldown active).", normalizedEmail);
            return ResponseEntity.ok(Map.of("message", genericMessage));
        }
        boolean sent = issueAndSendOtp(user, PURPOSE_RESET);
        userRepository.save(user);
        if (!sent) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("message", MAIL_FAILED_MESSAGE));
        }
        return ResponseEntity.ok(Map.of("message", genericMessage));
    }

    /** POST /auth/reset-password - checks the reset OTP and sets the new password. */
    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        if (!request.getNewPassword().equals(request.getConfirmPassword())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Passwords do not match"));
        }
        String normalizedEmail = request.getEmail().trim().toLowerCase();
        UserEntity user = userRepository.findByEmailIgnoreCase(normalizedEmail).orElse(null);

        String error = (user == null || !"LOCAL".equals(user.getAuthProvider()))
                ? INVALID_OTP_MESSAGE
                : validateOtp(user, PURPOSE_RESET, request.getOtp());
        if (error != null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", error));
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        // Receiving the OTP proves the user controls this mailbox.
        user.setEmailVerified(true);
        clearOtp(user);
        userRepository.save(user);

        emailService.sendPasswordChangedNotification(user.getEmail(), user.getName());
        return ResponseEntity.ok(Map.of("message", "Password updated. Please sign in with your new password."));
    }

    @PostMapping("/google")
    public ResponseEntity<?> googleAuth(@Valid @RequestBody GoogleAuthRequest request) {
        if (!googleTokenVerifierService.isConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("message", "Google Sign-In is not configured on the server yet. Set GOOGLE_CLIENT_ID to enable it."));
        }

        GoogleProfile profile = googleTokenVerifierService.verify(request.getIdToken());
        if (profile == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Google sign-in failed. Please try again."));
        }
        if (!profile.emailVerified) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Your Google email is not verified."));
        }

        String normalizedEmail = profile.email.trim().toLowerCase();

        UserEntity user = userRepository.findByGoogleId(profile.googleId)
                .or(() -> userRepository.findByEmailIgnoreCase(normalizedEmail))
                .orElse(null);

        if (user == null) {
            user = new UserEntity(
                    "usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16),
                    profile.name != null ? profile.name : normalizedEmail,
                    normalizedEmail,
                    "USER",
                    "ACTIVE",
                    LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
                    "Just now",
                    null,
                    "GOOGLE",
                    profile.googleId
            );
            // Google has already verified this email address, so there's nothing more to confirm.
            user.setEmailVerified(true);
        } else {
            if (!"ACTIVE".equalsIgnoreCase(user.getStatus())) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("message", "This account has been disabled. Contact support for help."));
            }
            // Link Google identity to an existing account (e.g. one originally created with a password).
            user.setGoogleId(profile.googleId);
            if (user.getAuthProvider() == null) {
                user.setAuthProvider("GOOGLE");
            }
            // Google re-confirms ownership of this address on every sign-in, so treat it as verified
            // even if it was a not-yet-verified LOCAL account being linked.
            user.setEmailVerified(true);
            clearOtp(user);
            user.setLastActive("Just now");
        }
        userRepository.save(user);

        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole());
        return ResponseEntity.ok(new AuthResponse(token, toSummary(user)));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Not authenticated"));
        }
        return userRepository.findById(authentication.getName())
                .<ResponseEntity<?>>map(user -> ResponseEntity.ok(toSummary(user)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "User not found")));
    }

    private static final String INVALID_OTP_MESSAGE = "Invalid or expired OTP. Please request a new one.";

    /**
     * Generates a fresh 6-digit OTP, stores only its BCrypt hash on the user and emails the plain code.
     * The caller must save the user. Returns false when the mail provider didn't accept the message.
     */
    private boolean issueAndSendOtp(UserEntity user, String purpose) {
        String otp = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        user.setOtpHash(passwordEncoder.encode(otp));
        user.setOtpPurpose(purpose);
        user.setOtpExpiresAt(Instant.now().plus(OTP_TTL_MINUTES, ChronoUnit.MINUTES));
        user.setOtpAttempts(0);
        user.setOtpSentAt(Instant.now());

        boolean sent = PURPOSE_RESET.equals(purpose)
                ? emailService.sendPasswordResetOtp(user.getEmail(), user.getName(), otp)
                : emailService.sendVerificationOtp(user.getEmail(), user.getName(), otp);
        if (!sent) {
            // Don't make the user wait out the cooldown after a failed send.
            user.setOtpSentAt(null);
        }
        return sent;
    }

    private boolean otpThrottled(UserEntity user) {
        return user.getOtpSentAt() != null
                && user.getOtpSentAt().plusSeconds(RESEND_COOLDOWN_SECONDS).isAfter(Instant.now());
    }

    /**
     * Checks [otp] against the stored hash for [purpose]. Returns null when valid, otherwise a
     * user-facing error. Wrong guesses are counted and persisted; after OTP_MAX_ATTEMPTS the code is dead.
     */
    private String validateOtp(UserEntity user, String purpose, String otp) {
        if (user.getOtpHash() == null || !purpose.equals(user.getOtpPurpose())) {
            return INVALID_OTP_MESSAGE;
        }
        if (user.getOtpExpiresAt() == null || user.getOtpExpiresAt().isBefore(Instant.now())) {
            return "This OTP has expired. Please request a new one.";
        }
        if (user.getOtpAttempts() >= OTP_MAX_ATTEMPTS) {
            return "Too many incorrect attempts. Please request a new OTP.";
        }
        if (!passwordEncoder.matches(otp, user.getOtpHash())) {
            user.setOtpAttempts(user.getOtpAttempts() + 1);
            userRepository.save(user);
            int left = OTP_MAX_ATTEMPTS - user.getOtpAttempts();
            return left > 0 ? "Incorrect OTP. " + left + " attempt(s) left." : "Too many incorrect attempts. Please request a new OTP.";
        }
        return null;
    }

    private void clearOtp(UserEntity user) {
        user.setOtpHash(null);
        user.setOtpPurpose(null);
        user.setOtpExpiresAt(null);
        user.setOtpSentAt(null);
        user.setOtpAttempts(0);
    }

    private UserSummary toSummary(UserEntity user) {
        return new UserSummary(user.getId(), user.getName(), user.getEmail(), user.getRole(), user.getAuthProvider(), user.isEmailVerified());
    }
}
