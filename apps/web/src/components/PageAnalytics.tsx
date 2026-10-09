"use client";

import { Analytics } from "@vercel/analytics/next";
import { scrubUrl } from "@/lib/analytics";

/** Cookieless page views (production only), with room codes removed from URLs. */
export function PageAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: scrubUrl(event.url) })} />;
}
