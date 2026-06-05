import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monsoon Brief",
  description: "A polished Weather-AI dashboard built for the integration assessment challenge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
