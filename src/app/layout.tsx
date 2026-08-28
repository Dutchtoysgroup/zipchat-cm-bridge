import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zipchat ↔ CM Bridge",
  description: "Koppeling tussen Zipchat en CM Mobile Service Cloud via de Conversational Router",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
