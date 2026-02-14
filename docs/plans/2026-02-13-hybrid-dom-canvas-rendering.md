# Hybrid DOM/Canvas Rendering

**Date:** 2026-02-13
**Status:** Phase 1 implemented

## Problem

Current pure-canvas rendering has limitations:
- Links in posts aren't clickable
- Text overflow handling is manual and imperfect
- Every rich text feature (links, mentions, hashtags, embeds, images) requires reimplementing browser functionality

Example: https://bsky.app/profile/hildabast.bsky.social/post/3merpwqxfls2z
- Has a link that isn't displayed as a link
- Text overflows the box

## Decision

Adopt a hybrid approach:
- **Canvas:** Lines/connections between nodes, pan/zoom handling
- **DOM:** Post content as absolutely positioned divs with CSS transforms

### Coordination

When user pans/zooms:
1. Redraw canvas lines with new transform
2. Apply matching CSS transform to a container div holding all post nodes

Container approach: one parent div gets `transform: translate(${x}px, ${y}px) scale(${zoom})`, child post-divs are positioned in "world coordinates."

### Why not oEmbed?

Bsky has an oEmbed API (`embed.bsky.app/oembed`) but it's not ideal for tree view:
- Heavy (iframe per post)
- Sizing unpredictable
- Redundant UI chrome (author info, timestamps repeated)
- May hit rate limits with many posts

## Implementation Plan

### Phase 1: Basic DOM nodes ✅

- [x] Render post text with facets parsed to clickable elements:
  - Links (`app.bsky.richtext.facet#link`)
  - Mentions (`app.bsky.richtext.facet#mention`)
  - Hashtags (`app.bsky.richtext.facet#tag`)
- [x] Display author name/handle, timestamp
- [x] Fix overflow with CSS (`word-wrap`, `overflow` handling)
- [x] Hook DOM nodes to existing canvas pan/zoom system
- [x] Keep current layout algorithm

### Phase 2: Embedded content

- [ ] Quote posts (nested post display)
- [ ] Images (thumbnails, click to expand)
- [ ] Link cards (title + thumbnail preview)
- [ ] Video thumbnails/players

### Phase 3: Polish

- [ ] Match bsky.app styling more closely
- [ ] Interaction counts (likes, reposts, replies)
- [ ] Performance tuning if needed (virtualization for huge threads)

## Technical Notes

### Facet structure

Posts come with:
- `record.text` - plain text
- `record.facets` - array of `{index: {byteStart, byteEnd}, features: [{$type, uri/did/tag}]}`

Parse by slicing text at byte offsets and wrapping segments in appropriate elements.

### Layout

Keep existing layout algorithm - it produces nice results. Just swap canvas text rendering for DOM node positioning.
