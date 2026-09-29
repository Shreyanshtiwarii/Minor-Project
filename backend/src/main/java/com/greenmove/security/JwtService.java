package com.greenmove.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * Issues and validates JWT access tokens for the GreenMove user authentication flow.
 *
 * Configuration:
 *   greenmove.jwt.secret      - HMAC signing secret (env: JWT_SECRET). Must be at least 32 chars in production.
 *   greenmove.jwt.expiration-ms - token lifetime in milliseconds (env: JWT_EXPIRATION_MS), default 7 days.
 */
@Component
public class JwtService {

    @Value("${greenmove.jwt.secret:dev-only-insecure-secret-change-me-please-32chars}")
    private String secret;

    @Value("${greenmove.jwt.expiration-ms:604800000}")
    private long expirationMs;

    private SecretKey signingKey() {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        // jjwt requires >= 256-bit keys for HS256; pad defensively if a short secret was configured.
        if (keyBytes.length < 32) {
            byte[] padded = new byte[32];
            System.arraycopy(keyBytes, 0, padded, 0, Math.min(keyBytes.length, 32));
            keyBytes = padded;
        }
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateToken(String subjectUserId, String email, String role) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);
        return Jwts.builder()
                .subject(subjectUserId)
                .claim("email", email)
                .claim("role", role)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(signingKey())
                .compact();
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean isValid(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
