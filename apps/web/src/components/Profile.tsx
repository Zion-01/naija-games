"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { GameRecord } from "@/components/Lobby";
import { NicknameField, useNickname } from "@/components/online/Nickname";
import { PrimaryButton } from "@/components/ui";
import {
  AccountError,
  isGuest,
  linkGoogle,
  linkedWith,
  normalizePhone,
  PROVISIONAL_GAMES,
  ratingsFor,
  recentGames,
  saveNickname,
  sendPhoneCode,
  signInWithGoogle,
  signOut,
  useAccount,
  verifyPhoneCode,
  type GameResult,
  type PlayedGame,
  type Rating,
} from "@/lib/account";
import { ensureGuest } from "@/lib/online";

const message = (e: unknown) => (e instanceof AccountError ? e.message : "Something spoil. Try again.");

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-md ring-1 ring-line">
      <h2 className="text-xl font-black">{title}</h2>
      {children}
    </section>
  );
}

function SecondaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl px-4 py-3 font-bold ring-2 ring-line transition hover:bg-background active:scale-95 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function NicknameCard() {
  const [nickname, setNickname] = useNickname();
  const [saved, setSaved] = useState(false);
  const save = () => {
    const me = ensureGuest(nickname);
    void saveNickname(me.nickname);
    setSaved(true);
  };
  return (
    <Card title="Your name">
      <NicknameField
        value={nickname}
        onChange={(v) => {
          setNickname(v);
          setSaved(false);
        }}
        onSubmit={save}
      />
      <SecondaryButton onClick={save} disabled={saved || !nickname.trim()}>
        {saved ? "Saved ✓" : "Save name"}
      </SecondaryButton>
    </Card>
  );
}

/** Texts a code to a phone number, then checks it. `link` saves the current guest; otherwise signs in. */
function PhoneForm({ link, onDone, onCancel }: { link: boolean; onDone: () => void; onCancel: () => void }) {
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(step: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(async () => {
      const e164 = normalizePhone(phone);
      if (!e164) throw new AccountError("That number no complete. Try am like 0803 123 4567.");
      await sendPhoneCode(e164, link);
      setSentTo(e164);
    });

  const verify = () =>
    run(async () => {
      await verifyPhoneCode(sentTo!, code, link);
      onDone();
    });

  const field = "rounded-2xl bg-background px-4 py-3 text-lg font-bold shadow-inner outline-none ring-accent focus:ring-2";
  return (
    <div className="flex flex-col gap-3">
      {!sentTo ? (
        <>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            aria-label="Phone number"
            className={field}
          />
          <PrimaryButton onClick={send} className={busy ? "pointer-events-none opacity-60" : ""}>
            {busy ? "Sending…" : "Text me a code"}
          </PrimaryButton>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">We don text a code to {sentTo}.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="123456"
            aria-label="Code from the SMS"
            className={`${field} font-mono tracking-[0.3em]`}
          />
          <PrimaryButton onClick={verify} className={busy || code.length < 6 ? "pointer-events-none opacity-60" : ""}>
            {busy ? "Checking…" : "Confirm"}
          </PrimaryButton>
        </>
      )}
      {error && <p className="text-center text-sm font-semibold text-[var(--card-ink)]">{error}</p>}
      <button type="button" onClick={onCancel} className="text-sm font-semibold text-muted underline">
        Cancel
      </button>
    </div>
  );
}

function AccountCard({ user }: { user: User | null }) {
  const [phoneFor, setPhoneFor] = useState<"link" | "signin" | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const guest = isGuest(user);
  const linked = linkedWith(user);

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    }
  };

  if (phoneFor) {
    return (
      <Card title={phoneFor === "link" ? "Save with your number" : "Sign in with your number"}>
        <PhoneForm
          link={phoneFor === "link"}
          onCancel={() => setPhoneFor(null)}
          onDone={() => {
            setPhoneFor(null);
            setNotice(phoneFor === "link" ? "Your account don save. Your record go follow you." : "You don sign in. Welcome back!");
          }}
        />
      </Card>
    );
  }

  return (
    <Card title="Your account">
      {notice && <p className="rounded-2xl bg-palm px-4 py-2 text-sm font-bold text-white">{notice}</p>}
      {guest ? (
        <>
          <p className="text-muted">
            You dey play as a guest. Save your account so your online record go follow you if you change phone or clear your browser.
          </p>
          <PrimaryButton onClick={() => act(linkGoogle)}>Save with Google</PrimaryButton>
          <SecondaryButton onClick={() => setPhoneFor("link")}>📱 Save with phone number</SecondaryButton>
          {!showSignIn ? (
            <button type="button" onClick={() => setShowSignIn(true)} className="text-sm font-semibold text-muted underline">
              You don get account before? Sign in
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-2xl bg-background p-3">
              <p className="text-sm text-muted">The guest games on this phone no go follow you into that account.</p>
              <SecondaryButton onClick={() => act(signInWithGoogle)}>Sign in with Google</SecondaryButton>
              <SecondaryButton onClick={() => setPhoneFor("signin")}>Sign in with phone number</SecondaryButton>
            </div>
          )}
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {linked.google && <li>✅ Google: <b>{linked.google}</b></li>}
            {linked.phone && <li>✅ Phone: <b>{linked.phone}</b></li>}
          </ul>
          {!linked.google && <SecondaryButton onClick={() => act(linkGoogle)}>Add Google too</SecondaryButton>}
          {!linked.phone && <SecondaryButton onClick={() => setPhoneFor("link")}>Add phone number too</SecondaryButton>}
          <button type="button" onClick={() => act(signOut)} className="text-sm font-semibold text-muted underline">
            Sign out
          </button>
        </>
      )}
      {error && <p className="text-center text-sm font-semibold text-[var(--card-ink)]">{error}</p>}
    </Card>
  );
}

const RESULT: Record<GameResult, { label: string; className: string }> = {
  won: { label: "W", className: "bg-palm text-white" },
  lost: { label: "L", className: "bg-[var(--card-ink)] text-white" },
  drawn: { label: "D", className: "bg-ochre text-black" },
};

const GAME_NAMES = { whot: "Whot", ayo: "Ayo" } as const;

function signed(d: number) {
  return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "±0";
}

function RatingRow({ game, rating }: { game: "whot" | "ayo"; rating: Rating | undefined }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col">
        <b>{GAME_NAMES[game]}</b>
        {rating && (
          <span className="text-xs text-muted">
            {rating.wins}W · {rating.losses}L{rating.draws ? ` · ${rating.draws}D` : ""} online
          </span>
        )}
      </div>
      {rating ? (
        <div className="flex flex-col items-end">
          <span className="text-2xl font-black">{rating.rating}</span>
          {rating.ratedGames < PROVISIONAL_GAMES && (
            <span className="text-xs text-muted">
              still settling ({rating.ratedGames}/{PROVISIONAL_GAMES})
            </span>
          )}
        </div>
      ) : (
        <span className="text-sm text-muted">No rating yet</span>
      )}
    </div>
  );
}

function OnlineGames({ user }: { user: User }) {
  const [data, setData] = useState<{ games: PlayedGame[]; ratings: Partial<Record<"whot" | "ayo", Rating>> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([recentGames(user.id), ratingsFor(user.id)]).then(
      ([games, ratings]) => live && setData({ games, ratings }),
      (e: unknown) => live && setError(message(e)),
    );
    return () => {
      live = false;
    };
  }, [user.id]);

  if (error) {
    return (
      <Card title="Online">
        <p className="text-sm text-muted">{error}</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card title="Online">
        <p className="text-sm text-muted">Loading…</p>
      </Card>
    );
  }
  const { games, ratings } = data;
  return (
    <>
      <Card title="Ratings">
        <RatingRow game="whot" rating={ratings.whot} />
        <RatingRow game="ayo" rating={ratings.ayo} />
        <p className="text-xs text-muted">Everybody start from 1200. Only games against other people move your rating, not the computer.</p>
      </Card>
      <Card title="Recent online games">
        {games.length === 0 ? (
          <p className="text-sm text-muted">No online game yet. Invite your guy!</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {games.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-2">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-black ${RESULT[g.result].className}`}>
                  {RESULT[g.result].label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">
                    {GAME_NAMES[g.game]} vs {g.others.map((o) => (o.kind === "ai" ? `${o.name} 🤖` : o.name)).join(", ")}
                  </div>
                  <div className="text-xs text-muted">
                    {new Date(g.endedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    {g.abandoned && " · computer finish am for you"}
                  </div>
                </div>
                {g.rating && (
                  <span className={`shrink-0 text-sm font-bold ${g.rating.after >= g.rating.before ? "text-palm" : "text-[var(--card-ink)]"}`}>
                    {signed(g.rating.after - g.rating.before)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export function Profile() {
  const account = useAccount();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <NicknameCard />
      {account.status === "off" ? (
        <Card title="Your account">
          <p className="text-muted">Online accounts never dey on for this server. Your games against the computer still dey saved on this phone.</p>
        </Card>
      ) : account.status === "loading" ? (
        <Card title="Your account">
          <p className="text-sm text-muted">Loading…</p>
        </Card>
      ) : (
        <>
          <AccountCard user={account.user} />
          {account.user && <OnlineGames user={account.user} />}
        </>
      )}
      <Card title="Vs computer (this phone)">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <b>Whot</b> <GameRecord game="whot" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <b>Ayo</b> <GameRecord game="ayo" />
          </div>
        </div>
      </Card>
    </main>
  );
}
