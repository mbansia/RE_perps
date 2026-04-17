import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/shared/Providers";
import { Header } from "@/components/layout/Header";
import { MarsLanding } from "@/components/shared/MarsLanding";
import { MarsSurface } from "@/components/shared/MarsSurface";

export const metadata: Metadata = {
  title: "TERRAFORM // Real Estate Perps",
  description: "Trade city-level real estate indices with up to 10x leverage. Built on Integra.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen relative">
        {/* Mars dust ambient particles */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-[20%] left-[15%] w-1 h-1 rounded-full bg-terra/20 animate-dust-float" />
          <div className="absolute top-[60%] left-[75%] w-0.5 h-0.5 rounded-full bg-terra/15 animate-dust-float" style={{ animationDelay: '5s' }} />
          <div className="absolute top-[40%] left-[45%] w-1.5 h-1.5 rounded-full bg-terra/10 animate-dust-float" style={{ animationDelay: '12s' }} />
          <div className="absolute top-[80%] left-[25%] w-0.5 h-0.5 rounded-full bg-oxide/20 animate-dust-float" style={{ animationDelay: '8s' }} />
        </div>

        <Providers>
          <MarsLanding />
          <MarsSurface />
          <div className="relative z-10">
            <Header />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-40">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
