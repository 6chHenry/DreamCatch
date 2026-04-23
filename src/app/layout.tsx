import type { Metadata } from "next";
import "./globals.css";
import { dreamHeadlineFont } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "DreamCup AI - 掬梦",
  description: "掬梦（DreamCup）：以多模态 AI 捕捉与承载梦境，如双手捧起、如杯盛水。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`h-full antialiased dark ${dreamHeadlineFont.variable}`}
      // DevTools / extensions (or mobile preview) may inject -webkit-touch-callout on <html> only on the client.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-[#050510] font-sans">
        {children}
      </body>
    </html>
  );
}
