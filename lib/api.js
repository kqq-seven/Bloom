const encoder = new TextEncoder();
const cookieName = "bloom_session";
const sessionSeconds = 30 * 24 * 60 * 60;
const maxStateBytes = 2 * 1024 * 1024;

export const emptyState = {
  tasks: [],
  schedule: [],
  items: [],
  notes: [],
  meals: [],
  mood: null,
  moments: [],
  journal: ["", "", ""],
  cycle: { start: "", end: "", reminder: false },
  milestones: [],
};

export function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export async function readJson(request) {
  if (Number(request.headers.get("Content-Length") || 0) > maxStateBytes) return null;
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value) {
  return Uint8Array.from(value.match(/.{2}/g) || [], byte => Number.parseInt(byte, 16));
}

async function derivePasswordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations: 310000 },
    key,
    256,
  );
  return toHex(result);
}

function equalHex(left, right) {
  const a = fromHex(left);
  const b = fromHex(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function tokenHash(token) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}

function cookieValue(request) {
  const cookies = request.headers.get("Cookie") || "";
  const entry = cookies.split(";").map(value => value.trim()).find(value => value.startsWith(cookieName + "="));
  return entry ? decodeURIComponent(entry.slice(cookieName.length + 1)) : "";
}

function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return cookieName + "=" + encodeURIComponent(token) + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + sessionSeconds + secure;
}

export function clearSessionCookie() {
  return cookieName + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
}

export async function currentUser(request, env) {
  const token = cookieValue(request);
  if (!token) return null;
  const digest = await tokenHash(token);
  const row = await env.DB.prepare(
    "SELECT users.id, users.username, users.display_name FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
  ).bind(digest, new Date().toISOString()).first();
  return row || null;
}

export async function createSession(userId, request, env) {
  const token = randomToken();
  const digest = await tokenHash(token);
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000).toISOString();
  const user = await env.DB.prepare(
    "SELECT id, username, display_name FROM users WHERE id = ?",
  ).bind(userId).first();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
  ).bind(digest, userId, expiresAt).run();
  return jsonResponse({ user: user }, 200, { "Set-Cookie": sessionCookie(token, request) });
}

export async function register(request, env) {
  const body = await readJson(request);
  if (!body) return jsonResponse({ error: "请求内容无效" }, 400);
  const username = String(body.username || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
    return jsonResponse({ error: "账号名需为 3 至 32 位字母、数字或 . _ -" }, 400);
  }
  if (name.length < 1 || name.length > 24) return jsonResponse({ error: "称呼需为 1 至 24 个字符" }, 400);
  if (password.length < 8 || password.length > 128) return jsonResponse({ error: "密码需为 8 至 128 个字符" }, 400);

  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await derivePasswordHash(password, salt);
  const userId = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, username, display_name, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(userId, username, name, salt, passwordHash, new Date().toISOString()),
      env.DB.prepare(
        "INSERT INTO user_state (user_id, payload, updated_at) VALUES (?, ?, ?)",
      ).bind(userId, JSON.stringify(emptyState), new Date().toISOString()),
    ]);
  } catch (error) {
    if (error.message && error.message.includes("UNIQUE constraint failed")) {
      return jsonResponse({ error: "这个账号名已经被使用" }, 409);
    }
    throw error;
  }
  return createSession(userId, request, env);
}

export async function login(request, env) {
  const body = await readJson(request);
  if (!body) return jsonResponse({ error: "请求内容无效" }, 400);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = await env.DB.prepare(
    "SELECT id, password_salt, password_hash FROM users WHERE username = ?",
  ).bind(username).first();
  if (!user || password.length > 128) return jsonResponse({ error: "账号名或密码不正确" }, 401);
  const candidate = await derivePasswordHash(password, user.password_salt);
  if (!equalHex(candidate, user.password_hash)) return jsonResponse({ error: "账号名或密码不正确" }, 401);
  return createSession(user.id, request, env);
}

export async function saveState(request, env) {
  const user = await currentUser(request, env);
  if (!user) return jsonResponse({ error: "登录状态已过期" }, 401);
  const body = await readJson(request);
  if (!body || !body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
    return jsonResponse({ error: "个人数据格式无效" }, 400);
  }
  const payload = JSON.stringify(body.state);
  if (encoder.encode(payload).length > maxStateBytes) return jsonResponse({ error: "个人数据超出大小限制" }, 413);
  await env.DB.prepare(
    "INSERT INTO user_state (user_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
  ).bind(user.id, payload, new Date().toISOString()).run();
  return jsonResponse({ ok: true });
}
