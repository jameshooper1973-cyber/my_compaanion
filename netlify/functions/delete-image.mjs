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

function cleanKey(value) {
  if (typeof value !== "string") return "";
  const key = value.trim();

  if (!key.startsWith("images/") || key.includes("..")) {
    return "";
  }

  return key;
}

export default async function deleteImage(request) {
  if (!["POST", "DELETE"].includes(request.method)) {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    let payload = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    }

    const key = cleanKey(payload.key);
    if (!key) {
      return json({ error: "Missing image key." }, { status: 400 });
    }

    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    await store.delete(key);

    return json({ ok: true, key });
  } catch (error) {
    console.error("delete-image failed", error);
    return json({ error: "Could not delete image." }, { status: 500 });
  }
}
