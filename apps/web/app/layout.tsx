import "./globals.css";
import Link from "next/link";
export const metadata = { title: "PCG Markets", description: "What PCG-graded Pokémon cards actually sell for", manifest: "/manifest.webmanifest" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b bg-white"><div className="mx-auto max-w-5xl px-4 py-3"><Link href="/" className="font-semibold">PCG Markets</Link></div></header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-zinc-500">
        Not affiliated with eBay or LY Corporation. Card images © The Pokémon Company / Nintendo / Creatures / GAME FREAK, served from TCGdex. Prices are observed sales, not offers.
      </footer>
    </body></html>
  );
}
