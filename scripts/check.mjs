import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const required = [
  "index.html",
  "assets/styles.css",
  "assets/app.js",
  "assets/data.js",
  "assets/icons.svg",
  "assets/favicon.svg",
  "assets/LUCIDE-LICENSE.txt",
  "Dockerfile",
  "nginx.conf",
  ".dockerignore",
  "compose.yaml",
  "README.md",
  "PLAN.md",
];
const textExtensions = new Set([".html", ".css", ".js", ".svg", ".md"]);
const runtimeFiles = [];

async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (relative(root, path).replaceAll("\\", "/") === "assets/media/gallery-sheet.webp") continue;
    if (item.isDirectory()) await walk(path);
    else if (item.isFile()) runtimeFiles.push(path);
  }
}

for (const file of required) {
  try {
    if (!(await stat(resolve(root, file))).isFile()) failures.push(`${file}: not a file`);
  } catch {
    failures.push(`${file}: missing`);
  }
}
try {
  await walk(resolve(root, "assets"));
} catch {
  failures.push("assets: missing");
}
runtimeFiles.push(resolve(root, "index.html"));

for (const script of ["assets/app.js", "assets/data.js", "scripts/preview.mjs", "scripts/check.mjs"]) {
  const result = spawnSync(process.execPath, ["--check", resolve(root, script)], { encoding: "utf8" });
  if (result.status !== 0)
    failures.push(`${script}: ${result.stderr.trim() || result.error?.message || "syntax check failed"}`);
}

let textBytes = 0;
let imageBytes = 0;
const sources = [];
for (const path of runtimeFiles) {
  let info;
  try {
    info = await stat(path);
  } catch {
    continue;
  }
  const extension = extname(path);
  if ([".html", ".css", ".js"].includes(extension)) textBytes += info.size;
  if ([".webp", ".png", ".jpg", ".jpeg", ".avif"].includes(extension)) imageBytes += info.size;
  if (textExtensions.has(extension)) sources.push([path, await readFile(path, "utf8")]);
}

function resolveReference(sourcePath, value) {
  if (!value || /^(?:https?:|mailto:|tel:|data:|blob:|#)/i.test(value)) return null;
  const clean = value.split(/[?#]/)[0];
  if (!clean || clean.includes("${")) return null;
  return clean.startsWith("/") ? resolve(root, `.${clean}`) : resolve(dirname(sourcePath), clean);
}

const resources = new Set();
for (const [path, source] of sources) {
  const extension = extname(path);
  if (extension === ".html") {
    for (const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (script[1].trim()) failures.push("index.html: inline script conflicts with CSP");
    }
    if (/<style\b|\sstyle\s*=|\son[a-z]+\s*=/i.test(source))
      failures.push("index.html: inline style/event conflicts with CSP");
    const ids = new Set([...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]));
    for (const match of source.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/g)) {
      if (match[1].startsWith("#") && match[1] !== "#" && !ids.has(match[1].slice(1)))
        failures.push(`${relative(root, path)}: missing anchor ${match[1]}`);
      const target = resolveReference(path, match[1]);
      if (target) resources.add(target);
    }
  }
  if (extension === ".css") {
    for (const match of source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
      const target = resolveReference(path, match[1]);
      if (target) resources.add(target);
    }
  }
  if (extension === ".js") {
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      const target = resolveReference(path, match[1]);
      if (target) resources.add(target);
    }
    for (const match of source.matchAll(
      /["'`]((?:\/|\.\/)?assets\/[^"'`]+|(?:\.\/)?(?:media|materials)\/[^"'`]+)["'`]/g,
    )) {
      const value = match[1];
      if (value.includes("${")) continue;
      const sourcePath = value.replace(/^\.?\//, "").startsWith("assets/") ? resolve(root, "index.html") : path;
      const target = resolveReference(sourcePath, value);
      if (target) resources.add(target);
    }
  }
}
for (const path of resources) {
  try {
    if (!(await stat(path)).isFile()) failures.push(`${relative(root, path)}: resource is not a file`);
  } catch {
    failures.push(`${relative(root, path)}: referenced resource missing`);
  }
}

const textLimit = 150 * 1024;
const imageLimit = 1.5 * 1024 * 1024;
console.log(`HTML/CSS/JS: ${(textBytes / 1024).toFixed(1)} KB / 150 KB`);
console.log(`Images: ${(imageBytes / 1024).toFixed(1)} KB / 1536 KB`);
console.log(`Local references checked: ${resources.size}`);
if (textBytes > textLimit) failures.push("HTML/CSS/JS exceeds the 150 KB budget");
if (imageBytes > imageLimit) failures.push("Images exceed the 1.5 MB budget");
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Checks passed.");
}
