import {
  demoChatWithReport,
  demoDeleteReport,
  demoDownloadReportPdf,
  demoFetchDashboardSummary,
  demoFetchMe,
  demoFetchReport,
  demoFetchReports,
  demoLoginUser,
  demoRegisterUser,
  demoUpdateReport,
  demoUploadSpreadsheet,
} from "./demoApi.js";

const API_URL = resolveApiUrl();
const DEMO_MODE = resolveDemoMode();

function resolveApiUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000/api";
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${window.location.hostname}:8000/api`;
}

function resolveDemoMode() {
  if (import.meta.env.VITE_DEMO_MODE === "true") {
    return true;
  }
  if (import.meta.env.VITE_DEMO_MODE === "false") {
    return false;
  }
  if (import.meta.env.VITE_API_URL?.trim()) {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }
  const host = window.location.hostname;
  const isLocalHost = ["localhost", "127.0.0.1", "0.0.0.0", ""].includes(host);
  return !isLocalHost;
}

export function isDemoMode() {
  return DEMO_MODE;
}

async function request(path, { token, body, headers = {}, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Nao consegui conectar com a API em ${API_URL}. Confirme se o backend esta rodando.`);
  }

  if (!response.ok) {
    let message = "Nao foi possivel concluir a operacao.";
    try {
      const payload = await response.json();
      message = payload.detail || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function registerUser(payload) {
  if (DEMO_MODE) return demoRegisterUser(payload);
  return request("/auth/register", { method: "POST", body: payload });
}

export function loginUser(payload) {
  if (DEMO_MODE) return demoLoginUser(payload);
  return request("/auth/login", { method: "POST", body: payload });
}

export function fetchMe(token) {
  if (DEMO_MODE) return demoFetchMe(token);
  return request("/auth/me", { token });
}

export function fetchReports(token) {
  if (DEMO_MODE) return demoFetchReports(token);
  return request("/reports", { token });
}

export function fetchReport(token, id) {
  if (DEMO_MODE) return demoFetchReport(token, id);
  return request(`/reports/${id}`, { token });
}

export function updateReport(token, id, payload) {
  if (DEMO_MODE) return demoUpdateReport(token, id, payload);
  return request(`/reports/${id}`, { method: "PATCH", token, body: payload });
}

export function deleteReport(token, id) {
  if (DEMO_MODE) return demoDeleteReport(token, id);
  return request(`/reports/${id}`, { method: "DELETE", token });
}

export function chatWithReport(token, id, question) {
  if (DEMO_MODE) return demoChatWithReport(token, id, question);
  return request(`/reports/${id}/chat`, {
    method: "POST",
    token,
    body: { question },
  });
}

export function uploadSpreadsheet(token, file) {
  if (DEMO_MODE) return demoUploadSpreadsheet(token, file);
  const form = new FormData();
  form.append("file", file);
  return request("/reports/upload", { method: "POST", token, body: form });
}

export function fetchDashboardSummary(token) {
  if (DEMO_MODE) return demoFetchDashboardSummary(token);
  return request("/dashboard/summary", { token });
}

export async function downloadReportPdf(token, report) {
  if (DEMO_MODE) return demoDownloadReportPdf(token, report);
  let response;
  try {
    response = await fetch(`${API_URL}/reports/${report.id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error(`Nao consegui conectar com a API em ${API_URL}.`);
  }

  if (!response.ok) {
    throw new Error("Nao foi possivel gerar o PDF.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SmartReports-${report.title}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
