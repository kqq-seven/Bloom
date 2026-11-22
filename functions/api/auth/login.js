import { jsonResponse } from "../../../lib/api.js";

export function onRequestPost() {
  return jsonResponse({ error: "请刷新页面，使用昵称进入。" }, 410);
}
