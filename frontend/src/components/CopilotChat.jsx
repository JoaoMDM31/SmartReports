import { Bot, Copy, Loader2, Plus, SendHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

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

  const disabled = !report?.id || busy;
  const title = useMemo(() => report?.title || "analise atual", [report]);

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

  return (
    <section className="copilot-panel">
      <header>
        <div>
          <span className="eyebrow">Chat com IA</span>
          <h2>{title}</h2>
        </div>
        <button className="upgrade-button small" type="button" onClick={() => setMessages([])}>
          <Plus size={15} /> Novo chat
        </button>
      </header>

      <div className="assistant-intro">
        <span className="analyst-icon"><Bot size={18} /></span>
        <p><strong>Ola! Sou seu analista de dados com IA.</strong> Pergunte qualquer coisa sobre suas analises e dados.</p>
      </div>

      <div className="chat-suggestions">
        {suggestions.map((suggestion) => (
          <button key={suggestion} onClick={() => ask(suggestion)} disabled={disabled}>
            {suggestion}
          </button>
        ))}
      </div>

      <div className="chat-log" aria-live="polite">
        {!messages.length && (
          <p className="muted">Selecione uma analise ou envie uma planilha para ativar o chat contextual.</p>
        )}
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={message.role}>
            <p>{message.text}</p>
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
            <Loader2 size={16} /> Analisando dados...
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
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={!report?.id}
          placeholder={report?.id ? "Digite sua pergunta..." : "Envie uma planilha primeiro"}
          aria-label="Pergunta para a IA"
        />
        <button className="icon-button" disabled={disabled || !question.trim()} aria-label="Enviar pergunta">
          <SendHorizontal size={17} />
        </button>
      </form>
      {error && <span className="inline-error" role="alert">{error}</span>}
    </section>
  );
}
