import { jsonResponse } from "../../lib/api.js";

export function onRequestGet() {
  return jsonResponse({ ok: true });
}
