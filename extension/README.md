# bskytree Browser Extension

A Firefox extension to open Bluesky posts in the [bskytree](https://llimllib.github.io/bskytree) thread visualizer.

## Features

- **Floating button**: When viewing a post on bsky.app, a "View Thread Tree" button appears in the bottom-right corner
- **Context menu**: Right-click on any bsky.app page or post link and select "Open in bskytree"

## Installation

### Temporary (for development)

1. Open Firefox and go to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on..."
4. Navigate to the `extension` folder and select `manifest.json`

### Permanent (after packaging)

```bash
cd extension
zip -r bskytree-extension.zip *
```

Then submit to [Firefox Add-ons](https://addons.mozilla.org/) or install as a signed extension.

## Configuration

To change the bskytree URL, edit the `BSKYTREE_BASE_URL` constant in both:
- `background.js` (line 2)
- `content.js` (line 2)

## Icons

The extension needs icons at `icons/icon-48.png` and `icons/icon-96.png`. 

You can create simple ones or use any tree-themed icon. The extension will work without icons, but Firefox will show a default placeholder.

## Files

- `manifest.json` - Extension configuration
- `background.js` - Handles context menu functionality
- `content.js` - Injects the floating button on bsky.app post pages
- `content.css` - Styles for the floating button
- `icons/` - Extension icons (48x48 and 96x96 PNG)
