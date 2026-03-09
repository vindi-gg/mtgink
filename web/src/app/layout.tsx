import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
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
  title: {
    default: "MTG Ink — Discover & Rank Magic Cards and Art",
    template: "%s",
  },
  description:
    "Discover and rank the best Magic: The Gathering cards and art. Compare card art, explore printings, and find your favorites.",
  openGraph: {
    type: "website",
    siteName: "MTG Ink",
    title: "MTG Ink — Discover & Rank Magic Cards and Art",
    description:
      "Discover and rank the best Magic: The Gathering cards and art.",
  },
  twitter: {
    card: "summary",
    title: "MTG Ink — Discover & Rank Magic Cards and Art",
    description:
      "Discover and rank the best Magic: The Gathering cards and art.",
  },
};

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
        <Navbar />
        {children}
      </body>
    </html>
  );
}
