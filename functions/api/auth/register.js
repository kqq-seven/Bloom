import { register } from "../../../lib/api.js";

export function onRequestPost({ request, env }) {
  return register(request, env);
}
