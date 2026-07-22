import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = resolve(root, "dist", "server", "index.js");

const worker = `const INDEX_PATH = "/index.html";

function hasFileExtension(pathname) {
  return /\\.[a-zA-Z0-9]+$/.test(pathname);
}

function withCacheHeaders(response) {
  const next = new Response(response.body, response);
  if (!next.headers.has("cache-control")) {
    next.headers.set("cache-control", "public, max-age=300");
  }
  return next;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status !== 404 || hasFileExtension(url.pathname)) {
      return withCacheHeaders(assetResponse);
    }

    const indexUrl = new URL(INDEX_PATH, url);
    const indexRequest = new Request(indexUrl, request);
    return withCacheHeaders(await env.ASSETS.fetch(indexRequest));
  },
};
`;

await mkdir(dirname(workerPath), { recursive: true });
await writeFile(workerPath, worker);
