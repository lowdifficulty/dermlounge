import type { NextConfig } from "next";
import { WOUND_CARE_REDIRECTS } from "./lib/wound-care-redirects";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  async redirects() {
    return WOUND_CARE_REDIRECTS.flatMap(({ source, destination }) => [
      { source, destination, permanent: true },
      { source: `${source}/`, destination, permanent: true },
    ]);
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/meta/leads", destination: "/api/meta/leads/" },
        { source: "/api/cron/meta-leads", destination: "/api/cron/meta-leads/" },
        { source: "/api/admin/meta/insights", destination: "/api/admin/meta/insights/" },
        { source: "/api/admin/meta/creative", destination: "/api/admin/meta/creative/" },
        { source: "/api/admin/meta/oauth", destination: "/api/admin/meta/oauth/" },
        { source: "/api/admin/meta/oauth/callback", destination: "/api/admin/meta/oauth/callback/" },
      ],
    };
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
