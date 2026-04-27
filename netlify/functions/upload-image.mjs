import { getStore } from "@netlify/blobs";

const STORE_NAME = "chatbot-media";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Netlify Blobs hard limit: 2KB per object metadata.
// All text fields are capped by BYTE length (not char count) to handle
// multi-byte UTF-8 input (emoji, CJK, Arabic = 2-4 bytes per char).
// Budget: filename(180) + contentType(80) + title(180) + alt(280) + caption(300)
// + createdAt(30) + size(10) + JSON structure overhead (~80) ≈ 1160 bytes max.
const META_LIMITS = { filename: 180, contentType: 80, title: 180, alt: 280, caption: 300 };

const _enc = new TextEncoder();
const _dec = new TextDecoder("utf-8", { fatal: false });

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

// Trims by encoded byte length, not character count.
// Prevents multi-byte chars from exceeding the 2KB metadata limit.
function cleanText(value, maxBytes) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const encoded = _enc.encode(trimmed);
  if (encoded.length <= maxBytes) return trimmed;
  // Slice at byte boundary and re-decode; strip any trailing replacement char.
  return _dec.decode(encoded.slice(0, maxBytes)).replace(/\uFFFD$/, "");
}

function buildKey(fileName = "") {
  const safeExt = fileName.includes(".")
    ? `.${fileName.split(".").pop().replace(/[^a-z0-9]/gi, "").toLowerCase()}`
    : "";

  return `images/${Date.now()}-${crypto.randomUUID()}${safeExt}`;
}

export default async function uploadImage(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return json({ error: "No image file received." }, { status: 400 });
    }

    if (!String(file.type || "").startsWith("image/")) {
      return json({ error: "Only image uploads are allowed." }, { status: 400 });
    }

    if (Number(file.size) > MAX_FILE_SIZE) {
      return json({ error: "Image exceeds the 10MB limit." }, { status: 400 });
    }

    const metadata = {
      filename: cleanText(file.name, META_LIMITS.filename),
      contentType: cleanText(file.type, META_LIMITS.contentType) || "application/octet-stream",
      size: Number(file.size) || 0,
      title: cleanText(formData.get("title"), META_LIMITS.title),
      alt: cleanText(formData.get("alt"), META_LIMITS.alt),
      caption: cleanText(formData.get("caption"), META_LIMITS.caption),
      createdAt: new Date().toISOString()
    };

    const key = buildKey(file.name);
    const store = getStore({ name: STORE_NAME, consistency: "strong" });

    await store.set(key, file, { metadata });

    return json({
      ok: true,
      image: {
        key,
        url: `/.netlify/functions/image-file?key=${encodeURIComponent(key)}`,
        ...metadata
      }
    });
  } catch (error) {
    console.error("upload-image failed", error);
    return json({ error: "Upload failed." }, { status: 500 });
  }
}
