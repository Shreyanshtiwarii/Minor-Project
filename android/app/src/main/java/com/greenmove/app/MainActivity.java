package com.greenmove.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Hosts the deployed GreenMove website (see AppConfig.BASE_URL) inside a
 * fully configured WebView: JS/DOM storage, persistent cookies/session,
 * geolocation, camera & file upload (including camera capture), file
 * download (both plain URL downloads and blob-generated files), external
 * link/scheme handling, popup window support (for OAuth-style flows),
 * pull-to-refresh, offline/error state with retry, and WebView back
 * navigation.
 *
 * No frontend/backend code is touched by this app - it is a pure wrapper.
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SwipeRefreshLayout swipeRefreshLayout;
    private ProgressBar progressBar;
    private View errorLayout;
    private TextView errorTitle;
    private TextView errorMessage;
    private LinearLayout nativeGoogleSignInButton;
    private final GoogleAuthHelper googleAuthHelper = new GoogleAuthHelper();

    private ValueCallback<Uri[]> filePathCallback;
    private String cameraCaptureUri;
    private long backPressedAt = 0;

    // Registers for the system file/camera chooser launched from onShowFileChooser().
    private ActivityResultLauncher<Intent> fileChooserLauncher;

    // Registers for runtime permission requests (camera / location / storage).
    private ActivityResultLauncher<String[]> permissionLauncher;
    private PermissionRequestCallback pendingPermissionRequest;

    private interface PermissionRequestCallback {
        void onResult(boolean granted);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout);
        progressBar = findViewById(R.id.progressBar);
        errorLayout = findViewById(R.id.errorLayout);
        errorTitle = findViewById(R.id.errorTitle);
        errorMessage = findViewById(R.id.errorMessage);
        Button retryButton = findViewById(R.id.retryButton);
        nativeGoogleSignInButton = findViewById(R.id.nativeGoogleSignInButton);
        nativeGoogleSignInButton.setOnClickListener(v -> startNativeGoogleSignIn());

        registerActivityResultLaunchers();

        configureWebView();
        swipeRefreshLayout.setOnRefreshListener(() -> webView.reload());
        swipeRefreshLayout.setColorSchemeResources(android.R.color.holo_green_dark);

        retryButton.setOnClickListener(v -> loadSite());

        setupBackNavigation();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            loadSite();
        }
    }

    // ---------------------------------------------------------------------
    // WebView setup
    // ---------------------------------------------------------------------

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString() + " GreenMoveAndroidApp/1.0");

        // Persistent login / session cookies across app restarts.
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidDownloader");

        webView.setWebViewClient(new GreenMoveWebViewClient());
        webView.setWebChromeClient(new GreenMoveWebChromeClient());
        webView.setDownloadListener(this::handleDownload);
    }

    private void loadSite() {
        hideError();
        if (isNetworkAvailable()) {
            webView.loadUrl(AppConfig.BASE_URL);
        } else {
            showError(getString(R.string.error_no_internet_title),
                    getString(R.string.error_no_internet_message));
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
        return activeNetwork != null && activeNetwork.isConnectedOrConnecting();
    }

    private void showError(String title, String message) {
        progressBar.setVisibility(View.GONE);
        swipeRefreshLayout.setRefreshing(false);
        errorTitle.setText(title);
        errorMessage.setText(message);
        errorLayout.setVisibility(View.VISIBLE);
        swipeRefreshLayout.setVisibility(View.GONE);
    }

    private void hideError() {
        errorLayout.setVisibility(View.GONE);
        swipeRefreshLayout.setVisibility(View.VISIBLE);
    }

    // ---------------------------------------------------------------------
    // Navigation: keep the deployed site (and its auth-related hosts) inside
    // the WebView; hand off other schemes (tel/mailto/market/intent) to the
    // matching system app.
    // ---------------------------------------------------------------------

    private class GreenMoveWebViewClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme();

            if (scheme == null) return false;

            switch (scheme) {
                case "http":
                case "https":
                    // Let it load in this WebView - covers the main site plus any
                    // third-party auth redirect hosts (e.g. Google Sign-In).
                    return false;
                case "tel":
                case "mailto":
                case "sms":
                case "geo":
                    return openExternally(uri);
                case "intent":
                    return openIntentUri(uri);
                case "market":
                    return openExternally(uri);
                default:
                    return openExternally(uri);
            }
        }

        private boolean openIntentUri(Uri uri) {
            try {
                Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                startActivity(intent);
            } catch (Exception e) {
                // No matching app - ignore.
            }
            return true;
        }

        private boolean openExternally(Uri uri) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException e) {
                Toast.makeText(MainActivity.this, R.string.error_load_failed_message, Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            progressBar.setVisibility(View.VISIBLE);
            nativeGoogleSignInButton.setVisibility(View.GONE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            progressBar.setVisibility(View.GONE);
            swipeRefreshLayout.setRefreshing(false);
            CookieManager.getInstance().flush();
            updateNativeGoogleButtonVisibility(url);
        }

        @Override
        public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame()) {
                showError(getString(R.string.error_load_failed_title), getString(R.string.error_load_failed_message));
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceResponse errorResponse) {
            super.onReceivedHttpError(view, request, errorResponse);
            // Non-fatal for sub-resources; only the main document failing is surfaced above.
        }
    }

    // ---------------------------------------------------------------------
    // Chrome client: progress, permissions (camera/mic/location), file
    // chooser (upload, incl. camera capture), and popup windows.
    // ---------------------------------------------------------------------

    private class GreenMoveWebChromeClient extends WebChromeClient {

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            super.onProgressChanged(view, newProgress);
            progressBar.setProgress(newProgress);
            if (newProgress >= 100) {
                progressBar.setVisibility(View.GONE);
                swipeRefreshLayout.setRefreshing(false);
            }
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            requestAndroidPermissions(
                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                    granted -> callback.invoke(origin, granted, false)
            );
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            List<String> androidPermissions = new ArrayList<>();
            for (String resource : request.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                    androidPermissions.add(Manifest.permission.CAMERA);
                } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                    androidPermissions.add(Manifest.permission.RECORD_AUDIO);
                }
            }
            if (androidPermissions.isEmpty()) {
                request.deny();
                return;
            }
            requestAndroidPermissions(androidPermissions.toArray(new String[0]), granted -> {
                if (granted) {
                    request.grant(request.getResources());
                } else {
                    request.deny();
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams fileChooserParams) {
            filePathCallback = callback;

            requestAndroidPermissions(new String[]{Manifest.permission.CAMERA}, granted -> {
                Intent takePictureIntent = null;
                if (granted) {
                    try {
                        File photoFile = createImageFile();
                        Uri photoUri = FileProvider.getUriForFile(
                                MainActivity.this,
                                getPackageName() + ".fileprovider",
                                photoFile);
                        cameraCaptureUri = photoUri.toString();
                        takePictureIntent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                        takePictureIntent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, photoUri);
                        takePictureIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    } catch (Exception e) {
                        takePictureIntent = null;
                    }
                }

                Intent contentSelectionIntent = new Intent(Intent.ACTION_GET_CONTENT);
                contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);
                String[] acceptTypes = fileChooserParams.getAcceptTypes();
                boolean multiple = fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                contentSelectionIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
                if (acceptTypes != null && acceptTypes.length > 0 && !acceptTypes[0].isEmpty()) {
                    contentSelectionIntent.setType(acceptTypes[0]);
                } else {
                    contentSelectionIntent.setType("*/*");
                }

                Intent chooserIntent = Intent.createChooser(contentSelectionIntent, "Choose File");
                if (takePictureIntent != null) {
                    chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{takePictureIntent});
                }

                try {
                    fileChooserLauncher.launch(chooserIntent);
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                }
            });

            return true;
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            // Supports window.open()-based popup flows (e.g. Google Identity
            // Services / "Continue with Google") by hosting the popup in a
            // second WebView inside a dialog rather than dropping it.
            PopupWebViewDialog popup = new PopupWebViewDialog(MainActivity.this);
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popup.getWebView());
            resultMsg.sendToTarget();
            popup.show();
            return true;
        }

        @Override
        public void onCloseWindow(WebView window) {
            super.onCloseWindow(window);
        }
    }

    private File createImageFile() throws java.io.IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        File storageDir = new File(getExternalCacheDir(), "captured_images");
        if (!storageDir.exists()) {
            storageDir.mkdirs();
        }
        return File.createTempFile("IMG_" + timeStamp, ".jpg", storageDir);
    }

    // ---------------------------------------------------------------------
    // Downloads: plain file downloads (PDF/CSV/images etc. served with a
    // real URL) are handed to the system DownloadManager with the current
    // session's cookies attached so authenticated downloads keep working.
    // ---------------------------------------------------------------------

    private void handleDownload(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        requestAndroidPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, granted -> {
            if (!granted && Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
                Toast.makeText(this, R.string.permission_denied_toast, Toast.LENGTH_SHORT).show();
                return;
            }
            try {
                Uri uri = Uri.parse(url);
                DownloadManager.Request request = new DownloadManager.Request(uri);
                request.setMimeType(mimeType);

                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) {
                    request.addRequestHeader("cookie", cookies);
                }
                request.addRequestHeader("User-Agent", userAgent);

                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                request.setDescription("Downloading file...");
                request.setTitle(fileName);
                request.allowScanningByMediaScanner();
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) {
                    dm.enqueue(request);
                    Toast.makeText(this, R.string.download_started_toast, Toast.LENGTH_SHORT).show();
                }
            } catch (Exception e) {
                Toast.makeText(this, R.string.download_failed_toast, Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ---------------------------------------------------------------------
    // Native "Continue with Google" fallback (see GoogleAuthHelper).
    // Google's web GSI widget refuses to initialize inside any WebView, so
    // this small native button - shown only on the site's own /signin and
    // /signup pages - replicates the same sign-in outcome without touching
    // any frontend/backend file. It's fully inert until AppConfig's
    // GOOGLE_WEB_CLIENT_ID / BACKEND_BASE_URL placeholders are filled in.
    // ---------------------------------------------------------------------

    private void updateNativeGoogleButtonVisibility(String url) {
        boolean onAuthPage = url != null && (url.contains("/signin") || url.contains("/signup"));
        boolean show = onAuthPage && AppConfig.isGoogleSignInConfigured();
        nativeGoogleSignInButton.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    private void startNativeGoogleSignIn() {
        nativeGoogleSignInButton.setEnabled(false);
        googleAuthHelper.signIn(this, webView, new GoogleAuthHelper.Listener() {
            @Override
            public void onStarted() {
                Toast.makeText(MainActivity.this, R.string.google_signin_in_progress, Toast.LENGTH_SHORT).show();
            }

            @Override
            public void onSuccess() {
                nativeGoogleSignInButton.setEnabled(true);
            }

            @Override
            public void onFailure(String message) {
                nativeGoogleSignInButton.setEnabled(true);
                Toast.makeText(MainActivity.this,
                        message != null ? message : getString(R.string.google_signin_failed_toast),
                        Toast.LENGTH_LONG).show();
            }
        });
    }

    // ---------------------------------------------------------------------
    // Runtime permissions helper
    // ---------------------------------------------------------------------

    private void registerActivityResultLaunchers() {
        fileChooserLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (filePathCallback == null) return;

                    Uri[] results = null;
                    if (result.getResultCode() == RESULT_OK) {
                        Intent data = result.getData();
                        if (data == null || data.getDataString() == null) {
                            // Came from the camera capture intent - no `data`, use the
                            // Uri we generated and passed as EXTRA_OUTPUT.
                            if (cameraCaptureUri != null) {
                                results = new Uri[]{Uri.parse(cameraCaptureUri)};
                            }
                        } else {
                            String dataString = data.getDataString();
                            if (dataString != null) {
                                results = new Uri[]{Uri.parse(dataString)};
                            } else if (data.getClipData() != null) {
                                int count = data.getClipData().getItemCount();
                                results = new Uri[count];
                                for (int i = 0; i < count; i++) {
                                    results[i] = data.getClipData().getItemAt(i).getUri();
                                }
                            }
                        }
                    }
                    filePathCallback.onReceiveValue(results);
                    filePathCallback = null;
                    cameraCaptureUri = null;
                });

        permissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestMultiplePermissions(),
                resultMap -> {
                    boolean allGranted = true;
                    for (Boolean granted : resultMap.values()) {
                        allGranted = allGranted && Boolean.TRUE.equals(granted);
                    }
                    if (pendingPermissionRequest != null) {
                        pendingPermissionRequest.onResult(allGranted);
                        pendingPermissionRequest = null;
                    }
                });
    }

    private void requestAndroidPermissions(String[] permissions, PermissionRequestCallback callback) {
        List<String> needed = new ArrayList<>();
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                needed.add(permission);
            }
        }
        if (needed.isEmpty()) {
            callback.onResult(true);
            return;
        }
        pendingPermissionRequest = callback;
        permissionLauncher.launch(needed.toArray(new String[0]));
    }

    // ---------------------------------------------------------------------
    // Back navigation: browse back through WebView history first, then
    // require a second back press to exit (avoids accidental exits).
    // ---------------------------------------------------------------------

    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else if (System.currentTimeMillis() - backPressedAt < 2000) {
                    finish();
                } else {
                    backPressedAt = System.currentTimeMillis();
                    Toast.makeText(MainActivity.this, R.string.exit_app_toast, Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
