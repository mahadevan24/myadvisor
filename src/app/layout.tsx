import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "MyAdvisor — Your second mind",
  description: "Personal AI companions. Conversations that become knowledge.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
