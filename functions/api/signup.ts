export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const { username, password } = await request.json();

  const hash = await hashPassword(password);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
  ).bind(id, username, hash).run();

  return new Response(JSON.stringify({ userId: id }), {
    headers: { "Content-Type": "application/json" }
  });
};

async function hashPassword(pw: string) {
  const data = new TextEncoder().encode(pw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
