"use client";
import type { InputHTMLAttributes } from "react";
import { readApiJson } from "@/lib/api-response";
export async function command(action: string, payload: unknown) {
  return readApiJson<Record<string, unknown>>(
    await fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
  );
}
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
export const value = (f: FormData, k: string) => String(f.get(k) || "");
export const number = (f: FormData, k: string) => Number(f.get(k));
export function noticeError(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Request failed; check your records before retrying";
}
