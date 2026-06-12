import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ttpkyepzzpxctajrhwvx.supabase.co",
        pathname: "/storage/v1/object/public/stb-project-renders/**",
      },
    ],
  },
};

export default nextConfig;
