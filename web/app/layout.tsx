import type { Metadata } from "next";
import "./globals.css";
import "./experience.css";
import "./visual.css";
import "./proof.css";

export const metadata: Metadata = {
  title: "PrivacyTwin",
  description:
    "A local privacy inventory with evidence-aware, scoped human reviews.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <link rel="stylesheet" href="/fonts/refresh.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
