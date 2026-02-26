/**
 * Central helper for GCS image URLs. When NEXT_PUBLIC_USE_DIRECT_GCS=true,
 * returns direct storage.googleapis.com URLs to avoid proxy egress (requires
 * GCS bucket CORS configured for your dashboard origin).
 */
const GCS_DIRECT_BASE = "https://storage.googleapis.com/tinglebot";

export function imageUrlForGcsPath(path: string): string {
  if (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_USE_DIRECT_GCS === "true"
  ) {
    const cleanPath = path.replace(/^\/+/, "");
    return `${GCS_DIRECT_BASE}/${cleanPath}`;
  }
  return `/api/images/${path}`;
}

/** Convert a full GCS URL to proxy path or direct URL depending on env. */
export function imageUrlForGcsUrl(fullUrl: string): string {
  if (!fullUrl || !fullUrl.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return fullUrl;
  }
  const path = fullUrl.replace("https://storage.googleapis.com/tinglebot/", "");
  return imageUrlForGcsPath(path);
}
