/**
 * Page views go to Vercel Web Analytics, which sets no cookies and stores no personal data. Before a view is sent we
 * strip anything private from its URL: room codes (an invite code is the key to a live room, KI-6) and query strings.
 */
export function scrubUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/^\/play\/[^/]+/, "/play/[code]");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}
