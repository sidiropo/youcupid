import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NostrProvider } from "@/lib/nostr/NostrContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "YouCupid - Decentralized Dating",
  description: "A decentralized dating app powered by nostr",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full`}>
        <NostrProvider>
          <main className="min-h-screen bg-gradient-to-b from-rose-100 to-custom-green-100 p-2 sm:p-4">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </NostrProvider>
      </body>
    </html>
  );
}
