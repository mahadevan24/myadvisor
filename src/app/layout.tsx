import type { Metadata, Viewport } from "next";
import "./globals.css";
import SpaceBackground from "@/components/SpaceBackground";

export const metadata: Metadata = {
  title: "MyAdvisor — Your second mind",
  description: "Personal AI companions. Conversations that become knowledge.",
  icons: {
    icon: [
      { url: "/icon.svg?v=space-blue-5", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg?v=space-blue-5",
    apple: "/icon.svg?v=space-blue-5",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MyAdvisor",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#030712",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/icon.svg?v=space-blue-5" type="image/svg+xml" sizes="any" />
        <link rel="shortcut icon" href="/icon.svg?v=space-blue-5" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg?v=space-blue-5" />
      </head>
      <body>
        <SpaceBackground />
        {children}
      </body>
    </html>
  );
}
