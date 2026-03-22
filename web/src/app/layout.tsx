import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdBanner from "@/components/AdBanner";
import { ImageModeProvider } from "@/lib/image-mode";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mtg.ink"),
  title: {
    default: "MTG Ink — Compare & Rank Every MTG Card Art",
    template: "%s | MTG Ink",
  },
  description:
    "Compare and rank every Magic: The Gathering card art. Browse 37,000+ cards, discover illustrations across all printings, and vote for the best MTG art.",
  openGraph: {
    type: "website",
    siteName: "MTG Ink",
    title: "MTG Ink — Compare & Rank Every MTG Card Art",
    description:
      "Compare and rank every Magic: The Gathering card art. Browse 37,000+ cards, discover illustrations across all printings, and vote for the best MTG art.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MTG Ink — Compare & Rank Every MTG Card Art",
    description:
      "Compare and rank every Magic: The Gathering card art. Browse 37,000+ cards and vote for the best MTG art.",
  },
};

const adsEnabled = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ImageModeProvider>
          <Navbar />
          <div className={adsEnabled ? "pb-[58px] md:pb-[98px]" : ""}>
            {children}
            <Footer />
          </div>
          {adsEnabled && <AdBanner />}
        </ImageModeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
