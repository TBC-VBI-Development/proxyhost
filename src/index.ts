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

    // Serve inline UI
    if (pathname === "/") {
      return new Response(HOME_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    if (pathname === "/styles.css") {
      return new Response(STYLES_CSS, {
        headers: { "Content-Type": "text/css; charset=utf-8" }
      });
    }

    if (pathname === "/app.js") {
      return new Response(APP_JS, {
        headers: { "Content-Type": "application/javascript; charset=utf-8" }
      });
    }

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
// Inline UI
// ---------------------------

const HOME_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>ProxyHost</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <h1>ProxyHost</h1>

  <div class="card">
    <h2>Create Account</h2>
    <input id="su-user" placeholder="Username">
    <input id="su-pass" placeholder="Password" type="password">
    <button onclick="signup()">Sign Up</button>
  </div>

  <div class="card">
    <h2>Login</h2>
    <input id="li-user" placeholder="Username">
    <input id="li-pass" placeholder="Password" type="password">
    <button onclick="login()">Login</button>
  </div>

  <div class="card">
    <h2>Generate Site</h2>
    <textarea id="prompt" placeholder="Describe your site..."></textarea>
    <button onclick="generateSite()">Generate</button>
  </div>

  <div class="card">
    <h2>Upload HTML</h2>
    <input id="file" type="file" accept=".html">
    <input id="siteName" placeholder="Site name">
    <button onclick="uploadSite()">Upload</button>
  </div>

  <script src="/app.js"></script>
</body>
</html>
`;

const STYLES_CSS = `
body {
  background: #0f172a;
  color: white;
  font-family: system-ui, sans-serif;
  padding: 40px;
}
h1 { font-size: 32px; margin-bottom: 20px; }
.card {
  background: #1e293b;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  max-width: 400px;
}
input, textarea {
  width: 100%;
  margin: 6px 0;
  padding: 10px;
  border-radius: 6px;
  border: none;
}
button {
  margin-top: 10px;
  padding: 10px 16px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
}
button:hover { background: #2563eb; }
`;

const APP_JS = `
async function signup() {
  const username = document.getElementById("su-user").value;
  const password = document.getElementById("su-pass").value;

  const res = await fetch("/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  alert(await res.text());
}

async function login() {
  const username = document.getElementById("li-user").value;
  const password = document.getElementById("li-pass").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  alert(await res.text());
}

async function generateSite() {
  const prompt = document.getElementById("prompt").value;

  const res = await fetch("/api/generate-site", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  alert("Generated HTML length: " + data.html.length);
}

async function uploadSite() {
  const file = document.getElementById("file").files[0];
  const siteName = document.getElementById("siteName").value;

  const form = new FormData();
  form.append("file", file);
  form.append("siteName", siteName);
  form.append("userId", "demo-user"); // replace with real login later

  const res = await fetch("/api/upload", {
    method: "POST",
    body: form
  });

  alert(await res.text());
}
`;

// ---------------------------
// Helpers + API + Hosting
// ---------------------------
// (Your existing code stays exactly the same below this line)

function corsMissing prompt" }, 400);

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
