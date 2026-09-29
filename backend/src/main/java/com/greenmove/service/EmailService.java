package com.greenmove.service;

/**
 * Abstraction over outbound transactional email so callers (AuthController signup verification,
 * UserProfileService) don't need to know which provider is wired up.
 *
 * Phase 2: {@link BrevoEmailService} is the production implementation, backed by the Brevo
 * transactional email API. It is @Primary so it's injected everywhere this interface is used.
 * If BREVO_API_KEY/BREVO_SENDER_EMAIL aren't configured (e.g. local dev), it falls back to
 * logging what would have been sent instead of failing, mirroring {@link ConsoleEmailService}
 * (kept around as a lightweight reference/local-dev implementation).
 */
public interface EmailService {

    /**
     * Verification link sent to a brand-new signup so they can confirm their email address
     * before they're allowed to log in.
     */
    void sendVerificationEmail(String toEmail, String userName, String verificationToken);

    /**
     * Security notification sent to the account's current email after a password change.
     */
    void sendPasswordChangedNotification(String toEmail, String userName);

    /**
     * Verification link sent to a *new* email address requested via "Change Email".
     * The account's email is only swapped once this link is confirmed.
     */
    void sendEmailChangeVerification(String toEmail, String userName, String verificationToken);

    /**
     * Security notification sent to the account's *old* email address after an email change
     * has been confirmed and applied, so the previous owner is alerted even if they didn't
     * initiate it.
     */
    void sendEmailChangedNotification(String oldEmail, String userName, String newEmail);
}
