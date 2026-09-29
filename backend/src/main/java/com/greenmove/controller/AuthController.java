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
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final Logger logger = LoggerFactory.getLogger(AuthController.class);

    // Signup verification links are valid for 24 hours, same as the email-change links.
    private static final long VERIFICATION_TOKEN_TTL_HOURS = 24;
    // Resend is throttled to avoid spamming a mailbox / being abused for enumeration+cost.
    private static final long RESEND_COOLDOWN_SECONDS = 60;

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

        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "An account with this email already exists"));
        }

        UserEntity user = new UserEntity(
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

        // Signup flow: create unverified user -> send verification email -> verify -> login.
        // No JWT is issued here; the account can't log in until the email is confirmed.
        user.setEmailVerified(false);
        issueAndSendVerificationToken(user);

        userRepository.save(user);

        return ResponseEntity.status(HttpStatus.CREATED).body(new SignupResponse(
                "Account created. We've sent a verification link to " + normalizedEmail + " - " +
                        "please confirm it before signing in.",
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
                                        "message", "Please verify your email before signing in. Check your inbox, or request a new link.",
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

    @PostMapping("/resend-verification")
    public ResponseEntity<?> resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase();

        // Always return the same generic response regardless of whether the account exists,
        // is already verified, or is a Google account - avoids leaking which emails are
        // registered (account enumeration).
        String genericMessage = "If an account with that email exists and still needs verification, we've sent a new link.";

        userRepository.findByEmailIgnoreCase(normalizedEmail).ifPresent(user -> {
            if (!"LOCAL".equals(user.getAuthProvider()) || user.isEmailVerified()) {
                return;
            }
            if (user.getVerificationSentAt() != null
                    && user.getVerificationSentAt().plusSeconds(RESEND_COOLDOWN_SECONDS).isAfter(Instant.now())) {
                logger.info("Resend-verification throttled for {} (cooldown active).", normalizedEmail);
                return;
            }
            issueAndSendVerificationToken(user);
            userRepository.save(user);
        });

        return ResponseEntity.ok(Map.of("message", genericMessage));
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

    private void issueAndSendVerificationToken(UserEntity user) {
        String token = generateSecureToken();
        user.setVerificationToken(token);
        user.setVerificationTokenExpiresAt(Instant.now().plus(VERIFICATION_TOKEN_TTL_HOURS, ChronoUnit.HOURS));
        user.setVerificationSentAt(Instant.now());
        emailService.sendVerificationEmail(user.getEmail(), user.getName(), token);
    }

    /** 256 bits of randomness, URL-safe - stronger than a UUID and safe to put in a query string. */
    private String generateSecureToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private UserSummary toSummary(UserEntity user) {
        return new UserSummary(user.getId(), user.getName(), user.getEmail(), user.getRole(), user.getAuthProvider(), user.isEmailVerified());
    }
}
