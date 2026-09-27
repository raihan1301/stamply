import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stamply — Loyalty stamp cards for local shops",
  description: "QR stamp cards, rewards, and customer messages for restaurants, barbers, coffee shops and salons.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="bg-ink-900 text-white">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center font-black text-lg">S</span>
              <span className="font-bold text-lg tracking-tight">Stamply</span>
              <span className="text-stone-400 text-sm ml-2 hidden sm:inline">Loyalty stamp cards for local shops</span>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="text-center text-xs text-stone-400 py-6">
            Stamply · Made for Kitchener–Waterloo local businesses
          </footer>
        </div>
      </body>
    </html>
  );
}
