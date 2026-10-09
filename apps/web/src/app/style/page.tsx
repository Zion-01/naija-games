import type { Metadata } from "next";
import { StylePicker } from "@/components/StylePicker";
import { GameHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Your table · Naija Games",
  description: "Pick your Whot card back and your Ayo board. Win games to unlock more.",
};

export default function StylePage() {
  return (
    <div className="ankara flex min-h-dvh flex-col">
      <GameHeader title="Your table" />
      <StylePicker />
    </div>
  );
}
