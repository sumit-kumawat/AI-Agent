import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.AUTH_URL ?? BRAND.appUrl),
  title: {
    default: `${BRAND.product} · Private AI chat`,
    template: `%s · ${BRAND.product}`,
  },
  description: BRAND.description,
  applicationName: BRAND.product,
  publisher: BRAND.company,
  authors: [{ name: BRAND.company, url: BRAND.companyUrl }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: BRAND.product,
    title: `${BRAND.product} · Private AI chat`,
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.className} flex min-h-full flex-col`}
        suppressHydrationWarning
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
