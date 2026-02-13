# Mobile App Brainstorm: TickTick Link Saver

## Problem

Chrome extension only works on desktop. Need the same "share URL → TickTick task" flow on phones, for both Android and iOS eventually.

## Decision: Capacitor

**Why Capacitor over the alternatives:**

| | Capacitor | React Native / Expo | Native Kotlin | PWA/TWA |
|---|---|---|---|---|
| Reuse existing JS? | Yes, almost all of popup.js | No, rewrite in RN components | No, rewrite in Kotlin | Yes, but share target is flaky |
| Cross-platform? | Android + iOS | Android + iOS | Android only | Android only (realistically) |
| Share intent? | Plugin + small native glue | Buggy third-party libs | Rock-solid but single-platform | Unreliable on many devices |
| Complexity | Low — it's a WebView with native shell | Medium-High — new framework, build system | Medium — new language | Low but limited |
| Future iOS? | Same codebase, `npx cap add ios` | Same codebase | Separate Swift project | No real path |

Capacitor wins because: JS-based, reuses your code, cross-platform, and the app is simple enough that WebView perf is irrelevant.

---

## What Changes From Extension → Capacitor App

Here's the concrete mapping. Your `popup.js` has 4 Chrome-specific things that need swapping:

### 1. Storage: `chrome.storage.local` → Capacitor Preferences

```js
// EXTENSION (popup.js:23, 73, 108, 134)
await chrome.storage.local.get(["access_token", "project_id", "project_name"]);
await chrome.storage.local.set({ project_id: id, project_name: name });

// MOBILE APP
import { Preferences } from '@capacitor/preferences';
const { value } = await Preferences.get({ key: 'access_token' });
await Preferences.set({ key: 'project_id', value: id });
```

Why not just `localStorage`? `Preferences` persists across app updates and works identically on Android + iOS. `localStorage` in a WebView can get cleared.

### 2. Get Shared URL: `chrome.tabs.query()` → Share Intent Plugin

```js
// EXTENSION (popup.js:118, 133)
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
pageTitle.textContent = tab.title;
pageUrl.textContent = tab.url;

// MOBILE APP — receive from share sheet
import { SendIntent } from 'send-intent';

// On app launch, check if opened via share
const intent = await SendIntent.checkSendIntentReceived();
if (intent?.url) {
  // We have a shared URL — fetch its title ourselves
  const title = await fetchPageTitle(intent.url);
  pageTitle.textContent = title;
  pageUrl.textContent = intent.url;
} else {
  // App opened normally (not via share) — show a
  // "Share a link to this app to create a task" message
}
```

One extra step: the extension gets the page title for free from `tab.title`. The mobile app only receives a URL from the share sheet, so we need to fetch the title ourselves:

```js
async function fetchPageTitle(url) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : url;
  } catch {
    return url; // fallback to URL if fetch fails
  }
}
```

### 3. OAuth: `chrome.runtime.sendMessage` → In-App Browser

```js
// EXTENSION (popup.js:64)
const response = await chrome.runtime.sendMessage({ action: "authenticate" });

// MOBILE APP — open OAuth in system browser, catch redirect
import { Browser } from '@capacitor/browser';

async function authenticate() {
  const authUrl = `https://ticktick.com/oauth/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=tasks:write tasks:read` +
    `&state=${crypto.randomUUID()}`;

  // Opens in system browser
  await Browser.open({ url: authUrl });

  // Listen for redirect back to app
  Browser.addListener('browserFinished', async () => {
    // On Android/iOS, the custom scheme redirect closes the browser
    // and fires an appUrlOpen event
  });
}

// In your app initialization:
import { App } from '@capacitor/app';
App.addListener('appUrlOpen', async ({ url }) => {
  if (url.startsWith(REDIRECT_URI)) {
    const code = new URL(url).searchParams.get('code');
    const token = await exchangeCodeForToken(code);
    await Preferences.set({ key: 'access_token', value: token });
    // Continue to project picker...
  }
});
```

The `exchangeCodeForToken()` function is the same POST to `/oauth/token` that's currently in `background.js`.

**Redirect URI setup:** Register `com.yourname.tickticksaver://oauth/callback` at https://developer.ticktick.com/manage. Capacitor catches custom scheme URLs natively.

### 4. Everything Else: Stays the Same

Your `apiGet()`, `apiPost()`, `showView()`, `showFeedback()`, `showProjectPicker()`, project select logic — all vanilla JS, all works as-is in a WebView. No changes needed.

---

## App Structure

```
ticktick-mobile/
├── www/                          # Your web code (Capacitor serves this)
│   ├── index.html                # Adapted from popup.html
│   ├── app.js                    # Adapted from popup.js (swap Chrome APIs)
│   ├── app.css                   # Adapted from popup.css (full-screen layout)
│   └── config.js                 # Same CLIENT_ID / CLIENT_SECRET
├── capacitor.config.ts           # Capacitor config
├── package.json
├── android/                      # Auto-generated, build APK from here
│   └── app/src/main/
│       └── AndroidManifest.xml   # Share intent filter added here
└── ios/                          # Auto-generated when you add iOS later
```

## Setup Steps (When Ready to Build)

```bash
# 1. Scaffold
mkdir ticktick-mobile && cd ticktick-mobile
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/preferences @capacitor/browser @capacitor/app
npm install send-intent  # for receiving share intents
npx cap init "TickTick Saver" com.yourname.tickticksaver --web-dir=www

# 2. Copy + adapt web code
mkdir www
cp ../ticktick-extension/popup.html www/index.html
cp ../ticktick-extension/popup.css www/app.css
cp ../ticktick-extension/config.js www/config.js
# Create www/app.js — adapted popup.js with Capacitor APIs

# 3. Add Android
npx cap add android

# 4. Configure share intent in android/app/src/main/AndroidManifest.xml
# (add intent-filter for ACTION_SEND)

# 5. Build
npx cap sync
npx cap open android   # opens Android Studio → Build → APK
```

## Android Share Intent Config

In `android/app/src/main/AndroidManifest.xml`, add to the main activity:

```xml
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
</intent-filter>
```

This makes the app appear in the Android share sheet for any text/URL.

## iOS Share Extension (Future)

When you're ready for iOS:

```bash
npx cap add ios
npx cap open ios  # opens Xcode
```

iOS share extensions are a bit more involved — you'd add a "Share Extension" target in Xcode that passes the URL to your Capacitor app. The JS code stays the same, just the native glue differs. Capacitor handles most of it.

---

## User Flow

```
FIRST TIME:
  Open app → "Connect to TickTick" → OAuth in browser → redirect back →
  Pick a project → Done, ready to use

EVERY TIME AFTER:
  Browsing on phone → Find link → Share → "TickTick Saver" →
  See title + URL + project → Tap "Save" → Task created → App closes
```

## MVP Checklist

- [ ] Capacitor project scaffolded
- [ ] popup.html/css adapted for full-screen mobile layout
- [ ] popup.js adapted: Preferences, Browser OAuth, SendIntent
- [ ] Share intent configured in AndroidManifest.xml
- [ ] Page title fetching from shared URLs
- [ ] OAuth redirect handling via custom scheme
- [ ] Token exchange (port from background.js)
- [ ] Build APK and test on real device

## Nice-to-Haves (Post-MVP)

- [ ] Auto-save mode — skip confirmation screen, just toast "Saved!"
- [ ] Offline queue — save locally, POST when back online
- [ ] Edit title before saving
- [ ] Pick project per-task (instead of one default)
- [ ] iOS build
- [ ] Dark mode (follow system theme)

## Distribution

- **Personal use / sharing with friends:** Build APK, host on GitHub Releases or any file host, share the link. Sideload on Android.
- **Wider distribution:** Google Play ($25 one-time), or TestFlight for iOS beta.
