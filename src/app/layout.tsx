import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Vashisht TravelOS | Vashisht Analytics",
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
