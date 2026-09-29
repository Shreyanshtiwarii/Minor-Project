package com.greenmove.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Reference/local-dev {@link EmailService} that just logs what would have been sent. Superseded
 * by {@link BrevoEmailService} (@Primary) for real delivery as of Phase 2; kept here as a
 * documented fallback implementation and for use in tests/environments with no Brevo credentials.
 * Not wired in directly anywhere - BrevoEmailService internally falls back to this same
 * log-only behavior when it isn't configured, so no profile/bean wiring is needed to use it.
 */
@Service
public class ConsoleEmailService implements EmailService {

    private static final Logger logger = LoggerFactory.getLogger(ConsoleEmailService.class);

    @Value("${greenmove.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Override
    public void sendVerificationEmail(String toEmail, String userName, String verificationToken) {
        String link = frontendUrl + "/verify-email?token=" + verificationToken;
        logger.info("[EMAIL:VERIFY-SIGNUP] Verification link for {} <{}>: {} " +
                "(No email provider configured - wire BREVO_API_KEY to send for real.)", userName, toEmail, link);
    }

    @Override
    public void sendPasswordChangedNotification(String toEmail, String userName) {
        logger.info("[EMAIL:SECURITY] Password changed for {} <{}>. " +
                "(No email provider configured - wire BREVO_API_KEY to send for real.)", userName, toEmail);
    }

    @Override
    public void sendEmailChangeVerification(String toEmail, String userName, String verificationToken) {
        String verificationLink = frontendUrl + "/confirm-email-change?token=" + verificationToken;
        logger.info("[EMAIL:VERIFY-EMAIL-CHANGE] Email change requested by {} - verification link for <{}>: {} " +
                "(No email provider configured - wire BREVO_API_KEY to send for real.)",
                userName, toEmail, verificationLink);
    }

    @Override
    public void sendEmailChangedNotification(String oldEmail, String userName, String newEmail) {
        logger.info("[EMAIL:SECURITY] Email changed for {} - old address <{}> notified, new address is <{}>. " +
                "(No email provider configured - wire BREVO_API_KEY to send for real.)", userName, oldEmail, newEmail);
    }
}
