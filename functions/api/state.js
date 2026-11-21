import { currentUser, emptyState, jsonResponse, saveState } from "../../lib/api.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return jsonResponse({ error: "请先登录" }, 401);
  const row = await env.DB.prepare("SELECT payload FROM user_state WHERE user_id = ?").bind(user.id).first();
  return jsonResponse({ state: row ? JSON.parse(row.payload) : emptyState });
}

export function onRequestPut(context) {
  return saveState(context.request, context.env);
}
