import type { Metadata } from "next";
import "./globals.css";
import "./premium.css";
import "./red-theme.css";
import "./dark-theme.css";
import "./light-theme.css";
import "./workspace-operations.css";
import "./agency-studio.css";
import "./unified-premium.css";
import "./public-appearance.css";
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
      <body className="premium-theme light-theme site-studio">{children}</body>
    </html>
  );
}
