const USERS_KEY = "smartreports.demo.users";
const REPORTS_KEY = "smartreports.demo.reports";
const DEMO_TOKEN_PREFIX = "demo.";
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const demoUser = {
  id: "demo-user",
  full_name: "Joao Silva",
  company_name: "SmartReports Demo",
  email: "demo@smartreports.com",
  password: "SmartReports123",
  created_at: "2026-07-22T00:00:00.000Z",
};

export async function demoRegisterUser(payload) {
  await pause(180);
  const users = ensureUsers();
  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new Error("Informe um e-mail valido.");
  }
  if ((payload.password || "").length < 8) {
    throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  }
  if (users.some((user) => normalizeEmail(user.email) === email)) {
    throw new Error("Este e-mail ja esta cadastrado.");
  }

  const user = {
    id: createId("user"),
    full_name: payload.full_name || email.split("@")[0] || "Usuario",
    company_name: payload.company_name || "Conta Web",
    email,
    password: payload.password,
    created_at: new Date().toISOString(),
  };
  saveUsers([...users, user]);
  return publicUser(user);
}

export async function demoLoginUser(payload) {
  await pause(220);
  const users = ensureUsers();
  const email = normalizeEmail(payload.email);
  if (!email || (payload.password || "").length < 8) {
    throw new Error("Informe e-mail e senha com pelo menos 8 caracteres.");
  }

  let user = users.find((item) => normalizeEmail(item.email) === email);
  if (!user) {
    user = {
      id: createId("user"),
      full_name: email.split("@")[0] || "Usuario",
      company_name: "Conta Web",
      email,
      password: payload.password,
      created_at: new Date().toISOString(),
    };
    saveUsers([...users, user]);
  } else if (user.password !== payload.password) {
    throw new Error("Senha incorreta para esta conta demo.");
  }

  return {
    access_token: `${DEMO_TOKEN_PREFIX}${user.id}.${Date.now()}`,
    token_type: "bearer",
  };
}

export async function demoFetchMe(token) {
  await pause(80);
  return publicUser(getUserFromToken(token));
}

export async function demoFetchReports(token) {
  await pause(120);
  const user = getUserFromToken(token);
  return getReports()
    .filter((report) => report.owner_id === user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(toListItem);
}

export async function demoFetchReport(token, id) {
  await pause(120);
  const user = getUserFromToken(token);
  const report = getOwnedReport(user.id, id);
  return { ...report };
}

export async function demoUpdateReport(token, id, payload) {
  await pause(140);
  const user = getUserFromToken(token);
  const reports = getReports();
  const index = reports.findIndex((report) => sameId(report.id, id) && report.owner_id === user.id);
  if (index === -1) {
    throw new Error("Relatorio nao encontrado.");
  }
  reports[index] = {
    ...reports[index],
    title: (payload.title || reports[index].title).trim(),
  };
  saveReports(reports);
  return { ...reports[index] };
}

export async function demoDeleteReport(token, id) {
  await pause(140);
  const user = getUserFromToken(token);
  saveReports(getReports().filter((report) => !(sameId(report.id, id) && report.owner_id === user.id)));
  return null;
}

export async function demoUploadSpreadsheet(token, file) {
  const user = getUserFromToken(token);
  if (!file) {
    throw new Error("Selecione uma planilha para analisar.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Arquivo acima do limite de 25 MB.");
  }

  const rows = await loadRows(file);
  if (!rows.length) {
    throw new Error("A planilha nao possui dados tabulares validos.");
  }

  await pause(520);
  const report = buildReport(user.id, file.name, rows);
  saveReports([report, ...getReports()]);
  return report;
}

export async function demoFetchDashboardSummary(token) {
  await pause(100);
  const user = getUserFromToken(token);
  const reports = getReports().filter((report) => report.owner_id === user.id);
  const columnCounter = new Map();
  const totalRows = reports.reduce((sum, report) => {
    for (const column of report.columns_schema?.columns || []) {
      columnCounter.set(column.name, (columnCounter.get(column.name) || 0) + 1);
    }
    return sum + Number(report.analysis_summary?.row_count || 0);
  }, 0);
  const latest = reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  return {
    total_reports: reports.length,
    total_rows_processed: totalRows,
    latest_report_title: latest?.title || null,
    latest_report_at: latest?.created_at || null,
    most_common_columns: [...columnCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count })),
  };
}

export async function demoChatWithReport(token, id, question) {
  await pause(260);
  const user = getUserFromToken(token);
  const report = getOwnedReport(user.id, id);

  const hostedAiAnswer = await requestHostedAiAnswer(report, question);
  if (hostedAiAnswer) {
    return hostedAiAnswer;
  }

  const answer = buildAnswer(report, question);
  return {
    answer: answer.text,
    confidence: answer.confidence,
    evidence: answer.evidence,
    next_steps: answer.nextSteps,
  };
}

async function requestHostedAiAnswer(report, question) {
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return null;
  }

  try {
    const response = await fetch("/api/demo-ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        report: buildHostedAiContext(report),
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload?.answer) {
      return null;
    }

    return {
      answer: String(payload.answer),
      confidence: payload.confidence || "media",
      evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
      next_steps: Array.isArray(payload.next_steps) ? payload.next_steps : [],
    };
  } catch {
    return null;
  }
}

function buildHostedAiContext(report) {
  const analysis = report.analysis_summary || {};
  const analyst = analysis.analyst_report || {};
  const schema = report.columns_schema || {};

  return {
    report: {
      id: report.id,
      title: report.title,
      filename: report.filename,
      source_sheet: report.source_sheet,
      created_at: report.created_at,
    },
    schema: {
      row_count: schema.row_count,
      column_count: schema.column_count,
      types: schema.types,
      columns: (schema.columns || []).slice(0, 14).map((column) => ({
        name: column.name,
        type: column.type,
        missing_count: column.missing_count,
        missing_ratio: column.missing_ratio,
        unique_count: column.unique_count,
        sample_values: (column.sample_values || []).slice(0, 4),
        stats: column.stats,
        top_values: (column.top_values || []).slice(0, 6),
      })),
    },
    summary: {
      row_count: analysis.row_count,
      column_count: analysis.column_count,
      missing_cells: analysis.missing_cells,
      quality_score: analysis.quality_score,
      summary_cards: (analysis.summary_cards || []).slice(0, 10),
    },
    charts: summarizeChartsForAi(analysis.charts || []),
    smart_analyst: {
      mode: analyst.mode,
      confidence_score: analyst.confidence_score,
      executive_summary: analyst.executive_summary,
      kpis: (analyst.kpis || []).slice(0, 8),
      findings: (analyst.findings || []).slice(0, 8),
      risks: (analyst.risks || []).slice(0, 8),
      opportunities: (analyst.opportunities || []).slice(0, 8),
      recommendations: (analyst.recommendations || []).slice(0, 8),
      action_plan: (analyst.action_plan || []).slice(0, 8),
      segment_analysis: (analyst.segment_analysis || []).slice(0, 8),
      conclusion: analyst.conclusion,
    },
    insight_text: report.insight_text,
  };
}

function summarizeChartsForAi(charts) {
  return charts.slice(0, 8).map((chart) => {
    const summarized = {
      id: chart.id,
      type: chart.type,
      title: chart.title,
      xLabel: chart.xLabel,
      yLabel: chart.yLabel,
    };

    if (chart.x && chart.y) {
      summarized.x = headTail(chart.x, 6);
      summarized.y = headTail(chart.y, 6);
    }
    if (chart.labels && chart.values) {
      summarized.labels = chart.labels.slice(0, 10);
      summarized.values = chart.values.slice(0, 10);
    }

    return summarized;
  });
}

function headTail(items, size) {
  if (!Array.isArray(items)) return [];
  if (items.length <= size * 2) return items;
  return [...items.slice(0, size), { gap: items.length - size * 2 }, ...items.slice(-size)];
}

export async function demoDownloadReportPdf(token, report) {
  const user = getUserFromToken(token);
  const fullReport = getOwnedReport(user.id, report.id);
  const analyst = fullReport.analysis_summary?.analyst_report || {};
  const lines = [
    `SmartReports - ${fullReport.title}`,
    `Arquivo: ${fullReport.filename}`,
    `Gerado em: ${formatDateTime(new Date())}`,
    `Linhas analisadas: ${fullReport.analysis_summary?.row_count || 0}`,
    `Colunas detectadas: ${fullReport.analysis_summary?.column_count || 0}`,
    "",
    "Resumo executivo",
    analyst.executive_summary || fullReport.insight_text || "Sem resumo disponivel.",
    "",
    "Insights",
    ...[
      ...(analyst.findings || []),
      ...(analyst.risks || []),
      ...(analyst.opportunities || []),
      ...(analyst.recommendations || []),
    ].slice(0, 8).map((item) => `${item.title}: ${item.detail}`),
  ];
  const blob = buildPdfBlob(lines);
  triggerDownload(blob, `SmartReports-${safeFilename(fullReport.title)}.pdf`);
}

function buildReport(ownerId, filename, rows) {
  const columns = buildColumnProfiles(rows);
  const charts = buildCharts(rows, columns);
  const qualityScore = buildQualityScore(rows, columns);
  const analyst = buildAnalystReport(filename, rows, columns, charts, qualityScore);
  const title = titleFromFilename(filename);
  const now = new Date().toISOString();

  return {
    id: createId("report"),
    owner_id: ownerId,
    title,
    filename,
    source_sheet: null,
    columns_schema: {
      columns,
      row_count: rows.length,
      column_count: columns.length,
      types: countTypes(columns),
    },
    analysis_summary: {
      row_count: rows.length,
      column_count: columns.length,
      missing_cells: columns.reduce((sum, column) => sum + column.missing_count, 0),
      quality_score: qualityScore,
      summary_cards: buildSummaryCards(rows, columns, qualityScore),
      charts,
      analyst_report: analyst,
    },
    insight_text: [analyst.executive_summary, analyst.conclusion].filter(Boolean).join(" "),
    created_at: now,
  };
}

async function loadRows(file) {
  const extension = `.${file.name.split(".").pop()}`.toLowerCase();
  if (extension === ".csv") {
    const text = await file.text();
    return parseCsv(text);
  }
  if (![".xlsx", ".xls", ".xlsm"].includes(extension)) {
    throw new Error("Formato nao suportado. Envie .xlsx, .xlsm, .xls ou .csv.");
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error("A planilha nao possui abas validas.");
  }
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
  return normalizeRows(rawRows);
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const matrix = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      matrix.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  matrix.push(row);

  const headers = dedupeHeaders((matrix.shift() || []).map((header, index) => cleanHeader(header, index)));
  const rows = matrix
    .filter((entry) => entry.some((cell) => String(cell || "").trim()))
    .map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] ?? ""])));
  return normalizeRows(rows);
}

function normalizeRows(rawRows) {
  const headers = dedupeHeaders([
    ...new Set(rawRows.flatMap((row) => Object.keys(row || {})).map((header, index) => cleanHeader(header, index))),
  ]);
  return rawRows
    .map((row) => {
      const normalized = {};
      headers.forEach((header) => {
        const originalKey = Object.keys(row || {}).find((key) => cleanHeader(key, 0) === header);
        normalized[header] = originalKey ? row[originalKey] : "";
      });
      return normalized;
    })
    .filter((row) => Object.values(row).some(isFilled));
}

function buildColumnProfiles(rows) {
  const headers = Object.keys(rows[0] || {});
  return headers.map((name) => {
    const values = rows.map((row) => row[name]);
    const cleanValues = values.filter(isFilled);
    const type = inferType(cleanValues);
    const profile = {
      name,
      type,
      missing_count: rows.length - cleanValues.length,
      missing_ratio: round((rows.length - cleanValues.length) / Math.max(rows.length, 1), 4),
      unique_count: new Set(cleanValues.map(normalizeValue)).size,
      sample_values: cleanValues.slice(0, 4).map(normalizeValue),
    };

    if (type === "numeric") {
      const numbers = cleanValues.map(parseNumber).filter((value) => value !== null);
      profile.stats = {
        min: round(Math.min(...numbers), 2),
        max: round(Math.max(...numbers), 2),
        mean: round(numbers.reduce((sum, value) => sum + value, 0) / Math.max(numbers.length, 1), 2),
        sum: round(numbers.reduce((sum, value) => sum + value, 0), 2),
      };
    } else if (type === "date") {
      const dates = cleanValues.map(parseDate).filter(Boolean).sort((a, b) => a - b);
      profile.stats = {
        min: dates[0]?.toISOString().slice(0, 10) || null,
        max: dates[dates.length - 1]?.toISOString().slice(0, 10) || null,
      };
    } else {
      profile.top_values = topCounts(cleanValues.map(normalizeValue), 5).map(([label, count]) => ({
        label: truncate(label),
        count,
      }));
    }
    return profile;
  });
}

function inferType(values) {
  if (!values.length) return "empty";
  const numbers = values.map(parseNumber).filter((value) => value !== null);
  if (numbers.length / values.length >= 0.85) return "numeric";
  const dates = values.map(parseDate).filter(Boolean);
  if (dates.length / values.length >= 0.8) return "date";
  const booleans = values.filter((value) => /^(sim|nao|true|false|yes|no|0|1)$/i.test(String(value).trim()));
  if (booleans.length / values.length >= 0.9) return "boolean";
  const uniqueCount = new Set(values.map(normalizeValue)).size;
  if (uniqueCount <= Math.max(12, Math.floor(values.length * 0.25))) return "categorical";
  return "text";
}

function buildCharts(rows, columns) {
  const numeric = columns.filter((column) => column.type === "numeric");
  const dates = columns.filter((column) => column.type === "date");
  const categories = columns.filter((column) => ["categorical", "boolean"].includes(column.type));
  const charts = [];

  if (dates.length && numeric.length) {
    const grouped = groupByDate(rows, dates[0].name, numeric[0].name);
    if (grouped.length) {
      charts.push({
        id: "trend",
        type: "line",
        title: `Tendencia de ${numeric[0].name}`,
        x: grouped.map((item) => item.label),
        y: grouped.map((item) => item.value),
        xLabel: dates[0].name,
        yLabel: numeric[0].name,
      });
    }
  }

  if (categories.length && numeric.length) {
    const grouped = groupByCategory(rows, categories[0].name, numeric[0].name, "sum").slice(0, 10);
    if (grouped.length) {
      charts.push({
        id: "category-bar",
        type: "bar",
        title: `Top categorias por ${numeric[0].name}`,
        x: grouped.map((item) => item.label),
        y: grouped.map((item) => item.value),
        xLabel: categories[0].name,
        yLabel: numeric[0].name,
      });
    }
  }

  if (categories.length) {
    const counts = groupByCategory(rows, categories[0].name, null, "count").slice(0, 8);
    if (counts.length) {
      charts.push({
        id: "category-share",
        type: "pie",
        title: `Distribuicao de ${categories[0].name}`,
        labels: counts.map((item) => item.label),
        values: counts.map((item) => item.value),
      });
    }
  }

  if (numeric.length >= 2) {
    const points = rows
      .map((row) => ({ x: parseNumber(row[numeric[0].name]), y: parseNumber(row[numeric[1].name]) }))
      .filter((point) => point.x !== null && point.y !== null)
      .slice(0, 500);
    if (points.length) {
      charts.push({
        id: "scatter",
        type: "scatter",
        title: `Relacao entre ${numeric[0].name} e ${numeric[1].name}`,
        x: points.map((point) => point.x),
        y: points.map((point) => point.y),
        xLabel: numeric[0].name,
        yLabel: numeric[1].name,
      });
    }
  }

  if (numeric.length) {
    const values = rows.map((row) => parseNumber(row[numeric[0].name])).filter((value) => value !== null).slice(0, 1000);
    if (values.length) {
      charts.push({
        id: "distribution",
        type: "histogram",
        title: `Distribuicao de ${numeric[0].name}`,
        x: values,
        xLabel: numeric[0].name,
      });
    }
  }

  return charts.slice(0, 5);
}

function buildAnalystReport(filename, rows, columns, charts, qualityScore) {
  const numeric = columns.filter((column) => column.type === "numeric");
  const categories = columns.filter((column) => ["categorical", "boolean"].includes(column.type));
  const firstMetric = numeric[0];
  const firstCategory = categories[0];
  const topCategory = firstMetric && firstCategory
    ? groupByCategory(rows, firstCategory.name, firstMetric.name, "sum")[0]
    : null;
  const missingCells = columns.reduce((sum, column) => sum + column.missing_count, 0);
  const qualityLabel = qualityScore >= 90 ? "alta" : qualityScore >= 75 ? "boa" : "moderada";

  const findings = [
    {
      title: `${rows.length} registros analisados`,
      detail: `O arquivo ${filename} foi processado com ${columns.length} colunas e qualidade ${qualityLabel} (${qualityScore}%).`,
      severity: "media",
    },
  ];
  if (topCategory) {
    findings.push({
      title: `${topCategory.label} lidera ${firstMetric.name}`,
      detail: `A categoria concentra ${formatCompact(topCategory.value)} em ${firstMetric.name}, maior valor agregado da base.`,
      severity: "alta",
    });
  }
  if (firstMetric?.stats) {
    findings.push({
      title: `Indicador principal: ${firstMetric.name}`,
      detail: `Soma de ${formatCompact(firstMetric.stats.sum)} e media de ${formatCompact(firstMetric.stats.mean)} nos registros validos.`,
      severity: "media",
    });
  }

  const risks = [];
  if (missingCells) {
    risks.push({
      title: `${missingCells} campos vazios`,
      detail: "Revise linhas incompletas antes de usar o relatorio para decisao financeira ou operacional.",
      severity: "alta",
    });
  } else {
    risks.push({
      title: "Base sem vazios relevantes",
      detail: "Nao foram encontrados campos vazios nas colunas detectadas, reduzindo risco de leitura parcial.",
      severity: "baixa",
    });
  }

  const opportunities = [
    {
      title: "Dashboard pronto para apresentacao",
      detail: `${charts.length} visualizacoes foram criadas automaticamente para acelerar reunioes e acompanhamento.`,
      impact: "alta",
    },
  ];
  if (firstCategory) {
    opportunities.push({
      title: `Segmentar por ${firstCategory.name}`,
      detail: "Use os maiores grupos para priorizar acoes comerciais, operacionais ou de atendimento.",
      impact: "media",
    });
  }

  const recommendations = [
    {
      title: "Padronizar a planilha de entrada",
      detail: "Mantenha nomes de colunas estaveis para comparar relatorios ao longo do tempo.",
      impact: "media",
    },
    {
      title: "Validar excecoes com a equipe",
      detail: "Combine os graficos com contexto de negocio antes de concluir causas e proximas acoes.",
      impact: "media",
    },
  ];

  return {
    mode: "Smart Analyst Web",
    confidence_score: Math.min(96, 74 + Math.min(18, Math.floor(rows.length / 12))),
    executive_summary: `A analise encontrou ${rows.length} linhas e ${columns.length} colunas. O SmartReports classificou a qualidade dos dados como ${qualityLabel} e gerou indicadores, graficos e insights executivos para apoiar a tomada de decisao.`,
    findings,
    risks,
    opportunities,
    recommendations,
    action_plan: [
      { step: "1", action: "Validar os principais indicadores com a area dona dos dados", owner: "Gestor", priority: "alta" },
      { step: "2", action: "Acompanhar a categoria lider e comparar contra periodos anteriores", owner: "Analista", priority: "media" },
      { step: "3", action: "Corrigir campos vazios e padronizar novas cargas", owner: "Operacoes", priority: missingCells ? "alta" : "baixa" },
    ],
    conclusion: "O relatorio ja esta pronto para exploracao interativa e pode ser exportado para compartilhar uma leitura executiva.",
  };
}

function buildSummaryCards(rows, columns, qualityScore) {
  const cards = [
    { label: "Linhas analisadas", value: rows.length, kind: "neutral" },
    { label: "Colunas detectadas", value: columns.length, kind: "neutral" },
    { label: "Qualidade dos dados", value: `${qualityScore}%`, kind: "success" },
    { label: "Campos vazios", value: columns.reduce((sum, column) => sum + column.missing_count, 0), kind: "warning" },
  ];

  columns
    .filter((column) => column.type === "numeric")
    .slice(0, 4)
    .forEach((column) => {
      cards.push({
        label: `Soma de ${column.name}`,
        value: formatCompact(column.stats?.sum),
        detail: `Media: ${formatCompact(column.stats?.mean)}`,
        kind: "accent",
      });
    });

  return cards.slice(0, 8);
}

function buildAnswer(report, question) {
  const text = String(question || "").toLowerCase();
  const analyst = report.analysis_summary?.analyst_report || {};
  const columns = report.columns_schema?.columns || [];
  const metric = columns.find((column) => column.type === "numeric");
  const category = columns.find((column) => ["categorical", "boolean"].includes(column.type));
  const date = columns.find((column) => column.type === "date");

  if (text.includes("resumo") || text.includes("executivo")) {
    return {
      text: analyst.executive_summary || report.insight_text,
      confidence: "89%",
      evidence: [],
      nextSteps: ["Abrir Smart Analyst", "Exportar PDF"],
    };
  }

  if ((text.includes("melhor") || text.includes("maior")) && date && metric) {
    const trend = (report.analysis_summary?.charts || []).find((chart) => chart.id === "trend");
    if (trend?.x?.length) {
      const bestIndex = trend.y.reduce((best, value, index) => (value > trend.y[best] ? index : best), 0);
      return {
        text: `O melhor periodo detectado foi ${trend.x[bestIndex]}, com ${formatCompact(trend.y[bestIndex])} em ${metric.name}.`,
        confidence: "86%",
        evidence: [{ column: date.name, metric: metric.name }],
        nextSteps: ["Comparar com o periodo anterior", "Ver grafico de tendencia"],
      };
    }
  }

  if (text.includes("crescimento") || text.includes("produtos") || text.includes("categoria")) {
    const chart = (report.analysis_summary?.charts || []).find((item) => item.id === "category-bar");
    if (chart?.x?.length) {
      return {
        text: `${chart.x[0]} aparece como principal destaque em ${metric?.name || "valor"}, com ${formatCompact(chart.y[0])}. Use essa categoria como ponto de partida para investigar crescimento ou concentracao.`,
        confidence: "84%",
        evidence: [{ category: category?.name, metric: metric?.name }],
        nextSteps: ["Filtrar top categorias", "Validar mix e margem"],
      };
    }
  }

  if (text.includes("anomalia") || text.includes("risco") || text.includes("problema")) {
    const risks = analyst.risks || [];
    return {
      text: risks.length
        ? `${risks[0].title}: ${risks[0].detail}`
        : "Nao encontrei riscos fortes nos dados carregados, mas vale revisar valores extremos e campos vazios antes de apresentar.",
      confidence: "81%",
      evidence: risks,
      nextSteps: ["Revisar qualidade dos dados", "Checar outliers"],
    };
  }

  return {
    text: report.insight_text || "A analise esta disponivel. Explore os graficos, colunas detectadas e o Smart Analyst para aprofundar a leitura.",
    confidence: "82%",
    evidence: [],
    nextSteps: ["Abrir dashboards", "Exportar PDF"],
  };
}

function groupByCategory(rows, categoryColumn, metricColumn, mode) {
  const groups = new Map();
  rows.forEach((row) => {
    const label = truncate(normalizeValue(row[categoryColumn]) || "Sem categoria");
    const value = mode === "count" ? 1 : parseNumber(row[metricColumn]) || 0;
    groups.set(label, (groups.get(label) || 0) + value);
  });
  return [...groups.entries()]
    .map(([label, value]) => ({ label, value: round(value, 2) }))
    .sort((a, b) => b.value - a.value);
}

function groupByDate(rows, dateColumn, metricColumn) {
  const groups = new Map();
  rows.forEach((row) => {
    const parsed = parseDate(row[dateColumn]);
    const value = parseNumber(row[metricColumn]);
    if (!parsed || value === null) return;
    const label = parsed.toISOString().slice(0, 10);
    groups.set(label, (groups.get(label) || 0) + value);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-120)
    .map(([label, value]) => ({ label, value: round(value, 2) }));
}

function buildQualityScore(rows, columns) {
  const totalCells = Math.max(rows.length * columns.length, 1);
  const missing = columns.reduce((sum, column) => sum + column.missing_count, 0);
  return Math.max(0, Math.min(100, Math.round(100 - (missing / totalCells) * 70)));
}

function countTypes(columns) {
  return columns.reduce((counts, column) => {
    counts[column.type] = (counts[column.type] || 0) + 1;
    return counts;
  }, {});
}

function toListItem(report) {
  return {
    id: report.id,
    title: report.title,
    filename: report.filename,
    source_sheet: report.source_sheet,
    created_at: report.created_at,
    row_count: report.analysis_summary?.row_count || 0,
    column_count: report.analysis_summary?.column_count || 0,
    insight_preview: (report.insight_text || "").slice(0, 180),
  };
}

function getOwnedReport(ownerId, id) {
  const report = getReports().find((item) => sameId(item.id, id) && item.owner_id === ownerId);
  if (!report) {
    throw new Error("Relatorio nao encontrado.");
  }
  return report;
}

function getUserFromToken(token) {
  if (!token || !String(token).startsWith(DEMO_TOKEN_PREFIX)) {
    throw new Error("Sessao demo expirada. Faca login novamente.");
  }
  const userId = String(token).slice(DEMO_TOKEN_PREFIX.length).split(".")[0];
  const user = ensureUsers().find((item) => item.id === userId);
  if (!user) {
    throw new Error("Sessao demo expirada. Faca login novamente.");
  }
  return user;
}

function ensureUsers() {
  const users = readJson(USERS_KEY, []);
  if (!users.some((user) => user.id === demoUser.id)) {
    const next = [demoUser, ...users];
    saveUsers(next);
    return next;
  }
  return users;
}

function getReports() {
  return readJson(REPORTS_KEY, []);
}

function saveReports(reports) {
  writeJson(REPORTS_KEY, reports);
}

function saveUsers(users) {
  writeJson(USERS_KEY, users);
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    company_name: user.company_name,
    email: user.email,
    created_at: user.created_at,
  };
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const original = String(value ?? "").trim();
  if (!original) return null;
  let text = original.replace(/[R$\s%]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+,\d+$/.test(text)) {
    text = text.replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value ?? "").trim();
  if (!text || /^\d+([,.]\d+)?$/.test(text)) return null;
  const br = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const date = new Date(Date.UTC(year, Number(br[2]) - 1, Number(br[1])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function topCounts(values, limit) {
  const counts = new Map();
  values.forEach((value) => {
    const label = normalizeValue(value) || "Sem valor";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  return (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
}

function cleanHeader(value, index) {
  const text = String(value ?? "").trim();
  return text && !text.toLowerCase().startsWith("unnamed") ? text : `Coluna ${index + 1}`;
}

function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map((header) => {
    const count = (seen.get(header) || 0) + 1;
    seen.set(header, count);
    return count === 1 ? header : `${header} ${count}`;
  });
}

function titleFromFilename(filename) {
  return safeFilename(filename)
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Nova Analise";
}

function safeFilename(value) {
  return String(value || "relatorio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim();
}

function isFilled(value) {
  return normalizeValue(value) !== "";
}

function sameId(left, right) {
  return String(left) === String(right);
}

function truncate(value, length = 40) {
  const text = String(value ?? "");
  return text.length <= length ? text : `${text.slice(0, length - 1)}...`;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (Math.abs(number) >= 1_000_000) return `${round(number / 1_000_000, 2)}M`;
  if (Math.abs(number) >= 1_000) return `${round(number / 1_000, 2)}k`;
  return Number.isInteger(number) ? String(number) : String(round(number, 2));
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function createId(prefix) {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pause(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildPdfBlob(lines) {
  const safeLines = lines.flatMap((line) => wrapPdfLine(stripPdfText(line), 96)).slice(0, 42);
  const content = safeLines
    .map((line, index) => {
      const size = index === 0 ? 18 : 10;
      const y = 770 - index * 16;
      return `BT /F1 ${size} Tf 48 ${y} Td (${escapePdf(line)}) Tj ET`;
    })
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function wrapPdfLine(line, limit) {
  const words = String(line || "").split(/\s+/);
  const result = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > limit) {
      if (current) result.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current || !result.length) result.push(current);
  return result;
}

function stripPdfText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdf(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
