package com.greenmove.app;

import android.app.Dialog;
import android.content.Context;
import android.os.Bundle;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * A lightweight dialog that hosts a second WebView, used to satisfy
 * window.open() calls triggered by the page (for example, an OAuth /
 * "Continue with Google" popup flow). Without this, WebChromeClient's
 * default behaviour silently drops window.open() and such flows appear to
 * do nothing when tapped.
 */
public class PopupWebViewDialog extends Dialog {

    private final WebView popupWebView;

    public PopupWebViewDialog(Context context) {
        super(context, android.R.style.Theme_Material_Light_NoActionBar);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.dialog_popup_webview);
        setCancelable(true);

        popupWebView = findViewById(R.id.popupWebView);
        WebSettings settings = popupWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setUserAgentString(
                "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(popupWebView, true);

        popupWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Once the OAuth/auth popup redirects back to our own app's origin,
                // its job is done - close the popup so the user lands back on the
                // main WebView, which will have picked up the resulting session.
                if (url != null && url.startsWith(AppConfig.BASE_URL)) {
                    dismiss();
                }
            }
        });
        popupWebView.setWebChromeClient(new WebChromeClient());

        findViewById(R.id.popupCloseButton).setOnClickListener(v -> dismiss());
    }

    public WebView getWebView() {
        return popupWebView;
    }

    @Override
    protected void onStop() {
        if (popupWebView != null) {
            popupWebView.stopLoading();
            popupWebView.destroy();
        }
        super.onStop();
    }
}
