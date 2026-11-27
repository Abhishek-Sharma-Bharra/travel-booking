"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
export default function PublicAppearance({
  children,
}: {
  children: ReactNode;
}) {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    try {
      if (localStorage.getItem("travelos-public-appearance") === "dark")
        setTheme("dark");
    } catch {
      /* A blocked storage area must not break the page. */
    }
  }, []);
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("travelos-public-appearance", next);
    } catch {}
  }
  return (
    <div className="public-appearance" data-appearance={theme}>
      {children}
      <button
        className="public-theme-toggle"
        aria-label={
          theme === "light" ? "Use dark appearance" : "Use light appearance"
        }
        aria-pressed={theme === "dark"}
        onClick={toggle}
        type="button"
      >
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
      </button>
    </div>
  );
}
