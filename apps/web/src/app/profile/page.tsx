import type { Metadata } from "next";
import { Profile } from "@/components/Profile";
import { GameHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Your profile · Naija Games",
  description: "Your name, your account and your record.",
};

export default function ProfilePage() {
  return (
    <div className="ankara flex min-h-dvh flex-col">
      <GameHeader title="Your profile" />
      <Profile />
    </div>
  );
}
