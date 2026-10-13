import type { Metadata } from "next";
import "./globals.css";

import { AccountBar } from "@/components/app/account-bar";

export const metadata: Metadata = {
  title: "South Texas Builders Project Health",
  description: "AI-assisted construction project health from QuickBooks Online.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AccountBar />
        {children}
      </body>
    </html>
  );
}
