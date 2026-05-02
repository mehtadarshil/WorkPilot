import type { NextConfig } from "next";

/** Local Express API (see backend `PORT`, default 4000). Used only in `next dev` so `/api/*` is not a 404 on :3001. */
const devBackendOrigin =
  process.env.BACKEND_DEV_ORIGIN || "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${devBackendOrigin.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
