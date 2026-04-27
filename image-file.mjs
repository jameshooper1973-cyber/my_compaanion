import { getStore } from "@netlify/blobs";

const STORE_NAME = "chatbot-media";

function cleanKey(value) {
  if (typeof value !== "string") return "";
  const key = value.trim();

  if (!key.startsWith("images/") || key.includes("..")) {
    return "";
  }

  return key;
}

export default async function imageFile(request) {
  if (request.method !== "GET") {
    return new Response("Method not allowed.", { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const key = cleanKey(url.searchParams.get("key"));

    if (!key) {
      return new Response("Missing image key.", { status: 400 });
    }

    // consistency belongs on getStore, not on individual calls
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const entry = await store.getWithMetadata(key, { type: "arrayBuffer" });

    if (!entry) {
      return new Response("Image not found.", { status: 404 });
    }

    const metadata = entry.metadata || {};
    const contentType = typeof metadata.contentType === "string" && metadata.contentType
      ? metadata.contentType
      : "application/octet-stream";

    const headers = new Headers({
      "content-type": contentType,
      "content-length": String(entry.data.byteLength),
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff"
    });

    if (typeof metadata.filename === "string" && metadata.filename) {
      const safeName = metadata.filename.replace(/[\r\n"]/g, "");
      headers.set("content-disposition", `inline; filename="${safeName}"`);
    }

    return new Response(entry.data, { headers });
  } catch (error) {
    console.error("image-file failed", error);
    return new Response("Could not read image.", { status: 500 });
  }
}
