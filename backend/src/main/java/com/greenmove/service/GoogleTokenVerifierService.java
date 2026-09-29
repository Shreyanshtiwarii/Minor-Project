package com.greenmove.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * Verifies "Sign in with Google" ID tokens issued by Google Identity Services on the frontend.
 *
 * Configuration (env vars):
 *   GOOGLE_CLIENT_ID - OAuth 2.0 Web Client ID from https://console.cloud.google.com/apis/credentials
 *                       Must match the audience ("aud") claim of the ID token. Required for Google
 *                       Sign-In to work; if unset, Google authentication is disabled server-side.
 *
 * This uses Google's lightweight tokeninfo endpoint (no extra client SDK needed), consistent with
 * this project's existing pattern of calling third-party REST APIs directly via RestTemplate
 * (see GoogleRoutesService, OpenChargeMapProvider).
 */
@Service
public class GoogleTokenVerifierService {

    private static final Logger logger = LoggerFactory.getLogger(GoogleTokenVerifierService.class);
    private static final String TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo?id_token=";

    @Value("${greenmove.google.client-id:}")
    private String googleClientId;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public GoogleTokenVerifierService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(4000);
        factory.setReadTimeout(4000);
        this.restTemplate = new RestTemplate(factory);
    }

    public boolean isConfigured() {
        return googleClientId != null && !googleClientId.trim().isEmpty();
    }

    public static class GoogleProfile {
        public final String googleId;
        public final String email;
        public final String name;
        public final boolean emailVerified;

        public GoogleProfile(String googleId, String email, String name, boolean emailVerified) {
            this.googleId = googleId;
            this.email = email;
            this.name = name;
            this.emailVerified = emailVerified;
        }
    }

    /**
     * Verifies the given ID token's signature/expiry (via Google) and audience, returning the
     * verified profile. Returns null if the token is invalid, expired, or minted for a different
     * OAuth client.
     */
    public GoogleProfile verify(String idToken) {
        if (!isConfigured()) {
            logger.warn("Google Sign-In attempted but GOOGLE_CLIENT_ID is not configured on the backend.");
            return null;
        }
        if (idToken == null || idToken.trim().isEmpty()) {
            return null;
        }
        try {
            String response = restTemplate.getForObject(TOKENINFO_URL + idToken, String.class);
            JsonNode node = objectMapper.readTree(response);

            String aud = node.path("aud").asText(null);
            if (aud == null || !aud.equals(googleClientId.trim())) {
                logger.warn("Google ID token audience mismatch - rejecting.");
                return null;
            }

            String sub = node.path("sub").asText(null);
            String email = node.path("email").asText(null);
            String name = node.path("name").asText(email);
            boolean emailVerified = "true".equalsIgnoreCase(node.path("email_verified").asText("false"));

            if (sub == null || email == null) {
                return null;
            }
            return new GoogleProfile(sub, email, name, emailVerified);
        } catch (Exception e) {
            logger.warn("Failed to verify Google ID token: {}", e.getMessage());
            return null;
        }
    }
}
