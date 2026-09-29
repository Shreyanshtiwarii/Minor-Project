package com.greenmove.app;

import android.app.Application;
import android.webkit.WebView;

public class GreenMoveApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        // Enables inspecting the WebView from chrome://inspect on debug builds,
        // which is invaluable for diagnosing issues with the real deployed site.
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
    }
}
