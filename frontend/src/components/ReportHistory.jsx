import { Check, Copy, Download, FileSpreadsheet, MoreVertical, Pencil, Search, Star, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { downloadReportPdf } from "../services/api.js";

const FAVORITES_KEY = "smartreports.favoriteReports";

export default function ReportHistory({ reports, selectedReport, token, onDelete, onRename, onSelect }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);

  const filteredReports = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return reports
      .filter((report) => {
        if (!normalized) return true;
        return `${report.title} ${report.filename} ${report.insight_preview}`.toLowerCase().includes(normalized);
      })
      .sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  }, [favorites, query, reports]);

  async function handleDownload(report) {
    setBusyId(report.id);
    setError("");
    try {
      await downloadReportPdf(token, report);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function toggleFavorite(reportId) {
    const next = favorites.includes(reportId)
      ? favorites.filter((id) => id !== reportId)
      : [...favorites, reportId];
    setFavorites(next);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }

  async function saveTitle(report) {
    if (!draftTitle.trim()) return;
    setBusyId(report.id);
    setError("");
    try {
      await onRename(report.id, draftTitle.trim());
      setEditingId(null);
      setDraftTitle("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(report) {
    setBusyId(report.id);
    setError("");
    try {
      await onDelete(report.id);
      setOpenMenuId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="history-panel">
      <header>
        <div>
          <span className="eyebrow">Historico</span>
          <h2>Analises recentes</h2>
        </div>
        <button className="link-button" type="button">Ver todas</button>
      </header>
      <label className="history-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar analises"
          aria-label="Pesquisar analises"
        />
      </label>
      <div className="history-list">
        {filteredReports.slice(0, 6).map((report) => (
          <article
            key={report.id}
            className={selectedReport?.id === report.id ? "active" : ""}
          >
            {editingId === report.id ? (
              <div className="history-main editing">
                <FileSpreadsheet size={18} />
                <span>
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    aria-label="Novo nome da analise"
                  />
                  <small>{formatDate(report.created_at)}</small>
                </span>
              </div>
            ) : (
              <button className="history-main" onClick={() => onSelect(report.id)}>
                <FileSpreadsheet size={18} />
                <span>
                  <strong>{report.title}</strong>
                  <small>{formatDate(report.created_at)}</small>
                </span>
              </button>
            )}
            <span className="status-badge">Concluido</span>
            {editingId === report.id ? (
              <div className="history-actions">
                <button
                  className="icon-button compact"
                  aria-label="Salvar nome"
                  onClick={() => saveTitle(report)}
                  disabled={busyId === report.id}
                >
                  <Check size={16} />
                </button>
                <button className="icon-button compact" aria-label="Cancelar" onClick={() => setEditingId(null)}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="history-actions">
                <button
                  className={`icon-button compact favorite ${favorites.includes(report.id) ? "active" : ""}`}
                  aria-label="Favoritar"
                  onClick={() => toggleFavorite(report.id)}
                >
                  <Star size={16} />
                </button>
                <button
                  className="icon-button compact"
                  aria-label="Mais acoes"
                  onClick={() => setOpenMenuId(openMenuId === report.id ? null : report.id)}
                >
                  <MoreVertical size={16} />
                </button>
                {openMenuId === report.id && (
                  <div className="action-menu">
                    <button type="button" onClick={() => onSelect(report.id)}>
                      <FileSpreadsheet size={15} /> Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(report.id);
                        setDraftTitle(report.title);
                        setOpenMenuId(null);
                      }}
                    >
                      <Pencil size={15} /> Renomear
                    </button>
                    <button type="button" onClick={() => handleDownload(report)} disabled={busyId === report.id}>
                      <Download size={15} /> Baixar relatorio
                    </button>
                    <button
                      type="button"
                      onClick={() => setError("Duplicar analise exige armazenar o arquivo original. Esta acao esta em breve.")}
                    >
                      <Copy size={15} /> Duplicar
                    </button>
                    <button type="button" className="danger" onClick={() => remove(report)} disabled={busyId === report.id}>
                      <Trash2 size={15} /> Excluir
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
        {!filteredReports.length && <p className="muted">Nenhuma analise encontrada.</p>}
      </div>
      {error && <span className="inline-error" role="alert">{error}</span>}
    </section>
  );
}

function formatDate(value) {
  if (!value) return "Agora";
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
