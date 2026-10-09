// Renders video.html (canvas + WebAudio) frame by frame to
// docs/brand/promo-video.mp4 with WebCodecs and Mediabunny in Chrome. Take the
// screenshots first with capture.mjs.
//   node apps/web/scripts/promo/record.mjs            record the video
//   node apps/web/scripts/promo/record.mjs --stills   save a few frames to stills/
//   node apps/web/scripts/promo/record.mjs --serve    serve it on :4321 to watch with sound
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "..");
const docs = join(web, "..", "..", "docs", "brand");
const mode = process.argv[2] ?? "";

const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf" };
function fileFor(path) {
  if (path === "/" || path === "/video.html") return join(here, "video.html");
  if (path === "/icon.svg") return join(web, "src/app/icon.svg");
  if (path === "/mediabunny.mjs") return join(web, "node_modules/mediabunny/dist/bundles/mediabunny.mjs");
  if (path.startsWith("/fonts/")) return join(web, "scripts", path);
  if (path.startsWith("/shots/")) return join(here, path);
  return null;
}

if (mode === "--serve") {
  createServer(async (req, res) => {
    const file = fileFor(new URL(req.url, "http://x").pathname);
    if (!file) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
  }).listen(4321, () => console.log("http://localhost:4321/"));
} else {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.on("console", (m) => m.type() === "error" && console.error("page:", m.text()));
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.route("http://localhost:4321/**", async (route) => {
    const file = fileFor(new URL(route.request().url()).pathname);
    if (!file) return route.fulfill({ status: 404 });
    await route.fulfill({ body: await readFile(file), contentType: TYPES[extname(file)] });
  });
  await page.goto("http://localhost:4321/video.html");
  await page.evaluate(() => window.ready);

  if (mode === "--stills") {
    const out = join(here, "stills");
    await mkdir(out, { recursive: true });
    for (const t of [1.2, 2.6, 3.3, 5, 9, 13.5, 17.5, 21.5, 25.5, 29]) {
      await page.evaluate((t) => window.seek(t), t);
      await page.locator("canvas").screenshot({ path: join(out, `t${String(t).padStart(4, "0")}.png`) });
    }
    console.log("stills in", out);
  } else {
    const chunks = [];
    await page.exposeFunction("saveChunk", (b64) => void chunks.push(Buffer.from(b64, "base64")));
    const info = await page.evaluate(() => window.render());
    const file = join(docs, "promo-video.mp4");
    await mkdir(docs, { recursive: true });
    await writeFile(file, Buffer.concat(chunks));
    console.log("wrote", file, info, `${(Buffer.concat(chunks).length / 1e6).toFixed(1)} MB`);
  }
  await browser.close();
}
