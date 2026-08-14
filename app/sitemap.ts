import { readFileSync } from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

type Manifest = {
  generatedAt?: string;
  routes: Array<{ route: string }>;
};

function loadManifest(): Manifest {
  const manifestPath = path.join(process.cwd(), "mirror", "manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
}

function routeToUrl(route: string): string {
  if (route === "/") return `${SITE_URL}/`;
  return `${SITE_URL}${route}/`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const manifest = loadManifest();
  const lastModified = manifest.generatedAt
    ? new Date(manifest.generatedAt)
    : new Date();

  const routes = [
    ...manifest.routes.map(({ route }) => ({
      url: routeToUrl(route),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: route === "/" ? 1 : 0.7,
    })),
    {
      url: routeToUrl("/data-deletion"),
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];
  return routes;
}
