// Minimal static file server for the built frontend (SPA fallback to index.html).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = "packages/frontend/dist";
const PORT = 4178;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path === "/" || path === "") path = "/index.html";
    let file = join(ROOT, path);
    let data;
    try {
      data = await readFile(file);
    } catch {
      // SPA fallback
      file = join(ROOT, "index.html");
      data = await readFile(file);
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
