import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Flags were renamed to requests; keeps links in older emails working.
  async redirects() {
    return [{ source: "/flags", destination: "/requests", permanent: true }];
  },
};

export default nextConfig;
