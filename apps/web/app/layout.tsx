import type { Metadata } from "next";

import "./globals.css";
import "./ui/design-system.css";

import { ThemeProvider } from "./ui/theme";

export const metadata: Metadata = {
  title: "CityChatbot MVP",
  description: "Production foundation for the CityChatbot service platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
