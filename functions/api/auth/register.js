import { jsonResponse, register } from "../../../lib/api.js";

export async function onRequestPost({ request, env }) {
  try {
    return await register(request, env);
  } catch (error) {
    console.error("Nickname registration failed", error);
    return jsonResponse({ error: "暂时无法创建昵称，请稍后再试。" }, 503);
  }
}
