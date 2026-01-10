import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "KORAUTO",
  description: "Advanced Car Sales Management System",
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

export const viewport = {
  themeColor: "#f8fafc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased bg-[hsl(var(--background))] text-[hsl(var(--foreground))] selection:bg-blue-500/20"
      >
        {children}
      </body>
    </html>
  );
}
