import { Bot, Copy, Loader2, Plus, SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { chatWithReport } from "../services/api.js";

const suggestions = [
  "Qual foi o melhor mes em vendas?",
  "Quais produtos tiveram maior crescimento?",
  "Faca um resumo executivo.",
  "Quais regioes apresentam maior margem?",
  "Existem anomalias nos dados?",
];

export default function CopilotChat({ report, token }) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef(null);

  const disabled = !report?.id || busy;
  const title = useMemo(() => report?.title || "analise atual", [report]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [question]);

  async function ask(nextQuestion = question) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || !report?.id) return;
    setBusy(true);
    setError("");
    setQuestion("");
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    try {
      const response = await chatWithReport(token, report.id, trimmed);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: response.answer,
          confidence: response.confidence,
          nextSteps: response.next_steps || [],
        },
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }

  function resetChat() {
    setMessages([]);
    setQuestion("");
    setError("");
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    ask();
  }

  return (
    <section className="copilot-panel">
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

      <div className="assistant-intro">
        <span className="analyst-icon"><Bot size={18} /></span>
        <p><strong>Ola! Sou seu analista de dados com IA.</strong> Pergunte qualquer coisa sobre suas analises e dados.</p>
      </div>

      {!messages.length && (
        <div className="chat-suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => ask(suggestion)} disabled={disabled}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="chat-log" aria-live="polite">
        {!messages.length && (
          <div className="chat-empty-state">
            <p>Selecione uma analise ou envie uma planilha para ativar o chat contextual.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={message.role}>
            <MessageContent text={message.text} />
            {message.role === "assistant" && (
              <button className="copy-button" type="button" onClick={() => copy(message.text)} aria-label="Copiar resposta">
                <Copy size={14} />
              </button>
            )}
            {message.confidence && <small>Confianca: {message.confidence}</small>}
            {!!message.nextSteps?.length && (
              <div className="next-steps">
                {message.nextSteps.map((step) => <span key={step}>{step}</span>)}
              </div>
            )}
          </article>
        ))}
        {busy && (
          <article className="assistant loading">
            <Loader2 size={16} /> IA pensando...
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
        <textarea
          ref={textareaRef}
          rows={1}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!report?.id}
          placeholder={report?.id ? "Pergunte qualquer coisa sobre seus dados..." : "Envie uma planilha primeiro"}
          aria-label="Pergunta para a IA"
        />
        <button className="icon-button" disabled={disabled || !question.trim()} aria-label="Enviar pergunta">
          <SendHorizontal size={17} />
        </button>
      </form>
      {question.trim() && !busy && <span className="typing-status">digitando...</span>}
      {error && <span className="inline-error" role="alert">{error}</span>}
    </section>
  );
}

function MessageContent({ text }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="message-content">
      {blocks.map((block, index) => {
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
      if (isTableLine(lines[index])) break;
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
