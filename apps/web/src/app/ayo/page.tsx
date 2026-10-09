import type { Metadata } from "next";
import { AyoGame } from "@/components/ayo/AyoGame";

export const metadata: Metadata = {
  title: "Ayo · Naija Games",
  description: "Play Ayo Olopon against the computer or with a friend on one phone.",
};

export default function AyoPage() {
  return <AyoGame />;
}
