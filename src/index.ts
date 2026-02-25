export interface Env {
  DB: D1Database;
  SITES_BUCKET: R2Bucket;
  AI: Ai; 
  AI_MODEL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // Auth
    if (pathname === "/api/signup" && request.method === "POST") {
      return signup(request, env);
    }
    if (pathname === "/api/login" && request.method === "POST") {
      return login(request, env);
    }

    // AI site generation
    if (pathname === "/api/generate-site" && request.method === "POST") {
      return generateSite(request, env);
    }

    // Upload
    if (pathname === "/api/upload" && request.method === "POST") {
      return uploadSite(request, env);
    }

    // Static hosting
    if (pathname.startsWith("/site/")) {
      return serveSite(request, env);
    }

    return new Response("Not found", { status: 404 });
  }
};

// ---------------------------
// Helpers
// ---------------------------

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

async function hashPassword(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

// ---------------------------
// Auth
// ---------------------------

async function signup(request: Request, env: Env): Promise<Response> {
  const { username, password } = await request.json();

  if (!username || !password) {
    return json({ error: "Missing username or password" }, 400);
  }

  const existing = await env.DB
    .prepare("SELECT id FROM users WHERE username = ?")
    .bind(username)
    .first();

  if (existing) {
    return json({ error: "Username already taken" }, 400);
  }

  const userId = crypto.randomUUID();
  const password_hash = await hashPassword(password);

  await env.DB
    .prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
    .bind(userId, username, password_hash)
    .run();

  return json({ userId });
}

async function login(request: Request, env: Env): Promise<Response> {
  const { username, password } = await request.json();

  const row = await env.DB
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string; password_hash: string }>();

  if (!row) return json({ error: "Invalid credentials" }, 401);

  const ok = (await hashPassword(password)) === row.password_hash;
  if (!ok) return json({ error: "Invalid credentials" }, 401);

  return json({ userId: row.id });
}

// ---------------------------
// AI Site Generation
// ---------------------------

async function generateSite(request: Request, env: Env): Promise<Response> {
  const { prompt } = await request.json();

  if (!prompt) return json({ error: "Missing prompt" }, 400);

  const result = await env.AI.run(env.AI_MODEL, {
    messages: [
      { role: "system", content: "Generate full HTML pages." },
      { role: "user", content: prompt }
    ]
  });

  const html =
    typeof result === "string"
      ? result
      : result.response ?? "<h1>AI generation failed</h1>";

  return json({ html });
}

// ---------------------------
// Upload Site
// ---------------------------

async function uploadSite(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const userId = form.get("userId")?.toString();
  const siteName = form.get("siteName")?.toString();
  const file = form.get("file") as File | null;

  if (!userId || !siteName || !file) {
    return json({ error: "Missing userId, siteName, or file" }, 400);
  }

  const siteId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB
    .prepare("INSERT INTO sites (id, user_id, name, created_at) VALUES (?, ?, ?, ?)")
    .bind(siteId, userId, siteName, createdAt)
    .run();

  await env.SITES_BUCKET.put(
    `sites/${userId}/${siteId}/index.html`,
    file.stream(),
    { httpMetadata: { contentType: "text/html; charset=utf-8" } }
  );

  return json({ siteId, url: `/site/${userId}/${siteId}/` });
}

// ---------------------------
// Serve Static Site
// ---------------------------

async function serveSite(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  const [, userId, siteId, ...rest] = parts;
  const path = rest.join("/") || "index.html";

  const key = `sites/${userId}/${siteId}/${path}`;
  const object = await env.SITES_BUCKET.get(key);

  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": guessContentType(path),
      "Cache-Control": "public, max-age=300"
    }
  });
}
