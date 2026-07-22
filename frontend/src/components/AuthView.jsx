import { Eye, EyeOff, Lock, Mail, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import BrandLogo from "./BrandLogo.jsx";
import { loginUser, registerUser } from "../services/api.js";

export default function AuthView({ error, initialMode = "login", onAuthenticated, theme, onThemeChange }) {
  const safeInitialMode = initialMode === "register" ? "register" : "login";
  const [mode, setMode] = useState(safeInitialMode);
  const [form, setForm] = useState({
    full_name: "",
    company_name: "",
    email: "",
    password: "",
  });
  const [status, setStatus] = useState("");
  const [localError, setLocalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setMode(safeInitialMode);
    setLocalError("");
  }, [safeInitialMode]);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("Validando acesso...");
    setLocalError("");
    try {
      if (mode === "register") {
        await registerUser(form);
      }
      const session = await loginUser({ email: form.email, password: form.password });
      onAuthenticated(session.access_token);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setStatus("");
    }
  }

  return (
    <main className="auth-screen">
      <button className="icon-button auth-theme" onClick={onThemeChange} aria-label="Alternar tema">
        {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <section className="auth-stage" aria-label="SmartReports login">
        <div className="auth-brand">
          <BrandLogo />
          <p>Inteligencia que transforma dados em decisoes.</p>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div>
            <h1>{mode === "login" ? "Bem-vindo de volta" : "Crie sua conta"}</h1>
            <p>{mode === "login" ? "Faca login para continuar" : "Configure seu acesso ao SmartReports"}</p>
          </div>

          {mode === "register" && (
            <>
              <label>
                Nome completo
                <input
                  required
                  minLength={2}
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                  placeholder="Ana Martins"
                />
              </label>
              <label>
                Empresa
                <input
                  value={form.company_name}
                  onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                  placeholder="Smart Co."
                />
              </label>
            </>
          )}

          <label>
            E-mail
            <span className="field-control">
              <Mail size={16} />
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="seu@email.com"
              />
            </span>
          </label>
          <label>
            Senha
            <span className="field-control">
              <Lock size={16} />
              <input
                required
                minLength={8}
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="Minimo 8 caracteres"
              />
              <button
                type="button"
                className="field-icon-button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          {mode === "login" && (
            <button
              className="link-button forgot-link"
              type="button"
              onClick={() => setLocalError("Recuperacao de senha ainda nao esta habilitada neste ambiente.")}
            >
              Esqueci minha senha
            </button>
          )}

          {(localError || error) && <p className="form-error" role="alert">{localError || error}</p>}
          <button className="primary-button" type="submit" disabled={Boolean(status)}>
            {status || (mode === "login" ? "Entrar" : "Criar conta")}
          </button>

          <div className="auth-divider"><span>ou continue com</span></div>
          <div className="social-row">
            <button type="button" onClick={() => setLocalError("Login com Google sera conectado em producao.")}>
              <span className="google-mark">G</span> Google
            </button>
            <button type="button" onClick={() => setLocalError("Login com Microsoft sera conectado em producao.")}>
              <span className="microsoft-mark"><i /><i /><i /><i /></span> Microsoft
            </button>
          </div>

          <p className="auth-switch">
            {mode === "login" ? "Ainda nao tem uma conta?" : "Ja tem uma conta?"}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setLocalError("");
                setMode(mode === "login" ? "register" : "login");
              }}
            >
              {mode === "login" ? "Crie agora" : "Entrar"}
            </button>
          </p>
        </form>

        <footer>(c) 2026 SmartReports. Todos os direitos reservados.</footer>
      </section>
    </main>
  );
}
