// Renders the brand images from src/app/icon.svg: app icons, the site-wide link
// preview, logo lockups and a square promo poster. Run after changing the mark:
//   node apps/web/scripts/brand.mjs
// It uses the satori + resvg bundled with Next (no system fonts, so text in the
// mark must be paths). Bricolage Grotesque is OFL-licensed (Google Fonts).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(web, "..", "..", "docs", "brand");

const C = {
  cream: "#fbf4e6",
  ink: "#1f160f",
  muted: "#6b5b4b",
  indigo: "#24316b",
  indigoDeep: "#18214d",
  ochre: "#e3a21a",
  palm: "#1f7a4d",
  accent: "#d9480f",
  wine: "#8a1c2b",
};
const URL = "naija-games.vercel.app";

const svg = await readFile(join(web, "src/app/icon.svg"), "utf8");
// The service worker precaches /icon.svg from public/, so keep the copy in step.
await writeFile(join(web, "public/icon.svg"), svg);
const mark = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const font = await readFile(join(web, "scripts/fonts/BricolageGrotesque-ExtraBold.ttf"));
const fonts = [{ name: "Bricolage", data: font, weight: 800, style: "normal" }];

/** Tiny hyperscript: every element is a flex box, as satori wants. */
const h = (style, ...children) => createElement("div", { style: { display: "flex", ...style } }, ...children);
const img = (size, extra = {}) => createElement("img", { src: mark, width: size, height: size, style: extra });

const kente = (height) =>
  h(
    { width: "100%", height },
    ...Array.from({ length: 12 }, (_, i) =>
      h({ flex: 1, background: [C.ochre, C.palm, C.accent, C.indigo][i % 4] }),
    ),
  );

async function render(file, element, width, height) {
  const res = new ImageResponse(element, { width, height, fonts });
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log("wrote", file.replace(web, "apps/web"));
}

// App icons. The rounded tile works as-is; the maskable and Apple ones need a
// full-bleed square with the art inside the safe zone.
const tile = (size) => h({ width: size, height: size, background: "transparent" }, img(size));
const bleed = (size, scale) =>
  h({ width: size, height: size, alignItems: "center", justifyContent: "center", background: C.indigo }, img(Math.round(size * scale)));

await render(join(web, "public/icon-192.png"), tile(192), 192, 192);
await render(join(web, "public/icon-512.png"), tile(512), 512, 512);
await render(join(web, "public/icon-maskable-512.png"), bleed(512, 0.82), 512, 512);
await render(join(web, "src/app/apple-icon.png"), bleed(180, 0.94), 180, 180);

// Site-wide link preview (WhatsApp, X, iMessage). /play/[code] has its own.
await render(
  join(web, "src/app/opengraph-image.png"),
  h(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      background: C.cream,
      backgroundImage: `radial-gradient(circle at 0 0, ${C.ochre} 0 150px, transparent 151px), radial-gradient(circle at 100% 100%, ${C.palm} 0 190px, transparent 191px)`,
      fontFamily: "Bricolage",
      color: C.ink,
    },
    h(
      { flex: 1, alignItems: "center", gap: 56, padding: "0 80px" },
      img(380, { transform: "rotate(-4deg)" }),
      h(
        { flexDirection: "column", gap: 18 },
        h({ fontSize: 112, lineHeight: 0.95, letterSpacing: -3, flexDirection: "column" }, h({}, "Naija"), h({ color: C.wine }, "Games")),
        h({ fontSize: 44, lineHeight: 1.1 }, "Whot & Ayo with your guys."),
        h({ fontSize: 30, color: C.muted }, "Free in your browser. No download."),
        h(
          { marginTop: 10 },
          h({ fontSize: 34, background: C.accent, color: "#fff", padding: "12px 30px", borderRadius: 999 }, "Oya, play →"),
        ),
      ),
    ),
    kente(22),
  ),
  1200,
  630,
);
await writeFile(join(web, "src/app/opengraph-image.alt.txt"), "Naija Games: play Whot and Ayo with your guys, free in your browser.");

// Logo lockups for anywhere else (README, socials): mark + wordmark.
for (const [name, ink, second] of [
  ["logo.png", C.ink, C.wine],
  ["logo-on-dark.png", C.cream, C.ochre],
]) {
  await render(
    join(docs, name),
    h(
      { width: "100%", height: "100%", alignItems: "center", gap: 36, padding: "0 40px", fontFamily: "Bricolage" },
      img(280),
      h(
        { flexDirection: "column" },
        h({ fontSize: 132, lineHeight: 0.92, letterSpacing: -4, color: ink, gap: 30 }, h({}, "Naija"), h({ color: second }, "Games")),
        h({ fontSize: 40, color: ink, opacity: 0.75, marginTop: 14, letterSpacing: 1 }, "WHOT · AYO · WITH YOUR GUYS"),
      ),
    ),
    1100,
    360,
  );
}

// Square poster for WhatsApp status, Instagram and group chats.
await render(
  join(docs, "promo-square.png"),
  h(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      alignItems: "center",
      background: C.indigoDeep,
      backgroundImage: `radial-gradient(circle at 50% 42%, ${C.indigo} 0 420px, transparent 421px)`,
      fontFamily: "Bricolage",
      color: C.cream,
    },
    kente(26),
    h(
      { flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 },
      img(470, { transform: "rotate(-4deg)" }),
      h({ fontSize: 128, letterSpacing: -4, marginTop: 24, gap: 26 }, h({}, "Naija"), h({ color: C.ochre }, "Games")),
      h({ fontSize: 50 }, "Oya, come play Whot & Ayo!"),
      h({ fontSize: 32, opacity: 0.8, marginTop: 4 }, "vs the computer · pass the phone · online with your guys"),
      h(
        { marginTop: 36, fontSize: 40, background: C.accent, color: "#fff", padding: "14px 40px", borderRadius: 999 },
        URL,
      ),
    ),
    kente(26),
  ),
  1080,
  1080,
);
