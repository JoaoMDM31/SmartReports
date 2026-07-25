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
const AI_CHAT_PATH = "/api/demo-ai-chat";
const MAX_BODY_BYTES = 64000;
const MAX_CONTEXT_CHARS = 14000;
const SYSTEM_PROMPT = "Voce e o SmartReports AI, um analista de dados e negocios dentro de um SaaS. Use apenas o contexto do relatorio enviado. Nao invente numeros, clientes, produtos ou causas que nao estejam no contexto. Quando os dados forem insuficientes, diga exatamente o que falta. Responda em portugues do Brasil, com tom executivo, claro e acionavel. Retorne somente JSON valido com answer, confidence, evidence e next_steps.";

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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === AI_CHAT_PATH) {
      return handleAiChat(request, env);
    }

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

async function handleAiChat(request, env) {
  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }
  if (request.method !== "POST") {
    return jsonResponse({ detail: "Metodo nao permitido." }, 405);
  }
  if (!env || !env.OPENAI_API_KEY) {
    return jsonResponse({ detail: "OPENAI_API_KEY nao configurada no Sites." }, 503);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ detail: "Contexto muito grande para o chat." }, 413);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ detail: "JSON invalido." }, 400);
  }

  const question = String(payload.question || "").trim().slice(0, 1000);
  if (question.length < 2) {
    return jsonResponse({ detail: "Pergunta muito curta." }, 400);
  }

  const context = JSON.stringify(payload.report || {}).slice(0, MAX_CONTEXT_CHARS);

  try {
    const aiPayload = await callOpenAi(env, question, context);
    return jsonResponse(normalizeAiResponse(aiPayload));
  } catch (error) {
    return jsonResponse({ detail: "Nao foi possivel gerar resposta com IA.", reason: String(error && error.message ? error.message : error) }, 502);
  }
}

async function callOpenAi(env, question, context) {
  const model = env.OPENAI_MODEL || "gpt-5.6";
  const baseUrl = String(env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\\/$/, "");
  const maxOutputTokens = Number(env.OPENAI_MAX_OUTPUT_TOKENS || 1200);
  const userPrompt = "Pergunta do usuario:\\n" + question + "\\n\\nContexto JSON do relatorio:\\n" + context + "\\n\\nAnalise os dados como consultor de negocios. Use evidencias e recomende proximos passos praticos.";

  const responsesPayload = {
    model,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    max_output_tokens: maxOutputTokens,
  };
  if (env.OPENAI_REASONING_EFFORT) {
    responsesPayload.reasoning = { effort: env.OPENAI_REASONING_EFFORT };
  }

  const response = await fetch(baseUrl + "/responses", {
    method: "POST",
    headers: openAiHeaders(env),
    body: JSON.stringify(responsesPayload),
  });

  if (response.ok) {
    return extractResponsesText(await response.json());
  }

  if (![400, 404, 422].includes(response.status)) {
    throw new Error("OpenAI HTTP " + response.status + ": " + await response.text());
  }

  const chatPayload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  };

  const fallback = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: openAiHeaders(env),
    body: JSON.stringify(chatPayload),
  });

  if (!fallback.ok) {
    throw new Error("OpenAI HTTP " + fallback.status + ": " + await fallback.text());
  }

  const fallbackPayload = await fallback.json();
  return fallbackPayload.choices && fallbackPayload.choices[0] && fallbackPayload.choices[0].message
    ? fallbackPayload.choices[0].message.content
    : "";
}

function openAiHeaders(env) {
  return {
    "Authorization": "Bearer " + env.OPENAI_API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

function extractResponsesText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\\n");
}

function normalizeAiResponse(rawText) {
  const parsed = parseJsonObject(String(rawText || ""));
  if (!parsed) {
    return {
      answer: String(rawText || "").trim() || "Nao consegui gerar uma resposta agora.",
      confidence: "media",
      evidence: [],
      next_steps: [],
    };
  }

  return {
    answer: String(parsed.answer || parsed.resposta || "").trim(),
    confidence: normalizeConfidence(parsed.confidence || parsed.confianca),
    evidence: normalizeEvidence(parsed.evidence || parsed.evidencias || []),
    next_steps: Array.isArray(parsed.next_steps || parsed.proximos_passos)
      ? (parsed.next_steps || parsed.proximos_passos).map((step) => String(step).trim()).filter(Boolean).slice(0, 6)
      : [],
  };
}

function parseJsonObject(rawText) {
  let text = rawText.trim();
  const fence = String.fromCharCode(96, 96, 96);
  if (text.startsWith(fence)) {
    text = text.replace(new RegExp("^" + fence + "json", "i"), "").replace(new RegExp("^" + fence), "").replace(new RegExp(fence + "$"), "").trim();
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function normalizeConfidence(value) {
  const text = String(value || "media").toLowerCase();
  if (["alta", "high"].includes(text)) return "alta";
  if (["baixa", "low"].includes(text)) return "baixa";
  return "media";
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return {
        label: String(item.label || item.titulo || "Evidencia").slice(0, 120),
        value: String(item.value || item.valor || "").slice(0, 180),
        detail: String(item.detail || item.detalhe || "").slice(0, 500),
      };
    }
    return { label: "Evidencia", value: "", detail: String(item).slice(0, 500) };
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
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
