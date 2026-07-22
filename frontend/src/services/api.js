const API_URL = resolveApiUrl();

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
  return request("/auth/register", { method: "POST", body: payload });
}

export function loginUser(payload) {
  return request("/auth/login", { method: "POST", body: payload });
}

export function fetchMe(token) {
  return request("/auth/me", { token });
}

export function fetchReports(token) {
  return request("/reports", { token });
}

export function fetchReport(token, id) {
  return request(`/reports/${id}`, { token });
}

export function updateReport(token, id, payload) {
  return request(`/reports/${id}`, { method: "PATCH", token, body: payload });
}

export function deleteReport(token, id) {
  return request(`/reports/${id}`, { method: "DELETE", token });
}

export function chatWithReport(token, id, question) {
  return request(`/reports/${id}/chat`, {
    method: "POST",
    token,
    body: { question },
  });
}

export function uploadSpreadsheet(token, file) {
  const form = new FormData();
  form.append("file", file);
  return request("/reports/upload", { method: "POST", token, body: form });
}

export function fetchDashboardSummary(token) {
  return request("/dashboard/summary", { token });
}

export async function downloadReportPdf(token, report) {
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
