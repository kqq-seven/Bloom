import { jsonResponse, register } from "../../../lib/api.js";

export async function onRequestPost({ request, env }) {
  try {
    return await register(request, env);
  } catch (error) {
    console.error("Account sign-in failed", error);
    return jsonResponse({ error: "暂时无法登录，请稍后重试。" }, 503);
  }
}
