export const onRequest: PagesFunction = async ({ params, env }) => {
  const user = params.user as string;
  const site = params.site as string;
  const path = (params.path as string) || "index.html";

  // R2 key format:
  // sites/<user>/<site>/<path>
  const key = `sites/${user}/${site}/${path}`;

  const object = await env.SITES_BUCKET.get(key);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": guessContentType(path),
      "Cache-Control": "public, max-age=300"
    }
  });
};

// --- Helpers ---

function guessContentType(path: string): string {
  const lower = path.toLowerCase();

  if (lower.endsWith(".html") || lower.endsWith(".htm"))
    return "text/html; charset=utf-8";
  if (lower.endsWith(".css"))
    return "text/css; charset=utf-8";
  if (lower.endsWith(".js"))
    return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json"))
    return "application/json; charset=utf-8";
  if (lower.endsWith(".png"))
    return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
    return "image/jpeg";
  if (lower.endsWith(".gif"))
    return "image/gif";
  if (lower.endsWith(".svg"))
    return "image/svg+xml";
  if (lower.endsWith(".ico"))
    return "image/x-icon";
  if (lower.endsWith(".txt"))
    return "text/plain; charset=utf-8";

  return "application/octet-stream";
}
