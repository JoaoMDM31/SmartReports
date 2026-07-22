import { Moon, Sun } from "lucide-react";

export default function ThemeToggle({ theme, onChange }) {
  return (
    <button className="icon-button" onClick={onChange} title="Alternar tema">
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
