# bskytree Firefox Extension

Firefox browser extension that adds "View Thread Tree" functionality to bsky.app, linking to the [btree.space](https://btree.space) thread visualizer.

## Project Structure

```
firefox-extension/
├── extension/           # Firefox extension source
│   ├── manifest.json    # Extension manifest (v2)
│   ├── background.js    # Context menu handler
│   ├── content.js       # Injects tree button into feed items
│   ├── content.css      # Button styling (matches bsky.app style)
│   └── icons/           # Extension icons (48x48, 96x96 PNG)
├── index.html           # Main bskytree visualizer (served at btree.space)
├── index.js             # Main visualizer JavaScript (external script)
├── transcripts/         # AI session transcripts for PRs
└── mise.toml            # Environment config (contains secrets - DO NOT COMMIT)
```

## Code Quality

All JavaScript code must pass biome linting with no errors or warnings before committing:

```bash
make lint
```

This runs `npx @biomejs/biome check index.js`. Fix any issues before submitting PRs.

## Development

### Loading the Extension

1. Open Firefox → `about:debugging`
2. Click "This Firefox" → "Load Temporary Add-on..."
3. Select `extension/manifest.json`

### Testing

- Visit any bsky.app post or feed
- Tree button appears next to the like button on each post
- Right-click context menu "Open in bskytree" works on post pages/links

### Packaging

```bash
cd extension
zip -r bskytree-extension.zip *
```

## Code Patterns

### URL Parsing

Both `background.js` and `content.js` parse bsky URLs with:
```javascript
url.match(/bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)/)
```

The bskytree URL format is: `https://btree.space/#handle/postId`

### Content Script Injection

`content.js` uses MutationObserver to handle:
- Initial page load
- Infinite scroll (new feed items)
- SPA navigation

Buttons are injected after the like button wrapper using `data-testid` selectors:
- Feed items: `[data-testid^="feedItem-by-"]`
- Thread view: `[data-testid="postThreadItem"]`

### Configuration

The base URL is hardcoded in both JS files:
```javascript
const BSKYTREE_BASE_URL = "https://btree.space";
```

## Styling

Button CSS matches bsky.app's action button style:
- Color: `rgb(111, 131, 159)` (default), `#1da1f2` (hover)
- Uses `border-radius: 999px` for pill shape
- SVG icon is a tree/hierarchy symbol

## Deployment

- Main visualizer deploys to GitHub Pages via `.github/workflows/deploy.yml`
- Extension must be submitted to Firefox Add-ons for permanent installation
