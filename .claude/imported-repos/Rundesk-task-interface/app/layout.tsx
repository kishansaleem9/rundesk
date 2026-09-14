import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rundesk Tasks",
  description: "Rundesk-style project, folder, list and task management interface",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
