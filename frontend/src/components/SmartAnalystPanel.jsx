import { AlertTriangle, CheckCircle2, Lightbulb, ListChecks, Sparkles, Target } from "lucide-react";

const sectionMeta = {
  findings: { title: "Descobertas", icon: Sparkles },
  risks: { title: "Riscos", icon: AlertTriangle },
  opportunities: { title: "Oportunidades", icon: Lightbulb },
  recommendations: { title: "Recomendacoes", icon: Target },
};

export default function SmartAnalystPanel({ report }) {
  const analyst = report?.analysis_summary?.analyst_report;

  if (!analyst) {
    return (
      <section className="smart-analyst-panel">
        <header>
          <span className="analyst-icon"><Sparkles size={18} /></span>
          <div>
            <span className="eyebrow">Smart Analyst</span>
            <h2>Aguardando dados</h2>
          </div>
        </header>
        <p className="muted">Envie uma planilha para gerar resumo executivo, riscos e plano de acao.</p>
      </section>
    );
  }

  return (
    <section className="smart-analyst-panel">
      <header>
        <span className="analyst-icon"><Sparkles size={18} /></span>
        <div>
          <span className="eyebrow">{analyst.mode || "Smart Analyst"}</span>
          <h2>Consultor empresarial</h2>
        </div>
        <strong className="confidence-score">{analyst.confidence_score}%</strong>
      </header>

      <div className="executive-summary">
        <p>{analyst.executive_summary}</p>
      </div>

      <div className="analyst-sections">
        {Object.entries(sectionMeta).map(([key, meta]) => (
          <AnalystSection key={key} icon={meta.icon} title={meta.title} items={analyst[key]} />
        ))}
      </div>

      <div className="action-plan">
        <div className="section-title">
          <ListChecks size={16} />
          <h3>Plano de acao</h3>
        </div>
        {(analyst.action_plan || []).map((item) => (
          <article key={`${item.step}-${item.action}`}>
            <span>{item.step}</span>
            <div>
              <strong>{item.action}</strong>
              <small>{item.owner} - prioridade {item.priority}</small>
            </div>
          </article>
        ))}
      </div>

      {analyst.conclusion && (
        <div className="analyst-conclusion">
          <CheckCircle2 size={16} />
          <p>{analyst.conclusion}</p>
        </div>
      )}
    </section>
  );
}

function AnalystSection({ icon: Icon, title, items = [] }) {
  if (!items.length) return null;

  return (
    <div className="analyst-section">
      <div className="section-title">
        <Icon size={16} />
        <h3>{title}</h3>
      </div>
      <div className="analyst-list">
        {items.slice(0, 3).map((item) => (
          <article key={`${title}-${item.title}`}>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
