"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { inviteLine, normalizeCode, type Snapshot } from "@naija/online";
import { GameHeader, PrimaryButton, Toasts, useCallouts } from "@/components/ui";
import { sfx } from "@/lib/feedback";
import { connect, ensureGuest, guest, inviteUrl, registry, wakeServer, whatsappLink, type Connection, type ConnectionState } from "@/lib/online";
import { Emotes } from "./Emotes";
import { NicknameField, useNickname } from "./Nickname";
import { OnlineAyo } from "./OnlineAyo";
import { OnlineWhot } from "./OnlineWhot";

const CONNECTING: ConnectionState = { status: "connecting" };
const noSubscribe = () => () => {};

/** True once the browser has hydrated, so device-only data (the saved nickname) can be read without a flash. */
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

/** /play/CODE: join a private room by its invite code and play whatever game it holds. */
export function OnlineMatch({ code: rawCode }: { code: string }) {
  const code = normalizeCode(rawCode);
  const hydrated = useHydrated();
  const saved = guest.use().nickname;
  const [ready, setReady] = useState(false);

  if (!code) return <Problem title="That code no correct" body="Room codes na four letters, like ABCD. Check the link your guy sent." />;
  if (!hydrated) return <Frame title="Naija Games"><Waiting text="Loading…" /></Frame>;
  if (!saved || !ready) {
    return <JoinGate code={code} known={saved} onJoin={() => setReady(true)} />;
  }
  return <Room code={code} />;
}

/** Asks for a nickname the first time, and confirms you want to join otherwise. */
function JoinGate({ code, known, onJoin }: { code: string; known: string; onJoin: () => void }) {
  const [nickname, setNickname] = useNickname();
  // The host arrives here with the room already open: skip the gate for them.
  const live = useSyncExternalStore(registry.subscribe, () => registry.peek(code), () => null);
  useEffect(() => {
    if (live && known) onJoin();
  }, [live, known, onJoin]);
  useEffect(wakeServer, []);

  function join() {
    if (!nickname.trim()) return;
    sfx("tap");
    ensureGuest(nickname);
    onJoin();
  }

  return (
    <Frame title={`Room ${code}`}>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted">You don get invite</p>
          <h2 className="mt-1 text-3xl font-black">Oya, enter the room</h2>
        </div>
        <NicknameField value={nickname} onChange={setNickname} onSubmit={join} />
        <PrimaryButton onClick={join}>{known ? `Join as ${nickname || known}` : "Join"}</PrimaryButton>
      </main>
    </Frame>
  );
}

function Room({ code }: { code: string }) {
  const conn = useSyncExternalStore(registry.subscribe, () => registry.peek(code), () => null);
  const state = useSyncExternalStore(conn?.subscribe ?? noSubscribe, conn?.get ?? (() => CONNECTING), () => CONNECTING);
  const { toasts, push } = useCallouts();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const c = connect(code);
    const release = c.retain();
    const offError = c.onError((text) => push([{ text, sfx: "error", tone: "bad" }]));
    return () => {
      offError();
      release();
    };
  }, [code, push, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  if (state.status === "failed") return <Problem title="Wahala dey" body={state.error} onRetry={retry} />;
  if (state.status === "closed") return <Problem title="You don comot" body="You left this room." onRetry={retry} retryLabel="Enter again" />;
  if (state.status === "connecting" || !state.snapshot || !conn) {
    return <Frame title={`Room ${code}`}><Waiting text="Connecting to the room…" /></Frame>;
  }

  const snap = state.snapshot;
  const title = snap.game === "whot" ? "Whot · online" : "Ayo · online";
  return (
    <Frame title={title} actions={snap.status !== "waiting" && <Emotes snap={snap} conn={conn} />}>
      <Toasts toasts={toasts} />
      {state.reconnecting && (
        <p className="bg-ochre px-4 py-1.5 text-center text-sm font-bold text-black" role="status">
          Network don shake. Reconnecting…
        </p>
      )}
      {snap.status === "waiting" && snap.quick ? (
        <Waiting text="Your opponent dey come… If dem no show, the computer go play you." />
      ) : snap.status === "waiting" ? (
        <WaitingRoom snap={snap} conn={conn} />
      ) : snap.game === "whot" ? (
        <OnlineWhot snap={snap as Snapshot<"whot">} conn={conn} push={push} />
      ) : (
        <OnlineAyo snap={snap as Snapshot<"ayo">} conn={conn} push={push} />
      )}
    </Frame>
  );
}

function WaitingRoom({ snap, conn }: { snap: Snapshot; conn: Connection }) {
  const host = snap.seats.find((s) => s?.host);
  const amHost = snap.you >= 0 && snap.seats[snap.you]?.host;
  const open = snap.seats.filter((s) => s === null).length;
  const [copied, setCopied] = useState(false);
  const game = snap.game === "whot" ? "Whot" : "Ayo";

  const message = () => `${inviteLine(host?.name ?? "Your guy", snap.game)} Tap to play: ${inviteUrl(snap.code)}`;

  async function copy() {
    sfx("tap");
    try {
      await navigator.clipboard.writeText(inviteUrl(snap.code));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    sfx("tap");
    if (navigator.share) {
      try {
        await navigator.share({ title: `${game} · Naija Games`, text: inviteLine(host?.name ?? "Your guy", snap.game), url: inviteUrl(snap.code) });
        return;
      } catch {
        // Cancelled, or not allowed: fall through to WhatsApp.
      }
    }
    window.open(whatsappLink(message()), "_blank", "noopener");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">{game} room code</p>
        <p className="mt-1 font-mono text-6xl font-black tracking-[0.2em]">{snap.code}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {snap.seats.map((seat, i) => (
          <li key={i} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-sm">
            <span className="text-xl">{seat ? (seat.kind === "ai" ? "🤖" : "🙂") : "⏳"}</span>
            <span className={`flex-1 font-bold ${seat ? "" : "text-muted"}`}>
              {seat ? seat.name : "Waiting for your guy…"}
              {i === snap.you && <span className="text-muted"> (you)</span>}
            </span>
            {seat?.host && <span className="rounded-full bg-ochre px-2 py-0.5 text-xs font-black text-black">Host</span>}
            {seat && !seat.connected && <span title="Offline">📵</span>}
          </li>
        ))}
      </ul>
      {snap.spectators > 0 && <p className="text-center text-sm text-muted">👀 {snap.spectators} dey watch</p>}

      <div className="flex flex-col gap-2">
        <a
          href={whatsappLink(message())}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            // Prefer the phone's share sheet when there is one; it includes WhatsApp.
            if (typeof navigator.share === "function") {
              e.preventDefault();
              void share();
            }
          }}
          className="rounded-2xl bg-[#25D366] px-6 py-3.5 text-center text-lg font-black text-black shadow-lg transition active:scale-95"
        >
          Invite on WhatsApp
        </a>
        <button type="button" onClick={copy} className="rounded-2xl bg-surface py-3 font-bold shadow-sm">
          {copied ? "Link copied ✓" : "Copy invite link"}
        </button>
      </div>

      {amHost ? (
        <PrimaryButton
          onClick={() => {
            sfx("tap");
            conn.send("start");
          }}
        >
          {open === snap.seats.length - 1 ? "Play the computer instead" : `Start now · computer takes ${open} seat${open === 1 ? "" : "s"}`}
        </PrimaryButton>
      ) : (
        <p className="text-center text-muted">
          {open > 0 ? `Waiting for ${open} more player${open === 1 ? "" : "s"}. ${host?.name ?? "The host"} fit start with the computer.` : "Dealing…"}
        </p>
      )}
    </main>
  );
}

function Frame({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="ankara flex min-h-dvh flex-col">
      <GameHeader title={title} actions={actions} />
      {children}
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <main className="grid flex-1 place-items-center p-6">
      <p className="animate-pulse text-lg font-bold text-muted">{text}</p>
    </main>
  );
}

function Problem({ title, body, onRetry, retryLabel = "Try again" }: { title: string; body: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <Frame title="Naija Games">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-8 text-center">
        <h2 className="text-3xl font-black">{title}</h2>
        <p className="text-muted">{body}</p>
        <div className="mt-2 flex gap-2">
          <Link href="/" className="flex-1 rounded-2xl bg-surface py-3.5 font-bold">
            Lobby
          </Link>
          {onRetry && (
            <PrimaryButton onClick={onRetry} className="flex-[2]">
              {retryLabel}
            </PrimaryButton>
          )}
        </div>
      </main>
    </Frame>
  );
}
