export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const form = await request.formData();
  const userId = form.get("userId");
  const siteId = crypto.randomUUID();
  const file = form.get("file") as File;

  await env.SITES_BUCKET.put(
    `sites/${userId}/${siteId}/index.html`,
    file.stream(),
    { httpMetadata: { contentType: "text/html" } }
  );

  return new Response(JSON.stringify({ siteId }), {
    headers: { "Content-Type": "application/json" }
  });
};
