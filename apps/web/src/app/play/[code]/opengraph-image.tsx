import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { inviteLine, normalizeCode } from "@naija/online";
import { fetchRoomSummary } from "@/lib/rooms";

export const alt = "An invite to play on Naija Games";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand colours and assets, as in scripts/brand.mjs (which renders the site-wide preview).
const C = {
  cream: "#fbf4e6",
  ink: "#1f160f",
  muted: "#6b5b4b",
  wine: "#8a1c2b",
  ochre: "#e3a21a",
  palm: "#1f7a4d",
  accent: "#d9480f",
  indigo: "#24316b",
};
const KENTE = Array.from({ length: 12 }, (_, i) => [C.ochre, C.palm, C.accent, C.indigo][i % 4]);

const assets = Promise.all([
  readFile(join(process.cwd(), "scripts/fonts/BricolageGrotesque-ExtraBold.ttf")),
  readFile(join(process.cwd(), "src/app/icon.svg")),
]);

/** The WhatsApp/X link preview: "Tunde don challenge you for Whot!" on a cream card with the logo and a kente stripe. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode((await params).code);
  const [room, [font, icon]] = await Promise.all([code ? fetchRoomSummary(code) : null, assets]);
  const headline = !room ? "Your guy don challenge you!" : room.quick ? "Quick match dey go on!" : inviteLine(room.host, room.game);
  const game = room?.game === "ayo" ? "Ayo" : room?.game === "whot" ? "Whot" : "Whot & Ayo";
  const mark = `data:image/svg+xml;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Bricolage",
          color: C.ink,
          background: C.cream,
        }}
      >
        {/* Solid discs rather than radial gradients, which satori renders with soft edges. */}
        <div style={{ position: "absolute", top: -150, right: -150, width: 300, height: 300, borderRadius: 999, background: C.ochre }} />
        <div style={{ position: "absolute", bottom: -170, right: -170, width: 360, height: 360, borderRadius: 999, background: C.palm }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 72px 48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
            <img src={mark} width={112} height={112} alt="" style={{ transform: "rotate(-4deg)" }} />
            <div style={{ display: "flex", fontSize: 44, letterSpacing: -1, gap: 12 }}>
              <span>Naija</span>
              <span style={{ color: C.wine }}>Games</span>
              <span style={{ color: C.muted }}>{`· ${game}`}</span>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 88, lineHeight: 1.02, letterSpacing: -2, maxWidth: 960 }}>{headline}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 36, background: C.accent, color: "#fff", padding: "12px 32px", borderRadius: 999 }}>
              Tap to play. No download.
            </div>
            {code && (
              <div
                style={{
                  display: "flex",
                  fontSize: 64,
                  letterSpacing: 12,
                  background: C.indigo,
                  color: C.cream,
                  padding: "8px 24px 8px 36px",
                  borderRadius: 24,
                  border: `5px solid ${C.ochre}`,
                }}
              >
                {code}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", height: 22, width: "100%" }}>
          {KENTE.map((color, i) => (
            <div key={i} style={{ flex: 1, background: color }} />
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Bricolage", data: font, weight: 800, style: "normal" }] },
  );
}
