import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  trailingSlash: true,
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
