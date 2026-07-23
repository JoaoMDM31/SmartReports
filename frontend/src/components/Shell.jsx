import {
  Bell,
  CalendarClock,
  ChevronDown,
  ChevronsLeft,
  Database,
  FileSpreadsheet,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Settings,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";

import BrandLogo from "./BrandLogo.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import WorkspaceView from "./WorkspaceView.jsx";

const navPrimary = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "dashboards", label: "Dashboards", icon: LayoutDashboard },
  { id: "relatorios", label: "Relatorios", icon: FileSpreadsheet },
  { id: "chat", label: "Chat com IA", icon: MessageSquareText },
  { id: "agendamentos", label: "Agendamentos", icon: CalendarClock },
  { id: "fontes", label: "Fontes de dados", icon: Database },
  { id: "compartilhados", label: "Compartilhados", icon: Users },
  { id: "lixeira", label: "Lixeira", icon: Trash2 },
];

const navSecondary = [
  { id: "configuracoes", label: "Configuracoes", icon: Settings },
  { id: "ajuda", label: "Ajuda", icon: HelpCircle },
];

const sectionCopy = {
  inicio: "Aqui esta o resumo das suas analises",
  dashboards: "Visualize indicadores e graficos interativos",
  relatorios: "Exporte e organize relatorios profissionais",
  chat: "Converse com a IA sobre seus dados",
  agendamentos: "Programe rotinas de acompanhamento",
  fontes: "Gerencie uploads e fontes de dados",
  compartilhados: "Controle links e relatorios compartilhados",
  lixeira: "Restaure ou exclua relatorios removidos",
  configuracoes: "Ajuste sua conta e preferencias",
  ajuda: "Veja atalhos e informacoes de suporte",
};

export default function Shell({
  displayName,
  loading,
  reports,
  selectedReport,
  summary,
  token,
  theme,
  trashedReports,
  user,
  onLogout,
  onPermanentDeleteReport,
  onRefreshReports,
  onRemoveReport,
  onRenameReport,
  onRestoreReport,
  onSelectReport,
  onShowRegister,
  onThemeChange,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState("inicio");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const currentSection = activeSection === "analises" ? "inicio" : activeSection;
  const displayUser = user?.full_name || "Usuario";
  const initials = displayUser
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BrandLogo variant={collapsed ? "icon" : "horizontal"} compact={collapsed} />
        </div>

        <nav className="sidebar-nav" aria-label="Navegacao principal">
          {navPrimary.map((item) => (
            <button
              key={item.id}
              className={currentSection === item.id ? "active" : ""}
              title={item.label}
              type="button"
              aria-current={currentSection === item.id ? "page" : undefined}
              onClick={() => setActiveSection(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <nav className="sidebar-nav secondary" aria-label="Navegacao secundaria">
            {navSecondary.map((item) => (
              <button
                key={item.id}
                className={currentSection === item.id ? "active" : ""}
                title={item.label}
                type="button"
                aria-current={currentSection === item.id ? "page" : undefined}
                onClick={() => setActiveSection(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <button className="ghost-button" onClick={onLogout}>
            <LogOut size={16} /> <span>Sair</span>
          </button>
          <button
            className="collapse-button"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <ChevronsLeft size={16} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Ola, {displayName}!</h1>
            <p>{sectionCopy[currentSection] || sectionCopy.inicio}</p>
          </div>
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onChange={onThemeChange} />
            <button className="upgrade-button" type="button" onClick={() => setActiveSection("configuracoes")}>
              <Sparkles size={16} /> Upgrade
            </button>
            <div className="topbar-popover-wrap">
              <button
                className="icon-button notification-button"
                aria-label="Notificacoes"
                type="button"
                onClick={() => setNotificationsOpen((current) => !current)}
              >
                <Bell size={17} />
                <span />
              </button>
              {notificationsOpen && (
                <div className="topbar-popover">
                  <strong>Notificacoes</strong>
                  <p>Analise pronta para revisao.</p>
                  <button className="link-button" type="button" onClick={() => setActiveSection("inicio")}>Abrir inicio</button>
                </div>
              )}
            </div>
            <div className="topbar-popover-wrap">
              <button
                className="user-menu"
                type="button"
                aria-label="Menu do usuario"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((current) => !current)}
              >
                <span className="avatar">{initials || "U"}</span>
                <span>
                  <strong>{displayUser}</strong>
                  <small>Plano Pro</small>
                </span>
                <ChevronDown size={16} />
              </button>
              {userMenuOpen && (
                <div className="topbar-popover user-popover">
                  <button type="button" onClick={() => setActiveSection("configuracoes")}>Minha conta</button>
                  <button type="button" onClick={onShowRegister}>Criar nova conta</button>
                  <button type="button" className="danger" onClick={onLogout}>Sair para login</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {currentSection === "inicio" ? (
          <Dashboard
            loading={loading}
            reports={reports}
            selectedReport={selectedReport}
            summary={summary}
            token={token}
            onRefreshReports={onRefreshReports}
            onRemoveReport={onRemoveReport}
            onRenameReport={onRenameReport}
            onSelectReport={onSelectReport}
          />
        ) : (
          <WorkspaceView
            section={currentSection}
            reports={reports}
            selectedReport={selectedReport}
            summary={summary}
            token={token}
            theme={theme}
            trashedReports={trashedReports}
            user={user}
            onLogout={onLogout}
            onPermanentDeleteReport={onPermanentDeleteReport}
            onRefreshReports={onRefreshReports}
            onRemoveReport={onRemoveReport}
            onRenameReport={onRenameReport}
            onRestoreReport={onRestoreReport}
            onSelectReport={onSelectReport}
            onShowRegister={onShowRegister}
            onThemeChange={onThemeChange}
          />
        )}
      </section>
    </div>
  );
}
