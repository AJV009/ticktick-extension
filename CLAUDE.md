# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Cross-browser extension (Manifest V3, Chrome + Firefox 120+) that saves the current browser tab as a TickTick task. Task title = page title, task content = page URL, posted to a user-selected TickTick project.

## Development

No build step. Single codebase works on both Chrome and Firefox — no browser-specific builds needed.

**Chrome:** Load the extension unpacked at `chrome://extensions` with Developer mode enabled. After any code change, click the reload button on the extension card.

**Firefox (120+):** Load as a temporary add-on at `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `manifest.json`. The `browser_specific_settings.gecko.id` in the manifest provides a stable extension ID (required for OAuth redirect URL consistency).

**OAuth setup:** Create a TickTick developer app at https://developer.ticktick.com/manage. Register redirect URIs for each browser:
- Chrome: `https://<extension-id>.chromiumapp.org/`
- Firefox: `https://<gecko-id>.extensions.allizom.org/`

Run `chrome.identity.getRedirectURL()` in the extension's background console to see the exact URI for your browser. Credentials go in `config.js`.

## Architecture

**Two execution contexts** that do NOT share scope:
- **`background.js`** — Manifest V3 service worker. Handles OAuth flow (auth code exchange → token). Loads config via `importScripts("config.js")`.
- **`popup.js`** + **`popup.html`** — Popup UI. Loads config via `<script src="config.js">`. Manages three view states (login → project picker → add task), makes TickTick API calls.

Communication between them: popup sends `chrome.runtime.sendMessage({action: "authenticate"})`, background responds with `{success: true}` or `{error: "..."}`.

**State stored in `chrome.storage.local`:** `access_token`, `project_id`, `project_name`.

**TickTick API endpoints used:**
- `GET /open/v1/project` — list projects (also used to validate token on startup)
- `POST /open/v1/task` — create task (`{title, content, projectId}`)

## Cross-Browser Compatibility

The extension uses `chrome.*` APIs throughout. Firefox provides a compatibility layer that maps `chrome.*` calls to its native `browser.*` APIs, so no polyfill or conditional code is needed. Key points:

- **Manifest**: `browser_specific_settings.gecko` is ignored by Chrome and required by Firefox for a stable extension ID.
- **`service_worker` in background**: Supported by Chrome (all MV3) and Firefox 120+. This is why `strict_min_version` is set to `120.0`.
- **`chrome.identity.getRedirectURL()`**: Returns different URLs per browser (`*.chromiumapp.org` on Chrome, `*.extensions.allizom.org` on Firefox). Both must be registered in the TickTick developer app.
- **`importScripts("config.js")`**: Standard ServiceWorker API, works identically on both browsers.

## Gotchas

- **CSS `hidden` attribute vs explicit `display`**: If a CSS rule sets `display: flex/grid/etc`, the HTML `hidden` attribute won't hide the element. Every selector that sets display must have a corresponding `[hidden] { display: none; }` rule.
- **Service worker isolation**: `background.js` cannot access `<script>` tags from `popup.html`. Shared code (like `config.js`) must be loaded with `importScripts()` in the service worker.
- **Token validation**: Always verify stored tokens with a real API call before advancing past the login screen. Stale tokens cause the UI to get stuck.
- **`config.js` contains secrets**: This file should not be committed to a public repo.
- **Firefox gecko ID**: The `browser_specific_settings.gecko.id` must be set to a stable value for OAuth to work. Without it, Firefox assigns a temporary ID on each load, changing the redirect URL and breaking the OAuth flow.
