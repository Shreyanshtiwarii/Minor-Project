# Add project specific ProGuard rules here.

# Keep the WebView JavaScript bridge interface and its methods, otherwise
# calls from JavaScript (e.g. AndroidDownloader.saveBase64File) will silently
# fail to resolve once code is obfuscated/minified in a release build.
-keepclassmembers class com.greenmove.app.WebAppInterface {
    public *;
}
-keepattributes JavascriptInterface
