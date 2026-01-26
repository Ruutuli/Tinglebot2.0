import { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppUrl();
  
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
