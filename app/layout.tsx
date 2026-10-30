import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Assistant } from "@/components/Assistant";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KREATIVES Outreach",
  description: "Lead scraper, qualifier, website-analist en tracker voor KREATIVES.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className={interTight.className}>
        <div className="app">
          <Sidebar />
          <main className="main">{children}</main>
          <Assistant />
        </div>
      </body>
    </html>
  );
}
