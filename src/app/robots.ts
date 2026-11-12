import type { MetadataRoute } from "next";
import { indexingEnabled, privatePaths, publicOrigin } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: indexingEnabled()
      ? {
          userAgent: "*",
          allow: "/",
          disallow: privatePaths.flatMap((path) => [path, `${path}/`]),
        }
      : { userAgent: "*", disallow: "/" },
    ...(indexingEnabled() ? { sitemap: `${publicOrigin()}/sitemap.xml` } : {}),
  };
}
