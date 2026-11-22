const encoder = new TextEncoder();
const cookieName = "bloom_session";
const sessionSeconds = 400 * 24 * 60 * 60;
const maxStateBytes = 2 * 1024 * 1024;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

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
  const value = entry?.slice(cookieName.length + 1) || "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
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

export async function register(request, env) {
  const body = await readJson(request);
  if (typeof body?.nickname !== "string") return jsonResponse({ error: "请填写昵称。" }, 400);
  const name = body.nickname.trim().normalize("NFC");
  if (!name || encoder.encode(name).length > 512 || [...segmenter.segment(name)].length > 10 ||
      /[\p{Cc}\p{Cs}]/u.test(name) || !/[\p{L}\p{N}\p{P}\p{S}]/u.test(name)) {
    return jsonResponse({ error: "请输入 1–10 个可见字符，可以使用中文、英文、数字或表情。" }, 400);
  }
  if (!env.DB) return jsonResponse({ error: "网站尚未连接 D1 数据库，请检查 DB 绑定。" }, 503);
  const current = await currentUser(request, env);
  if (current) return jsonResponse({ user: current });

  const username = name.toLowerCase().normalize("NFC");
  const userId = crypto.randomUUID();
  const token = randomToken();
  const digest = await tokenHash(token);
  const now = Date.now();
  const expiresAt = new Date(now + sessionSeconds * 1000).toISOString();
  // Keep the existing D1 schema and reserve earlier display names as well.
  const [claim] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, username, display_name, password_salt, password_hash, created_at)
       SELECT ?, ?, ?, '', '', ?
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE password_hash <> '' AND lower(display_name) = ?)
       ON CONFLICT(username) DO NOTHING`,
    ).bind(userId, username, name, new Date(now).toISOString(), username),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at) SELECT ?, id, ? FROM users WHERE id = ?",
    ).bind(digest, expiresAt, userId),
  ]);
  if (!claim.meta.changes) return jsonResponse({ error: "这个昵称已被使用，请换一个。" }, 409);
  return jsonResponse({ user: { id: userId, display_name: name } }, 201, {
    "Set-Cookie": sessionCookie(token, request),
  });
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
