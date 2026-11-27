import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(path.join(root, "index.html"), path.join(output, "index.html"));
await copyFile(path.join(root, "style.css"), path.join(output, "style.css"));
await copyFile(path.join(root, "app.js"), path.join(output, "app.js"));
await mkdir(path.join(output, "utils"), { recursive: true });
await copyFile(path.join(root, "utils", "cycle.js"), path.join(output, "utils", "cycle.js"));
await copyFile(path.join(root, "utils", "daily.js"), path.join(output, "utils", "daily.js"));
await cp(path.join(root, "assets"), path.join(output, "assets"), { recursive: true });
