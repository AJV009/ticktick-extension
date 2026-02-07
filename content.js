let lastRightClickedLink = null;

document.addEventListener("contextmenu", (e) => {
  const anchor = e.target.closest("a");
  if (anchor) {
    lastRightClickedLink = {
      text: anchor.innerText.trim() || anchor.href,
      href: anchor.href,
    };
  } else {
    lastRightClickedLink = null;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getLinkText") {
    sendResponse(lastRightClickedLink);
  }
});
