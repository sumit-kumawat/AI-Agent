import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Providers } from "@/components/theme";
import { APPEARANCE_SCRIPT } from "@/lib/appearance";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.AUTH_URL ?? BRAND.appUrl),
  title: {
    default: `${BRAND.product} · ${BRAND.tagline}`,
    template: `%s · ${BRAND.product}`,
  },
  description: BRAND.description,
  applicationName: BRAND.product,
  publisher: BRAND.company,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: BRAND.product,
    title: `${BRAND.product} · ${BRAND.tagline}`,
    description: BRAND.description,
  },
  twitter: { card: "summary", title: BRAND.product, description: BRAND.description },
  appleWebApp: { capable: true, title: BRAND.product, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body
        className="flex min-h-full flex-col font-sans"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
