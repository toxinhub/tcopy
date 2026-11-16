import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/auto-tag-worker.js";

const ORIGIN = "https://toxinhub.github.io";
const URL = "https://tcopy-auto-tag.test/";
const TOKEN = "valid-firebase-token";

function request({ method = "POST", body, origin = ORIGIN, token = TOKEN } = {}) {
  const headers = new Headers();
  if (origin !== null) headers.set("Origin", origin);
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(URL, { method, headers, body });
}

function env(overrides = {}) {
  return {
    FIREBASE_WEB_API_KEY: "test-web-api-key",
    AI: { run: async () => ({ response: '["planning","research"]' }) },
    AUTOTAG_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides
  };
}

async function withFetch(stub, run) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try { await run(); } finally { globalThis.fetch = original; }
}

async function identityFetch() {
  return new Response(JSON.stringify({ users: [{ localId: "uid-test-123" }] }), {
    status: 200, headers: { "content-type": "application/json" }
  });
}

test("answers CORS preflight only for the allowed origin", async () => {
  const response = await worker.fetch(request({ method: "OPTIONS", body: undefined }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
});

test("rejects foreign origins", async () => {
  const response = await worker.fetch(request({ origin: "https://evil.example", body: "{}" }), env());
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin-not-allowed" });
});

test("rejects non-POST methods", async () => {
  const response = await worker.fetch(request({ method: "GET" }), env());
  assert.equal(response.status, 405);
});

test("rejects missing Firebase bearer token", async () => {
  const response = await worker.fetch(request({ token: null, body: JSON.stringify({ text: "hello" }) }), env());
  assert.equal(response.status, 401);
});

test("rejects malformed JSON", async () => {
  const response = await worker.fetch(request({ body: "{" }), env());
  assert.equal(response.status, 400);
});

test("enforces the actual request-body byte limit", async () => {
  const response = await worker.fetch(request({ body: JSON.stringify({ text: "x".repeat(12020) }) }), env());
  assert.equal(response.status, 413);
});

test("rejects invalid Firebase tokens before rate limiting or inference", async () => {
  await withFetch(async () => new Response("{}", { status: 401 }), async () => {
    let limited = false;
    const response = await worker.fetch(request({ body: JSON.stringify({ text: "A useful note" }) }), env({
      AUTOTAG_LIMITER: { limit: async () => { limited = true; return { success: true }; } }
    }));
    assert.equal(response.status, 401);
    assert.equal(limited, false);
  });
});

test("returns sanitized tags for an authenticated note", async () => {
  await withFetch(identityFetch, async () => {
    let rateKey = "";
    let model = "";
    const response = await worker.fetch(request({ body: JSON.stringify({ text: "Researching a project plan" }) }), env({
      AUTOTAG_LIMITER: { limit: async ({ key }) => { rateKey = key; return { success: true }; } },
      AI: { run: async (name, input) => {
        model = name;
        assert.match(input.messages[1].content, /Researching a project plan/);
        return { response: '["Planning","planning","Research","this tag is much too long to fit"]' };
      } }
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { tags: ["planning", "research"] });
    assert.equal(rateKey, "uid-test-123");
    assert.equal(model, "@cf/google/gemma-4-26b-a4b-it");
  });
});

test("blocks inference when the per-user rate limit is reached", async () => {
  await withFetch(identityFetch, async () => {
    let called = false;
    const response = await worker.fetch(request({ body: JSON.stringify({ text: "A note" }) }), env({
      AUTOTAG_LIMITER: { limit: async () => ({ success: false }) },
      AI: { run: async () => { called = true; return { response: "[]" }; } }
    }));
    assert.equal(response.status, 429);
    assert.equal(called, false);
  });
});

test("fails closed when the rate limiter is unavailable", async () => {
  await withFetch(identityFetch, async () => {
    let called = false;
    const response = await worker.fetch(request({ body: JSON.stringify({ text: "A note" }) }), env({
      AUTOTAG_LIMITER: { limit: async () => { throw new Error("unavailable"); } },
      AI: { run: async () => { called = true; return { response: "[]" }; } }
    }));
    assert.equal(response.status, 503);
    assert.equal(called, false);
  });
});

test("returns a safe error when AI inference fails", async () => {
  await withFetch(identityFetch, async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const response = await worker.fetch(request({ body: JSON.stringify({ text: "A note" }) }), env({
        AI: { run: async () => { throw new Error("provider failed"); } }
      }));
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: "tagging-unavailable" });
    } finally { console.error = originalError; }
  });
});
