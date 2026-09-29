package com.greenmove.app;

import android.content.Context;
import android.os.CancellationSignal;
import android.util.Log;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.core.content.ContextCompat;

import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native fallback for "Continue with Google".
 *
 * Google's Identity Services JavaScript widget (used by
 * src/components/GoogleSignInButton.jsx) deliberately refuses to initialize
 * inside any WebView - this is a Google-side policy, not something a WebView
 * can be configured around. This helper reproduces the exact same outcome
 * natively instead:
 *
 *   1. Use Android's Credential Manager to get a real Google ID token
 *      (audience = the same GOOGLE_WEB_CLIENT_ID your backend already
 *      verifies, from your existing .env GOOGLE_CLIENT_ID).
 *   2. POST that ID token to the SAME backend endpoint the frontend already
 *      calls: {API_BASE_URL}/auth/google, with the exact same request body
 *      shape used by src/services/authService.js#loginWithGoogleIdToken.
 *   3. Write the response into localStorage under the SAME keys
 *      src/services/authService.js#persistSession already uses
 *      ("greenmove_auth_token", "greenmove_auth_user") plus the
 *      "greenmove_user_id"/"greenmove_user_name" keys historyService.js
 *      reads, so the running React app sees an identical signed-in state.
 *   4. Reload the site so the app picks up the new session.
 *
 * No file in the existing frontend or backend is read from or modified by
 * this class beyond calling the backend's already-existing public API.
 */
public class GoogleAuthHelper {

    private static final String TAG = "GoogleAuthHelper";
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

    public interface Listener {
        void onStarted();
        void onSuccess();
        void onFailure(String message);
    }

    public void signIn(Context context, WebView webView, Listener listener) {
        if (!AppConfig.isGoogleSignInConfigured()) {
            listener.onFailure("Google Sign-In isn't configured yet in AppConfig.java.");
            return;
        }

        listener.onStarted();

        CredentialManager credentialManager = CredentialManager.create(context);

        GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(AppConfig.GOOGLE_WEB_CLIENT_ID)
                .setAutoSelectEnabled(false)
                .build();

        GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build();

        credentialManager.getCredentialAsync(
                context,
                request,
                new CancellationSignal(),
                ContextCompat.getMainExecutor(context),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        handleCredentialResponse(response, webView, listener);
                    }

                    @Override
                    public void onError(GetCredentialException e) {
                        Log.w(TAG, "Credential Manager sign-in failed/cancelled", e);
                        listener.onFailure("Google sign-in was cancelled or unavailable.");
                    }
                });
    }

    private void handleCredentialResponse(GetCredentialResponse response, WebView webView, Listener listener) {
        Credential credential = response.getCredential();

        if (!(credential instanceof CustomCredential) ||
                !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
            listener.onFailure("Unexpected credential type returned.");
            return;
        }

        String idToken;
        try {
            GoogleIdTokenCredential googleIdTokenCredential =
                    GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
            idToken = googleIdTokenCredential.getIdToken();
        } catch (Exception e) {
            listener.onFailure("Couldn't read the Google credential.");
            return;
        }

        exchangeTokenWithBackend(idToken, webView, listener);
    }

    /** Calls the site's existing POST {API_BASE}/auth/google endpoint, exactly as authService.js does. */
    private void exchangeTokenWithBackend(String idToken, WebView webView, Listener listener) {
        networkExecutor.execute(() -> {
            try {
                URL url = new URL(AppConfig.apiBaseUrl() + "/auth/google");
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);

                JSONObject body = new JSONObject();
                body.put("idToken", idToken);

                try (OutputStream os = connection.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }

                int status = connection.getResponseCode();
                java.io.InputStream stream = status >= 200 && status < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

                String responseText = readStream(stream);

                if (status < 200 || status >= 300) {
                    String message = "Google sign-in failed. Please try again.";
                    try {
                        JSONObject errorBody = new JSONObject(responseText);
                        if (errorBody.has("message")) {
                            message = errorBody.getString("message");
                        }
                    } catch (Exception ignored) {
                        // fall back to default message
                    }
                    String finalMessage = message;
                    webView.post(() -> listener.onFailure(finalMessage));
                    return;
                }

                JSONObject data = new JSONObject(responseText);
                String token = data.getString("token");
                JSONObject user = data.getJSONObject("user");
                String userId = user.optString("id", null);
                String userName = user.optString("name", null);

                webView.post(() -> injectSessionAndReload(webView, token, user, userId, userName, listener));

            } catch (Exception e) {
                Log.w(TAG, "Backend Google auth exchange failed", e);
                webView.post(() -> listener.onFailure("Couldn't reach the server. Please check your connection."));
            }
        });
    }

    /**
     * Writes the exact same localStorage keys
     * src/services/authService.js#persistSession and
     * src/services/historyService.js#setCurrentUser already write on a
     * normal web sign-in, then reloads so the React app picks up the session.
     */
    private void injectSessionAndReload(WebView webView, String token, JSONObject user,
                                         String userId, String userName, Listener listener) {
        String js =
                "localStorage.setItem('greenmove_auth_token', " + JSONObject.quote(token) + ");" +
                "localStorage.setItem('greenmove_auth_user', " + JSONObject.quote(user.toString()) + ");" +
                (userId != null && userName != null
                        ? "localStorage.setItem('greenmove_user_id', " + JSONObject.quote(userId) + ");" +
                          "localStorage.setItem('greenmove_user_name', " + JSONObject.quote(userName) + ");"
                        : "");

        webView.evaluateJavascript(js, unused -> {
            listener.onSuccess();
            webView.loadUrl(AppConfig.BASE_URL);
        });
    }

    private static String readStream(java.io.InputStream stream) throws Exception {
        if (stream == null) return "";
        java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[1024];
        int len;
        while ((len = stream.read(chunk)) != -1) {
            buffer.write(chunk, 0, len);
        }
        return buffer.toString("UTF-8");
    }
}
