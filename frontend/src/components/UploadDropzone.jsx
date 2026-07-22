import { CheckCircle2, FileWarning, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { uploadSpreadsheet } from "../services/api.js";

const allowedExtensions = [".xlsx", ".xls", ".xlsm", ".csv"];

export default function UploadDropzone({ token, onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!busy) return undefined;
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 9, 88));
    }, 220);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function handleFile(file) {
    if (!file) return;
    const extension = `.${file.name.split(".").pop()}`.toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      setError("Arquivo invalido. Envie Excel ou CSV.");
      setSuccess("");
      return;
    }

    setBusy(true);
    setProgress(8);
    setError("");
    setSuccess("");
    try {
      const report = await uploadSpreadsheet(token, file);
      setProgress(100);
      setSuccess("Analise concluida com sucesso.");
      await onUploaded(report);
    } catch (err) {
      setError(err.message);
      setProgress(0);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section
      className={`upload-zone ${dragging ? "dragging" : ""} ${busy ? "processing" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        id="spreadsheet-upload"
        type="file"
        accept=".xlsx,.xls,.xlsm,.csv"
        onChange={(event) => handleFile(event.target.files[0])}
      />
      <span className="upload-icon">
        <UploadCloud size={30} />
      </span>
      <div>
        <h2>Anexe sua planilha</h2>
        <p>Arraste e solte seu arquivo aqui ou clique para selecionar</p>
      </div>
      <small>Suporte: Excel (.xlsx), CSV (.csv). Tamanho maximo: 25 MB.</small>
      <button type="button" className="upload-action" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Processando..." : "Selecionar arquivo"}
      </button>
      {(busy || progress === 100) && (
        <div className="upload-progress" aria-label="Progresso do upload">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      {success && (
        <span className="inline-success">
          <CheckCircle2 size={15} /> {success}
        </span>
      )}
      {error && (
        <span className="inline-error" role="alert">
          <FileWarning size={15} /> {error}
        </span>
      )}
    </section>
  );
}
