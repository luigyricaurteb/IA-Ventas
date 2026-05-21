import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/register", "/login"], disallow: ["/api/", "/dashboard/", "/reset-password/"] },
    ],
    sitemap: "https://aivoxgroup.com/sitemap.xml",
    host: "https://aivoxgroup.com",
  };
}
