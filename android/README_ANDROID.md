# GreenMove Android App (WebView wrapper)

This folder is a **complete, standalone Android Studio project** that packages your
existing GreenMove website (frontend + backend, unchanged) as a native Android app
using a fully configured WebView. Nothing in `../GreenMove`'s frontend or backend
source was modified.

## 1. The one thing you must edit before building

Open:

```
android/app/src/main/java/com/greenmove/app/AppConfig.java
```

and replace the placeholder with your deployed frontend URL:

```java
public static final String BASE_URL = "https://REPLACE_WITH_YOUR_DEPLOYED_GREENMOVE_URL.example.com/";
```

for example:

```java
public static final String BASE_URL = "https://greenmove.vercel.app/";
```

That's the **only** file you need to touch. The app is wired so every other file reads
the URL from here. Your frontend should already be built/deployed with
`VITE_API_BASE_URL` pointing at your deployed Spring Boot backend (Render, etc.), per
your existing `.env.example` — the Android app doesn't need to know about the backend
URL directly, since the frontend running inside the WebView is the one that calls it.

## 2. Native "Continue with Google" (required extra step)

Google's Identity Services JavaScript widget — the one your site's
`GoogleSignInButton.jsx` renders — **deliberately refuses to run inside any
Android WebView** (this is a Google-side policy, not a bug or a WebView
setting; it shows exactly the "Google Sign-In unavailable" state you saw).
There's no WebView configuration that gets around this, and User-Agent
spoofing tricks are unreliable and can break without warning.

Instead, this project includes a **native** "Continue with Google" button
(`GoogleAuthHelper.java`) that only appears on the site's own `/signin` and
`/signup` pages. It:

1. Uses Android's official Credential Manager API to get a real Google ID
   token natively (no WebView involved, so Google's block doesn't apply).
2. Sends that token to your **existing, unmodified** backend endpoint —
   `POST {your backend}/api/v1/auth/google` with `{"idToken": "..."}`, exactly
   like `src/services/authService.js#loginWithGoogleIdToken` already does.
3. Writes the response into the WebView's `localStorage` under the exact same
   keys (`greenmove_auth_token`, `greenmove_auth_user`, `greenmove_user_id`,
   `greenmove_user_name`) your frontend already uses, then reloads the site.

No frontend or backend file is read from or changed for this to work — it
simply calls the API your backend already exposes.

**To enable it, two things:**

**A. Fill in two more placeholders** in `AppConfig.java`:

```java
public static final String GOOGLE_WEB_CLIENT_ID = "...same value as your VITE_GOOGLE_CLIENT_ID...";
public static final String BACKEND_BASE_URL = "...same value as your VITE_API_BASE_URL (Render URL, no /api/v1)...";
```

If you leave these as placeholders, the button simply never appears — the
rest of the app (email/password sign-in, everything else) works normally
either way.

**B. Register an Android OAuth client in Google Cloud Console**, under the
*same* project as your existing Web client ID. This is required by Google
for any native Android app doing Google Sign-In, regardless of framework:

1. Get your app's SHA-1 signing fingerprint. In Android Studio: **Gradle**
   panel (right sidebar) → `android` → `Tasks` → `android` → double-click
   `signingReport`, then copy the SHA1 value shown for the `debug` variant in
   the **Run** panel. (For a Play Store release build later, you'll add the
   *release* keystore's SHA-1 the same way.)
2. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
   for the same project as your existing Web client ID.
3. **Create Credentials → OAuth client ID → Application type: Android**.
4. Package name: `com.greenmove.app`. Paste the SHA-1 from step 1.
5. Save. You do **not** need to put this new Android client ID anywhere in
   the code — Credential Manager uses it automatically based on your app's
   package name + signing certificate; `GOOGLE_WEB_CLIENT_ID` in
   `AppConfig.java` stays set to your **Web** client ID (the `serverClientId`
   Google needs so the ID token's audience matches what your backend already
   verifies).

Until you complete step B, native Google Sign-In will fail with a
cancelled/unavailable error even with the placeholders filled in — this is
a one-time Google Cloud Console setup, not an Android project limitation.

## 3. Opening the project

1. Launch **Android Studio** (Giraffe/Koala or newer recommended).
2. **File → Open**, and select this `android/` folder (the one containing
   `settings.gradle`).
3. Android Studio will run Gradle sync automatically.
   - This project includes `gradlew` / `gradlew.bat` and
     `gradle/wrapper/gradle-wrapper.properties` (pinned to Gradle 8.7), but the
     small `gradle-wrapper.jar` binary itself isn't included in this ZIP. Android
     Studio will offer to regenerate it automatically on first sync ("Gradle
     wrapper is missing... would you like Android Studio to create it?" → Yes).
     If it doesn't prompt automatically, run **File → Sync Project with Gradle
     Files**, or from a terminal with Gradle installed: `gradle wrapper --gradle-version 8.7`.
4. Once sync finishes, select **Run ▶** with a connected device/emulator, or
   **Build → Build Bundle(s)/APK(s) → Build APK(s)** to produce a signed/unsigned
   APK for distribution.

## 4. What's included / how it works

- **`MainActivity.java`** — hosts a single `WebView` pointed at `AppConfig.BASE_URL`.
- **JavaScript & DOM storage** enabled, so the React app and `localStorage`-based
  session/auth state work exactly as in a normal browser.
- **Persistent cookies** via `CookieManager` (incl. third-party cookies), so signed-in
  sessions survive app restarts.
- **Geolocation** — the site's map/routing/EV-station features request the browser
  Geolocation API; the app maps this to Android's runtime location permission
  (`ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`) and forwards the result.
- **File uploads** (`<input type="file">`) — fully implemented via
  `onShowFileChooser`, including an option to take a new photo (camera) via a
  `FileProvider`, or pick an existing file/image, with single or multiple selection.
- **Downloads** — two paths are covered:
  - Regular `<a href="...">` / navigations to a downloadable file are handed to the
    system `DownloadManager` (with the current session cookies attached, so
    authenticated downloads work), saved to the public Downloads folder.
  - Files generated client-side via JavaScript (`Blob` + `URL.createObjectURL`, e.g.
    an exported report/CSV) can optionally use the exposed
    `window.AndroidDownloader.saveBase64File(base64, fileName, mimeType)` bridge —
    see the comment in `WebAppInterface.java` for the exact JS snippet. This is
    inert (does nothing) unless your frontend calls it, so it doesn't change any
    existing behavior.
- **"Continue with Google"** — Google actively blocks its own web GSI widget
  inside WebViews (see section 2 above for why), so this project uses a
  native Credential Manager-based fallback button on `/signin`/`/signup`
  instead, calling your existing `/auth/google` backend endpoint directly.
- **External link handling** — `tel:`, `mailto:`, `sms:`, `geo:`, `market:`, and
  `intent:` links are handed off to the appropriate system app; all `http(s)` links,
  including any third-party auth redirect hosts, load inside the WebView so
  navigation/back stack behaves like a real browser.
- **Back button** — navigates the WebView's own history first; a second back press
  (or back press with no history) exits the app, with a "press back again to exit"
  hint.
- **Offline / load-failure handling** — a real error screen with a **Retry** button
  is shown if there's no connectivity or the main page fails to load (not a generic
  WebView error page).
- **Pull-to-refresh** via `SwipeRefreshLayout`.
- **App icon & splash color** use GreenMove's own primary green (`#004100`) /
  accent (`#87DA74`) from your existing Tailwind theme.

## 5. Permissions declared

| Permission | Why |
|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Load the site; detect connectivity for the offline screen |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Maps, route planning, nearby EV stations |
| `CAMERA` | "Take Photo" option in file-upload inputs |
| `RECORD_AUDIO` | Only used if a page ever calls `getUserMedia()` for audio; unused today, harmless to have |
| `WRITE_EXTERNAL_STORAGE` (API ≤28) / `READ_EXTERNAL_STORAGE` (API ≤32) | Saving downloads on older Android versions (API 29+ uses scoped storage automatically, no permission needed) |
| `POST_NOTIFICATIONS` | Android 13+ requires this for the DownloadManager's "download complete" notification |

All of the above (except `INTERNET`/`ACCESS_NETWORK_STATE`) are requested **at
runtime**, only when the website actually triggers the relevant feature (e.g.
location is only asked for once the site calls the geolocation API) — nothing is
requested up front on first launch.

## 6. Network security / HTTPS

`network_security_config.xml` permits cleartext (`http://`) traffic so you can also
point `AppConfig.BASE_URL` at a local dev server (e.g. `http://10.0.2.2:8080` from
an emulator) while testing before you deploy. Once you set `BASE_URL` to your real
`https://` deployment, all traffic to it is encrypted as normal. If you want to
enforce HTTPS-only once deployed, set `cleartextTrafficPermitted="false"` in that file.

## 7. App identity

- Package name / applicationId: `com.greenmove.app`
- App name shown on the device: **GreenMove**
- `minSdk 24` (Android 7.0+), `targetSdk 34`

You can change the package name, app name, and icon like any normal Android project
(`AndroidManifest.xml`, `res/values/strings.xml`, `res/mipmap-*`) — none of that
affects the website itself.
