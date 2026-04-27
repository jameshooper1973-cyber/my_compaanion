import { getStore } from "@netlify/blobs";

const STORE_NAME = "chatbot-media";

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

export default async function listImages(request) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const { blobs } = await store.list({ prefix: "images/" });

    const images = await Promise.all(
      blobs.map(async (blob) => {
        // getMetadata returns { etag, metadata } | null — only access .metadata
        const metaEntry = await store.getMetadata(blob.key);
        const metadata = metaEntry?.metadata ?? {};

        return {
          key: blob.key,
          url: `/.netlify/functions/image-file?key=${encodeURIComponent(blob.key)}`,
          title: typeof metadata.title === "string" ? metadata.title : "",
          alt: typeof metadata.alt === "string" ? metadata.alt : "",
          caption: typeof metadata.caption === "string" ? metadata.caption : "",
          filename: typeof metadata.filename === "string" ? metadata.filename : "",
          contentType: typeof metadata.contentType === "string" ? metadata.contentType : "",
          createdAt: typeof metadata.createdAt === "string" ? metadata.createdAt : "",
          size: Number(metadata.size) > 0 ? Number(metadata.size) : 0,
          etag: blob.etag
        };
      })
    );

    images.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return json({ ok: true, images });
  } catch (error) {
    console.error("list-images failed", error);
    return json({ error: "Could not list images." }, { status: 500 });
  }
}
