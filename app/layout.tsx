import type { Metadata, Viewport } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "KORAUTO — Car Sales Management",
  description: "KORAUTO dealership platform for managing inventory, sales, invoices, contracts and customer records.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KORAUTO"
  },
  icons: {
    apple: "/icon-192.png",
    icon: "/icon-192.png"
  },
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable}`}>
      <body
        className="antialiased bg-[hsl(var(--background))] text-[hsl(var(--foreground))] selection:bg-black/15"
      >
        {children}
      </body>
    </html>
  );
}
