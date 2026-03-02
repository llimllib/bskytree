# Fix Tree Icon on Individual Post Pages

## Issue
Issue #7: The extension was only showing the tree icon on the feed page, not on individual post pages.

## Root Cause
Used Playwright to inspect the DOM structure on an individual post page. Found that:
- The selector `[data-testid="postThreadItem"]` was looking for an exact match
- But Bluesky's actual `data-testid` format is `postThreadItem-by-{handle}` (e.g., `postThreadItem-by-robertscotthorton.bsky.social`)

## Fix
Changed the selector in `extension/content.js` from:
```javascript
const postPage = document.querySelector('[data-testid="postThreadItem"]');
if (postPage) {
  injectButtonIntoItem(postPage);
}
```

To:
```javascript
const threadItems = document.querySelectorAll('[data-testid^="postThreadItem-by-"]');
threadItems.forEach(injectButtonIntoItem);
```

Also:
- Applied optional chaining fix suggested by biome linter
- Updated Makefile lint target to include `extension/` directory
- Removed orphaned `config.js` that wasn't loaded by manifest
- Updated CLAUDE.md documentation with correct selector
