import { Sparkles } from "lucide-react";

export default function InsightsPanel({ report, text }) {
  const analyst = report?.analysis_summary?.analyst_report;
  const important = [
    ...(analyst?.findings || []),
    ...(analyst?.risks || []),
    ...(analyst?.opportunities || []),
  ].slice(0, 3);

  return (
    <section className="insights-panel">
      <header>
        <div>
          <span className="eyebrow">Smart Analyst</span>
          <h2>Insights mais importantes</h2>
        </div>
        <button className="link-button" type="button">Ver todos</button>
      </header>
      {important.length ? (
        <div className="insight-list">
          {important.map((item, index) => (
            <article key={`${item.title}-${index}`}>
              <span className={`insight-priority ${item.severity || item.impact || "media"}`}>
                <Sparkles size={15} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <small>Gerado agora - prioridade {item.severity || item.impact || "media"}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p>{text || "Envie uma planilha para gerar os primeiros insights."}</p>
      )}
    </section>
  );
}
