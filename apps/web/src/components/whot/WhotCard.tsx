import type { whot } from "@naija/engine";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "w-9 h-[3.25rem]",
  md: "w-[4.25rem] h-[6.25rem]",
  lg: "w-24 h-36",
};

/** The big shape in the middle of a card, drawn on a 100×100 box. */
export function ShapeGlyph({ shape, className }: { shape: whot.Shape; className?: string }) {
  const fill = "currentColor";
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {shape === "circle" && <circle cx="50" cy="50" r="38" fill={fill} />}
      {shape === "triangle" && <polygon points="50,10 92,86 8,86" fill={fill} />}
      {shape === "cross" && (
        <path d="M38 8h24v30h30v24H62v30H38V62H8V38h30z" fill={fill} />
      )}
      {shape === "square" && <rect x="14" y="14" width="72" height="72" fill={fill} />}
      {shape === "star" && (
        <polygon
          points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"
          fill={fill}
        />
      )}
      {shape === "whot" && (
        <text x="50" y="62" textAnchor="middle" fontSize="34" fontWeight="900" fill={fill} fontFamily="inherit">
          WHOT
        </text>
      )}
    </svg>
  );
}

export function cardLabel(card: whot.Card) {
  return card.shape === "whot" ? "Whot 20" : `${card.shape} ${card.number}`;
}

export function WhotCard({
  card,
  size = "md",
  dim = false,
  className = "",
}: {
  card: whot.Card;
  size?: Size;
  dim?: boolean;
  className?: string;
}) {
  const corner = size === "sm" ? "text-[0.6rem]" : size === "md" ? "text-sm" : "text-lg";
  return (
    <div
      className={`relative ${SIZES[size]} shrink-0 rounded-lg border border-black/15 bg-[var(--card-face)] text-[var(--card-ink)] shadow-md transition ${dim ? "brightness-[0.68] saturate-[0.35]" : ""} ${className}`}
      aria-label={cardLabel(card)}
      role="img"
    >
      <span className={`absolute left-1 top-0.5 font-black leading-none ${corner}`}>{card.number}</span>
      <span className={`absolute bottom-0.5 right-1 rotate-180 font-black leading-none ${corner}`}>{card.number}</span>
      <ShapeGlyph shape={card.shape} className="absolute inset-[18%]" />
    </div>
  );
}

export function CardBack({ size = "md", className = "" }: { size?: Size; className?: string }) {
  return (
    <div
      className={`relative ${SIZES[size]} shrink-0 overflow-hidden rounded-lg border-2 border-[var(--card-face)] bg-[var(--card-back)] shadow-md ${className}`}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 8px), repeating-linear-gradient(-45deg, #fff 0 2px, transparent 2px 8px)",
        }}
      />
      {size !== "sm" && (
        <span className="absolute inset-0 grid place-items-center text-xs font-black tracking-widest text-[var(--card-face)] [writing-mode:vertical-rl]">
          WHOT
        </span>
      )}
    </div>
  );
}
