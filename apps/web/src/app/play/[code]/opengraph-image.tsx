import { ImageResponse } from "next/og";
import { inviteLine, normalizeCode } from "@naija/online";
import { fetchRoomSummary } from "@/lib/rooms";

export const alt = "An invite to play on Naija Games";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STRIPE = ["#e2a33a", "#1f7a4d", "#b3261e", "#2b3a8c"];

/** The WhatsApp/X link preview: "Tunde don challenge you for Whot!" on an ankara-coloured card. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode((await params).code);
  const room = code ? await fetchRoomSummary(code) : null;
  const headline = room ? inviteLine(room.host, room.game) : "Your guy don challenge you!";
  const game = room?.game === "ayo" ? "Ayo" : room?.game === "whot" ? "Whot" : "Whot · Ayo";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#1d140c",
          background: "#fbf4e6",
          backgroundImage:
            "radial-gradient(circle at 0 0, #e2a33a 0 120px, transparent 121px), radial-gradient(circle at 100% 100%, #1f7a4d 0 160px, transparent 161px)",
        }}
      >
        <div style={{ display: "flex", height: 18, width: "100%" }}>
          {STRIPE.map((color) => (
            <div key={color} style={{ flex: 1, background: color }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#7a5a3a" }}>{`Naija Games · ${game}`}</div>
          <div style={{ fontSize: 86, fontWeight: 900, lineHeight: 1.05 }}>{headline}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 40, fontWeight: 700 }}>Tap to play. No download.</div>
          {code && (
            <div style={{ display: "flex", fontSize: 64, fontWeight: 900, letterSpacing: 12, background: "#1d140c", color: "#fbf4e6", padding: "12px 32px", borderRadius: 24 }}>
              {code}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
