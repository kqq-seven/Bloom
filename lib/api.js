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
  cycle: { start: "", end: "", reminder: false, history: [] },
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

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations: 100000 },
    key,
    256,
  );
  return toHex(bits);
}

async function passwordMatches(password, salt, expectedHash) {
  if (!expectedHash) return false;
  const actual = fromHex(await passwordHash(password, salt));
  const expected = fromHex(expectedHash);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
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
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  const token = bearer?.[1] || cookieValue(request);
  if (!token) return null;
  const digest = await tokenHash(token);
  const row = await env.DB.prepare(
    "SELECT users.id, users.username, users.display_name, CASE WHEN length(users.password_hash) > 0 THEN 1 ELSE 0 END AS password_set FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
  ).bind(digest, new Date().toISOString()).first();
  return row || null;
}

async function createSession(user, request, env) {
  const token = randomToken();
  const digest = await tokenHash(token);
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
  ).bind(digest, user.id, expiresAt).run();
  const sessionUser = { id: user.id, username: user.username, display_name: user.display_name, password_set: 1 };
  if (request.headers.get("X-Bloom-Client") === "wechat-miniprogram") {
    return jsonResponse({ user: sessionUser, token });
  }
  return jsonResponse({ user: sessionUser }, 200, { "Set-Cookie": sessionCookie(token, request) });
}

async function createWechatSession(user, request, env) {
  const token = randomToken();
  const digest = await tokenHash(token);
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
  ).bind(digest, user.id, expiresAt).run();
  const sessionUser = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    password_set: 1,
  };
  return jsonResponse({ user: sessionUser, token: token });
}

export async function authenticate(request, env) {
  const body = await readJson(request);
  if (typeof body?.nickname !== "string" || typeof body?.password !== "string") {
    return jsonResponse({ error: "请填写昵称和密码。" }, 400);
  }
  const name = body.nickname.trim().normalize("NFC");
  if (!name || encoder.encode(name).length > 512 || [...segmenter.segment(name)].length > 10 ||
      /[\p{Cc}\p{Cs}]/u.test(name) || !/[\p{L}\p{N}\p{P}\p{S}]/u.test(name)) {
    return jsonResponse({ error: "请输入 1–10 个可见字符，可以使用中文、英文、数字或表情。" }, 400);
  }
  const password = body.password;
  if ([...password].length < 8 || [...password].length > 128) {
    return jsonResponse({ error: "密码需为 8–128 个字符。" }, 400);
  }
  if (!env.DB) return jsonResponse({ error: "网站尚未连接 D1 数据库，请检查 DB 绑定。" }, 503);
  const current = await currentUser(request, env);
  const username = name.toLowerCase().normalize("NFC");
  if (current) {
    if (current.username !== username) {
      return jsonResponse({ error: "昵称已存在或密码错误，请重试。" }, 401);
    }
    const stored = await env.DB.prepare(
      "SELECT password_salt, password_hash FROM users WHERE id = ?",
    ).bind(current.id).first();
    if (!stored.password_hash) {
      const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await passwordHash(password, salt);
      await env.DB.prepare(
        "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ? AND password_hash = ?",
      ).bind(salt, hash, current.id, "").run();
      current.password_set = 1;
      return jsonResponse({ user: current });
    }
    if (!(await passwordMatches(password, stored.password_salt, stored.password_hash))) {
      return jsonResponse({ error: "昵称已存在或密码错误，请重试。" }, 401);
    }
    return jsonResponse({ user: current });
  }

  const userId = crypto.randomUUID();
  const existing = await env.DB.prepare(
    "SELECT id, username, display_name, password_salt, password_hash FROM users WHERE username = ?",
  ).bind(username).first();
  if (existing) {
    if (!(await passwordMatches(password, existing.password_salt, existing.password_hash))) {
      return jsonResponse({ error: "昵称已存在或密码错误，请重试。" }, 401);
    }
    if (request.headers.get("X-Bloom-Client") === "wechat-miniprogram") {
      return createWechatSession(existing, request, env);
    }
    return createSession(existing, request, env);
  }

  const token = randomToken();
  const digest = await tokenHash(token);
  const now = Date.now();
  const expiresAt = new Date(now + sessionSeconds * 1000).toISOString();
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(password, salt);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, username, display_name, password_salt, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(username) DO NOTHING`,
    ).bind(userId, username, name, salt, hash, new Date(now).toISOString()),
    env.DB.prepare(
      "INSERT INTO user_state (user_id, payload, updated_at) SELECT id, ?, ? FROM users WHERE id = ? ON CONFLICT(user_id) DO NOTHING",
    ).bind(JSON.stringify(emptyState), new Date(now).toISOString(), userId),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at) SELECT ?, id, ? FROM users WHERE id = ?",
    ).bind(digest, expiresAt, userId),
  ]);

  const user = await env.DB.prepare(
    "SELECT id, username, display_name, password_salt, password_hash FROM users WHERE username = ?",
  ).bind(username).first();
  if (!user) return jsonResponse({ error: "暂时无法登录，请稍后重试。" }, 503);
  if (user.id !== userId) {
    if (!(await passwordMatches(password, user.password_salt, user.password_hash))) {
      return jsonResponse({ error: "昵称已存在或密码错误，请重试。" }, 401);
    }
    if (request.headers.get("X-Bloom-Client") === "wechat-miniprogram") {
      return createWechatSession(user, request, env);
    }
    return createSession(user, request, env);
  }
  const newUser = { id: user.id, username: user.username, display_name: user.display_name, password_set: 1 };
  if (request.headers.get("X-Bloom-Client") === "wechat-miniprogram") {
    return jsonResponse({ user: newUser, token }, 201);
  }
  return jsonResponse({ user: newUser }, 201, { "Set-Cookie": sessionCookie(token, request) });
}

export async function register(request, env) {
  return authenticate(request, env);
}

export async function setPassword(request, env) {
  const user = await currentUser(request, env);
  if (!user) return jsonResponse({ error: "登录状态已过期" }, 401);
  if (user.password_set) return jsonResponse({ error: "这个账号已经设置过密码。" }, 409);
  const body = await readJson(request);
  const password = body?.password;
  if (typeof password !== "string" || [...password].length < 8 || [...password].length > 128) {
    return jsonResponse({ error: "密码需为 8–128 个字符。" }, 400);
  }
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(password, salt);
  await env.DB.prepare(
    "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ? AND password_hash = ?",
  ).bind(salt, hash, user.id, "").run();
  return jsonResponse({ ok: true });
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
