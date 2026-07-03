import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INVINCIBLE STUDIOS Captions | Powered by Studio Ultimate",
  description: "Next-gen subtitle editor that automatically transcribes, translates, styles, animates, and exports professional-grade captions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased selection:bg-rose-500/30 selection:text-rose-200">
      <body className="min-h-full flex flex-col bg-[#020205] text-[#f8fafc]">
        {children}
      </body>
    </html>
  );
}
