import {
  Bot,
  Copy,
  Database,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import BrandLogo from "./BrandLogo.jsx";
import { chatWithReport } from "../services/api.js";

const suggestions = [
  "Qual foi o melhor mes em vendas?",
  "Quais produtos cresceram mais?",
  "Faca um resumo executivo.",
  "Quais regioes possuem maior margem?",
  "Existem anomalias nos dados?",
];

export default function CopilotChat({
  report,
  reports = [],
  token,
  variant = "panel",
  onSelectReport,
}) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState({});
  const textareaRef = useRef(null);
  const logRef = useRef(null);

  const isPage = variant === "page";
  const disabled = !report?.id || busy;
  const title = useMemo(() => report?.title || "analise atual", [report]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [question]);

  useEffect(() => {
    if (!isPage || !logRef.current || !messages.length) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [busy, isPage, messages.length]);

  async function requestAnswer(nextQuestion, options = {}) {
    const { includeUser = true, replaceAssistantIndex = null } = options;
    const trimmed = nextQuestion.trim();
    if (!trimmed || !report?.id) return;

    setBusy(true);
    setError("");
    setQuestion("");
    if (includeUser) {
      setMessages((current) => [...current, { role: "user", text: trimmed, createdAt: new Date().toISOString() }]);
    }

    try {
      const response = await chatWithReport(token, report.id, trimmed);
      const assistantMessage = {
        role: "assistant",
        text: response.answer,
        confidence: response.confidence,
        nextSteps: response.next_steps || [],
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => {
        if (replaceAssistantIndex === null) return [...current, assistantMessage];
        return current.map((message, index) => (index === replaceAssistantIndex ? assistantMessage : message));
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function ask(nextQuestion = question) {
    requestAnswer(nextQuestion);
  }

  function regenerate(index) {
    const previousUser = messages
      .slice(0, index)
      .reverse()
      .find((message) => message.role === "user");
    if (!previousUser) return;
    requestAnswer(previousUser.text, { includeUser: false, replaceAssistantIndex: index });
  }

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }

  function resetChat() {
    setMessages([]);
    setQuestion("");
    setError("");
    setFeedback({});
  }

  function toggleFeedback(index, value) {
    setFeedback((current) => {
      const next = { ...current };
      if (next[index] === value) {
        delete next[index];
      } else {
        next[index] = value;
      }
      return next;
    });
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    ask();
  }

  function handleReportChange(event) {
    if (!event.target.value || !onSelectReport) return;
    onSelectReport(event.target.value);
  }

  return (
    <section className={`copilot-panel ${isPage ? "chat-page-panel" : ""}`}>
      {isPage ? (
        <header className="chat-page-header">
          <BrandLogo variant="horizontal" />
          <label className="chat-analysis-picker">
            <Database size={15} />
            <span>Analise atual</span>
            <select value={report?.id || ""} onChange={handleReportChange} disabled={!reports.length || !onSelectReport}>
              <option value="" disabled>Nenhuma analise selecionada</option>
              {reports.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </label>
          <button className="upgrade-button small" type="button" onClick={resetChat}>
            <Plus size={15} /> Novo chat
          </button>
        </header>
      ) : (
        <header className="copilot-header">
          <div>
            <span className="eyebrow">Assistente de dados</span>
            <h2>Chat com IA</h2>
            <small>{title}</small>
          </div>
          <button className="upgrade-button small" type="button" onClick={resetChat}>
            <Plus size={15} /> Novo chat
          </button>
        </header>
      )}

      {!isPage && (
        <div className="assistant-intro">
          <span className="analyst-icon"><Bot size={18} /></span>
          <p><strong>Ola! Sou seu analista de dados com IA.</strong> Pergunte qualquer coisa sobre suas analises e dados.</p>
        </div>
      )}

      {isPage && !messages.length && (
        <section className="chat-hero">
          <span className="chat-hero-logo"><BrandLogo variant="icon" /></span>
          <h2>Como posso ajudar voce hoje?</h2>
          <p>Faca perguntas sobre sua analise atual.</p>
          <SuggestionChips suggestions={suggestions} disabled={disabled} onAsk={ask} />
          <span className="chat-or-divider">ou faca sua propria pergunta</span>
        </section>
      )}

      {!isPage && !messages.length && (
        <SuggestionChips suggestions={suggestions} disabled={disabled} onAsk={ask} />
      )}

      <div className="chat-log" aria-live="polite" ref={logRef}>
        {!messages.length && !isPage && (
          <div className="chat-empty-state">
            <p>Selecione uma analise ou envie uma planilha para ativar o chat contextual.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={message.role}>
            {isPage && message.role === "assistant" && (
              <span className="message-avatar assistant"><Bot size={16} /></span>
            )}
            <div className="message-bubble">
              <MessageContent text={message.text} />
              {!isPage && message.confidence && <small>Confianca: {message.confidence}</small>}
              {!isPage && !!message.nextSteps?.length && (
                <div className="next-steps">
                  {message.nextSteps.map((step) => <span key={step}>{step}</span>)}
                </div>
              )}
            </div>
            {isPage && message.role === "user" && (
              <span className="message-avatar user">U</span>
            )}
            {message.role === "assistant" && (
              <div className="message-actions" aria-label="Acoes da resposta">
                <button type="button" onClick={() => copy(message.text)} aria-label="Copiar resposta">
                  <Copy size={14} />
                </button>
                <button type="button" onClick={() => regenerate(index)} disabled={busy || !report?.id} aria-label="Regenerar resposta">
                  <RefreshCw size={14} />
                </button>
                <button
                  className={feedback[index] === "up" ? "active" : ""}
                  type="button"
                  onClick={() => toggleFeedback(index, "up")}
                  aria-label="Curtir resposta"
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  className={feedback[index] === "down" ? "active" : ""}
                  type="button"
                  onClick={() => toggleFeedback(index, "down")}
                  aria-label="Nao curtir resposta"
                >
                  <ThumbsDown size={14} />
                </button>
              </div>
            )}
          </article>
        ))}
        {busy && (
          <article className="assistant loading">
            {isPage && <span className="message-avatar assistant"><Bot size={16} /></span>}
            <div className="message-bubble"><Loader2 size={16} /> IA pensando...</div>
          </article>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        {isPage && (
          <button className="icon-button compact chat-attach-button" type="button" disabled title="Anexar contexto em breve" aria-label="Anexar contexto">
            <Paperclip size={16} />
          </button>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!report?.id}
          placeholder={report?.id ? "Pergunte qualquer coisa sobre sua analise..." : "Envie uma planilha primeiro"}
          aria-label="Pergunta para a IA"
        />
        <button className="icon-button" disabled={disabled || !question.trim()} aria-label="Enviar pergunta">
          <SendHorizontal size={17} />
        </button>
      </form>
      {isPage && <p className="chat-disclaimer">SmartReports pode cometer erros. Verifique informacoes importantes.</p>}
      {!isPage && question.trim() && !busy && <span className="typing-status">digitando...</span>}
      {error && <span className="inline-error" role="alert">{error}</span>}
    </section>
  );
}

function SuggestionChips({ disabled, onAsk, suggestions: items }) {
  return (
    <div className="chat-suggestions">
      {items.map((suggestion) => (
        <button key={suggestion} onClick={() => onAsk(suggestion)} disabled={disabled} type="button">
          <Sparkles size={14} />
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function MessageContent({ text }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="message-content">
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <pre key={index}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={index}>
              {block.items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>)}
            </Tag>
          );
        }
        if (block.type === "table") {
          return (
            <div className="message-table-wrap" key={index}>
              <table>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${index}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        rowIndex === 0
                          ? <th key={`${index}-${rowIndex}-${cellIndex}`}>{renderInline(cell)}</th>
                          : <td key={`${index}-${rowIndex}-${cellIndex}`}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

function parseBlocks(text = "") {
  const lines = String(text).split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    if (isTableLine(line) && isTableSeparator(lines[index + 1])) {
      const rows = [splitTableLine(line)];
      index += 2;
      while (isTableLine(lines[index])) {
        rows.push(splitTableLine(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    const listMatch = line.match(/^(\d+\.|-|\*)\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d+\./.test(listMatch[1]);
      const items = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const match = current.match(/^(\d+\.|-|\*)\s+(.+)$/);
        if (!match || (/^\d+\./.test(match[1]) !== ordered)) break;
        items.push(match[2]);
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !lines[index].trim().match(/^(\d+\.|-|\*)\s+(.+)$/)) {
      if (lines[index].trim().startsWith("```") || isTableLine(lines[index])) break;
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks.length ? blocks : [{ type: "paragraph", text }];
}

function isTableLine(line = "") {
  const value = String(line).trim();
  return value.includes("|") && value.split("|").filter(Boolean).length >= 2;
}

function isTableSeparator(line = "") {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line));
}

function splitTableLine(line) {
  return String(line)
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(text) {
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
