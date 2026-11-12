import type { Metadata } from "next";
import "./globals.css";
import { publicOrigin } from "@/lib/seo";
export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin()),
  title: "Vashisht TravelOS | Vashisht Analytics",
  robots: { index: false, follow: false },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
  description:
    "From the first enquiry to the final mile. A workspace for growing travel agencies.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
