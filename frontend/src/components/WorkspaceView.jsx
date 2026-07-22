import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Link,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import ChartRenderer from "./ChartRenderer.jsx";
import ColumnProfiler from "./ColumnProfiler.jsx";
import CopilotChat from "./CopilotChat.jsx";
import MetricCard from "./MetricCard.jsx";
import ReportHistory from "./ReportHistory.jsx";
import SmartAnalystPanel from "./SmartAnalystPanel.jsx";
import UploadDropzone from "./UploadDropzone.jsx";
import { downloadReportPdf } from "../services/api.js";

const SCHEDULES_KEY = "smartreports.schedules";
const SHARES_KEY = "smartreports.shares";

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function WorkspaceView({
  section,
  reports,
  selectedReport,
  summary,
  token,
  theme,
  user,
  trashedReports,
  onLogout,
  onRefreshReports,
  onRemoveReport,
  onRenameReport,
  onRestoreReport,
  onPermanentDeleteReport,
  onSelectReport,
  onShowRegister,
  onThemeChange,
}) {
  const analyst = selectedReport?.analysis_summary?.analyst_report;
  const insightsCount = analyst
    ? (analyst.findings?.length || 0)
      + (analyst.risks?.length || 0)
      + (analyst.opportunities?.length || 0)
      + (analyst.recommendations?.length || 0)
    : 0;
  const metrics = [
    { label: "Analises realizadas", value: summary?.total_reports || 0, detail: "Total no historico", kind: "neutral" },
    { label: "Relatorios gerados", value: reports.length, detail: "Disponiveis para PDF", kind: "success" },
    { label: "Planilhas processadas", value: summary?.total_reports || 0, detail: `${summary?.total_rows_processed || 0} linhas lidas`, kind: "accent" },
    { label: "Insights gerados", value: insightsCount || "-", detail: selectedReport ? "Da analise selecionada" : "Aguardando analise", kind: "warning" },
  ];

  if (section === "analises") {
    return (
      <Page title="Analises" eyebrow="Smart Analyst" description="Explore os insights, riscos, oportunidades e colunas detectadas da planilha selecionada.">
        <div className="workspace-two-columns">
          <ReportHistory
            reports={reports}
            selectedReport={selectedReport}
            token={token}
            onDelete={onRemoveReport}
            onRename={onRenameReport}
            onSelect={onSelectReport}
          />
          <SmartAnalystPanel report={selectedReport} />
        </div>
        <ColumnProfiler columns={selectedReport?.columns_schema?.columns || []} />
      </Page>
    );
  }

  if (section === "dashboards") {
    return (
      <Page title="Dashboards" eyebrow="Visualizacao" description="Acompanhe graficos interativos e indicadores executivos gerados automaticamente.">
        <section className="metric-grid standalone">
          {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
        </section>
        <section className="charts-section standalone">
          <header>
            <div>
              <span className="eyebrow">Dashboard ativo</span>
              <h2>{selectedReport?.title || "Aguardando planilha"}</h2>
            </div>
            <button className="ghost-button" type="button" onClick={() => selectedReport && onSelectReport(selectedReport.id)} disabled={!selectedReport}>
              Atualizar
            </button>
          </header>
          <div className="charts-grid">
            {(selectedReport?.analysis_summary?.charts || []).map((chart) => (
              <ChartRenderer key={chart.id} chart={chart} />
            ))}
            {!selectedReport?.analysis_summary?.charts?.length && <EmptyState title="Nenhum dashboard ainda" text="Envie uma planilha para gerar graficos interativos." />}
          </div>
        </section>
      </Page>
    );
  }

  if (section === "relatorios") {
    return (
      <Page title="Relatorios" eyebrow="PDF profissional" description="Baixe, renomeie ou selecione relatorios prontos para apresentacao.">
        <ReportCards reports={reports} selectedReport={selectedReport} token={token} onRename={onRenameReport} onSelect={onSelectReport} />
      </Page>
    );
  }

  if (section === "chat") {
    return (
      <Page title="Chat com IA" eyebrow="Assistente de dados" description="Converse com a IA sobre a analise selecionada e copie respostas executivas.">
        <CopilotChat report={selectedReport} token={token} />
      </Page>
    );
  }

  if (section === "agendamentos") {
    return <SchedulesView reports={reports} />;
  }

  if (section === "fontes") {
    return (
      <Page title="Fontes de dados" eyebrow="Entrada de dados" description="Envie novas planilhas e consulte os arquivos que alimentam seus dashboards.">
        <section className="command-panel standalone">
          <UploadDropzone token={token} onUploaded={onRefreshReports} />
        </section>
        <DataSources reports={reports} onSelectReport={onSelectReport} />
      </Page>
    );
  }

  if (section === "compartilhados") {
    return <SharedView reports={reports} selectedReport={selectedReport} onSelectReport={onSelectReport} />;
  }

  if (section === "lixeira") {
    return (
      <TrashView
        trashedReports={trashedReports}
        onPermanentDeleteReport={onPermanentDeleteReport}
        onRestoreReport={onRestoreReport}
      />
    );
  }

  if (section === "configuracoes") {
    return (
      <SettingsView
        theme={theme}
        user={user}
        onLogout={onLogout}
        onShowRegister={onShowRegister}
        onThemeChange={onThemeChange}
      />
    );
  }

  return <HelpView />;
}

function Page({ children, description, eyebrow, title }) {
  return (
    <main className="workspace-page">
      <header className="page-heading">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </main>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function ReportCards({ reports, selectedReport, token, onRename, onSelect }) {
  const [renamingId, setRenamingId] = useState(null);
  const [title, setTitle] = useState("");

  if (!reports.length) {
    return <EmptyState title="Nenhum relatorio gerado" text="Envie uma planilha para criar o primeiro relatorio profissional." />;
  }

  return (
    <section className="report-card-grid">
      {reports.map((report) => (
        <article key={report.id} className={`report-card ${selectedReport?.id === report.id ? "active" : ""}`}>
          <div>
            <span className="report-icon"><FileSpreadsheet size={18} /></span>
            {renamingId === report.id ? (
              <form
                className="inline-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  await onRename(report.id, title.trim() || report.title);
                  setRenamingId(null);
                }}
              >
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
                <button className="primary-button compact-primary" type="submit">Salvar</button>
              </form>
            ) : (
              <>
                <h3>{report.title}</h3>
                <p>{formatDate(report.created_at)}</p>
              </>
            )}
          </div>
          <div className="card-actions">
            <button className="ghost-button" type="button" onClick={() => onSelect(report.id)}>Abrir</button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setRenamingId(report.id);
                setTitle(report.title);
              }}
            >
              Renomear
            </button>
            <button className="ghost-button" type="button" onClick={() => downloadReportPdf(token, report)}>
              <Download size={16} /> PDF
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function SchedulesView({ reports }) {
  const today = new Date().toISOString().slice(0, 10);
  const [schedules, setSchedules] = useState(() => readJson(SCHEDULES_KEY, []));
  const [form, setForm] = useState({
    reportId: reports[0]?.id || "",
    frequency: "Semanal",
    date: today,
    time: "09:00",
  });

  function updateSchedules(next) {
    setSchedules(next);
    saveJson(SCHEDULES_KEY, next);
  }

  return (
    <Page title="Agendamentos" eyebrow="Automacao" description="Programe lembretes locais para revisar ou enviar relatorios.">
      <section className="form-panel">
        <form
          className="settings-grid"
          onSubmit={(event) => {
            event.preventDefault();
            const report = reports.find((item) => String(item.id) === String(form.reportId));
            const next = [
              {
                ...form,
                date: form.date || today,
                id: crypto.randomUUID(),
                reportTitle: report?.title || "Relatorio sem nome",
                createdAt: new Date().toISOString(),
              },
              ...schedules,
            ];
            updateSchedules(next);
          }}
        >
          <label>
            Relatorio
            <select value={form.reportId} onChange={(event) => setForm({ ...form, reportId: event.target.value })} required>
              <option value="" disabled>Selecione</option>
              {reports.map((report) => <option key={report.id} value={report.id}>{report.title}</option>)}
            </select>
          </label>
          <label>
            Frequencia
            <select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>
              <option>Diario</option>
              <option>Semanal</option>
              <option>Mensal</option>
            </select>
          </label>
          <label>
            Data inicial
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
          </label>
          <label>
            Horario
            <input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required />
          </label>
          <button className="primary-button" type="submit"><CalendarClock size={16} /> Criar agendamento</button>
        </form>
      </section>
      <ListPanel
        emptyTitle="Nenhum agendamento"
        emptyText="Crie um lembrete para acompanhar relatorios recorrentes."
        items={schedules}
        render={(item) => (
          <article key={item.id} className="list-row">
            <CalendarClock size={18} />
            <span>
              <strong>{item.reportTitle}</strong>
              <small>{item.frequency} - {item.date || today} as {item.time}</small>
            </span>
            <button className="icon-button compact" type="button" onClick={() => updateSchedules(schedules.filter((entry) => entry.id !== item.id))} aria-label="Remover agendamento">
              <Trash2 size={15} />
            </button>
          </article>
        )}
      />
    </Page>
  );
}

function DataSources({ reports, onSelectReport }) {
  if (!reports.length) {
    return <EmptyState title="Nenhuma fonte conectada" text="Envie uma planilha para criar sua primeira fonte de dados." />;
  }

  return (
    <section className="data-panel standalone">
      <header>
        <div>
          <span className="eyebrow">Arquivos processados</span>
          <h2>Fontes ativas</h2>
        </div>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Tipo</th>
              <th>Criado em</th>
              <th>Status</th>
              <th>Acao</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td>{report.title}</td>
                <td>Planilha</td>
                <td>{formatDate(report.created_at)}</td>
                <td><span className="type-pill">Ativa</span></td>
                <td><button className="link-button" type="button" onClick={() => onSelectReport(report.id)}>Abrir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SharedView({ reports, selectedReport, onSelectReport }) {
  const [shares, setShares] = useState(() => readJson(SHARES_KEY, []));
  const [message, setMessage] = useState("");
  const reportOptions = useMemo(() => reports.map((report) => ({ id: report.id, title: report.title })), [reports]);

  function updateShares(next) {
    setShares(next);
    saveJson(SHARES_KEY, next);
  }

  function createShare() {
    if (!selectedReport) return;
    const url = `${window.location.origin}/?report=${selectedReport.id}`;
    const item = {
      id: crypto.randomUUID(),
      reportId: selectedReport.id,
      title: selectedReport.title,
      url,
      createdAt: new Date().toISOString(),
    };
    updateShares([item, ...shares.filter((share) => share.reportId !== selectedReport.id)]);
    navigator.clipboard?.writeText(url);
    setMessage("Link criado e copiado.");
  }

  return (
    <Page title="Compartilhados" eyebrow="Colaboracao" description="Crie links locais para relatorios selecionados e acompanhe o que foi compartilhado.">
      <section className="form-panel">
        <div className="share-current">
          <Link size={22} />
          <span>
            <strong>{selectedReport?.title || "Nenhum relatorio selecionado"}</strong>
            <small>{reportOptions.length ? "Selecione um relatorio no historico ou crie um link para o atual." : "Envie uma planilha para compartilhar."}</small>
          </span>
          <button className="primary-button compact-primary" type="button" onClick={createShare} disabled={!selectedReport}>
            <Copy size={16} /> Criar link
          </button>
        </div>
        {message && <p className="inline-success"><CheckCircle2 size={16} /> {message}</p>}
      </section>
      <ListPanel
        emptyTitle="Nada compartilhado"
        emptyText="Os links criados aparecem aqui."
        items={shares}
        render={(item) => (
          <article key={item.id} className="list-row">
            <Link size={18} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.url}</small>
            </span>
            <button className="ghost-button" type="button" onClick={() => onSelectReport(item.reportId)}>Abrir</button>
            <button className="icon-button compact" type="button" onClick={() => navigator.clipboard?.writeText(item.url)} aria-label="Copiar link">
              <Copy size={15} />
            </button>
            <button className="icon-button compact" type="button" onClick={() => updateShares(shares.filter((share) => share.id !== item.id))} aria-label="Remover compartilhamento">
              <Trash2 size={15} />
            </button>
          </article>
        )}
      />
    </Page>
  );
}

function TrashView({ trashedReports, onPermanentDeleteReport, onRestoreReport }) {
  const [message, setMessage] = useState("");

  return (
    <Page title="Lixeira" eyebrow="Recuperacao" description="Relatorios removidos ficam ocultos ate serem restaurados ou excluidos definitivamente.">
      <ListPanel
        emptyTitle="Lixeira vazia"
        emptyText="Quando voce excluir um relatorio, ele aparecera aqui antes da remocao definitiva."
        items={trashedReports}
        render={(item) => (
          <article key={item.id} className="list-row">
            <Trash2 size={18} />
            <span>
              <strong>{item.title}</strong>
              <small>Movido em {formatDate(item.trashedAt)}</small>
            </span>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                onRestoreReport(item.id);
                setMessage("Relatorio restaurado.");
              }}
            >
              <RotateCcw size={16} /> Restaurar
            </button>
            <button
              className="ghost-button danger"
              type="button"
              onClick={async () => {
                await onPermanentDeleteReport(item.id);
                setMessage("Relatorio excluido definitivamente.");
              }}
            >
              <Trash2 size={16} /> Excluir
            </button>
          </article>
        )}
      />
      {message && <p className="inline-success"><CheckCircle2 size={16} /> {message}</p>}
    </Page>
  );
}

function SettingsView({ theme, user, onLogout, onShowRegister, onThemeChange }) {
  return (
    <Page title="Configuracoes" eyebrow="Conta e produto" description="Ajuste preferencias locais, confira sua conta e acesse login ou cadastro.">
      <section className="settings-grid">
        <article className="settings-card">
          <Settings size={20} />
          <span>
            <strong>Tema da interface</strong>
            <small>Atual: {theme === "dark" ? "Escuro" : "Claro"}</small>
          </span>
          <button className="ghost-button" type="button" onClick={onThemeChange}>Alternar tema</button>
        </article>
        <article className="settings-card">
          <Sparkles size={20} />
          <span>
            <strong>Plano atual</strong>
            <small>{user?.company_name || "Plano Pro"} - pronto para upgrade comercial.</small>
          </span>
          <button className="upgrade-button" type="button">Upgrade</button>
        </article>
        <article className="settings-card">
          <Plus size={20} />
          <span>
            <strong>Criar outra conta</strong>
            <small>Sai da sessao atual e abre diretamente o cadastro.</small>
          </span>
          <button className="ghost-button" type="button" onClick={onShowRegister}>Ir para cadastro</button>
        </article>
        <article className="settings-card">
          <Trash2 size={20} />
          <span>
            <strong>Sair para login</strong>
            <small>Encerra a sessao e volta para a tela de entrada.</small>
          </span>
          <button className="ghost-button danger" type="button" onClick={onLogout}>Sair</button>
        </article>
      </section>
    </Page>
  );
}

function HelpView() {
  return (
    <Page title="Ajuda" eyebrow="Suporte" description="Atalhos uteis para operar e validar o SmartReports localmente.">
      <section className="help-grid">
        <article className="settings-card">
          <HelpCircle size={20} />
          <span>
            <strong>Como testar</strong>
            <small>Entre, envie uma planilha Excel ou CSV, selecione o relatorio e use PDF, graficos e chat.</small>
          </span>
        </article>
        <article className="settings-card">
          <Database size={20} />
          <span>
            <strong>Swagger da API</strong>
            <small>http://127.0.0.1:8000/api/docs</small>
          </span>
        </article>
        <article className="settings-card">
          <FileSpreadsheet size={20} />
          <span>
            <strong>Planilha de teste</strong>
            <small>outputs/smartreports-test-data/SmartReports_Dados_Teste_Vendas.xlsx</small>
          </span>
        </article>
      </section>
    </Page>
  );
}

function ListPanel({ emptyText, emptyTitle, items, render }) {
  if (!items.length) {
    return <EmptyState title={emptyTitle} text={emptyText} />;
  }

  return <section className="list-panel">{items.map(render)}</section>;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
