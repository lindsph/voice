import type { Metadata } from "next";
import { Geist, Inter, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const display = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const label = Geist({
  subsets: ["latin"],
  variable: "--font-label",
});

export const metadata: Metadata = {
  title: "Voice",
  description: "One teacher for every mouth. Profiles, golds, learnings, generate.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`dark ${display.variable} ${body.variable} ${label.variable}`} lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background font-body-md text-body-md text-on-surface antialiased selection:bg-primary-container/20 selection:text-primary">
        {children}
      </body>
    </html>
  );
}
