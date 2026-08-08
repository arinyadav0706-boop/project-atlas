/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` exists for the Docker/Azure target only — `docker/Dockerfile`
  // copies `.next/standalone` (ADR-0004, portability). On Vercel it is both
  // redundant and harmful: Vercel builds its own output format, and the extra
  // trace-and-copy phase runs immediately after static generation, which is
  // exactly where the Next 16 build started failing. It was survivable on 14
  // and is not on 16.
  //
  // `VERCEL` is set to "1" by the platform, so the Docker build (which sets
  // nothing) still gets standalone and stays portable.
  output: process.env.VERCEL ? undefined : "standalone",
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
