import { currentUser, jsonResponse } from "../../lib/api.js";

export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return jsonResponse({ error: "请先登录" }, 401);
  return jsonResponse({ user: user });
}
