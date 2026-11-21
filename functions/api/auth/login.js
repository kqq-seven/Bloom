import { login } from "../../../lib/api.js";

export function onRequestPost({ request, env }) {
  return login(request, env);
}
