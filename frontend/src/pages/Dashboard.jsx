import { RefreshCw } from "lucide-react";

import ChartRenderer from "../components/ChartRenderer.jsx";
import ColumnProfiler from "../components/ColumnProfiler.jsx";
import CopilotChat from "../components/CopilotChat.jsx";
import InsightsPanel from "../components/InsightsPanel.jsx";
import MetricCard from "../components/MetricCard.jsx";
import ReportHistory from "../components/ReportHistory.jsx";
import SmartAnalystPanel from "../components/SmartAnalystPanel.jsx";
import UploadDropzone from "../components/UploadDropzone.jsx";
import { downloadReportPdf } from "../services/api.js";

export default function Dashboard({
  loading,
  reports,
  selectedReport,
  summary,
  token,
  onRefreshReports,
  onRemoveReport,
  onRenameReport,
  onSelectReport,
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

  return (
    <main className="dashboard-grid">
      <section className="command-panel">
        <UploadDropzone token={token} onUploaded={onRefreshReports} />
      </section>

      <section className="metric-grid">
        {metrics.slice(0, 8).map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <InsightsPanel report={selectedReport} text={selectedReport?.insight_text} />

      <SmartAnalystPanel report={selectedReport} />

      <section className="charts-section">
        <header>
          <div>
            <span className="eyebrow">Visualizacao</span>
            <h2>{selectedReport?.title || "Aguardando planilha"}</h2>
          </div>
          <div className="chart-actions">
            <button className="ghost-button" onClick={() => selectedReport && onSelectReport(selectedReport.id)}>
              <RefreshCw size={16} /> Atualizar
            </button>
            <button
              className="ghost-button"
              onClick={() => selectedReport && downloadReportPdf(token, selectedReport)}
              disabled={!selectedReport}
            >
              Preparar reuniao
            </button>
          </div>
        </header>
        <div className="charts-grid">
          {(selectedReport?.analysis_summary?.charts || []).map((chart) => (
            <ChartRenderer key={chart.id} chart={chart} />
          ))}
          {!selectedReport?.analysis_summary?.charts?.length && (
            <div className="empty-state">
              <h3>Envie uma planilha para gerar graficos interativos.</h3>
              <p>O SmartReports identifica tipos de colunas e escolhe visualizacoes automaticamente.</p>
            </div>
          )}
        </div>
      </section>

      <ColumnProfiler columns={selectedReport?.columns_schema?.columns || []} />

      <ReportHistory
        reports={reports}
        selectedReport={selectedReport}
        token={token}
        onDelete={onRemoveReport}
        onRename={onRenameReport}
        onSelect={onSelectReport}
      />

      <CopilotChat report={selectedReport} token={token} />
    </main>
  );
}
