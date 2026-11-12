import type { MetadataRoute } from "next";
import { indexingEnabled, publicOrigin, publicPages } from "@/lib/seo";
export default function sitemap(): MetadataRoute.Sitemap {
  return indexingEnabled()
    ? publicPages.map((path) => ({
        url: `${publicOrigin()}${path === "/" ? "" : path}`,
      }))
    : [];
}
