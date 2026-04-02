import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TKO Central",
  description: "Top Kim Oil Operations Management System",
  icons: {
    icon: "/logo.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
