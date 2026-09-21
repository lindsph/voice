import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Voice",
  description: "One teacher for every mouth. Profiles, golds, learnings, generate.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              Voice
            </Link>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
