package com.greenmove.controller;

import com.greenmove.dto.ProfileDTOs.ChangeEmailRequest;
import com.greenmove.dto.ProfileDTOs.ChangePasswordRequest;
import com.greenmove.dto.ProfileDTOs.ConfirmEmailChangeRequest;
import com.greenmove.dto.ProfileDTOs.UpdateNameRequest;
import com.greenmove.service.UserProfileService;
import com.greenmove.service.UserProfileService.ProfileException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST endpoints for the "Profile Settings" page: change name, change password, and request an
 * email change. Endpoints are self-protecting (like VehiclePoolController) rather than declared
 * in SecurityConfig, so callers get a friendly JSON 401 instead of Spring Security's default
 * empty-body 403.
 */
@RestController
@RequestMapping("/api/v1/users/me")
public class UserProfileController {

    private final UserProfileService userProfileService;

    public UserProfileController(UserProfileService userProfileService) {
        this.userProfileService = userProfileService;
    }

    @PutMapping("/name")
    public ResponseEntity<?> updateName(Authentication authentication, @Valid @RequestBody UpdateNameRequest request) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            return ResponseEntity.ok(userProfileService.updateName(authentication.getName(), request.getName()));
        } catch (ProfileException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    @PutMapping("/password")
    public ResponseEntity<?> changePassword(Authentication authentication, @Valid @RequestBody ChangePasswordRequest request) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            userProfileService.changePassword(
                    authentication.getName(), request.getCurrentPassword(), request.getNewPassword(), request.getConfirmPassword());
            return ResponseEntity.ok(Map.of("message", "Password updated successfully"));
        } catch (ProfileException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/email/change-request")
    public ResponseEntity<?> requestEmailChange(Authentication authentication, @Valid @RequestBody ChangeEmailRequest request) {
        if (authentication == null || authentication.getName() == null) {
            return unauthenticated();
        }
        try {
            userProfileService.requestEmailChange(authentication.getName(), request.getCurrentPassword(), request.getNewEmail());
            return ResponseEntity.ok(Map.of(
                    "message", "We sent a verification link to your new email address. Your email will update once you confirm it."));
        } catch (ProfileException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    /**
     * Confirms an in-flight "Change Email" request and swaps the address over. Intentionally
     * NOT gated on Authentication - the emailed token is the credential (the link may be opened
     * in a browser where the original session has since expired), same pattern as
     * POST /api/v1/auth/verify-email.
     */
    @PostMapping("/email/confirm")
    public ResponseEntity<?> confirmEmailChange(@Valid @RequestBody ConfirmEmailChangeRequest request) {
        try {
            userProfileService.confirmEmailChange(request.getToken());
            return ResponseEntity.ok(Map.of("message", "Your email address has been updated. You can now sign in with your new email."));
        } catch (ProfileException ex) {
            return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
        }
    }

    private ResponseEntity<?> unauthenticated() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Please sign in to continue"));
    }
}
