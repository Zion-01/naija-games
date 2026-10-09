import type { Metadata } from "next";
import { WhotGame } from "@/components/whot/WhotGame";

export const metadata: Metadata = {
  title: "Whot · Naija Games",
  description: "Play Whot with Naija street rules against the computer or pass the phone round.",
};

export default function WhotPage() {
  return <WhotGame />;
}
