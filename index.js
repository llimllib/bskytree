const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const nodesContainer = document.getElementById("nodes-container");
const urlInput = document.getElementById("urlInput");
const loadBtn = document.getElementById("loadBtn");
const clearBtn = document.getElementById("clearBtn");
const shareBtn = document.getElementById("shareBtn");
const notification = document.getElementById("notification");
const statusEl = document.getElementById("status");

// Parse facets and render rich text
function renderRichText(text, facets) {
  if (!facets || facets.length === 0) {
    return escapeHtml(text);
  }

  // Convert string to byte array for proper slicing
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(text);

  // Sort facets by start position
  const sortedFacets = [...facets].sort(
    (a, b) => a.index.byteStart - b.index.byteStart,
  );

  let result = "";
  let lastEnd = 0;

  for (const facet of sortedFacets) {
    const { byteStart, byteEnd } = facet.index;

    // Add text before this facet
    if (byteStart > lastEnd) {
      result += escapeHtml(decoder.decode(bytes.slice(lastEnd, byteStart)));
    }

    // Get the facet text
    const facetText = decoder.decode(bytes.slice(byteStart, byteEnd));

    // Process facet features
    for (const feature of facet.features) {
      if (feature.$type === "app.bsky.richtext.facet#link") {
        result += `<a href="${escapeHtml(feature.uri)}" target="_blank" rel="noopener">${escapeHtml(facetText)}</a>`;
      } else if (feature.$type === "app.bsky.richtext.facet#mention") {
        result += `<a href="https://bsky.app/profile/${escapeHtml(feature.did)}" target="_blank" rel="noopener" class="mention">${escapeHtml(facetText)}</a>`;
      } else if (feature.$type === "app.bsky.richtext.facet#tag") {
        result += `<a href="https://bsky.app/hashtag/${escapeHtml(feature.tag)}" target="_blank" rel="noopener" class="hashtag">${escapeHtml(facetText)}</a>`;
      } else {
        result += escapeHtml(facetText);
      }
    }

    lastEnd = byteEnd;
  }

  // Add remaining text
  if (lastEnd < bytes.length) {
    result += escapeHtml(decoder.decode(bytes.slice(lastEnd)));
  }

  return result;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Canvas state
let width;
let height;
let panX = 0;
let panY = 0;
let zoom = 1;
let isDragging = false;
let dragStartX;
let dragStartY;
let dragStartPanX;
let dragStartPanY;

// Tree state
let nodes = [];

// Reskeet trees: array of { sourceNode, targetNode, tree, nodes }
let reskeetTrees = [];

// Node dimensions
const NODE_WIDTH = 320;
const NODE_MIN_HEIGHT = 100;
const H_SPACING = 20;
const V_SPACING = 30;

// Tree limits to prevent runaway threads
const MAX_NODES = 500;
const MAX_DEPTH = 50;

function resizeCanvas() {
  const container = canvas.parentElement;
  width = container.clientWidth;
  height = container.clientHeight;
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  render();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Parse Bluesky URL
function parseUrl(url) {
  // Handle various URL formats
  const match = url.match(/bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)/);
  if (!match) throw new Error("Invalid Bluesky URL format");
  return { handle: match[1], postId: match[2] };
}

// Resolve handle to DID
async function resolveHandle(handle) {
  // If it's already a DID, return it
  if (handle.startsWith("did:")) return handle;

  const res = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  if (!res.ok) throw new Error("Could not resolve handle");
  const data = await res.json();
  return data.did;
}

// Fetch thread
async function fetchThread(did, postId) {
  const uri = `at://${did}/app.bsky.feed.post/${postId}`;
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=100&parentHeight=100`,
  );
  if (!res.ok) throw new Error("Could not fetch thread");
  const data = await res.json();
  return data.thread;
}

// Measure text height for wrapping
// Extract images from embed
function getEmbedImages(embed) {
  if (!embed) return [];

  // Direct images
  if (embed.$type === "app.bsky.embed.images#view") {
    return embed.images.map((img) => ({
      thumb: img.thumb,
      fullsize: img.fullsize,
      alt: img.alt,
      aspectRatio: img.aspectRatio,
    }));
  }

  // Record with media (quote post with images)
  if (embed.$type === "app.bsky.embed.recordWithMedia#view" && embed.media) {
    return getEmbedImages(embed.media);
  }

  return [];
}

// Extract external embed (links like YouTube, articles, etc.)
function getExternalEmbed(embed) {
  if (!embed) return null;

  // Direct external link
  if (embed.$type === "app.bsky.embed.external#view" && embed.external) {
    return {
      uri: embed.external.uri,
      title: embed.external.title || "",
      description: embed.external.description || "",
      thumb: embed.external.thumb,
    };
  }

  // Record with media might have external embed
  if (embed.$type === "app.bsky.embed.recordWithMedia#view" && embed.media) {
    return getExternalEmbed(embed.media);
  }

  return null;
}

// Extract quoted post from embed
function getQuotedPost(embed) {
  if (!embed) return null;

  // Direct quote
  if (embed.$type === "app.bsky.embed.record#view" && embed.record) {
    const rec = embed.record;
    if (rec.$type === "app.bsky.embed.record#viewRecord") {
      // Get images from the quoted post's embeds
      let quotedImages = [];
      if (rec.embeds && rec.embeds.length > 0) {
        for (const e of rec.embeds) {
          quotedImages = quotedImages.concat(getEmbedImages(e));
        }
      }
      return {
        did: rec.author.did,
        handle: rec.author.handle,
        displayName: rec.author.displayName || rec.author.handle,
        avatar: rec.author.avatar,
        text: rec.value?.text || "",
        images: quotedImages,
        uri: rec.uri,
      };
    }
  }

  // Record with media (quote + images on the quoting post)
  // The structure is: embed.record.record (nested)
  if (
    embed.$type === "app.bsky.embed.recordWithMedia#view" &&
    embed.record?.record
  ) {
    const rec = embed.record.record;
    if (rec.$type === "app.bsky.embed.record#viewRecord") {
      let quotedImages = [];
      if (rec.embeds && rec.embeds.length > 0) {
        for (const e of rec.embeds) {
          quotedImages = quotedImages.concat(getEmbedImages(e));
        }
      }
      return {
        did: rec.author.did,
        handle: rec.author.handle,
        displayName: rec.author.displayName || rec.author.handle,
        avatar: rec.author.avatar,
        text: rec.value?.text || "",
        images: quotedImages,
        uri: rec.uri,
      };
    }
  }

  return null;
}

// Build node tree from API response
let nodeCount = 0;
function buildTree(thread, parent = null, depth = 0, isReskeetTree = false) {
  if (
    !thread ||
    thread.$type === "app.bsky.feed.defs#blockedPost" ||
    thread.$type === "app.bsky.feed.defs#notFoundPost"
  ) {
    return null;
  }

  // Enforce limits
  if (depth > MAX_DEPTH || nodeCount >= MAX_NODES) {
    return null;
  }
  nodeCount++;

  const post = thread.post;
  const author = post.author;
  const record = post.record;
  const images = getEmbedImages(post.embed);
  const quotedPost = getQuotedPost(post.embed);
  const externalEmbed = getExternalEmbed(post.embed);

  // Height will be measured from DOM later
  const nodeHeight = NODE_MIN_HEIGHT;

  const node = {
    id: post.uri,
    did: author.did,
    handle: author.handle,
    displayName: author.displayName || author.handle,
    avatar: author.avatar,
    text: record.text || "",
    facets: record.facets || [],
    images: images,
    quotedPost: quotedPost,
    externalEmbed: externalEmbed,
    likes: post.likeCount || 0,
    replies: post.replyCount || 0,
    reposts: post.repostCount || 0,
    createdAt: record.createdAt,
    uri: post.uri,
    depth,
    parent,
    children: [],
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height: nodeHeight,
    collapsed: false,
    isReskeetTree: isReskeetTree,
    element: null, // Will hold DOM element
  };

  // Process replies
  if (thread.replies && thread.replies.length > 0) {
    for (const reply of thread.replies) {
      const childNode = buildTree(reply, node, depth + 1, isReskeetTree);
      if (childNode) {
        node.children.push(childNode);
      }
    }
    // Sort replies by creation time
    node.children.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  return node;
}

// Find root of thread (traverse parents) and merge reply trees
// The issue: when we fetch a post that's a reply, the API gives us:
// - The post with its full replies subtree
// - Parent posts with potentially incomplete/different replies arrays
// We need to merge the loaded post's subtree into its parent's replies
function findRoot(thread) {
  if (
    thread.parent &&
    thread.parent.$type !== "app.bsky.feed.defs#blockedPost" &&
    thread.parent.$type !== "app.bsky.feed.defs#notFoundPost"
  ) {
    // Merge current thread into parent's replies to preserve full subtree
    const parent = thread.parent;
    if (!parent.replies) {
      parent.replies = [];
    }

    // Find if this thread exists in parent's replies and replace/add it
    const existingIdx = parent.replies.findIndex(
      (r) => r.post && thread.post && r.post.uri === thread.post.uri,
    );

    if (existingIdx >= 0) {
      // Replace with our more complete version (has full reply subtree)
      parent.replies[existingIdx] = thread;
    } else {
      // Add it if not present
      parent.replies.push(thread);
    }

    return findRoot(parent);
  }
  return thread;
}

// Layout tree nodes
function layoutTree(root) {
  if (!root) return [];

  const allNodes = [];

  // First pass: collect all nodes and calculate subtree widths
  function calcWidth(node) {
    if (node.collapsed || node.children.length === 0) {
      node.subtreeWidth = node.width;
    } else {
      let childrenWidth = 0;
      for (const child of node.children) {
        calcWidth(child);
        childrenWidth += child.subtreeWidth + H_SPACING;
      }
      childrenWidth -= H_SPACING;
      node.subtreeWidth = Math.max(node.width, childrenWidth);
    }
    allNodes.push(node);
  }

  calcWidth(root);

  // Second pass: assign positions
  function positionNode(node, x, y) {
    node.y = y;

    if (node.collapsed || node.children.length === 0) {
      node.x = x + (node.subtreeWidth - node.width) / 2;
    } else {
      let childX = x;
      for (const child of node.children) {
        positionNode(child, childX, y + node.height + V_SPACING);
        childX += child.subtreeWidth + H_SPACING;
      }
      // Center parent over children
      const firstChild = node.children[0];
      const lastChild = node.children[node.children.length - 1];
      node.x =
        (firstChild.x + lastChild.x + lastChild.width) / 2 - node.width / 2;
    }
  }

  positionNode(root, 0, 0);

  return allNodes;
}

// Extract YouTube video ID from various URL formats
function getYouTubeVideoId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Video overlay elements
const videoOverlay = document.getElementById("videoOverlay");
const videoFrame = document.getElementById("videoFrame");
const videoClose = document.getElementById("videoClose");

function showVideoPlayer(videoId) {
  videoFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  videoOverlay.classList.add("visible");
}

function hideVideoPlayer() {
  videoOverlay.classList.remove("visible");
  videoFrame.src = "";
}

videoClose.addEventListener("click", hideVideoPlayer);
videoOverlay.addEventListener("click", (e) => {
  if (e.target === videoOverlay) {
    hideVideoPlayer();
  }
});

// Close video on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && videoOverlay.classList.contains("visible")) {
    hideVideoPlayer();
    e.stopPropagation();
  }
});

// Format time for display
function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  // Show date for older posts
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Convert AT URI to bsky.app URL
function atUriToBskyUrl(uri, handle) {
  const match = uri.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)/);
  if (match) {
    return `https://bsky.app/profile/${handle}/post/${match[2]}`;
  }
  return null;
}

function countDescendants(node) {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}

// Create DOM element for a post node
function createNodeElement(node) {
  const el = document.createElement("div");
  el.className = "post-node";
  if (node.isReskeetTree) {
    el.classList.add("reskeet-tree");
  }
  el.dataset.nodeId = node.id;

  // Build HTML
  let html = `
    <div class="post-header">
      <img class="post-avatar" src="${node.avatar || ""}" alt="" onerror="this.style.background='#1da1f2'">
      <div class="post-author">
        <div class="post-display-name">${escapeHtml(node.displayName.slice(0, 25))}</div>
        <div class="post-handle">@${escapeHtml(node.handle.slice(0, 28))}</div>
      </div>
    </div>
    <div class="post-text">${renderRichText(node.text, node.facets)}</div>
  `;

  // Images
  if (node.images.length > 0) {
    const gridClass = node.images.length === 1 ? "single" : "multiple";
    html += `<div class="post-images ${gridClass}">`;
    for (let i = 0; i < Math.min(4, node.images.length); i++) {
      html += `<img src="${node.images[i].thumb}" alt="${escapeHtml(node.images[i].alt || "")}" loading="lazy">`;
    }
    html += "</div>";
  }

  // External embed
  if (node.externalEmbed) {
    const ext = node.externalEmbed;
    const videoId = getYouTubeVideoId(ext.uri);
    html += `
      <a class="post-external" href="${escapeHtml(ext.uri)}" target="_blank" rel="noopener" ${videoId ? `data-video-id="${videoId}"` : ""}>
        ${ext.thumb ? `<img class="post-external-thumb" src="${ext.thumb}" alt="">` : '<div class="post-external-thumb"></div>'}
        ${videoId ? '<div class="play-button"></div>' : ""}
        <div class="post-external-info">
          ${ext.title ? `<div class="post-external-title">${escapeHtml(ext.title)}</div>` : ""}
          ${ext.description ? `<div class="post-external-desc">${escapeHtml(ext.description.slice(0, 100))}</div>` : ""}
        </div>
      </a>
    `;
  }

  // Quoted post
  if (node.quotedPost) {
    const qp = node.quotedPost;
    html += `
      <div class="post-quote">
        <div class="post-header">
          <img class="post-avatar" src="${qp.avatar || ""}" alt="" onerror="this.style.background='#1da1f2'">
          <div class="post-author">
            <div class="post-display-name">${escapeHtml(qp.displayName.slice(0, 20))}</div>
            <div class="post-handle">@${escapeHtml(qp.handle.slice(0, 20))}</div>
          </div>
        </div>
        <div class="post-text">${escapeHtml(qp.text)}</div>
    `;
    if (qp.images.length > 0) {
      html += '<div class="post-images multiple">';
      for (let i = 0; i < Math.min(3, qp.images.length); i++) {
        html += `<img src="${qp.images[i].thumb}" alt="" loading="lazy">`;
      }
      html += "</div>";
    }
    html += "</div>";
  }

  // Stats
  const timeStr = formatTime(node.createdAt);
  const bskyUrl = atUriToBskyUrl(node.uri, node.handle);
  html += `
    <div class="post-stats">
      <span>♡ ${node.likes}</span>
      <span>⟲ ${node.reposts}</span>
      <span>💬 ${node.replies}</span>
      <span>•</span>
      <a href="${bskyUrl}" target="_blank" rel="noopener">${timeStr}</a>
      ${node.children.length > 0 ? `<span class="post-collapse" data-node-id="${node.id}">${node.collapsed ? `+${countDescendants(node)}` : "−"}</span>` : ""}
    </div>
  `;

  el.innerHTML = html;

  // Handle YouTube video clicks
  const extLink = el.querySelector(".post-external[data-video-id]");
  if (extLink) {
    extLink.addEventListener("click", (e) => {
      e.preventDefault();
      showVideoPlayer(extLink.dataset.videoId);
    });
  }

  // Handle collapse button
  const collapseBtn = el.querySelector(".post-collapse");
  if (collapseBtn) {
    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      node.collapsed = !node.collapsed;
      collapseBtn.textContent = node.collapsed
        ? `+${countDescendants(node)}`
        : "−";
      updateVisibleNodes();
      render();
    });
  }

  // Click to select/center
  el.addEventListener("click", (e) => {
    // Don't handle if clicking a link
    if (e.target.closest("a")) return;
    selectAndCenter(node);
  });

  return el;
}

// Update visible nodes after collapse/expand
function updateVisibleNodes() {
  layoutTree(rootNode);
  nodes = getVisibleNodes(rootNode);

  // Update reskeet trees too
  for (const rt of reskeetTrees) {
    layoutTree(rt.root);
    rt.nodes = getVisibleNodes(rt.root);
  }
  layoutReskeetTrees(nodes);

  // Update DOM - hide/show elements
  updateNodeElements();
}

// Create/update all node DOM elements
function updateNodeElements() {
  // Collect all visible nodes
  let allVisible = [...nodes];
  for (const rt of reskeetTrees) {
    allVisible = allVisible.concat(rt.nodes);
  }

  const visibleIds = new Set(allVisible.map((n) => n.id));

  // Remove elements for nodes that are no longer visible
  for (const el of nodesContainer.querySelectorAll(".post-node")) {
    if (!visibleIds.has(el.dataset.nodeId)) {
      el.remove();
    }
  }

  // Add/update elements for visible nodes
  for (const node of allVisible) {
    if (!node.element || !node.element.parentNode) {
      node.element = createNodeElement(node);
      nodesContainer.appendChild(node.element);
    }

    // Update position
    node.element.style.left = `${node.x}px`;
    node.element.style.top = `${node.y}px`;

    // Set z-index so parents appear above children (prevents overlap issues)
    // Higher depth = lower z-index
    node.element.style.zIndex = 1000 - node.depth;

    // Update selection state
    node.element.classList.toggle("selected", node === selectedNode);

    // Update reskeet target state
    const isReskeetTarget = reskeetTrees.some((rt) => rt.targetNode === node);
    node.element.classList.toggle("reskeet-target", isReskeetTarget);
  }
}

// Create DOM elements for all nodes and measure their heights
function createAndMeasureNodes(root) {
  const allNodes = [];

  function traverse(node) {
    allNodes.push(node);
    for (const child of node.children) {
      traverse(child);
    }
  }
  traverse(root);

  // Create elements and add to DOM (hidden) to measure
  // Reset transform so measurements are accurate
  nodesContainer.style.transform = "none";
  nodesContainer.style.visibility = "hidden";
  nodesContainer.style.display = "block";

  for (const node of allNodes) {
    if (!node.element) {
      node.element = createNodeElement(node);
      node.element.style.position = "absolute";
      node.element.style.left = "0";
      node.element.style.top = "0";
      nodesContainer.appendChild(node.element);
    }
  }

  // Force layout
  nodesContainer.offsetHeight;

  // Measure heights
  for (const node of allNodes) {
    node.height = Math.max(NODE_MIN_HEIGHT, node.element.offsetHeight);
  }

  nodesContainer.style.visibility = "";
}

// Draw rounded rectangle
// Render everything
function render() {
  ctx.clearRect(0, 0, width, height);

  if (nodes.length === 0) {
    nodesContainer.style.display = "none";
    ctx.fillStyle = "#666";
    ctx.font = "16px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "Paste a Bluesky post URL and click Load",
      width / 2,
      height / 2,
    );
    ctx.textAlign = "left";
    return;
  }

  nodesContainer.style.display = "block";

  // Update DOM container transform
  nodesContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;

  // Update node positions in DOM
  updateNodeElements();

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // Draw edges first
  ctx.strokeStyle = "#0f3460";
  ctx.lineWidth = 2;
  for (const node of nodes) {
    if (!node.collapsed) {
      for (const child of node.children) {
        const startX = node.x + node.width / 2;
        const startY = node.y + node.height;
        const endX = child.x + child.width / 2;
        const endY = child.y;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(
          startX,
          startY + V_SPACING / 2,
          endX,
          endY - V_SPACING / 2,
          endX,
          endY,
        );
        ctx.stroke();
      }
    }
  }

  // Draw reskeet tree edges
  for (const reskeetTree of reskeetTrees) {
    ctx.strokeStyle = "#2d4a3e"; // Slightly different color for reskeet trees
    ctx.lineWidth = 2;
    for (const node of reskeetTree.nodes) {
      if (!node.collapsed) {
        for (const child of node.children) {
          const startX = node.x + node.width / 2;
          const startY = node.y + node.height;
          const endX = child.x + child.width / 2;
          const endY = child.y;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.bezierCurveTo(
            startX,
            startY + V_SPACING / 2,
            endX,
            endY - V_SPACING / 2,
            endX,
            endY,
          );
          ctx.stroke();
        }
      }
    }
  }

  // Draw labels above reskeet trees
  for (let i = 0; i < reskeetTrees.length; i++) {
    const reskeetTree = reskeetTrees[i];
    if (reskeetTree.nodes.length === 0) continue;

    // Find the root node (top-most node)
    const rootNode = reskeetTree.root;
    if (rootNode) {
      ctx.fillStyle = "#666";
      ctx.font = "italic 12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `Quoted Thread ${i + 1}`,
        rootNode.x + rootNode.width / 2,
        rootNode.y - 10,
      );
      ctx.textAlign = "left";
    }
  }

  // Draw arcs from quoted posts to their source trees
  for (const reskeetTree of reskeetTrees) {
    if (!reskeetTree.sourceNode || !reskeetTree.targetNode) continue;

    const source = reskeetTree.sourceNode;
    const target = reskeetTree.targetNode;

    // Arc starts from the right side of the source node (where the quote is embedded)
    const startX = source.x + source.width;
    const startY = source.y + source.height * 0.7; // Lower part where quote usually is

    // Arc ends at the left side of the target node
    const endX = target.x;
    const endY = target.y + target.height / 2;

    // Draw a curved arc
    ctx.strokeStyle = "#f59e0b"; // Amber/orange color for the arc
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]); // Dashed line

    const midX = (startX + endX) / 2;
    const arcHeight = Math.min(150, Math.abs(endY - startY) * 0.5 + 50);
    const controlY = Math.min(startY, endY) - arcHeight;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(midX, controlY, endX, endY);
    ctx.stroke();

    // Draw arrow at the end
    ctx.setLineDash([]);
    const angle = Math.atan2(endY - controlY, endX - midX);
    const arrowSize = 12;

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle - Math.PI / 6),
      endY - arrowSize * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle + Math.PI / 6),
      endY - arrowSize * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();

    ctx.setLineDash([]);
  }

  ctx.restore();
}

// Get visible nodes (excluding collapsed children)
function getVisibleNodes(root) {
  const visible = [];
  function traverse(node) {
    visible.push(node);
    if (!node.collapsed) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  if (root) traverse(root);
  return visible;
}

// Find all nodes that have quoted posts (for reskeet visualization)
function findNodesWithQuotes(root) {
  const result = [];
  function traverse(node) {
    if (node.quotedPost?.uri) {
      result.push({ node, quotedUri: node.quotedPost.uri });
    }
    for (const child of node.children) {
      traverse(child);
    }
  }
  if (root) traverse(root);
  return result;
}

// Find a node by URI in a tree
function findNodeByUri(root, uri) {
  if (root.id === uri || root.uri === uri) return root;
  for (const child of root.children) {
    const found = findNodeByUri(child, uri);
    if (found) return found;
  }
  return null;
}

// Load reskeet trees for all quoted posts
async function loadReskeetTrees(mainRoot) {
  reskeetTrees = [];
  const quotedNodes = findNodesWithQuotes(mainRoot);

  // Track which URIs we've already loaded to avoid duplicates
  const loadedUris = new Set();
  // Also track URIs that are already in the main tree
  const mainTreeUris = new Set();
  function collectUris(node) {
    mainTreeUris.add(node.uri);
    for (const child of node.children) {
      collectUris(child);
    }
  }
  collectUris(mainRoot);

  // Helper to mark all nodes in a tree as loaded
  function markLoaded(n) {
    loadedUris.add(n.uri);
    for (const child of n.children) {
      markLoaded(child);
    }
  }

  for (const { node, quotedUri } of quotedNodes) {
    // Skip if this quoted post is already in our main tree
    if (mainTreeUris.has(quotedUri)) continue;
    // Skip if we've already loaded a tree containing this URI
    if (loadedUris.has(quotedUri)) continue;

    try {
      // Parse the AT URI
      const match = quotedUri.match(
        /at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)/,
      );
      if (!match) continue;

      const [, did, postId] = match;

      // Fetch the thread for this quoted post
      const thread = await fetchThread(did, postId);
      const root = findRoot(thread);

      // If we navigated up to a parent, fetch the root's full thread
      let fullRoot = root;
      if (root !== thread && root.post) {
        const rootUri = root.post.uri;
        const rootMatch = rootUri.match(
          /at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)/,
        );
        if (rootMatch) {
          const rootThread = await fetchThread(rootMatch[1], rootMatch[2]);
          fullRoot = rootThread;
        }
      }

      // Build the tree - use a flag to indicate it's a reskeet tree
      // Don't reset nodeCount - we want to limit total nodes across all trees
      const reskeetRoot = buildTree(fullRoot, null, 0, true);

      // Stop loading more reskeet trees if we've hit the limit
      if (nodeCount >= MAX_NODES) break;
      if (!reskeetRoot) continue;

      // Mark all nodes in this tree as loaded
      markLoaded(reskeetRoot);

      // Find the target node (the quoted post) in this tree
      const targetNode = findNodeByUri(reskeetRoot, quotedUri);

      // Create DOM elements and measure heights
      createAndMeasureNodes(reskeetRoot);

      reskeetTrees.push({
        sourceNode: node,
        targetNode: targetNode,
        root: reskeetRoot,
        nodes: [],
      });
    } catch (err) {
      console.log("Failed to load reskeet tree:", quotedUri, err);
    }
  }

  return reskeetTrees;
}

// Layout reskeet trees to the right of the main tree
function layoutReskeetTrees(mainNodes) {
  if (reskeetTrees.length === 0) return;

  // Find the rightmost edge of the main tree
  let maxX = 0;
  for (const node of mainNodes) {
    maxX = Math.max(maxX, node.x + node.width);
  }

  const TREE_GAP = 150; // Gap between trees
  let currentX = maxX + TREE_GAP;

  for (const reskeetTree of reskeetTrees) {
    // Layout this tree
    layoutTree(reskeetTree.root);
    reskeetTree.nodes = getVisibleNodes(reskeetTree.root);

    // Find the min X of this tree
    let minX = Number.POSITIVE_INFINITY;
    for (const node of reskeetTree.nodes) {
      minX = Math.min(minX, node.x);
    }

    // Offset all nodes to position tree at currentX
    const offsetX = currentX - minX;
    for (const node of reskeetTree.nodes) {
      node.x += offsetX;
    }

    // Update currentX for next tree
    let treeMaxX = 0;
    for (const node of reskeetTree.nodes) {
      treeMaxX = Math.max(treeMaxX, node.x + node.width);
    }
    currentX = treeMaxX + TREE_GAP;
  }
}

// Hit test
// Event handlers
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(3, zoom * zoomFactor));

    // Zoom toward mouse position
    panX = mouseX - (mouseX - panX) * (newZoom / zoom);
    panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    zoom = newZoom;

    render();
  },
  { passive: false },
);

canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  dragStartX = e.offsetX;
  dragStartY = e.offsetY;
  dragStartPanX = panX;
  dragStartPanY = panY;
  canvas.style.cursor = "grabbing";
});

canvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
    panX = dragStartPanX + (e.offsetX - dragStartX);
    panY = dragStartPanY + (e.offsetY - dragStartY);
    render();
  }
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
  canvas.style.cursor = "default";
});

// Smooth animation to target pan/zoom
function animateTo(targetPanX, targetPanY, targetZoom) {
  const startPanX = panX;
  const startPanY = panY;
  const startZoom = zoom;
  const duration = 300;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(1, elapsed / duration);
    // Ease out cubic
    const eased = 1 - (1 - progress) ** 3;

    panX = startPanX + (targetPanX - startPanX) * eased;
    panY = startPanY + (targetPanY - startPanY) * eased;
    zoom = startZoom + (targetZoom - startZoom) * eased;

    render();

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

canvas.addEventListener("mouseleave", () => {
  isDragging = false;
  canvas.style.cursor = "default";
});

// Load thread
let rootNode = null;

async function loadThread() {
  const url = urlInput.value.trim();
  if (!url) return;

  loadBtn.disabled = true;
  statusEl.className = "status";
  statusEl.textContent = "Loading...";
  nodes = [];
  nodesContainer.innerHTML = "";
  render();

  try {
    const { handle, postId } = parseUrl(url);
    updateHash(handle, postId);
    statusEl.textContent = "Resolving handle...";

    const did = await resolveHandle(handle);
    statusEl.textContent = "Fetching thread...";

    const thread = await fetchThread(did, postId);
    statusEl.textContent = "Building tree...";

    // Find the root of the conversation
    let root = findRoot(thread);

    // If we navigated up to a parent, fetch the root's full thread
    // to get all reply branches, not just the one we came from
    if (root !== thread && root.post) {
      statusEl.textContent = "Fetching full thread from root...";
      const rootUri = root.post.uri;
      const rootMatch = rootUri.match(
        /at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)/,
      );
      if (rootMatch) {
        const rootThread = await fetchThread(rootMatch[1], rootMatch[2]);
        root = rootThread;
      }
    }

    nodeCount = 0; // Reset node count before building tree

    rootNode = buildTree(root);

    if (!rootNode) {
      throw new Error("Could not build thread tree");
    }

    const limitReached = nodeCount >= MAX_NODES;

    // Create DOM elements and measure heights before layout
    statusEl.textContent = "Measuring nodes...";
    createAndMeasureNodes(rootNode);

    layoutTree(rootNode);
    nodes = getVisibleNodes(rootNode);

    // Select root node
    selectedNode = rootNode;

    statusEl.textContent = `Loaded ${nodes.length} posts. Loading quoted post trees...`;
    render();

    // Load reskeet trees for quoted posts
    await loadReskeetTrees(rootNode);

    // Layout reskeet trees to the right of main tree
    layoutReskeetTrees(nodes);

    // Center the tree (including reskeet trees)
    let allNodes = [...nodes];
    for (const rt of reskeetTrees) {
      allNodes = allNodes.concat(rt.nodes);
    }

    const minX = Math.min(...allNodes.map((n) => n.x));
    const maxX = Math.max(...allNodes.map((n) => n.x + n.width));
    const minY = Math.min(...allNodes.map((n) => n.y));
    const maxY = Math.max(...allNodes.map((n) => n.y + n.height));

    const treeWidth = maxX - minX;
    const treeHeight = maxY - minY;

    // Fit tree in view
    const scaleX = (width - 100) / treeWidth;
    const scaleY = (height - 100) / treeHeight;
    zoom = Math.min(1, Math.min(scaleX, scaleY));

    panX = (width - treeWidth * zoom) / 2 - minX * zoom;
    panY = 50;

    const totalPosts = allNodes.length;
    const reskeetCount = reskeetTrees.length;
    let statusText = `Loaded ${nodes.length} posts`;
    if (reskeetCount > 0) {
      statusText += ` + ${reskeetCount} quoted thread${reskeetCount > 1 ? "s" : ""} (${totalPosts - nodes.length} posts)`;
    }
    if (limitReached) {
      statusText += ` (limited to ${MAX_NODES} nodes)`;
    }
    statusEl.textContent = statusText;
    render();
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = err.message;
    console.error(err);
  } finally {
    loadBtn.disabled = false;
  }
}

loadBtn.addEventListener("click", loadThread);
urlInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    loadThread();
    urlInput.blur();
  }
});

clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  nodes = [];
  rootNode = null;
  selectedNode = null;
  reskeetTrees = [];
  nodesContainer.innerHTML = "";
  statusEl.textContent = "";
  statusEl.className = "status";
  window.history.replaceState(null, "", window.location.pathname);
  panX = 0;
  panY = 0;
  zoom = 1;
  render();
});

shareBtn.addEventListener("click", () => {
  if (window.location.hash) {
    navigator.clipboard.writeText(window.location.href).then(() => {
      notification.classList.add("show");
      setTimeout(() => {
        notification.classList.remove("show");
      }, 1500);
    });
  }
});

// Shortcuts panel
const shortcutsLink = document.getElementById("shortcutsLink");
const shortcutsPanel = document.getElementById("shortcutsPanel");

shortcutsLink.addEventListener("click", () => {
  shortcutsPanel.classList.toggle("visible");
});

// Close panel when clicking outside
document.addEventListener("click", (e) => {
  if (!shortcutsPanel.contains(e.target) && e.target !== shortcutsLink) {
    shortcutsPanel.classList.remove("visible");
  }
});

// Keyboard navigation
let selectedNode = null;

document.addEventListener("keydown", (e) => {
  // Ignore if typing in input
  if (e.target === urlInput) return;

  const PAN_SPEED = 50;

  switch (e.key.toLowerCase()) {
    // WASD for panning
    case "w":
      panY += PAN_SPEED;
      render();
      break;
    case "s":
      panY -= PAN_SPEED;
      render();
      break;
    case "a":
      panX += PAN_SPEED;
      render();
      break;
    case "d":
      panX -= PAN_SPEED;
      render();
      break;

    // HJKL / Arrow keys for tree navigation
    case "h":
    case "arrowleft": // Left sibling
      if (selectedNode?.parent) {
        const siblings = selectedNode.parent.children;
        const idx = siblings.indexOf(selectedNode);
        if (idx > 0) {
          selectAndCenter(siblings[idx - 1]);
        }
      }
      break;
    case "l":
    case "arrowright": // Right sibling
      if (selectedNode?.parent) {
        const siblings = selectedNode.parent.children;
        const idx = siblings.indexOf(selectedNode);
        if (idx < siblings.length - 1) {
          selectAndCenter(siblings[idx + 1]);
        }
      }
      break;
    case "j":
    case "arrowdown": // Middle child
      if (
        selectedNode &&
        selectedNode.children.length > 0 &&
        !selectedNode.collapsed
      ) {
        const midIdx = Math.floor(selectedNode.children.length / 2);
        selectAndCenter(selectedNode.children[midIdx]);
      }
      break;
    case "k":
    case "arrowup": // Parent
      if (selectedNode?.parent) {
        selectAndCenter(selectedNode.parent);
      }
      break;
    case "g": // Jump to root
      if (rootNode) {
        selectAndCenter(rootNode);
      }
      break;
    case "enter": // Zoom to focused node
      if (selectedNode) {
        selectAndCenter(selectedNode);
      }
      break;
    case "?": // Toggle shortcuts panel
      shortcutsPanel.classList.toggle("visible");
      break;
    case "escape": // Close shortcuts panel or zoom to overview
      if (shortcutsPanel.classList.contains("visible")) {
        shortcutsPanel.classList.remove("visible");
      } else if (nodes.length > 0) {
        // Zoom to fit entire tree (including reskeet trees)
        let allNodes = [...nodes];
        for (const rt of reskeetTrees) {
          allNodes = allNodes.concat(rt.nodes);
        }

        const minX = Math.min(...allNodes.map((n) => n.x));
        const maxX = Math.max(...allNodes.map((n) => n.x + n.width));
        const minY = Math.min(...allNodes.map((n) => n.y));
        const maxY = Math.max(...allNodes.map((n) => n.y + n.height));

        const treeWidth = maxX - minX;
        const treeHeight = maxY - minY;

        const scaleX = (width - 100) / treeWidth;
        const scaleY = (height - 100) / treeHeight;
        const targetZoom = Math.min(1, Math.min(scaleX, scaleY));

        const targetPanX =
          (width - treeWidth * targetZoom) / 2 - minX * targetZoom;
        const targetPanY = 50;

        animateTo(targetPanX, targetPanY, targetZoom);
      }
      break;
  }
});

function selectAndCenter(node) {
  selectedNode = node;

  // Calculate zoom to fit the node with padding
  const padding = 80;
  const maxWidth = width - padding * 2;
  const maxHeight = height - padding * 2;

  // Zoom to fit both width and height, capped at 1.5 for comfortable reading
  const zoomToFitWidth = maxWidth / node.width;
  const zoomToFitHeight = maxHeight / node.height;
  const targetZoom = Math.min(1.5, zoomToFitWidth, zoomToFitHeight);

  // Position the node near the top (horizontally centered, vertically near top)
  // Use more padding but clamp so we don't push too far down on small screens
  const topPadding = Math.min(100, height * 0.15);
  const targetPanX = width / 2 - (node.x + node.width / 2) * targetZoom;
  const targetPanY = topPadding - node.y * targetZoom;
  animateTo(targetPanX, targetPanY, targetZoom);
}

// Check for hash on load (format: #handle/postId)
function loadFromHash() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const match = hash.match(/^([^/]+)\/([a-zA-Z0-9]+)$/);
    if (match) {
      const [, handle, postId] = match;
      urlInput.value = `https://bsky.app/profile/${handle}/post/${postId}`;
      loadThread();
    }
  }
}

// Update hash when loading a thread
function updateHash(handle, postId) {
  window.history.replaceState(null, "", `#${handle}/${postId}`);
}

// Listen for hash changes (back/forward navigation)
window.addEventListener("hashchange", loadFromHash);

// Initial render and check for hash
render();
loadFromHash();
