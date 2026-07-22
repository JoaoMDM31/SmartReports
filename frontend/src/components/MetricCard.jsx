import { Activity, Database, FileSpreadsheet, Gauge, TriangleAlert } from "lucide-react";

const iconMap = {
  neutral: Database,
  success: Gauge,
  warning: TriangleAlert,
  accent: Activity,
};

export default function MetricCard({ metric }) {
  const Icon = iconMap[metric.kind] || FileSpreadsheet;

  return (
    <article className={`metric-card ${metric.kind || "neutral"}`} title={metric.detail || metric.label}>
      <span className="metric-icon">
        <Icon size={18} />
      </span>
      <div>
        <p>{metric.label}</p>
        <strong>{metric.value}</strong>
        <span>{metric.detail || "Dados reais do workspace"}</span>
      </div>
      <svg className="sparkline" viewBox="0 0 64 28" aria-hidden="true">
        <path d="M4 22 L16 15 L26 18 L38 8 L48 13 L60 4" />
      </svg>
    </article>
  );
}
