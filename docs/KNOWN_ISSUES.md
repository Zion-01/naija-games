# Known issues and loose ends

What still needs attention after Phase 3 (online multiplayer). Each item has an id (`KI-n`), so code comments, commits and PRs can point to it. When you fix one, delete it here and remove its `KI-n` comment from the code.

Severity: 🔴 must fix before a public launch · 🟠 should fix soon · 🟡 minor or cosmetic.

## Before launch

| ID | Sev | Issue | Where | Suggested fix |
|---|---|---|---|---|
| KI-1 | 🔴 | **No Supabase sign-in yet.** Phase 3 planned guest identity through Supabase anonymous sign-in. Instead, each device gets a random `guestId` (localStorage) and a nickname. Clearing site data, switching browsers or private mode means you can't reclaim your seat. | `apps/web/src/lib/online.ts` (`ensureGuest`), `apps/server/src/match.ts` (`join`) | Phase 4: verify a Supabase JWT in `onAuth` (`apps/server/src/rooms.ts`) and use its `sub` instead of `guestId`. |
| KI-2 | 🔴 | **The game server isn't deployable yet.** There is no Dockerfile or Fly.io/Railway config, and it runs through `tsx` with no build step. | `apps/server` | Add a Dockerfile (or Fly config) and a health-checked deploy. The server already serves `GET /health`. |
| KI-3 | 🔴 | **The production URL must be set.** Without `NEXT_PUBLIC_GAME_SERVER_URL`, the browser tries `http(s)://<page host>:2567`. That only works in development. An HTTPS page pointing at a plain `ws://` server is blocked as mixed content. | `gameServerUrl()` in `apps/web/src/lib/online.ts` | Set `NEXT_PUBLIC_GAME_SERVER_URL=https://…` (TLS) on the web deploy, and `GAME_SERVER_URL` if the web server reaches the game server on a different address. |
| KI-4 | 🔴 | **Not yet tried on a real phone via WhatsApp** (plan's Verification section). WhatsApp's link preview and its in-app browser are untested. | — | Manual check on a real Android phone once KI-2 and KI-3 are done. |
| KI-5 | 🟠 | **Rooms live in one process's memory.** A server restart or deploy ends every game in progress. You can't run two server instances: `/rooms/:code` and the `matches` map only know about local rooms. | `apps/server/src/rooms.ts` (`matches`) | Deploy outside play hours, or add Colyseus Redis presence/driver and look up summaries through `matchMaker.query` before scaling past one node (Phase 5 load test). |

## Security and abuse

| ID | Sev | Issue | Where | Suggested fix |
|---|---|---|---|---|
| KI-6 | 🟠 | **Room codes can be guessed.** There are 24⁴ ≈ 330k codes, and nothing limits how fast someone tries them. A stranger who guesses a live code can take an open seat or watch. Rooms are private only because codes are hard to guess. | `packages/online` (`CODE_LENGTH`), `apps/server/src/app.ts` | Rate-limit joins and `GET /rooms/:code` per IP. Optionally add a 5th letter, or a host setting to lock the room once it's full. |
| KI-7 | 🟠 | **`guestId` acts as a password.** Anyone holding a player's `guestId` can take their seat. It never leaves the server, but it sits in plain localStorage. | `apps/server/src/match.ts` (`join`) | Replaced by KI-1 (a signed token instead of a raw id). |
| KI-8 | 🟡 | **Two tabs on one device fight over the seat.** Opening the same room in a second tab silently moves the seat there. The first tab is left with `you = -1`, but isn't counted as a spectator. | `Match.join` | Tell the old session ("You opened this game somewhere else") and kick it. |

## Gameplay and UX

| ID | Sev | Issue | Where | Suggested fix |
|---|---|---|---|---|
| KI-9 | 🟠 | **Online "Last card" can be lost.** The board clears your Last card toggle as soon as the move is sent. If the server then rejects the move (it raced your turn timer, or a catch landed first), the toggle is already off. You have to tap it again. | `WhotBoard` (`onPlay` returns `true` optimistically in `OnlineWhot`) | Keep the toggle until the next snapshot confirms the move, or send `lastCard` as its own message. |
| KI-10 | 🟡 | **Pass-and-play: a Last card toggle can carry over.** If a player taps Last card and then goes to market instead of playing, the toggle stays on for the next player. This bug predates Phase 3. | `WhotBoard` (`lastCardCalled` state) | Reset it whenever `view.current` changes. |
| KI-11 | 🟡 | **Online Ayo doesn't warn about the 100-move limit.** Offline Ayo says "N moves without a chop until each side keeps their own seeds" from move 60. Online Ayo doesn't. | `apps/web/src/components/online/OnlineAyo.tsx` | Copy the `sinceCapture >= 60` line from `AyoGame.tsx`. |
| KI-12 | 🟡 | **After a reconnect, the table jumps.** Callouts and sow animations only run when a snapshot is exactly one move ahead. A move that was missed during a reconnect (or arrived mid-animation in Ayo) gets no callout, and the board jumps. | `isNextMove` in `apps/web/src/lib/online.ts`, `useSowAnimation` | Acceptable for now. A fuller fix would have the server send a short move log. |
| KI-13 | 🟡 | **The turn countdown can be off by about half a round trip.** Clock skew is corrected using the time the snapshot arrived, so network latency isn't accounted for. | `secondsLeft` in `online.ts` | Use `room.ping()` to estimate latency, if players notice. |
| KI-14 | 🟡 | **Computer seats online are always Medium**, both when filling seats and when taking over a dropped player. There's no difficulty choice online. Hard Whot is slow (Monte Carlo) and would block the server's event loop. | `Match.schedule` / `autoPlay` | Let the host pick Easy or Medium. Run Hard in a worker thread if wanted. |
| KI-15 | 🟡 | **The computer's names can clash with players' names.** A computer seat called "Oga Tunde" can sit next to a real Tunde. Nicknames aren't unique either. | `AI_NAMES` in `match.ts` | Skip names already at the table, and add "(2)" to duplicate nicknames. |
| KI-16 | 🟡 | **An abandoned room keeps playing.** If every human leaves mid-game but a spectator stays, the computer keeps playing both sides until the spectator leaves. | `Match.leave` | End the game (or close the room) when no humans are left in seats. |
| KI-17 | 🟡 | **Online results aren't saved anywhere.** The lobby record only counts games against the computer. Online wins and losses aren't recorded on the device or the server. | `apps/web/src/lib/stats.ts` | Phase 4 (`matches`, `ratings` tables). |
| KI-18 | 🟡 | **The invite page can be slow to load when the game server is slow.** The link preview data is fetched on every request, with a 2.5s timeout. If the game server is down, the preview falls back to generic text. | `apps/web/src/lib/rooms.ts` | Fine for now. Lower the timeout or cache it briefly if it shows up in metrics. |

## Testing gaps

| ID | Sev | Issue | Where | Suggested fix |
|---|---|---|---|---|
| KI-19 | 🟠 | **The Playwright tests don't run in CI.** `pnpm e2e` only runs locally; CI has no browser installed. | `.github/workflows/ci.yml` | Add a job that runs `pnpm --filter web exec playwright install --with-deps chromium` then `pnpm e2e`. |
| KI-20 | 🟡 | **Pick Two stacking isn't tested end to end.** The plan's browser test asks for it, but the deal is random, so the test can't set it up. The engine and server tests do cover stacking. | `apps/web/e2e/online.spec.ts` | Add a server option, for tests only, to deal from a fixed seed. |
| KI-21 | 🟡 | **Error messages are matched as text.** Join failures are recognised by regex on the Colyseus SDK's error text. A wording change in the SDK would show raw errors to players. | `joinError` in `apps/web/src/lib/online.ts` | Match on `e.code` (Colyseus `ErrorCode`) instead. |

## Housekeeping

- `next dev` re-adds an agent-rules block to `apps/web/AGENTS.md`. Committing it is harmless (see that file).
- The server logs auto-play failures with `console.error` only. There are no metrics or structured logs yet (Phase 5).
