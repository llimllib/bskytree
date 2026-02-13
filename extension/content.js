// Configuration - change this URL as needed
const BSKYTREE_BASE_URL = "https://llimllib.github.io/bskytree";

// Parse bsky URL path to extract handle and postId
function parsePostPath(path) {
  const match = path.match(/\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)/);
  if (match) {
    return { handle: match[1], postId: match[2] };
  }
  return null;
}

// Build bskytree URL
function buildBskytreeUrl(handle, postId) {
  return `${BSKYTREE_BASE_URL}/#${handle}/${postId}`;
}

// Create tree button element
function createTreeButton() {
  const btn = document.createElement("button");
  btn.className = "bskytree-btn";
  btn.setAttribute("aria-label", "View thread tree");
  btn.setAttribute("type", "button");
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 1A2.5 2.5 0 0 0 9.5 3.5A2.5 2.5 0 0 0 11 5.79V7H7A2 2 0 0 0 5 9V9.71A2.5 2.5 0 0 0 3.5 12A2.5 2.5 0 0 0 5 14.29V15H4A2 2 0 0 0 2 17V18.21A2.5 2.5 0 0 0 .5 20.5A2.5 2.5 0 0 0 3 23A2.5 2.5 0 0 0 5.5 20.5A2.5 2.5 0 0 0 4 18.21V17H8V18.21A2.5 2.5 0 0 0 6.5 20.5A2.5 2.5 0 0 0 9 23A2.5 2.5 0 0 0 11.5 20.5A2.5 2.5 0 0 0 10 18.21V17A2 2 0 0 0 8 15H7V14.29A2.5 2.5 0 0 0 8.5 12A2.5 2.5 0 0 0 7 9.71V9H17V9.71A2.5 2.5 0 0 0 15.5 12A2.5 2.5 0 0 0 17 14.29V15H16A2 2 0 0 0 14 17V18.21A2.5 2.5 0 0 0 12.5 20.5A2.5 2.5 0 0 0 15 23A2.5 2.5 0 0 0 17.5 20.5A2.5 2.5 0 0 0 16 18.21V17H20V18.21A2.5 2.5 0 0 0 18.5 20.5A2.5 2.5 0 0 0 21 23A2.5 2.5 0 0 0 23.5 20.5A2.5 2.5 0 0 0 22 18.21V17A2 2 0 0 0 20 15H19V14.29A2.5 2.5 0 0 0 20.5 12A2.5 2.5 0 0 0 19 9.71V9A2 2 0 0 0 17 7H13V5.79A2.5 2.5 0 0 0 14.5 3.5A2.5 2.5 0 0 0 12 1M12 2.5A1 1 0 0 1 13 3.5A1 1 0 0 1 12 4.5A1 1 0 0 1 11 3.5A1 1 0 0 1 12 2.5M6 11A1 1 0 0 1 7 12A1 1 0 0 1 6 13A1 1 0 0 1 5 12A1 1 0 0 1 6 11M18 11A1 1 0 0 1 19 12A1 1 0 0 1 18 13A1 1 0 0 1 17 12A1 1 0 0 1 18 11M3 19.5A1 1 0 0 1 4 20.5A1 1 0 0 1 3 21.5A1 1 0 0 1 2 20.5A1 1 0 0 1 3 19.5M9 19.5A1 1 0 0 1 10 20.5A1 1 0 0 1 9 21.5A1 1 0 0 1 8 20.5A1 1 0 0 1 9 19.5M15 19.5A1 1 0 0 1 16 20.5A1 1 0 0 1 15 21.5A1 1 0 0 1 14 20.5A1 1 0 0 1 15 19.5M21 19.5A1 1 0 0 1 22 20.5A1 1 0 0 1 21 21.5A1 1 0 0 1 20 20.5A1 1 0 0 1 21 19.5Z"/>
    </svg>
  `;
  return btn;
}

// Find the post URL for a feed item
function getPostUrlFromItem(feedItem) {
  // Look for a link that matches /profile/*/post/*
  const links = feedItem.querySelectorAll('a[href*="/post/"]');
  for (const link of links) {
    const parsed = parsePostPath(link.getAttribute("href"));
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

// Inject button into a single feed item
function injectButtonIntoItem(feedItem) {
  // Skip if already has our button
  if (feedItem.querySelector(".bskytree-btn")) return;
  
  // Find the like button to insert next to
  const likeBtn = feedItem.querySelector('[data-testid="likeBtn"]');
  if (!likeBtn) return;
  
  // Get the post info
  const postInfo = getPostUrlFromItem(feedItem);
  if (!postInfo) return;
  
  // Create wrapper div to match other buttons
  const wrapper = document.createElement("div");
  wrapper.className = "bskytree-wrapper";
  wrapper.style.cssText = "flex: 1 1 0%; align-items: flex-start;";
  
  const btn = createTreeButton();
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = buildBskytreeUrl(postInfo.handle, postInfo.postId);
    window.open(url, "_blank");
  });
  
  wrapper.appendChild(btn);
  
  // Insert after the like button's parent wrapper
  const likeWrapper = likeBtn.closest('[style*="flex: 1 1 0%"]');
  if (likeWrapper && likeWrapper.parentElement) {
    likeWrapper.parentElement.insertBefore(wrapper, likeWrapper.nextSibling);
  }
}

// Process all feed items on the page
function processAllFeedItems() {
  const feedItems = document.querySelectorAll('[data-testid^="feedItem-by-"]');
  feedItems.forEach(injectButtonIntoItem);
  
  // Also handle single post view pages
  const postPage = document.querySelector('[data-testid="postThreadItem"]');
  if (postPage) {
    injectButtonIntoItem(postPage);
  }
}

// Initial processing
processAllFeedItems();

// Watch for new content (infinite scroll, navigation)
const observer = new MutationObserver((mutations) => {
  // Debounce - only process if we have new nodes
  let hasNewNodes = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      hasNewNodes = true;
      break;
    }
  }
  if (hasNewNodes) {
    processAllFeedItems();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
