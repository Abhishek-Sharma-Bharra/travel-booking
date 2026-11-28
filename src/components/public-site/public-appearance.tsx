"use client";
import { useEffect, useState, type ReactNode } from "react";
import PublicPanels from "./public-panels";
import { usePathname } from "next/navigation";
import { Moon, Sun, MessageCircle } from "lucide-react";
export default function PublicAppearance({
  children,
}: {
  children: ReactNode;
}) {
  const [theme, setTheme] = useState("light");
  const pathname = usePathname();
  const phone = "919717956828";
  useEffect(() => {
    document.body.dataset.appearance = theme;
  }, [theme]);
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
      <PublicPanels phone={phone}>{children}</PublicPanels>
      {!pathname.startsWith("/trips/") && !/^\/stays\/.+/.test(pathname) && (
        <a
          className="platform-whatsapp"
          aria-label="Contact VASHISHT on WhatsApp"
          href={`https://wa.me/${phone}?text=${encodeURIComponent("Namaste VASHISHT team, I would like to discuss TravelOS for my business.")}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={21} />
          <span>WhatsApp us</span>
        </a>
      )}
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
