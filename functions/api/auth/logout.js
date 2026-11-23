import { clearSessionCookie, jsonResponse } from "../../../lib/api.js";

export async function onRequestPost({ request, env }) {
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  const cookies = request.headers.get("Cookie") || "";
  const entry = cookies.split(";").map(value => value.trim()).find(value => value.startsWith("bloom_session="));
  const token = bearer?.[1] || (entry ? decodeURIComponent(entry.slice("bloom_session=".length)) : "");
  if (token) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}
