import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Contract and document uploads allow up to 25 MB. The proxy buffers request bodies
    // (10 MB by default, silently truncated past that) and Server Actions reject bodies
    // over 1 MB by default, so both limits need room for a full upload.
    proxyClientMaxBodySize: "30mb",
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
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
