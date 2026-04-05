import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/pwa/register-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: "TKO Hub",
  description: "Top Kim Oil Operations Hub",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.png",
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TKO Hub",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
