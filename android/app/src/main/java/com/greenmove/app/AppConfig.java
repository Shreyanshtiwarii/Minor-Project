package com.greenmove.app;

/**
 * Centralized app configuration.
 *
 * ============================================================================
 *  ACTION REQUIRED AFTER YOU DEPLOY GREENMOVE
 * ============================================================================
 *  This is the ONLY place in the whole Android project you need to edit.
 *
 *  Replace BASE_URL below with your deployed GreenMove frontend URL
 *  (the same URL your frontend is reachable at, e.g. your Vercel deployment
 *  URL such as "https://your-app.vercel.app/"). That frontend is expected to
 *  already be configured (via VITE_API_BASE_URL, per your existing
 *  .env.example) to talk to your deployed backend - nothing else changes.
 *
 *  Do NOT edit MainActivity.java or any other file to point the app at your
 *  site; everything reads BASE_URL from here.
 * ============================================================================
 */
public final class AppConfig {

    /**
     * TODO: REPLACE_WITH_YOUR_DEPLOYED_GREENMOVE_URL
     * Must be a full URL including scheme and a trailing slash, e.g.:
     *   "https://greenmove.vercel.app/"
     */
    public static final String BASE_URL = "https://green-move-five.vercel.app/";

    /**
     * Google OAuth 2.0 **Web** Client ID - the SAME value as your project's
     * VITE_GOOGLE_CLIENT_ID / GOOGLE_CLIENT_ID (see your .env.example).
     * Required for the native "Continue with Google" fallback described below.
     * Leave as the placeholder to keep that fallback disabled.
     */
    public static final String GOOGLE_WEB_CLIENT_ID = "508063674692-h5duqn8c80jn3gn44khlfdmlp7eqamnq.apps.googleusercontent.com";

    /**
     * Your deployed backend's base URL - the SAME value you set for
     * VITE_API_BASE_URL when you deployed the frontend (e.g. your Render URL,
     * no trailing "/api/v1" - that's appended automatically, matching
     * src/config.js exactly). Required for the native Google Sign-In fallback
     * below to call the same /auth/google endpoint your frontend already uses.
     */
    public static final String BACKEND_BASE_URL = "https://greenmove-backend-t28r.onrender.com";

    /**
     * Computes the same "{base}/api/v1" API root your frontend's
     * src/config.js computes from VITE_API_BASE_URL, so native calls hit
     * exactly the endpoints your backend already exposes.
     */
    public static String apiBaseUrl() {
        String base = BACKEND_BASE_URL.endsWith("/")
                ? BACKEND_BASE_URL.substring(0, BACKEND_BASE_URL.length() - 1)
                : BACKEND_BASE_URL;
        return base + "/api/v1";
    }

    /** True once GOOGLE_WEB_CLIENT_ID has actually been filled in. */
    public static boolean isGoogleSignInConfigured() {
        return GOOGLE_WEB_CLIENT_ID != null && !GOOGLE_WEB_CLIENT_ID.startsWith("REPLACE_WITH")
                && BACKEND_BASE_URL != null && !BACKEND_BASE_URL.startsWith("REPLACE_WITH");
    }

    /**
     * Hosts that are allowed to load *inside* the app's WebView (kept in the
     * in-app browsing experience) rather than being handed off to an external
     * browser or app. The deployed site's own host is added automatically at
     * runtime from BASE_URL. Add any additional first-party subdomains here
     * (e.g. an API/auth subdomain) if you split them from the main frontend host.
     *
     * Third-party auth hosts used by "Continue with Google" are included so the
     * Google Identity Services flow completes without leaving the app.
     */
    public static final String[] ADDITIONAL_IN_APP_HOSTS = new String[] {
            "accounts.google.com",
            "accounts.youtube.com",
            "content.googleapis.com",
            "apis.google.com"
    };

    private AppConfig() {
    }
}
