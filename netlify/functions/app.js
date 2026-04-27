const LOCAL_KEY = "chatbot-browser-layout-2.0";
const CANVAS_BG_KEY = "chatbot-browser-canvas-bg";
const ADMIN_PIN = "1973";
const NUM_TYPES = 3;
const ADMIN_HOLD_MS = 900;
const GRID_SIZE = 20;
const MIN_WIDTH = 180;
const MIN_HEIGHT = 140;
const DEFAULT_WIDTH = 260;
const DEFAULT_HEIGHT = 200;
const DEFAULT_IMAGE_WIDTH = 280;
const DEFAULT_IMAGE_HEIGHT = 300;
const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const DEFAULT_FONT_SIZE = 14;

const API = {
  uploadImage: "/.netlify/functions/upload-image",
  listImages: "/.netlify/functions/list-images",
  deleteImage: "/.netlify/functions/delete-image",
  imageFile: "/.netlify/functions/image-file"
};

const types = {
  text: { label: "Text", content: "Add text..." },
  image: { label: "Image", content: "Caption..." },
  app: { label: "App", content: "[App chatbot]" },
  price: { label: "Price", content: "[Price chatbot]" },
  contact: { label: "Contact", content: "[Contact chatbot]" }
};

let isAdmin = false;
let cards = [];
let bounceCount = 0;
let sludgeCount = 0;
let mediaLibrary = [];
let targetCardIdForMedia = null;

// ─── Utilities ──────────────────────────────────────────────────────────────

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function snap(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function getNextNumType(current) {
  return (current % NUM_TYPES) + 1;
}

function getToggleLabel(current) {
  return `Theme → ${getNextNumType(current)}`;
}

function getImageUrl(key) {
  return `${API.imageFile}?key=${encodeURIComponent(key)}`;
}

function getMaxZ() {
  return cards.reduce((max, card) => Math.max(max, Number(card.z) || 0), 0);
}

function bringToFront(cardId) {
  const card = cards.find(item => item.id === cardId);
  if (!card) return;
  card.z = getMaxZ() + 1;
}

function clampFontSize(size) {
  const n = Number(size);
  if (!Number.isFinite(n)) return DEFAULT_FONT_SIZE;
  return Math.max(FONT_SIZES[0], Math.min(FONT_SIZES[FONT_SIZES.length - 1], n));
}

function nextFontSize(current, direction) {
  const clamped = clampFontSize(current);
  const idx = FONT_SIZES.reduce((best, val, i) => {
    return Math.abs(val - clamped) < Math.abs(FONT_SIZES[best] - clamped) ? i : best;
  }, 0);
  const next = idx + direction;
  if (next < 0) return FONT_SIZES[0];
  if (next >= FONT_SIZES.length) return FONT_SIZES[FONT_SIZES.length - 1];
  return FONT_SIZES[next];
}

function getSeedPosition(index = cards.length) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: snap(20 + column * 300),
    y: snap(20 + row * 240)
  };
}

// ─── Normalization ───────────────────────────────────────────────────────────

function normalizeImageMeta(meta = {}, fallbackCaption = "") {
  return {
    title: typeof meta.title === "string" ? meta.title : "",
    alt: typeof meta.alt === "string" ? meta.alt : "",
    caption: typeof meta.caption === "string" ? meta.caption : fallbackCaption,
    filename: typeof meta.filename === "string" ? meta.filename : "",
    contentType: typeof meta.contentType === "string" ? meta.contentType : "",
    createdAt: typeof meta.createdAt === "string" ? meta.createdAt : "",
    size: Number(meta.size) > 0 ? Number(meta.size) : 0
  };
}

function normalizeCard(card, index) {
  const kind = card?.kind && types[card.kind] ? card.kind : "text";
  const meta = types[kind];
  const seeded = getSeedPosition(index);
  const width = Number(card?.w ?? card?.width);
  const height = Number(card?.h ?? card?.height);
  const x = Number(card?.x);
  const y = Number(card?.y);
  const numType = Number(card?.numType);
  const defaultWidth = kind === "image" ? DEFAULT_IMAGE_WIDTH : DEFAULT_WIDTH;
  const defaultHeight = kind === "image" ? DEFAULT_IMAGE_HEIGHT : DEFAULT_HEIGHT;
  const content = typeof card?.content === "string"
    ? card.content
    : (typeof card?.preview === "string" ? card.preview : meta.content);

  return {
    id: card?.id ?? createId(),
    kind,
    label: typeof card?.label === "string"
      ? card.label
      : (typeof card?.typeLabel === "string" ? card.typeLabel : meta.label),
    numType: numType >= 1 && numType <= NUM_TYPES ? numType : ((index % NUM_TYPES) + 1),
    x: Number.isFinite(x) ? Math.max(0, snap(x)) : seeded.x,
    y: Number.isFinite(y) ? Math.max(0, snap(y)) : seeded.y,
    w: Math.max(MIN_WIDTH, snap(Number.isFinite(width) ? width : defaultWidth)),
    h: Math.max(kind === "image" ? 180 : MIN_HEIGHT, snap(Number.isFinite(height) ? height : defaultHeight)),
    z: Number(card?.z) > 0 ? Number(card.z) : (index + 1),
    content,
    fontSize: clampFontSize(card?.fontSize ?? DEFAULT_FONT_SIZE),
    imageKey: typeof card?.imageKey === "string" ? card.imageKey : "",
    imageMeta: normalizeImageMeta(card?.imageMeta, content)
  };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function loadCardsFromStorage() {
  try {
    const stored = localStorage.getItem(LOCAL_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    cards = Array.isArray(parsed) ? parsed.map(normalizeCard) : [];
  } catch (error) {
    console.error("Failed to parse saved layout:", error);
    cards = [];
  }
}

function saveCardsToStorage() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(cards));
  } catch (error) {
    console.error("Failed to save layout:", error);
  }
}

function loadCanvasBg() {
  return localStorage.getItem(CANVAS_BG_KEY) || "#f8fafc";
}

function saveCanvasBg(color) {
  localStorage.setItem(CANVAS_BG_KEY, color);
}

function applyCanvasBg(color) {
  const canvas = document.getElementById("cards");
  if (canvas) canvas.style.backgroundColor = color;
  const picker = document.getElementById("canvasBgColor");
  if (picker) picker.value = color;
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function sortCards() {
  cards.sort((a, b) => (a.z || 0) - (b.z || 0));
}

function onCardChange() {
  bounceCount += 1;
  sludgeCount = cards.length;
  updateBridgeUI();
  updateCanvasSize();
}

function updateBridgeUI() {
  document.body.classList.toggle("admin", isAdmin);
  document.getElementById("viewIndicator").textContent = `View: ${isAdmin ? "admin" : "customer"}`;
  document.getElementById("bridgeIndicator").textContent = `Bridge: ${isAdmin ? "on" : "off"}`;
  document.getElementById("gridIndicator").textContent = `Grid: ${GRID_SIZE}px`;
  document.getElementById("bounceCounter").textContent = `Bounces: ${bounceCount}`;
  document.getElementById("sludgeCount").textContent = `Sludge: ${sludgeCount}`;
  document.getElementById("status").classList.toggle("shown", isAdmin);
}

function updateCanvasSize() {
  const wrap = document.getElementById("canvasWrap");
  const canvas = document.getElementById("cards");
  if (!wrap || !canvas) return;

  const viewportWidth = Math.max(wrap.clientWidth - 12, 320);
  const viewportHeight = Math.max(wrap.clientHeight - 12, 520);

  const maxRight = cards.reduce((max, card) => Math.max(max, card.x + card.w + GRID_SIZE * 3), viewportWidth);
  const maxBottom = cards.reduce((max, card) => Math.max(max, card.y + card.h + GRID_SIZE * 3), viewportHeight);

  canvas.style.width = `${maxRight}px`;
  canvas.style.height = `${maxBottom}px`;
  canvas.classList.toggle("empty", cards.length === 0);
}

// ─── Admin mode ───────────────────────────────────────────────────────────────

function closeAdminPrompt() {
  const prompt = document.getElementById("adminPrompt");
  const input = document.getElementById("pinInput");
  prompt.hidden = true;
  input.value = "";
  input.blur();
}

function promptAdmin() {
  if (isAdmin) return;
  const prompt = document.getElementById("adminPrompt");
  const input = document.getElementById("pinInput");
  prompt.hidden = false;
  input.value = "";
  setTimeout(() => input.focus(), 30);
}

function enterAdminMode() {
  isAdmin = true;
  closeAdminPrompt();
  renderAllCards();
  updateBridgeUI();
}

function exitAdminMode() {
  isAdmin = false;
  document.activeElement?.blur?.();
  closeMediaManager();
  renderAllCards();
  updateBridgeUI();
}

function attemptAdminLogin() {
  const pin = document.getElementById("pinInput").value.trim();
  if (pin === ADMIN_PIN) {
    enterAdminMode();
  } else {
    alert("Incorrect PIN.");
  }
}

// ─── Card data mutations ──────────────────────────────────────────────────────

function createCard(kind) {
  const meta = types[kind];
  const seeded = getSeedPosition(cards.length);

  return normalizeCard({
    id: createId(),
    kind,
    label: meta.label,
    content: meta.content,
    x: seeded.x,
    y: seeded.y,
    w: kind === "image" ? DEFAULT_IMAGE_WIDTH : DEFAULT_WIDTH,
    h: kind === "image" ? DEFAULT_IMAGE_HEIGHT : DEFAULT_HEIGHT,
    z: getMaxZ() + 1,
    numType: 1 + (cards.length % NUM_TYPES),
    fontSize: DEFAULT_FONT_SIZE
  }, cards.length);
}

function setCardText(cardId, value) {
  const card = cards.find(item => item.id === cardId);
  if (!card) return;
  card.content = value;
  saveCardsToStorage();
}

function setCardFontSize(cardId, size) {
  const card = cards.find(item => item.id === cardId);
  if (!card) return;
  card.fontSize = clampFontSize(size);
  saveCardsToStorage();
}

function commitLayoutChange() {
  saveCardsToStorage();
  onCardChange();
}

// ─── Drag and resize ─────────────────────────────────────────────────────────

function attachMoveBehavior(handle, card, cardEl) {
  if (!handle) return;

  handle.addEventListener("pointerdown", (event) => {
    if (!isAdmin) return;
    if (event.target.closest("button, input, .resize-handle")) return;

    event.preventDefault();
    bringToFront(card.id);
    cardEl.style.zIndex = String(cards.find(item => item.id === card.id)?.z || card.z || 1);
    saveCardsToStorage();

    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = card.x;
    const originalY = card.y;

    cardEl.classList.add("dragging");
    handle.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      card.x = Math.max(0, snap(originalX + deltaX));
      card.y = Math.max(0, snap(originalY + deltaY));
      cardEl.style.left = `${card.x}px`;
      cardEl.style.top = `${card.y}px`;
      updateCanvasSize();
    };

    const onPointerUp = () => {
      cardEl.classList.remove("dragging");
      handle.releasePointerCapture(event.pointerId);
      commitLayoutChange();
    };

    handle.addEventListener("pointermove", onPointerMove, { passive: true });
    handle.addEventListener("pointerup", onPointerUp, { once: true });
  });
}

function attachResizeBehavior(handle, card, cardEl) {
  if (!handle) return;

  handle.addEventListener("pointerdown", (event) => {
    if (!isAdmin) return;

    event.preventDefault();
    event.stopPropagation();
    bringToFront(card.id);
    cardEl.style.zIndex = String(cards.find(item => item.id === card.id)?.z || card.z || 1);

    const startX = event.clientX;
    const startY = event.clientY;
    const originalW = card.w;
    const originalH = card.h;
    const minHeight = card.kind === "image" ? 180 : MIN_HEIGHT;

    cardEl.classList.add("resizing");
    handle.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      card.w = Math.max(MIN_WIDTH, snap(originalW + deltaX));
      card.h = Math.max(minHeight, snap(originalH + deltaY));
      cardEl.style.width = `${card.w}px`;
      cardEl.style.height = `${card.h}px`;
      updateCanvasSize();
    };

    const onPointerUp = () => {
      cardEl.classList.remove("resizing");
      handle.releasePointerCapture(event.pointerId);
      commitLayoutChange();
    };

    handle.addEventListener("pointermove", onPointerMove, { passive: true });
    handle.addEventListener("pointerup", onPointerUp, { once: true });
  });
}

// ─── Card rendering ───────────────────────────────────────────────────────────

function renderTextCardBody(card) {
  const body = document.createElement("div");
  body.className = "card-body";
  body.setAttribute("data-placeholder", "Type here…");
  body.style.fontSize = `${card.fontSize || DEFAULT_FONT_SIZE}px`;

  if (isAdmin) {
    body.setAttribute("contenteditable", "true");
    body.spellcheck = true;
    // Set textContent only when not empty to preserve placeholder
    if (card.content) body.textContent = card.content;

    body.addEventListener("input", () => {
      setCardText(card.id, body.textContent || "");
    });

    // blur saves but does NOT lock — admin-controls remain accessible
    body.addEventListener("blur", () => {
      commitLayoutChange();
    });
  } else {
    body.setAttribute("contenteditable", "false");
    body.textContent = card.content;
  }

  return body;
}

function renderImageCardBody(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "card-content";

  const stage = document.createElement("div");
  stage.className = "image-stage";

  if (card.imageKey) {
    const image = document.createElement("img");
    image.src = getImageUrl(card.imageKey);
    image.alt = card.imageMeta.alt || card.content || "Uploaded image";
    image.loading = "lazy";
    stage.appendChild(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "image-placeholder";
    placeholder.textContent = isAdmin
      ? "Tap Image to pick from the media library."
      : "No image selected.";
    stage.appendChild(placeholder);
  }

  const meta = document.createElement("div");
  meta.className = "image-meta";
  meta.textContent = card.imageMeta.title || card.imageMeta.filename || "";

  const caption = document.createElement("div");
  caption.className = "card-body";
  caption.setAttribute("data-placeholder", "Caption…");
  caption.style.fontSize = `${card.fontSize || DEFAULT_FONT_SIZE}px`;

  if (isAdmin) {
    caption.setAttribute("contenteditable", "true");
    caption.spellcheck = true;
    if (card.content) caption.textContent = card.content;

    caption.addEventListener("input", () => {
      setCardText(card.id, caption.textContent || "");
    });

    caption.addEventListener("blur", () => {
      commitLayoutChange();
    });
  } else {
    caption.setAttribute("contenteditable", "false");
    caption.textContent = card.content;
  }

  wrapper.appendChild(stage);
  wrapper.appendChild(meta);
  wrapper.appendChild(caption);
  return wrapper;
}

function renderCard(card) {
  const div = document.createElement("article");
  div.className = `card kind-${card.kind} num-${card.numType}`;
  div.dataset.id = card.id;
  div.style.left = `${card.x}px`;
  div.style.top = `${card.y}px`;
  div.style.width = `${card.w}px`;
  div.style.height = `${card.h}px`;
  div.style.zIndex = String(card.z || 1);

  const header = document.createElement("div");
  header.className = "card-header";

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = card.label;

  const grip = document.createElement("div");
  grip.className = "card-grip";
  grip.textContent = isAdmin ? "drag" : "";

  header.appendChild(title);
  header.appendChild(grip);
  div.appendChild(header);

  if (card.kind === "image") {
    div.appendChild(renderImageCardBody(card));
  } else {
    const content = document.createElement("div");
    content.className = "card-content";
    content.appendChild(renderTextCardBody(card));
    div.appendChild(content);
  }

  if (isAdmin) {
    const admin = document.createElement("div");
    admin.className = "admin-controls";

    // Theme toggle
    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.textContent = getToggleLabel(card.numType);
    themeBtn.addEventListener("click", () => {
      card.numType = getNextNumType(card.numType);
      div.className = `card kind-${card.kind} num-${card.numType}`;
      themeBtn.textContent = getToggleLabel(card.numType);
      commitLayoutChange();
    });
    admin.appendChild(themeBtn);

    // Font size controls
    const fontRow = document.createElement("div");
    fontRow.className = "font-size-row";

    const fontDown = document.createElement("button");
    fontDown.type = "button";
    fontDown.textContent = "A−";
    fontDown.title = "Decrease font size";

    const fontLabel = document.createElement("span");
    fontLabel.className = "font-size-label";
    fontLabel.textContent = `${card.fontSize || DEFAULT_FONT_SIZE}px`;

    const fontUp = document.createElement("button");
    fontUp.type = "button";
    fontUp.textContent = "A+";
    fontUp.title = "Increase font size";

    const applyFontToBody = (size) => {
      // Apply to editable body without full re-render
      const body = div.querySelector(".card-body");
      if (body) body.style.fontSize = `${size}px`;
      fontLabel.textContent = `${size}px`;
    };

    fontDown.addEventListener("click", () => {
      const newSize = nextFontSize(card.fontSize || DEFAULT_FONT_SIZE, -1);
      card.fontSize = newSize;
      applyFontToBody(newSize);
      setCardFontSize(card.id, newSize);
    });

    fontUp.addEventListener("click", () => {
      const newSize = nextFontSize(card.fontSize || DEFAULT_FONT_SIZE, 1);
      card.fontSize = newSize;
      applyFontToBody(newSize);
      setCardFontSize(card.id, newSize);
    });

    fontRow.appendChild(fontDown);
    fontRow.appendChild(fontLabel);
    fontRow.appendChild(fontUp);
    admin.appendChild(fontRow);

    // Image button
    if (card.kind === "image") {
      const imageBtn = document.createElement("button");
      imageBtn.type = "button";
      imageBtn.textContent = card.imageKey ? "Change image" : "Pick image";
      imageBtn.addEventListener("click", () => openMediaManager(card.id));
      admin.appendChild(imageBtn);
    }

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      cards = cards.filter(item => item.id !== card.id);
      renderAllCards();
      commitLayoutChange();
    });
    admin.appendChild(deleteBtn);

    div.appendChild(admin);

    // Resize handle — rendered last so z-index stacks above admin-controls
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle";
    div.appendChild(resizeHandle);

    attachMoveBehavior(header, card, div);
    attachResizeBehavior(resizeHandle, card, div);
  }

  return div;
}

function renderAllCards() {
  const container = document.getElementById("cards");
  container.innerHTML = "";
  sortCards();
  for (const card of cards) {
    container.appendChild(renderCard(card));
  }
  updateCanvasSize();
}

function addCard(kind, options = {}) {
  if (!isAdmin) return;
  const meta = types[kind];
  if (!meta) return;
  const card = createCard(kind);
  cards.push(card);
  renderAllCards();
  commitLayoutChange();
  scrollCardIntoView(card.id);
  if (options.openMediaManager) {
    openMediaManager(card.id);
  }
}

function scrollCardIntoView(cardId) {
  setTimeout(() => {
    const element = document.querySelector(`[data-id="${cardId}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, 50);
}

// ─── Media manager ────────────────────────────────────────────────────────────

function setMediaStatus(message, isError = false) {
  const status = document.getElementById("mediaStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function normalizeMediaItem(item) {
  const key = typeof item?.key === "string" ? item.key : "";

  return {
    key,
    url: typeof item?.url === "string" && item.url ? item.url : getImageUrl(key),
    title: typeof item?.title === "string" ? item.title : "",
    alt: typeof item?.alt === "string" ? item.alt : "",
    caption: typeof item?.caption === "string" ? item.caption : "",
    filename: typeof item?.filename === "string" ? item.filename : key,
    contentType: typeof item?.contentType === "string" ? item.contentType : "",
    size: Number(item?.size) > 0 ? Number(item.size) : 0,
    createdAt: typeof item?.createdAt === "string" ? item.createdAt : ""
  };
}

function renderMediaLibrary() {
  const list = document.getElementById("mediaList");
  list.innerHTML = "";

  if (mediaLibrary.length === 0) {
    const empty = document.createElement("div");
    empty.className = "media-empty";
    empty.textContent = "No images yet. Upload one above.";
    list.appendChild(empty);
    return;
  }

  for (const item of mediaLibrary) {
    const article = document.createElement("article");
    article.className = "media-item";

    const thumb = document.createElement("div");
    thumb.className = "media-thumb";

    const img = document.createElement("img");
    img.src = item.url || getImageUrl(item.key);
    img.alt = item.alt || item.title || "Image";
    img.loading = "lazy";
    thumb.appendChild(img);

    const info = document.createElement("div");
    info.className = "media-info";

    const name = document.createElement("strong");
    name.textContent = item.title || item.filename || "Untitled";
    info.appendChild(name);

    if (item.alt) {
      const alt = document.createElement("div");
      alt.textContent = `Alt: ${item.alt}`;
      info.appendChild(alt);
    }

    if (item.caption) {
      const caption = document.createElement("div");
      caption.textContent = `Caption: ${item.caption}`;
      info.appendChild(caption);
    }

    const actions = document.createElement("div");
    actions.className = "media-actions";

    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.textContent = targetCardIdForMedia ? "Use" : "New card";
    useBtn.addEventListener("click", () => applyImageSelection(item));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteImage(item.key));

    actions.appendChild(useBtn);
    actions.appendChild(deleteBtn);

    article.appendChild(thumb);
    article.appendChild(info);
    article.appendChild(actions);
    list.appendChild(article);
  }
}

async function loadMediaLibrary() {
  renderMediaLibrary();
  setMediaStatus("Loading images...");

  try {
    const response = await fetch(API.listImages, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not load the image library.");
    }

    mediaLibrary = Array.isArray(data.images) ? data.images.map(normalizeMediaItem) : [];
    renderMediaLibrary();
    setMediaStatus(mediaLibrary.length ? `${mediaLibrary.length} image(s) ready.` : "No images yet. Upload one above.");
  } catch (error) {
    console.error(error);
    mediaLibrary = [];
    renderMediaLibrary();
    setMediaStatus("Image library available after Netlify deploy.", true);
  }
}

function openMediaManager(cardId = null) {
  if (!isAdmin) return;
  targetCardIdForMedia = cardId;
  document.getElementById("mediaManager").hidden = false;
  document.getElementById("mediaTargetLabel").textContent = cardId
    ? "Choose an image for the selected card, or upload a new one."
    : "Upload a new image or choose one to create a new image card.";
  loadMediaLibrary();
}

function closeMediaManager() {
  document.getElementById("mediaManager").hidden = true;
  targetCardIdForMedia = null;
  setMediaStatus("Library closed.");
}

function applyImageSelection(item) {
  let card = cards.find(entry => entry.id === targetCardIdForMedia);

  if (!card) {
    card = createCard("image");
    cards.push(card);
  }

  bringToFront(card.id);
  card.kind = "image";
  card.label = types.image.label;
  card.imageKey = item.key;
  card.imageMeta = normalizeImageMeta(item, item.caption || card.content || "");

  if (!card.content || card.content === types.image.content) {
    card.content = item.caption || "";
  }

  renderAllCards();
  commitLayoutChange();
  scrollCardIntoView(card.id);
  closeMediaManager();
}

async function deleteImage(key) {
  if (!confirm("Delete this image from the Netlify media store?")) return;

  setMediaStatus("Deleting image...");

  try {
    const response = await fetch(API.deleteImage, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Delete failed.");
    }

    let cardWasUpdated = false;
    for (const card of cards) {
      if (card.imageKey === key) {
        card.imageKey = "";
        card.imageMeta = normalizeImageMeta({}, card.content);
        cardWasUpdated = true;
      }
    }

    mediaLibrary = mediaLibrary.filter(item => item.key !== key);
    renderMediaLibrary();

    if (cardWasUpdated) {
      renderAllCards();
      commitLayoutChange();
    }

    setMediaStatus("Image deleted.");
  } catch (error) {
    console.error(error);
    setMediaStatus(error.message || "Delete failed.", true);
  }
}

async function handleMediaUpload(event) {
  event.preventDefault();

  const fileInput = document.getElementById("imageFileInput");
  const titleInput = document.getElementById("imageTitleInput");
  const altInput = document.getElementById("imageAltInput");
  const captionInput = document.getElementById("imageCaptionInput");
  const file = fileInput.files?.[0];

  if (!file) {
    setMediaStatus("Choose an image file first.", true);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", titleInput.value.trim());
  formData.append("alt", altInput.value.trim());
  formData.append("caption", captionInput.value.trim());

  setMediaStatus("Uploading image...");

  try {
    const response = await fetch(API.uploadImage, {
      method: "POST",
      body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Upload failed.");
    }

    const image = normalizeMediaItem(data.image || {});
    fileInput.value = "";
    titleInput.value = "";
    altInput.value = "";
    captionInput.value = "";

    setMediaStatus("Upload complete.");
    await loadMediaLibrary();

    if (targetCardIdForMedia) {
      applyImageSelection(image);
    }
  } catch (error) {
    console.error(error);
    setMediaStatus(error.message || "Upload failed.", true);
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

function attachButtonListeners() {
  document.getElementById("addText").addEventListener("click", () => addCard("text"));
  document.getElementById("addImage").addEventListener("click", () => addCard("image", { openMediaManager: true }));
  document.getElementById("addApp").addEventListener("click", () => addCard("app"));
  document.getElementById("addPrice").addEventListener("click", () => addCard("price"));
  document.getElementById("addContact").addEventListener("click", () => addCard("contact"));
  document.getElementById("openLibrary").addEventListener("click", () => openMediaManager());

  document.getElementById("exitAdmin").addEventListener("click", exitAdminMode);
  document.getElementById("enterPinBtn").addEventListener("click", attemptAdminLogin);
  document.getElementById("cancelPinBtn").addEventListener("click", closeAdminPrompt);
  document.getElementById("pinInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") attemptAdminLogin();
  });

  document.getElementById("uploadForm").addEventListener("submit", handleMediaUpload);
  document.getElementById("closeMediaBtn").addEventListener("click", closeMediaManager);

  document.getElementById("adminPrompt").addEventListener("click", (event) => {
    if (event.target.id === "adminPrompt") closeAdminPrompt();
  });

  document.getElementById("mediaManager").addEventListener("click", (event) => {
    if (event.target.id === "mediaManager") closeMediaManager();
  });

  // Canvas background colour picker
  document.getElementById("canvasBgColor").addEventListener("input", (event) => {
    const color = event.target.value;
    applyCanvasBg(color);
    saveCanvasBg(color);
  });

  window.addEventListener("resize", updateCanvasSize);
}

function attachAdminListeners() {
  let holdTimer = null;

  function clearHoldTimer() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  document.body.addEventListener("touchstart", (event) => {
    if (isAdmin) return;
    if (!document.getElementById("adminPrompt").hidden) return;
    if (!document.getElementById("mediaManager").hidden) return;

    if (event.touches.length === 2) {
      clearHoldTimer();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!isAdmin) promptAdmin();
      }, ADMIN_HOLD_MS);
    } else {
      clearHoldTimer();
    }
  }, { passive: true });

  document.body.addEventListener("touchmove", clearHoldTimer, { passive: true });
  document.body.addEventListener("touchend", clearHoldTimer);
  document.body.addEventListener("touchcancel", clearHoldTimer);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  loadCardsFromStorage();
  sludgeCount = cards.length;
  renderAllCards();
  updateBridgeUI();
  attachButtonListeners();
  attachAdminListeners();

  // Apply saved canvas background
  applyCanvasBg(loadCanvasBg());
}

init();
