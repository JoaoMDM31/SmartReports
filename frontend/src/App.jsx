import { useEffect, useMemo, useState } from "react";

import AuthView from "./components/AuthView.jsx";
import Shell from "./components/Shell.jsx";
import {
  fetchDashboardSummary,
  deleteReport,
  fetchMe,
  fetchReport,
  fetchReports,
  updateReport,
} from "./services/api.js";

const TOKEN_KEY = "smartreports.token";
const THEME_KEY = "smartreports.theme";
const TRASH_KEY = "smartreports.trash";

function readTrash() {
  try {
    return JSON.parse(localStorage.getItem(TRASH_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [trashedReports, setTrashedReports] = useState(readTrash);
  const [selectedReport, setSelectedReport] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    async function bootstrap() {
      setLoading(true);
      setError("");
      try {
        const [me, reportList, dashboard] = await Promise.all([
          fetchMe(token),
          fetchReports(token),
          fetchDashboardSummary(token),
        ]);
        if (!active) return;
        setUser(me);
        setReports(reportList);
        setSummary(dashboard);
        const visibleList = reportList.filter((report) => !trashedReports.some((item) => item.id === report.id));
        if (visibleList.length > 0) {
          const detail = await fetchReport(token, visibleList[0].id);
          if (active) setSelectedReport(detail);
        } else {
          setSelectedReport(null);
        }
      } catch (err) {
        if (!active) return;
        handleLogout();
        setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [token, trashedReports]);

  const displayName = useMemo(() => user?.full_name?.split(" ")[0] || "Usuario", [user]);
  const visibleReports = useMemo(
    () => reports.filter((report) => !trashedReports.some((item) => item.id === report.id)),
    [reports, trashedReports],
  );
  const visibleSummary = useMemo(
    () => (summary ? { ...summary, total_reports: visibleReports.length } : summary),
    [summary, visibleReports.length],
  );

  function updateTrash(nextTrash) {
    setTrashedReports(nextTrash);
    localStorage.setItem(TRASH_KEY, JSON.stringify(nextTrash));
  }

  function handleAuth(accessToken) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    setToken(accessToken);
    setAuthMode("login");
  }

  function handleLogout(nextAuthMode = "login") {
    const safeAuthMode = nextAuthMode === "register" ? "register" : "login";
    localStorage.removeItem(TOKEN_KEY);
    setAuthMode(safeAuthMode);
    setToken(null);
    setUser(null);
    setReports([]);
    setSelectedReport(null);
    setSummary(null);
  }

  function handleShowRegister() {
    handleLogout("register");
  }

  async function refreshReports(nextReport) {
    if (!token) return;
    const [reportList, dashboard] = await Promise.all([
      fetchReports(token),
      fetchDashboardSummary(token),
    ]);
    setReports(reportList);
    setSummary(dashboard);
    setSelectedReport(nextReport || selectedReport);
  }

  async function selectReport(reportId) {
    const detail = await fetchReport(token, reportId);
    setSelectedReport(detail);
  }

  async function renameReport(reportId, title) {
    const detail = await updateReport(token, reportId, { title });
    setSelectedReport(detail);
    await refreshReports(detail);
  }

  async function removeReport(reportId) {
    const target = reports.find((report) => report.id === reportId) || selectedReport;
    if (target) {
      updateTrash([
        {
          id: target.id,
          title: target.title,
          created_at: target.created_at,
          trashedAt: new Date().toISOString(),
        },
        ...trashedReports.filter((report) => report.id !== reportId),
      ]);
    }
    if (selectedReport?.id === reportId) {
      const nextReport = visibleReports.find((report) => report.id !== reportId);
      setSelectedReport(nextReport ? await fetchReport(token, nextReport.id) : null);
    }
  }

  function restoreReport(reportId) {
    updateTrash(trashedReports.filter((report) => report.id !== reportId));
  }

  async function permanentlyDeleteReport(reportId) {
    await deleteReport(token, reportId);
    updateTrash(trashedReports.filter((report) => report.id !== reportId));
    const [reportList, dashboard] = await Promise.all([
      fetchReports(token),
      fetchDashboardSummary(token),
    ]);
    setReports(reportList);
    setSummary(dashboard);
    if (selectedReport?.id === reportId) {
      const nextReport = reportList.find((report) => !trashedReports.some((item) => item.id === report.id && item.id !== reportId));
      setSelectedReport(nextReport ? await fetchReport(token, nextReport.id) : null);
    }
  }

  if (!token) {
    return (
      <AuthView
        error={error}
        initialMode={authMode}
        onAuthenticated={handleAuth}
        theme={theme}
        onThemeChange={() => setTheme(theme === "light" ? "dark" : "light")}
      />
    );
  }

  return (
    <Shell
      displayName={displayName}
      loading={loading}
      reports={visibleReports}
      selectedReport={selectedReport}
      summary={visibleSummary}
      token={token}
      theme={theme}
      trashedReports={trashedReports}
      user={user}
      onLogout={handleLogout}
      onPermanentDeleteReport={permanentlyDeleteReport}
      onRefreshReports={refreshReports}
      onRemoveReport={removeReport}
      onRenameReport={renameReport}
      onRestoreReport={restoreReport}
      onSelectReport={selectReport}
      onShowRegister={handleShowRegister}
      onThemeChange={() => setTheme(theme === "light" ? "dark" : "light")}
    />
  );
}
