import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/brand/TopNav";
import { VoiceShell } from "@/components/voice/VoiceShell";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Marhaba — Dubai AI Concierge",
  description:
    "Marhaba, a Dubai AI concierge by Zapcom. Speak or type to plan your day in Dubai, change it on the fly, and find what's nearby. Illustrative prototype.",
  applicationName: "Marhaba",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f4ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1220" },
  ],
};

// Applies a stored theme choice before first paint (no flash).
const THEME_BOOT = `try{var t=localStorage.getItem("marhaba-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cormorant.variable} ${manrope.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="flex min-h-full flex-col text-ink">
        <div
          aria-hidden
          className="mashrabiya pointer-events-none fixed inset-0 -z-10 print-hide"
        />
        <VoiceShell>
          <TopNav />
          <main className="flex flex-1 flex-col">{children}</main>
          <span aria-live="polite" id="trip-announcer" className="sr-only" />
        </VoiceShell>
      </body>
    </html>
  );
}
