import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "South Texas Builders Project Health",
  description: "AI-assisted construction project health from QuickBooks Online.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
