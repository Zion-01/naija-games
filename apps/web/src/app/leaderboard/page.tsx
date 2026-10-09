import type { Metadata } from "next";
import { Leaderboard } from "@/components/Leaderboard";
import { GameHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Leaderboard · Naija Games",
  description: "Who be Oga of the Week? Weekly and all-time Whot and Ayo leaderboards.",
};

export default function LeaderboardPage() {
  return (
    <div className="ankara flex min-h-dvh flex-col">
      <GameHeader title="Leaderboard" />
      <Leaderboard />
    </div>
  );
}
