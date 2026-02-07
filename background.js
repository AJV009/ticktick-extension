importScripts("config.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "authenticate") {
    handleAuth().then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true; // keep message channel open for async response
  }
});

async function handleAuth() {
  const redirectUri = chrome.identity.getRedirectURL();
  const state = crypto.randomUUID();

  const authUrl =
    "https://ticktick.com/oauth/authorize" +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&scope=${encodeURIComponent("tasks:write tasks:read")}` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code`;

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  const url = new URL(responseUrl);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (returnedState !== state) {
    throw new Error("OAuth state mismatch");
  }
  if (!code) {
    throw new Error("No authorization code received");
  }

  // Exchange code for access token
  const tokenResponse = await fetch("https://ticktick.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(CLIENT_ID + ":" + CLIENT_SECRET),
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      scope: "tasks:write tasks:read",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${tokenResponse.status} ${text}`);
  }

  const tokenData = await tokenResponse.json();
  await chrome.storage.local.set({ access_token: tokenData.access_token });

  return { success: true };
}
