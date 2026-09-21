import "./globals.css";
import { Archivo } from "next/font/google";
const archivo = Archivo({ subsets: ["latin", "latin-ext"], weight: "variable", axes: ["wdth"], variable: "--font-archivo", display: "swap" });
export const metadata = { title: "PCG Markets", description: "What PCG-graded Pokémon cards actually sold for", manifest: "/manifest.webmanifest" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}><body className="min-h-screen bg-ground text-ink font-sans flex flex-col">{children}</body></html>
  );
}
