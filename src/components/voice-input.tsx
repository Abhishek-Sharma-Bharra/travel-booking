"use client";
import { useEffect, useRef, useState } from "react";
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
export default function VoiceInput({
  onText,
  language = "en",
  maxLength = 1000,
  disabled = false,
}: {
  onText: (text: string) => void;
  language?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  const [available, setAvailable] = useState(false),
    [consent, setConsent] = useState(false),
    [listening, setListening] = useState(false),
    [notice, setNotice] = useState("");
  const active = useRef<Recognition | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    setAvailable(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (disabled) active.current?.abort();
  }, [disabled]);
  return (
    <div className="voice-input">
      <label>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (!e.target.checked) active.current?.abort();
          }}
        />{" "}
        Enable browser voice input. Your browser may send audio to its speech
        service; do not dictate payment credentials or identity documents.
      </label>
      <button
        type="button"
        className="btn secondary"
        disabled={disabled || !available || !consent}
        onClick={() => {
          if (listening) {
            active.current?.abort();
            return;
          }
          const w = window as unknown as {
            SpeechRecognition?: new () => Recognition;
            webkitSpeechRecognition?: new () => Recognition;
          };
          const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
          if (!Constructor) return;
          const r = new Constructor();
          r.lang = language === "hi" ? "hi-IN" : "en-IN";
          r.continuous = false;
          r.interimResults = false;
          r.onresult = (e) => {
            if (!mounted.current) return;
            const text = Array.from(e.results)
              .map((result) => result[0]?.transcript || "")
              .join(" ")
              .slice(0, maxLength);
            onText(text);
            setNotice(
              "Voice draft added. Review it before submitting; no action was taken automatically.",
            );
          };
          r.onerror = (e) => {
            if (mounted.current)
              setNotice(
                e.error === "not-allowed"
                  ? "Microphone permission was denied. You can keep typing."
                  : "Voice input stopped. You can keep typing.",
              );
          };
          r.onend = () => {
            if (mounted.current) setListening(false);
          };
          active.current = r;
          try {
            r.start();
            setListening(true);
            setNotice("");
          } catch {
            setNotice("Voice input could not start. Keep typing.");
          }
        }}
      >
        {listening ? "Stop voice input" : "Dictate your question"}
      </button>
      {!available && (
        <small>
          Voice input is unavailable in this browser; typing works normally.
        </small>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
