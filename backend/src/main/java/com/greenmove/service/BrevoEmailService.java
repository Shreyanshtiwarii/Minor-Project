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
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;

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
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(15000);
        this.restTemplate = new RestTemplate(factory);
    }

    /** Makes a missing/misnamed env var obvious in the Render logs right at boot. */
    @PostConstruct
    void logConfiguration() {
        if (isConfigured()) {
            logger.info("Brevo email is configured (sender: {}).", senderEmail);
        } else {
            logger.error("Brevo email is NOT configured: BREVO_API_KEY set={}, BREVO_SENDER_EMAIL set={}. "
                            + "No emails (OTP, notifications) will be delivered until both are set.",
                    apiKey != null && !apiKey.trim().isEmpty(),
                    senderEmail != null && !senderEmail.trim().isEmpty());
        }
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
    public boolean sendVerificationOtp(String toEmail, String userName, String otp) {
        String html = "<p>Hi " + escape(userName) + ",</p>"
                + "<p>Your GreenMove verification code is:</p>"
                + "<p style=\"font-size:28px;font-weight:bold;letter-spacing:6px;\">" + escape(otp) + "</p>"
                + "<p>It expires in 10 minutes. If you didn't create a GreenMove account, you can ignore this email.</p>";
        return send(toEmail, userName, "Your GreenMove verification code", html, "signup OTP");
    }

    @Override
    public boolean sendPasswordResetOtp(String toEmail, String userName, String otp) {
        String html = "<p>Hi " + escape(userName) + ",</p>"
                + "<p>Use this code to reset your GreenMove password:</p>"
                + "<p style=\"font-size:28px;font-weight:bold;letter-spacing:6px;\">" + escape(otp) + "</p>"
                + "<p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>";
        return send(toEmail, userName, "Your GreenMove password reset code", html, "password-reset OTP");
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

    /** @return true only when Brevo accepted the message (2xx). Failures are logged with Brevo's own error body. */
    private boolean send(String toEmail, String userName, String subject, String htmlContent, String kind) {
        if (!isConfigured()) {
            logger.error("[EMAIL:{}] Brevo not configured (BREVO_API_KEY/BREVO_SENDER_EMAIL unset) - "
                    + "could not send \"{}\" to <{}>.", kind, subject, toEmail);
            return false;
        }
        try {
            Map<String, Object> body = Map.of(
                    "sender", Map.of("name", senderName, "email", senderEmail.trim()),
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
                logger.error("Brevo API returned non-2xx status {} sending \"{}\" to <{}>: {}", status, kind, toEmail, response.getBody());
                return false;
            }
            logger.info("Sent \"{}\" email to <{}> via Brevo: {}", kind, toEmail, response.getBody());
            return true;
        } catch (HttpStatusCodeException e) {
            // Brevo answered with an error (401 bad key / unrecognised IP, 400 sender not valid, ...):
            // its JSON body says exactly why.
            logger.error("Brevo rejected \"{}\" email to <{}>: HTTP {} - {}", kind, toEmail,
                    e.getStatusCode().value(), e.getResponseBodyAsString());
            return false;
        } catch (Exception e) {
            logger.error("Failed to send \"{}\" email to <{}> via Brevo: {}", kind, toEmail, e.toString());
            return false;
        }
    }

    private String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
