// Screenshots of the real app for the promo video, taken at phone size from a
// running `pnpm --filter web dev` (default http://localhost:3000):
//   node apps/web/scripts/promo/capture.mjs [baseUrl]
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const out = join(dirname(fileURLToPath(import.meta.url)), "shots");
const base = process.argv[2] ?? "http://localhost:3000";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function shot(name, path, { scheme = "light", act } = {}) {
  const context = await browser.newContext({ ...phone, colorScheme: scheme });
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: "networkidle" });
  if (act) await act(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log("shot", name);
  await context.close();
}

await shot("lobby-dark", "/", { scheme: "dark" });
await shot("whot-setup", "/whot");
await shot("whot", "/whot", {
  act: async (page) => {
    await page.getByRole("button", { name: "Deal am" }).click();
    await page.waitForTimeout(2500);
  },
});
await shot("ayo", "/ayo", {
  act: async (page) => {
    await page.getByRole("button", { name: "Start" }).click();
    await page.waitForTimeout(1500);
  },
});
await shot("style", "/style");
await browser.close();
