import { jsonResponse, setPassword } from "../../../lib/api.js";

export async function onRequestPost({ request, env }) {
  try {
    return await setPassword(request, env);
  } catch (error) {
    console.error("Account password setup failed", error);
    return jsonResponse({ error: "暂时无法设置密码，请稍后重试。" }, 503);
  }
}
