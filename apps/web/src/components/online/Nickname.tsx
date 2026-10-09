"use client";

import { useState } from "react";
import { NICKNAME_MAX } from "@naija/online";
import { guest } from "@/lib/online";

/** The nickname being typed, seeded from the one saved on this device. */
export function useNickname() {
  const saved = guest.use().nickname;
  const [typed, setTyped] = useState<string | null>(null);
  return [typed ?? saved, setTyped] as const;
}

export function NicknameField({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-muted">Wetin we go call you?</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        maxLength={NICKNAME_MAX}
        autoComplete="nickname"
        enterKeyHint="go"
        placeholder="e.g. Tunde"
        className="rounded-2xl bg-surface px-4 py-3 text-lg font-bold shadow-inner outline-none ring-accent focus:ring-2"
      />
    </label>
  );
}
