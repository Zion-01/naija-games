import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { BackgroundMusic } from "@/components/BackgroundMusic";
import { CosmeticsStyle } from "@/components/CosmeticsStyle";
import { PageAnalytics } from "@/components/PageAnalytics";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// The display face for headings and the wordmark (same as the brand images).
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: "800",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Naija Games",
  description: "Play Whot and Ayo online with your guys. Free in your browser.",
  applicationName: "Naija Games",
  appleWebApp: { capable: true, title: "Naija Games", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf4e6" },
    { media: "(prefers-color-scheme: dark)", color: "#14100c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-NG"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
        <CosmeticsStyle />
        <BackgroundMusic />
        {/* It reads the search params, which needs a Suspense boundary under Cache Components. */}
        <Suspense fallback={null}>
          <PageAnalytics />
        </Suspense>
      </body>
    </html>
  );
}
