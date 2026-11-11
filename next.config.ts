import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Payment widgets (Razorpay checkout / Stripe) load their own scripts and frames.
const paymentScript = "https://checkout.razorpay.com https://js.stripe.com";
const paymentFrame =
  "https://api.razorpay.com https://checkout.razorpay.com https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com";
const paymentConnect =
  "https://api.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com https://api.stripe.com";
const paymentImg = "https://*.razorpay.com https://*.stripe.com";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${paymentScript}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${paymentImg}`,
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} ${paymentConnect}`,
  `frame-src 'self' ${paymentFrame}`,
  "child-src 'self' blob: " + paymentFrame,
  // The IDE's Monaco editor runs language services in same-origin and blob workers.
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  poweredByHeader: false,
  // Lets phones and other machines on the local network use `npm run dev`.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  serverExternalPackages: ["better-sqlite3", "node-pty", "unpdf", "mammoth", "exceljs"],
  outputFileTracingExcludes: {
    "*": ["./data/**", "./.env*", "./scripts/**", "./drizzle/**", "./public/monaco/**"],
  },
  outputFileTracingIncludes: {
    "/api/ide/**": ["./node_modules/node-pty/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
