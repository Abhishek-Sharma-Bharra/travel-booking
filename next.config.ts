import type { NextConfig } from "next";
import { privatePaths, indexingEnabled } from "./src/lib/seo";
const cloudflareWebpack: NonNullable<NextConfig["webpack"]> = (
  webpackConfig,
  context,
) => {
  if (context.isServer) {
    const previous = webpackConfig.externals ?? [];
    webpackConfig.externals = [
      (
        { request }: { request?: string },
        callback: (error: Error | null, result?: string) => void,
      ) => {
        // Native D1 builds need one generated client/compiler, not both SQL engines.
        // Regular PostgreSQL/Render builds keep their original client resolution.
        if (
          request === "@travelos/d1-client" ||
          (process.env.TRAVELOS_BUILD_DATABASE_ENGINE === "d1" &&
            request === "@prisma/client")
        )
          return callback(null, "commonjs @travelos/d1-client");
        callback(null);
      },
      ...(Array.isArray(previous) ? previous : [previous]),
    ];
  }
  return webpackConfig;
};
const config: NextConfig = {
  env: { TRAVELOS_RELEASE: process.env.TRAVELOS_BUILD_ID || "local" },
  serverExternalPackages: ["pg", "@travelos/d1-client"],
  ...(process.env.TRAVELOS_BUILD_ID
    ? {
        generateBuildId: async () => process.env.TRAVELOS_BUILD_ID!,
        webpack: cloudflareWebpack,
      }
    : {}),
  async headers() {
    return [
      ...(!indexingEnabled()
        ? [
            {
              source: "/:path*",
              headers: [
                { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
              ],
            },
          ]
        : privatePaths.map((path) => ({
            source: `${path}/:path*`,
            headers: [
              { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
            ],
          }))),
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};
export default config;
