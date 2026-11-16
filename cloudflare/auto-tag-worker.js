const ALLOWED_ORIGIN = "https://toxinhub.github.io";
const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MAX_NOTE_CHARS = 6000;

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "vary": "Origin"
    }
  });
}

async function verifyFirebaseToken(idToken, apiKey) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) throw new Error("invalid-token");
  const data = await response.json();
  const account = data.users?.[0];
  if (!account?.localId || account.localId.length > 128) throw new Error("invalid-token");
  return account.localId;
}

function parseModelText(result) {
  const text = typeof result === "string" ? result : (result?.response || result?.result || result?.text || "");
  if (Array.isArray(text)) return text.join("");
  return String(text || "").trim().replace(/^`{3}(?:json)?\s*/i, "").replace(/\s*`{3}$/i, "");
}

function cleanTags(value) {
  const source = Array.isArray(value) ? value : value?.tags;
  if (!Array.isArray(source)) return [];
  const seen = new Set();
  return source.map(item => String(item).trim().replace(/\s+/g, " ").toLowerCase())
    .filter(tag => tag && tag.length <= 24 && !/[#<>]/.test(tag) && !seen.has(tag) && seen.add(tag))
    .slice(0, 4);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) return json({ error: "origin-not-allowed" }, 403, ALLOWED_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": ALLOWED_ORIGIN,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "86400",
        "vary": "Origin"
      }
    });
    if (request.method !== "POST") return json({ error: "method-not-allowed" }, 405);
    if (!env.FIREBASE_WEB_API_KEY || !env.AI || !env.AUTOTAG_LIMITER) return json({ error: "service-not-configured" }, 503);

    const authorization = request.headers.get("Authorization") || "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch || tokenMatch[1].length > 5000) return json({ error: "authentication-required" }, 401);

    let payload;
    try {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 12000) return json({ error: "payload-too-large" }, 413);
      payload = await request.json();
    } catch {
      return json({ error: "invalid-json" }, 400);
    }
    const note = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!note || note.length > MAX_NOTE_CHARS) return json({ error: "invalid-note" }, 400);

    let uid;
    try {
      uid = await verifyFirebaseToken(tokenMatch[1], env.FIREBASE_WEB_API_KEY);
    } catch {
      return json({ error: "invalid-authentication" }, 401);
    }

    const limit = await env.AUTOTAG_LIMITER.limit({ key: uid });
    if (!limit.success) return json({ error: "rate-limited" }, 429);

    const prompt = [
      "You are a precise topic-tagging assistant for a personal notebook.",
      "Return only a JSON array containing 1 to 4 short topic tags. No markdown or explanation.",
      "Use the same language as the note where natural. English tags must be lowercase.",
      "Prefer specific, reusable topic labels. Do not add hashtags.",
      "Do not infer sensitive personal traits or invent context.",
      "Avoid generic tags such as note, text, general, miscellaneous, or personal.",
      "Each tag must be at most 24 characters.",
      "NOTE:",
      note
    ].join("\n");

    try {
      const result = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: "Classify note topics. Output only a JSON array of short strings." },
          { role: "user", content: prompt }
        ],
        max_tokens: 128,
        temperature: 0.2
      });
      let tags = [];
      try {
        tags = cleanTags(JSON.parse(parseModelText(result)));
      } catch {
        const raw = parseModelText(result);
        const match = raw.match(/\[[\s\S]*?\]/);
        if (match) {
          try { tags = cleanTags(JSON.parse(match[0])); } catch {}
        }
      }
      return json({ tags });
    } catch (error) {
      console.error("Workers AI inference failed", error?.message || "unknown");
      return json({ error: "tagging-unavailable" }, 502);
    }
  }
};
