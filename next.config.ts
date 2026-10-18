import type { NextConfig } from "next";

const PRINT = [
  ["/carte", "carte-visite"],
  ["/depliant", "depliant"],
  ["/lettre", "lettre-avocats"],
] as const;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/reserver", destination: "/fr/reserver", permanent: false },
      { source: "/book", destination: "/en/reserver", permanent: false },
      /* Les liens courts des imprimés, ceux que portent les codes QR. Ils
         restent temporaires : l'adresse imprimée ne change plus, la page où
         elle mène le peut. */
      ...PRINT.map(([path, campaign]) => ({
        source: path,
        destination: `/fr?utm_source=porte-a-porte&utm_medium=print&utm_campaign=${campaign}`,
        permanent: false,
      })),
    ];
  },
};

export default nextConfig;
