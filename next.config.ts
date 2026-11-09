import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Razorpay Checkout loads its script and opens its payment frame from these hosts.
const razorpay = {
  script: "https://checkout.razorpay.com",
  frame: "https://api.razorpay.com https://checkout.razorpay.com",
  connect: "https://api.razorpay.com https://lumberjack.razorpay.com",
  img: "https://*.razorpay.com",
};

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${razorpay.script}${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${razorpay.img}`,
  "font-src 'self' data:",
  `connect-src 'self' ${razorpay.connect}${isDev ? " ws: wss:" : ""}`,
  `frame-src ${razorpay.frame}`,
  // The IDE's Monaco editor runs language services in same-origin and blob workers.
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${razorpay.frame}`,
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
  serverExternalPackages: ["better-sqlite3", "node-pty"],
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
