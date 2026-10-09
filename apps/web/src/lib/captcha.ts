/**
 * Cloudflare Turnstile, for Supabase's CAPTCHA on guest sign-in (KI-22). Only used when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; Supabase checks the token with the widget's secret key.
 *
 * The widget is invisible ("interaction-only"): most players never see it. When Cloudflare wants a click, it shows a
 * small box at the bottom of the screen until they pass.
 */
type Turnstile = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<Turnstile> | null = null;

function load(): Promise<Turnstile> {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
    script.onerror = () => reject(new Error("Turnstile did not load"));
    document.head.appendChild(script);
  }).catch((e: unknown) => {
    loading = null; // Let the next attempt try again (a network blip shouldn't stick).
    throw e;
  });
  return loading;
}

/** A one-time token proving a human is here, or undefined when CAPTCHA isn't configured. Call from event handlers. */
export async function captchaToken(): Promise<string | undefined> {
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!sitekey) return undefined;
  const turnstile = await load();
  const box = document.createElement("div");
  box.className = "fixed inset-x-0 bottom-4 z-50 flex justify-center";
  document.body.appendChild(box);
  let id: string | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      id = turnstile.render(box, {
        sitekey,
        appearance: "interaction-only",
        action: "guest-sign-in",
        callback: resolve,
        "error-callback": () => reject(new Error("Turnstile failed")),
        "expired-callback": () => reject(new Error("Turnstile expired")),
        "timeout-callback": () => reject(new Error("Turnstile timed out")),
      });
    });
  } finally {
    if (id) turnstile.remove(id);
    box.remove();
  }
}
