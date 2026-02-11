# Bluesky Thread Tree

An interactive visualizer for Bluesky comment threads. Paste a post URL and see the entire conversation rendered as a zoomable, navigable tree.

## Features

- **Full thread visualization** - Fetches the complete conversation from root to all replies
- **Interactive canvas** - Pan by dragging, zoom with scroll wheel
- **Rich post cards** - Shows avatar, display name, handle, full text, images, and engagement stats
- **Keyboard navigation** - Vim-style keys to traverse the tree
- **Shareable permalinks** - URL updates with the thread ID for easy sharing
- **No backend required** - Runs entirely in the browser using Bluesky's public API

## Usage

1. Open `index.html` in a browser (or serve it locally)
2. Paste a Bluesky post URL (e.g., `https://bsky.app/profile/user.bsky.social/post/abc123`)
3. Click "Load Thread" or press Enter
4. Explore the thread tree!

### Running locally

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

## Keyboard Shortcuts

### Panning
| Key | Action |
|-----|--------|
| `W` | Pan up |
| `A` | Pan left |
| `S` | Pan down |
| `D` | Pan right |

### Tree Navigation
| Key | Action |
|-----|--------|
| `H` | Go to left sibling |
| `J` | Go to child (middle if multiple) |
| `K` | Go to parent |
| `L` | Go to right sibling |
| `G` | Jump to root |
| `Enter` | Center & zoom focused node |

### Other
| Key | Action |
|-----|--------|
| `?` | Toggle keyboard shortcuts panel |
| `Esc` | Close shortcuts panel |

## Permalink Format

URLs are shareable via the hash fragment:

```
https://yoursite.com/#handle/postId
```

For example: `http://localhost:8000/#bsky.app/3kf5rcpe2as2c`

## License

MIT
