import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zipchat · EXIT Toys",
  description: "Het Zipchat-dashboard van EXIT Toys: de AI-assistent op de webshops en het doorzetten naar Mobile Service Cloud",
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
