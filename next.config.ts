import type { NextConfig } from "next";
import { WOUND_CARE_REDIRECTS } from "./lib/wound-care-redirects";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  trailingSlash: true,
  async redirects() {
    return WOUND_CARE_REDIRECTS.flatMap(({ source, destination }) => [
      { source, destination, permanent: true },
      { source: `${source}/`, destination, permanent: true },
    ]);
  },
  async rewrites() {
    return [{ source: "/api/meta/leads", destination: "/api/meta/leads/" }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.mydermlounge.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "mydermlounge.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
