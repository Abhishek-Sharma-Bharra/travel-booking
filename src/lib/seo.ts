import type { Metadata } from "next";

export const siteName = "Vashisht TravelOS";
export function publicOrigin() {
  const url = new URL(
    process.env.PUBLIC_SITE_URL || "https://vashisht-travelos.onrender.com",
  );
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("PUBLIC_SITE_URL must be a bare HTTPS origin");
  return url.origin;
}
export const indexingEnabled = () =>
  process.env.SITE_INDEXING_ENABLED !== "false";
export const privatePaths = [
  "/workspace",
  "/admin",
  "/api",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/join",
  "/two-factor",
  "/demo",
];
export const publicPages = [
  "/",
  "/features",
  "/pricing",
  "/product-demo",
  "/contact",
  "/guides/enquiry-to-booking",
  "/privacy",
  "/terms",
];
export function publicMetadata(
  path: string,
  title: string,
  description: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: indexingEnabled(), follow: indexingEnabled() },
    openGraph: {
      title,
      description,
      url: path,
      siteName,
      type: "website",
      locale: "en_IN",
    },
    twitter: { card: "summary", title, description },
  };
}
// Explicitly authorized public business contact, separate from mail sender credentials.
export function publicContactEmail() {
  const email = process.env.PUBLIC_CONTACT_EMAIL || "avinav.vashisht@gmail.com";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
