package com.greenmove.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * Production {@link EmailService} implementation backed by Brevo's transactional email API
 * (https://api.brevo.com/v3/smtp/email). Consistent with this project's existing pattern of
 * calling third-party REST APIs directly via RestTemplate (see GoogleRoutesService,
 * GoogleTokenVerifierService, OpenChargeMapProvider) rather than pulling in a dedicated SDK.
 *
 * @Primary so this is the EmailService injected everywhere (AuthController, UserProfileService)
 * once BREVO_API_KEY is set. If it isn't configured - e.g. local dev with no credentials -
 * every method logs what would have been sent instead of failing, so the rest of the app keeps
 * working end-to-end without a live Brevo account.
 *
 * Configuration (env vars - see .env.example):
 *   BREVO_API_KEY      - Brevo API key (Brevo dashboard -> SMTP & API -> API Keys). Backend-only, never exposed to the frontend.
 *   BREVO_SENDER_EMAIL - "From" address. Must be a verified sender/domain in Brevo.
 *   BREVO_SENDER_NAME  - "From" display name (defaults to "GreenMove" if unset).
 *   GREENMOVE_FRONTEND_URL - already-existing var used to build the links inside these emails.
 */
@Service
@Primary
public class BrevoEmailService implements EmailService {

    private static final Logger logger = LoggerFactory.getLogger(BrevoEmailService.class);
    private static final String BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

    @Value("${greenmove.brevo.api-key:}")
    private String apiKey;

    @Value("${greenmove.brevo.sender-email:}")
    private String senderEmail;

    @Value("${greenmove.brevo.sender-name:GreenMove}")
    private String senderName;

    @Value("${greenmove.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    private final RestTemplate restTemplate;

    public BrevoEmailService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(5000);
        this.restTemplate = new RestTemplate(factory);
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.trim().isEmpty()
                && senderEmail != null && !senderEmail.trim().isEmpty();
    }

    @Override
    public void sendVerificationEmail(String toEmail, String userName, String verificationToken) {
        String link = frontendUrl + "/verify-email?token=" + verificationToken;
        String html = "<p>Hi " + escape(userName) + ",</p>"
                + "<p>Welcome to GreenMove! Please confirm your email address to activate your account:</p>"
                + "<p><a href=\"" + link + "\">Verify my email</a></p>"
                + "<p>This link expires in 24 hours. If you didn't create a GreenMove account, you can ignore this email.</p>";
        send(toEmail, userName, "Verify your GreenMove account", html, "signup verification");
    }

    @Override
    public void sendPasswordChangedNotification(String toEmail, String userName) {
        String html = "<p>Hi " + escape(userName) + ",</p>"
                + "<p>Your GreenMove account password was just changed.</p>"
                + "<p>If this wasn't you, please contact support immediately.</p>";
        send(toEmail, userName, "Your GreenMove password was changed", html, "password-changed notification");
    }

    @Override
    public void sendEmailChangeVerification(String toEmail, String userName, String verificationToken) {
        String link = frontendUrl + "/confirm-email-change?token=" + verificationToken;
        String html = "<p>Hi " + escape(userName) + ",</p>"
                + "<p>We received a request to change the email address on your GreenMove account to this address. "
                + "Confirm the change:</p>"
                + "<p><a href=\"" + link + "\">Confirm my new email</a></p>"
                + "<p>This link expires in 24 hours. If you didn't request this, you can safely ignore this email.</p>";
        send(toEmail, userName, "Confirm your new GreenMove email address", html, "email-change verification");
    }

    @Override
    public void sendEmailChangedNotification(String oldEmail, String userName, String newEmail) {
        String html = "<p>Hi " + escape(userName) + ",</p>"
                + "<p>The email address on your GreenMove account was just changed to <strong>" + escape(newEmail) + "</strong>.</p>"
                + "<p>If you didn't request this change, please contact support immediately.</p>";
        send(oldEmail, userName, "Your GreenMove account email was changed", html, "email-changed notification");
    }

    private void send(String toEmail, String userName, String subject, String htmlContent, String kind) {
        if (!isConfigured()) {
            logger.info("[EMAIL:{}] Brevo not configured (BREVO_API_KEY/BREVO_SENDER_EMAIL unset) - " +
                    "would have sent \"{}\" to {} <{}>.", kind, subject, userName, toEmail);
            return;
        }
        try {
            Map<String, Object> body = Map.of(
                    "sender", Map.of("name", senderName, "email", senderEmail),
                    "to", List.of(Map.of("email", toEmail, "name", userName != null ? userName : toEmail)),
                    "subject", subject,
                    "htmlContent", htmlContent
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("api-key", apiKey.trim());
            headers.set("Accept", "application/json");

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.exchange(BREVO_SEND_URL, HttpMethod.POST, entity, String.class);

            HttpStatusCode status = response.getStatusCode();
            if (!status.is2xxSuccessful()) {
                logger.error("Brevo API returned non-2xx status {} sending \"{}\" to <{}>", status, kind, toEmail);
            } else {
                logger.info("Sent \"{}\" email to <{}> via Brevo.", kind, toEmail);
            }
        } catch (Exception e) {
            // Never let an email-provider failure break the underlying request (signup, password
            // change, etc.) - log it and move on. The user can always use "resend verification".
            logger.error("Failed to send \"{}\" email to <{}> via Brevo: {}", kind, toEmail, e.getMessage());
        }
    }

    private String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
