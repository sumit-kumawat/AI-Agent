// End-to-end check against a running server: register, sign in, chat with the
// model, confirm both messages were saved, then delete the test conversation.
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
    headers: { cookie: cookieHeader(), ...(init.headers ?? {}) },
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

const health = await call("/api/health");
const healthBody = await health.json();
check(health.status === 200, `health (${JSON.stringify(healthBody)})`);

const registered = await call("/api/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Test", email, password }),
});
check(registered.status === 201, "register");

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

const created = await call("/api/conversations", { method: "POST" });
check(created.status === 201, "create conversation");
const { id } = await created.json();

const userMessageId = crypto.randomUUID();
const started = Date.now();
const chat = await call("/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    conversationId: id,
    id,
    trigger: "submit-message",
    messages: [
      {
        id: userMessageId,
        role: "user",
        parts: [{ type: "text", text: "Reply with exactly: harbor smoke ok" }],
      },
    ],
  }),
});
check(chat.status === 200, "chat request accepted");

const reader = chat.body.getReader();
const decoder = new TextDecoder();
let streamed = "";
let chunks = 0;
let firstTokenMs = null;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const line of decoder.decode(value, { stream: true }).split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") continue;
    try {
      const part = JSON.parse(payload);
      if (part.type === "text-delta" && typeof part.delta === "string") {
        firstTokenMs ??= Date.now() - started;
        streamed += part.delta;
        chunks += 1;
      }
      if (part.type === "error") check(false, `stream error: ${part.errorText}`);
    } catch {
      // partial line split across reads
    }
  }
}
check(chunks > 1, `streamed ${chunks} chunks, first token after ${firstTokenMs} ms`);
console.log(`     reply: ${streamed.trim().slice(0, 120)}`);

await new Promise((resolve) => setTimeout(resolve, 300));
const saved = await (await call(`/api/conversations/${id}`)).json();
check(
  saved.messages.length === 2 &&
    saved.messages[0].id === userMessageId &&
    saved.messages[1].role === "assistant" &&
    saved.messages[1].content.length > 0,
  "both messages saved in order",
);
check(saved.title !== "New chat", `title set ("${saved.title}")`);

const deleted = await call(`/api/conversations/${id}`, { method: "DELETE" });
check(deleted.status === 204, "delete conversation");

console.log(`\nSmoke test passed. Test account left behind: ${email}`);
