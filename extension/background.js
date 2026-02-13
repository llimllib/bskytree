// Configuration - change this URL as needed
const BSKYTREE_BASE_URL = "https://llimllib.github.io/bskytree";

// Parse bsky.app URL to extract handle and postId
function parseBskyUrl(url) {
  const match = url.match(/bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)/);
  if (match) {
    return { handle: match[1], postId: match[2] };
  }
  return null;
}

// Build bskytree URL
function buildBskytreeUrl(handle, postId) {
  return `${BSKYTREE_BASE_URL}/#${handle}/${postId}`;
}

// Create context menu item
browser.contextMenus.create({
  id: "open-in-bskytree",
  title: "Open in bskytree",
  contexts: ["page", "link"],
  documentUrlPatterns: ["*://bsky.app/*"]
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "open-in-bskytree") return;
  
  // Use link URL if right-clicked on a link, otherwise use page URL
  const url = info.linkUrl || info.pageUrl;
  const parsed = parseBskyUrl(url);
  
  if (parsed) {
    const bskytreeUrl = buildBskytreeUrl(parsed.handle, parsed.postId);
    browser.tabs.create({ url: bskytreeUrl });
  }
});
