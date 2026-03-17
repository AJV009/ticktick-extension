// Service worker (Chrome) needs importScripts; event page (Firefox) loads
// config.js via the manifest "scripts" array, so importScripts isn't available.
if (typeof importScripts === "function") {
  importScripts("config.js");
}

const API_BASE = "https://api.ticktick.com/open/v1";
const MENU_ID = "send-to-ticktick";

// --- Context Menu Setup ---

chrome.runtime.onInstalled.addListener(async () => {
  const { project_name } = await chrome.storage.local.get("project_name");
  chrome.contextMenus.create({
    id: MENU_ID,
    title: project_name ? `Send to ${project_name}` : "Send to TickTick",
    contexts: ["page", "link"],
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.project_name) {
    const name = changes.project_name.newValue;
    chrome.contextMenus.update(MENU_ID, {
      title: name ? `Send to ${name}` : "Send to TickTick",
    });
  }
});

// --- URL Resolver ---

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveUrl(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    const finalUrl = res.url;
    let title = null;

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const html = await res.text();

      // Try <title> tag first
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        const decoded = decodeEntities(titleMatch[1]);
        if (decoded && decoded !== finalUrl) title = decoded;
      }

      // Fall back to og:title / twitter:title meta tags (works for JS-rendered sites like x.com)
      if (!title) {
        const ogMatch = html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']*?)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']*?)["'][^>]+(?:property|name)=["']og:title["']/i);
        if (ogMatch) title = decodeEntities(ogMatch[1]);
      }
      if (!title) {
        const twMatch = html.match(/<meta[^>]+(?:property|name)=["']twitter:title["'][^>]+content=["']([^"']*?)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']*?)["'][^>]+(?:property|name)=["']twitter:title["']/i);
        if (twMatch) title = decodeEntities(twMatch[1]);
      }
    }

    return { url: finalUrl, title: title || finalUrl };
  } catch {
    return { url, title: url };
  }
}

// --- Context Menu Click Handler ---

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const { access_token, project_id } = await chrome.storage.local.get([
    "access_token",
    "project_id",
  ]);

  if (!access_token || !project_id) return;

  let title, content;

  if (info.linkUrl) {
    // Get anchor text from the content script in the frame that was right-clicked
    let linkText;
    try {
      const linkData = await chrome.tabs.sendMessage(
        tab.id,
        { action: "getLinkText" },
        { frameId: info.frameId }
      );
      linkText = linkData?.text;
    } catch {}

    // Resolve redirect chain for the final URL
    const resolved = await resolveUrl(info.linkUrl);
    title = linkText || resolved.title;
    content = resolved.url;
  } else {
    // Right-clicked on the page
    title = tab.title || "Untitled";
    content = tab.url || "";
  }

  try {
    const res = await fetch(`${API_BASE}/task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, content, projectId: project_id }),
    });
    if (!res.ok) {
      console.error("TickTick API error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Failed to create task:", err);
  }
});

// --- OAuth Message Handler ---

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
