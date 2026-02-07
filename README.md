# TickTick Page Saver

Chrome extension that saves the current tab as a TickTick task. Title = page title, description = page URL, sent to a project you pick once.

## Setup

1. Clone this repo and copy `config.js.sample` to `config.js`
2. Create an app at https://developer.ticktick.com/manage
3. Set the redirect URI to `https://<extension-id>.chromiumapp.org/`
4. Paste your `CLIENT_ID` and `CLIENT_SECRET` into `config.js`
5. Load the extension unpacked at `chrome://extensions` (Developer mode on)
6. Note the extension ID, update the redirect URI in step 3 if needed
7. Click the extension icon, connect your TickTick account, pick a project — done
