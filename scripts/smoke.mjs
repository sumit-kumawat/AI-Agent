// End-to-end check against a running server: register, sign in, list models,
// chat with one model, switch to another, confirm history and the stored model,
// then delete the test conversation.
const base = (process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const email = `smoke-${Date.now()}@example.com`;
const password = "smoke-test-password";
const jar = new Map();

function remember(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader() {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function call(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    ...init,
    headers: { cookie: cookieHeader(), origin: base, ...(init.headers ?? {}) },
  });
  remember(response);
  return response;
}

function check(condition, label) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
  console.log(`ok   ${label}`);
}

const json = { "content-type": "application/json" };

async function chat(conversationId, messages, model) {
  const started = Date.now();
  const response = await call("/api/chat", {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      conversationId,
      id: conversationId,
      trigger: "submit-message",
      messages,
      ...(model ? { model } : {}),
    }),
  });
  check(response.status === 200, `chat request accepted${model ? ` (${model})` : ""}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let chunks = 0;
  let firstTokenMs = null;
  let assistantId = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      const part = JSON.parse(payload);
      if (part.type === "start" && part.messageId) assistantId = part.messageId;
      if (part.type === "text-delta" && typeof part.delta === "string") {
        firstTokenMs ??= Date.now() - started;
        text += part.delta;
        chunks += 1;
      }
      if (part.type === "error") check(false, `stream error: ${part.errorText}`);
    }
  }
  check(chunks > 0, `streamed ${chunks} chunks, first token after ${firstTokenMs} ms`);
  console.log(`     reply: ${text.trim().replace(/\s+/g, " ").slice(0, 100)}`);
  return { id: assistantId ?? crypto.randomUUID(), text };
}

const health = await call("/api/health");
const healthBody = await health.json();
check(health.status === 200, `health (${healthBody.models?.length ?? 0} models)`);

const registered = await call("/api/register", {
  method: "POST",
  headers: json,
  body: JSON.stringify({ name: "Smoke Test", email, password }),
});
check(registered.status === 201, "register");

const duplicate = await call("/api/register", {
  method: "POST",
  headers: json,
  body: JSON.stringify({ name: "Smoke Test", email, password }),
});
check(duplicate.status === 409, "duplicate email rejected");

const csrf = await (await call("/api/auth/csrf")).json();
const login = await call("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    callbackUrl: "/chat",
  }),
});
check(
  login.status === 302 && [...jar.keys()].some((key) => key.endsWith("session-token")),
  "sign in",
);

const modelsResponse = await call("/api/models");
const { models } = await modelsResponse.json();
check(modelsResponse.status === 200 && models.length > 0, `list models (${models.map((m) => m.name).join(", ")})`);
const bySize = [...models].sort((a, b) => a.size - b.size);
const first = process.env.SMOKE_MODEL ?? bySize[0].name;
const second = bySize.find((model) => model.name !== first)?.name ?? first;

const created = await call("/api/conversations", {
  method: "POST",
  headers: json,
  body: JSON.stringify({ model: first }),
});
check(created.status === 201, "create conversation");
const { id, model: createdModel } = await created.json();
check(createdModel === first, `conversation stores model (${createdModel})`);

const userOne = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "Reply with exactly: harbor smoke ok" }] };
const replyOne = await chat(id, [userOne]);

const userTwo = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "Now say: switched" }] };
await chat(
  id,
  [userOne, { id: replyOne.id, role: "assistant", parts: [{ type: "text", text: replyOne.text }] }, userTwo],
  second,
);

const missing = await call("/api/chat", {
  method: "POST",
  headers: json,
  body: JSON.stringify({ conversationId: id, messages: [userOne], model: "not-installed:1b" }),
});
check(missing.status === 400, "unknown model rejected");

await new Promise((resolve) => setTimeout(resolve, 300));
const saved = await (await call(`/api/conversations/${id}`)).json();
check(
  saved.messages.length === 4 &&
    saved.messages[0].id === userOne.id &&
    saved.messages[2].id === userTwo.id &&
    saved.messages[3].role === "assistant",
  "all four messages saved in order",
);
check(saved.model === second, `conversation switched to ${saved.model}`);
check(saved.title !== "New chat", `title set ("${saved.title}")`);

const deleted = await call(`/api/conversations/${id}`, { method: "DELETE" });
check(deleted.status === 204, "delete conversation");

const removed = await call("/api/account", {
  method: "DELETE",
  headers: json,
  body: JSON.stringify({ password }),
});
check(removed.status === 204, "delete test account");

console.log("\nSmoke test passed.");
