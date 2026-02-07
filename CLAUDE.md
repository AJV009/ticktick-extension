# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Chrome extension (Manifest V3) that saves the current browser tab as a TickTick task. Task title = page title, task content = page URL, posted to a user-selected TickTick project.

## Development

No build step. Load the extension unpacked at `chrome://extensions` with Developer mode enabled. After any code change, click the reload button on the extension card.

OAuth setup requires a TickTick developer app at https://developer.ticktick.com/manage with redirect URI `https://<extension-id>.chromiumapp.org/`. Credentials go in `config.js`.

## Architecture

**Two execution contexts** that do NOT share scope:
- **`background.js`** — Manifest V3 service worker. Handles OAuth flow (auth code exchange → token). Loads config via `importScripts("config.js")`.
- **`popup.js`** + **`popup.html`** — Popup UI. Loads config via `<script src="config.js">`. Manages three view states (login → project picker → add task), makes TickTick API calls.

Communication between them: popup sends `chrome.runtime.sendMessage({action: "authenticate"})`, background responds with `{success: true}` or `{error: "..."}`.

**State stored in `chrome.storage.local`:** `access_token`, `project_id`, `project_name`.

**TickTick API endpoints used:**
- `GET /open/v1/project` — list projects (also used to validate token on startup)
- `POST /open/v1/task` — create task (`{title, content, projectId}`)

## Gotchas

- **CSS `hidden` attribute vs explicit `display`**: If a CSS rule sets `display: flex/grid/etc`, the HTML `hidden` attribute won't hide the element. Every selector that sets display must have a corresponding `[hidden] { display: none; }` rule.
- **Service worker isolation**: `background.js` cannot access `<script>` tags from `popup.html`. Shared code (like `config.js`) must be loaded with `importScripts()` in the service worker.
- **Token validation**: Always verify stored tokens with a real API call before advancing past the login screen. Stale tokens cause the UI to get stuck.
- **`config.js` contains secrets**: This file should not be committed to a public repo.
