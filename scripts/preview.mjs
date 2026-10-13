import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
const csp =
  "default-src 'self'; base-uri 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";

function publicPath(path) {
  return (
    path === "/index.html" ||
    /^\/assets\/(styles\.css|app\.js|data\.js|icons\.svg|favicon\.svg|LUCIDE-LICENSE\.txt)$/.test(path) ||
    /^\/assets\/(media\/[^/]+\.webp|materials\/[^/]+\.md)$/.test(path)
  );
}

function reply(response, code, message, head = false) {
  response.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(head ? undefined : `${message}\n`);
}

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", csp);
  const head = request.method === "HEAD";
  if (request.method !== "GET" && !head) {
    response.setHeader("Allow", "GET, HEAD");
    reply(response, 405, "Method not allowed");
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/healthz") {
      reply(response, 200, "ok", head);
      return;
    }
    const publicName = pathname === "/" ? "/index.html" : pathname;
    if (!publicPath(publicName) || publicName.includes("\\") || publicName.includes("\0")) {
      reply(response, 404, "Not found", head);
      return;
    }
    const candidate = await realpath(resolve(root, `.${publicName}`));
    const local = relative(root, candidate);
    if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
      reply(response, 404, "Not found", head);
      return;
    }
    const info = await stat(candidate);
    if (!info.isFile()) {
      reply(response, 404, "Not found", head);
      return;
    }
    response.writeHead(200, {
      "Content-Type": mime[extname(candidate)] || "application/octet-stream",
      "Content-Length": info.size,
    });
    if (head) response.end();
    else
      createReadStream(candidate)
        .on("error", () => response.destroy())
        .pipe(response);
  } catch (error) {
    if (error instanceof URIError) reply(response, 400, "Invalid URL", head);
    else reply(response, error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500, "Not found", head);
  }
});

server.listen(port, host, () => console.log(`NEUROSHIFT: http://${host}:${port}`));
server.on("error", (error) => {
  console.error(`Preview server: ${error.message}`);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
