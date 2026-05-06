import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/db/expansions", destination: "/sets", permanent: true },
      { source: "/db/expansions/:code", destination: "/sets/:code", permanent: true },
      { source: "/expansions", destination: "/sets", permanent: true },
      { source: "/expansions/:code", destination: "/sets/:code", permanent: true },
    ];
  },
};

export default nextConfig;
