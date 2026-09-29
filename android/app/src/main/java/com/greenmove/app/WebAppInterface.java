package com.greenmove.app;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.OutputStream;

/**
 * JavaScript bridge exposed to the web app as "AndroidDownloader".
 *
 * Handles the case where the site generates a file client-side (e.g. via
 * `new Blob([...])` + `URL.createObjectURL`) rather than linking to a plain
 * downloadable URL. WebView's normal DownloadListener (see MainActivity)
 * cannot fetch blob: URLs directly since they only exist inside the page's
 * JS context, so the page's own JS should read the blob and hand the bytes
 * to this bridge instead.
 *
 * Usage from the website's JavaScript (optional - only used if/when such an
 * export feature exists; harmless if never called):
 *
 *   if (window.AndroidDownloader) {
 *     const reader = new FileReader();
 *     reader.onloadend = () => {
 *       const base64 = reader.result.split(',')[1];
 *       window.AndroidDownloader.saveBase64File(base64, "report.pdf", "application/pdf");
 *     };
 *     reader.readAsDataURL(blob);
 *   }
 */
public class WebAppInterface {

    private final Context context;

    public WebAppInterface(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public void saveBase64File(String base64Data, String fileName, String mimeType) {
        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE,
                        mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                Uri uri = context.getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (OutputStream out = context.getContentResolver().openOutputStream(uri)) {
                        if (out != null) {
                            out.write(bytes);
                        }
                    }
                    notifySuccess(fileName);
                } else {
                    notifyFailure();
                }
            } else {
                java.io.File downloadsDir =
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloadsDir.exists()) {
                    downloadsDir.mkdirs();
                }
                java.io.File outFile = new java.io.File(downloadsDir, fileName);
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(outFile)) {
                    fos.write(bytes);
                }
                notifySuccess(fileName);
            }
        } catch (Exception e) {
            notifyFailure();
        }
    }

    private void notifySuccess(String fileName) {
        android.os.Handler mainHandler = new android.os.Handler(context.getMainLooper());
        mainHandler.post(() -> Toast.makeText(context,
                context.getString(R.string.download_started_toast) + ": " + fileName,
                Toast.LENGTH_SHORT).show());
    }

    private void notifyFailure() {
        android.os.Handler mainHandler = new android.os.Handler(context.getMainLooper());
        mainHandler.post(() -> Toast.makeText(context,
                context.getString(R.string.download_failed_toast),
                Toast.LENGTH_SHORT).show());
    }
}
