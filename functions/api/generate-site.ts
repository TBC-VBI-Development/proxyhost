export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const { prompt } = await request.json();

  const result = await env.AI.run(env.AI_MODEL, {
    messages: [
      { role: "system", content: "Generate full HTML pages." },
      { role: "user", content: prompt }
    ]
  });

  return new Response(JSON.stringify({ html: result.response }), {
    headers: { "Content-Type": "application/json" }
  });
};
