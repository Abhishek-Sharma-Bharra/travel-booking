"use client";
import { useRef, useState } from "react";
import { ArrowUpRight, Compass, Menu, X } from "lucide-react";
const links = [
  ["#home", "Home"],
  ["#features", "Features"],
  ["#workspaces", "Solutions"],
  ["#intelligence", "AI Intelligence"],
  ["#pricing", "Pricing"],
  ["#demo", "Demo"],
];
export default function HomepageNav() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <header className="saas-header">
      <nav className="saas-nav" aria-label="Main navigation">
        <a href="/" className="saas-brand" aria-label="Vashisht TravelOS home">
          <span>
            <Compass size={25} />
          </span>
          <strong>
            VASHISHT<small>TRAVELOS</small>
          </strong>
        </a>
        <button
          ref={toggle}
          className="saas-menu-toggle"
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="homepage-navigation"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div
          id="homepage-navigation"
          className={`saas-nav-links ${open ? "is-open" : ""}`}
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              toggle.current?.focus();
            }
          }}
        >
          {links.map(([href, title]) => (
            <a href={href} key={href}>
              {title}
            </a>
          ))}
          <a className="saas-login" href="/login" aria-label="Agency sign in">
            Login
          </a>
          <a className="btn primary saas-nav-trial" href="/login?signup=1">
            Start free trial
            <ArrowUpRight size={14} />
          </a>
        </div>
      </nav>
    </header>
  );
}
