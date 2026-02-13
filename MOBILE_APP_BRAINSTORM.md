# Mobile App Brainstorm: TickTick Link Saver

## Problem

The Chrome extension only works in desktop Chromium browsers. On mobile, there's no way to quickly share a URL to TickTick as a task with title + link.

## Core Concept

A lightweight Android app that registers as a **share target**. When you hit "Share" on any link/page in your phone's browser (or any app), this app appears in the share sheet. It receives the URL, fetches the page title, lets you pick a project, and posts it to TickTick — same flow as the extension.

---

## Approach Options

### Option A: PWA (Progressive Web App) wrapped in a TWA/APK

**How it works:**
- Build a small web app (HTML/CSS/JS — reuse popup logic almost directly)
- Use [Bubblewrap](https://github.com/nicedoc/nicedoc.io) or [PWABuilder](https://www.pwabuilder.com/) to wrap it as an APK via Trusted Web Activity (TWA)
- Host the web app on a simple static site (GitHub Pages, Vercel, Netlify)
- The APK is essentially a thin shell that opens the web app in Chrome Custom Tabs

**Share target:**
- PWAs can register as share targets via `manifest.json`:
  ```json
  {
    "share_target": {
      "action": "/share",
      "method": "GET",
      "params": { "url": "link", "title": "name" }
    }
  }
  ```
- When wrapped in a TWA, this works on Android

**Pros:**
- Reuse almost all existing JS code (OAuth, API calls, UI)
- No native development skills needed
- Single codebase for web + mobile
- Easy to update (just redeploy the web app)

**Cons:**
- Share target support in TWAs can be flaky on some Android versions
- Requires Chrome to be installed on the device
- Limited access to native features
- OAuth redirect handling can be tricky in a TWA context

**Effort:** Low — mostly repackaging existing code

---

### Option B: Native Android App (Kotlin)

**How it works:**
- Small Kotlin app with an intent filter for `ACTION_SEND` (share target)
- OAuth 2.0 via AppAuth library or a WebView
- Direct HTTP calls to TickTick API
- Minimal UI: project picker + confirmation

**Share target (native intent filter in AndroidManifest.xml):**
```xml
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
</intent-filter>
```

**Pros:**
- Rock-solid share target — this is the native Android way
- Full control over UX
- Works offline (queue tasks, sync later)
- Can add features like quick-add notifications, widgets
- Better OAuth flow via Custom Tabs / system browser

**Cons:**
- Need to rewrite logic in Kotlin
- Android-only (no iOS without a separate project)
- Requires maintaining a separate codebase

**Effort:** Medium

---

### Option C: React Native / Expo

**How it works:**
- Cross-platform app using React Native
- Use `react-native-share-menu` or `react-native-receive-sharing-intent` for share target
- Build APK via EAS Build or bare workflow

**Pros:**
- Cross-platform (Android + iOS from one codebase)
- JavaScript — closest to your existing skillset
- Large ecosystem of libraries

**Cons:**
- Heavy runtime for a very simple app
- Share intent libraries can be buggy or unmaintained
- More complex build/deploy pipeline than needed
- Overkill for this use case

**Effort:** Medium-High

---

### Option D: Capacitor (Ionic) Web App

**How it works:**
- Wrap a web app using [Capacitor](https://capacitorjs.com/)
- Your existing HTML/CSS/JS popup code runs inside a native WebView
- Use `@nicedoc/capacitor-share-target` or similar plugin for share intent
- Build APK via Android Studio or Capacitor CLI

**Pros:**
- Directly reuse your existing web code
- True native shell with WebView — better than TWA
- Capacitor has decent plugin ecosystem
- Can add native features incrementally

**Cons:**
- WebView performance (fine for this simple app though)
- Share target plugins may need manual native code
- Extra abstraction layer

**Effort:** Low-Medium

---

## Recommended Approach: Option B (Native Kotlin) or Option D (Capacitor)

**If you want maximum reliability** (especially for the share target, which is the entire point): go native Kotlin. The app is small enough that the Kotlin code would be ~200 lines.

**If you want to reuse your existing JS code**: go Capacitor. You already have the popup UI and API logic — Capacitor wraps it in a native shell and gives you access to share intents.

---

## Architecture for the Mobile App

Regardless of approach, the architecture maps cleanly from the extension:

```
┌──────────────────────────────────────────────┐
│                 MOBILE APP                    │
│                                               │
│  ┌─────────────┐    ┌──────────────────────┐ │
│  │ Share Intent │───>│   Main Activity /    │ │
│  │ (URL + Title)│    │   Web View           │ │
│  └─────────────┘    │                      │ │
│                      │  1. Parse shared URL │ │
│  ┌─────────────┐    │  2. Fetch page title  │ │
│  │ OAuth Login  │───>│  3. Pick project     │ │
│  │ (first time) │    │  4. POST to TickTick │ │
│  └─────────────┘    └──────────────────────┘ │
│                              │                │
│                    ┌─────────▼─────────┐     │
│                    │ TickTick API       │     │
│                    │ - GET /project     │     │
│                    │ - POST /task       │     │
│                    └───────────────────┘     │
│                                               │
│  Storage: SharedPreferences / SQLite          │
│  - access_token                               │
│  - project_id                                 │
│  - project_name                               │
└──────────────────────────────────────────────┘
```

## OAuth on Mobile

The TickTick OAuth flow needs a different redirect URI for mobile:

1. **Register a new redirect URI** at https://developer.ticktick.com/manage
   - For native: use a custom scheme like `tickticksaver://oauth/callback`
   - For Capacitor/TWA: use the hosted web app URL

2. **Flow:**
   - Open TickTick auth URL in system browser / Custom Tab
   - User approves → redirect to your custom scheme
   - App catches the redirect, extracts auth code
   - Exchange code for token (same POST to `/oauth/token`)

3. **Token storage:**
   - Android: `EncryptedSharedPreferences` (native) or `localStorage` (WebView)

## User Flow

```
1. Install app → Open → "Connect to TickTick" → OAuth login (one-time)
2. Select default project (one-time)
3. Browsing the web on your phone...
4. Find interesting link → tap Share → pick "TickTick Saver"
5. App opens briefly:
   - Shows: page title, URL, selected project
   - Tap "Save" → task created → app closes
   (or auto-save with a toast notification if you want zero friction)
```

## Minimum Viable Feature Set

- [ ] OAuth login with TickTick
- [ ] Project selection (stored locally)
- [ ] Receive shared URLs via Android share sheet
- [ ] Fetch page title from URL
- [ ] Create task via TickTick API (title + URL + project)
- [ ] Success/error feedback

## Nice-to-Have Features

- [ ] Auto-save mode (skip confirmation, just show a toast)
- [ ] Offline queue (save locally, sync when online)
- [ ] Quick-add from notification shade (persistent notification with input)
- [ ] Widget for home screen
- [ ] Multiple project support (pick per-task)
- [ ] Tag support
- [ ] Due date quick-pick
- [ ] iOS version (if using React Native or Capacitor)

## Distribution

- **Sideload APK**: Build the APK, host it anywhere (GitHub Releases, personal site), share the download link. Users enable "Install from unknown sources."
- **Google Play**: $25 one-time fee for a developer account. Good for discoverability but overkill for personal use.
- **F-Droid**: Free, open-source app store. Good if you open-source the app.

## Quick-Start: Native Kotlin Skeleton

If going native, here's the minimal file structure:

```
app/
├── src/main/
│   ├── AndroidManifest.xml     # Share intent filter + OAuth redirect
│   ├── java/.../
│   │   ├── MainActivity.kt     # OAuth + project picker
│   │   ├── ShareActivity.kt    # Receives share intents, creates tasks
│   │   ├── TickTickApi.kt      # API client (Retrofit or raw HttpURLConnection)
│   │   └── TokenStore.kt       # EncryptedSharedPreferences wrapper
│   └── res/
│       ├── layout/
│       │   ├── activity_main.xml
│       │   └── activity_share.xml
│       └── values/
│           └── strings.xml
├── build.gradle.kts
└── google-services.json        # (only if using Firebase)
```

## Quick-Start: Capacitor Approach

If going Capacitor (reusing existing code):

```bash
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init "TickTick Saver" com.yourname.tickticksaver --web-dir=www

# Copy your existing extension files into www/
mkdir www
cp popup.html www/index.html
cp popup.js popup.css config.js www/

# Adapt: replace chrome.storage.local with localStorage
# Adapt: replace chrome.tabs.query with share intent data
# Adapt: replace chrome.runtime.sendMessage with direct OAuth

npm install @nicedoc/capacitor-share-target  # or similar
npx cap add android
npx cap open android  # opens in Android Studio
# Build APK from Android Studio
```

Key code changes needed for Capacitor:
1. Replace `chrome.storage.local` → `localStorage`
2. Replace `chrome.tabs.query()` → receive URL from share intent plugin
3. Replace `chrome.runtime.sendMessage({action: "authenticate"})` → direct OAuth flow via browser plugin
4. Remove all Chrome extension-specific APIs
