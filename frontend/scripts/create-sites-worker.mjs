import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(root, "dist");
const workerPath = resolve(root, "dist", "server", "index.js");
const textAssetExtensions = new Set([".html", ".css", ".js", ".json", ".txt", ".svg"]);

const assets = await collectAssets(distRoot);

const worker = `const ASSETS = new Map(${JSON.stringify(assets)});
const INDEX_PATH = "/index.html";

function hasFileExtension(pathname) {
  return /\\.[a-zA-Z0-9]+$/.test(pathname);
}

function headersFor(pathname, contentType) {
  return {
    "content-type": contentType,
    "cache-control": pathname === INDEX_PATH
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? INDEX_PATH : url.pathname;
    const asset = ASSETS.get(pathname) || (!hasFileExtension(pathname) ? ASSETS.get(INDEX_PATH) : null);

    if (!asset) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(asset.body, {
      status: 200,
      headers: headersFor(pathname, asset.contentType),
    });
  },
};
`;

await mkdir(dirname(workerPath), { recursive: true });
await writeFile(workerPath, worker);

async function collectAssets(directory) {
  const entries = [];
  for (const filePath of await walk(directory)) {
    const route = `/${relative(directory, filePath).split(sep).join("/")}`;
    if (route.startsWith("/server/") || route.startsWith("/.openai/")) continue;
    const extension = route.slice(route.lastIndexOf(".")).toLowerCase();
    if (!textAssetExtensions.has(extension)) continue;
    entries.push([
      route,
      {
        contentType: contentTypeFor(route),
        body: await readFile(filePath, "utf8"),
      },
    ]);
  }
  return entries;
}

async function walk(directory) {
  const items = [];
  for (const entry of await readdir(directory)) {
    const filePath = resolve(directory, entry);
    const details = await stat(filePath);
    if (details.isDirectory()) {
      items.push(...await walk(filePath));
    } else {
      items.push(filePath);
    }
  }
  return items;
}

function contentTypeFor(route) {
  if (route.endsWith(".html")) return "text/html; charset=utf-8";
  if (route.endsWith(".css")) return "text/css; charset=utf-8";
  if (route.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (route.endsWith(".json")) return "application/json; charset=utf-8";
  if (route.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  return "text/plain; charset=utf-8";
}
