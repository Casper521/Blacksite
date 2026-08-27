import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function safePath(pathname) {
  const relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const resolved = join(DIST, normalize(relative).replace(/^(\.\.(\/|\\|$))+/, ""));
  if (!resolved.startsWith(DIST)) return null;
  return resolved;
}

export function servePublic(request, response) {
  if (!existsSync(DIST)) return false;
  const url = new URL(request.url, `http://${request.headers.host}`);
  let file = safePath(url.pathname);
  if (!file) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, "index.html");
    if (!existsSync(file)) return false;
  }
  response.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": extname(file) === ".html" ? "no-cache" : "public, max-age=86400",
  });
  createReadStream(file).pipe(response);
  return true;
}
