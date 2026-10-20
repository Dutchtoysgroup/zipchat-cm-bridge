import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zipchat-bridge · EXIT Toys",
  description: "Koppeling tussen Zipchat en CM Mobile Service Cloud via de Conversational Router",
  icons: { icon: { url: "/exit-logo.svg", type: "image/svg+xml" } },
};

export const viewport: Viewport = { themeColor: "#638c1c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
