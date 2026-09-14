import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rundesk Chat",
  description: "Team conversations, tasks, and collaboration in one place.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions (Grammarly, ColorZilla, ...) add attributes to <body>
  // before React hydrates. suppressHydrationWarning only silences attribute
  // mismatches on this element; children are still checked.
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
