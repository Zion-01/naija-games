# Naija Games: Whot + Ayo (web, online multiplayer)

## Context
This plan comes from looking at lagoslife.app, a hit browser game that works because it feels specific to Lagos. Among the Naija-coded ideas we discussed, **Whot** and **Ayo** stood out. Nigerians already know and love both, so there are no rules to teach, and both work well online. Decisions so far:
- **Web game**, built like lagoslife.app (Next.js), so people can share a link on WhatsApp/X.
- **Online multiplayer in v1**, plus play against the computer (AI).
- **Naija street rules for Whot.**

The goal is a mobile-first PWA where you can start a game against the computer in seconds, or tap "Invite your guy" and send a WhatsApp link that opens a private match.

## Stack (recommended)
| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces, TypeScript everywhere | One rules engine shared by the client, server and AI |
| Web | Next.js (App Router) + Tailwind, Framer Motion for card and seed animation | Same stack as lagoslife.app; deploys to Vercel |
| Game server | **Colyseus** (Node) on Fly.io or Railway | The server is authoritative, and it has rooms, matchmaking and reconnection built in. Its per-client state filtering keeps Whot hands hidden from other players |
| Auth + data | Supabase (guest/anonymous sign-in, then Google; Postgres for profiles, match history and ratings) | Free tier; guests can play before they sign up |
| Tests | Vitest (engine), Playwright (two-browser online match) | |

New project folder: `C:\Users\M'soft\naija-games` (git repo).

```
naija-games/
  packages/engine/      pure TS, no I/O
    src/whot/  deck.ts rules.ts state.ts ai.ts
    src/ayo/   rules.ts state.ts ai.ts
    src/rng.ts          seeded RNG (shuffles reproducible in tests/replays)
  apps/server/          Colyseus: WhotRoom.ts, AyoRoom.ts, auth hook (verify Supabase JWT)
  apps/web/             Next.js: /, /whot, /ayo, /play/[roomId], /profile
    components/cards/   SVG Whot cards (drawn by us, not scanned)
    components/ayo/     board + seed physics-lite animation
    lib/callouts.ts     pidgin lines + SFX
```

Engine contract (same shape for both games): `initialState(opts, seed)`, `legalMoves(state, player)`, `applyMove(state, move) → state | error`, `viewFor(state, player)` (redacted view), `isOver/result`. The server only calls these functions, the offline mode runs the same engine in the browser, and the AI searches over `legalMoves` and `applyMove`.

## Rules to implement
**Whot (54 cards).** Circles and Triangles have 1–5, 7, 8 and 10–14. Crosses and Squares have 1, 2, 3, 5, 7, 10, 11, 13 and 14. Stars have 1–5, 7 and 8. There are five Whot 20s. Each player gets 5 or 6 cards (set per room) and the rest form the market. You play a card that matches the shape or number on top.
- 1 Hold On: play again. 2 Pick Two and 5 Pick Three: the next player picks unless they defend with the same number, and penalties stack. 8 Suspension: the next player is skipped. 14 General Market: every other player picks 1. 20 Whot: wild, and you name the shape.
- You must call "Last card" when one card is left (forget, and you pick 2 if someone catches it before your next turn) and "Check up" on your final card.
- If the market runs out, players count the cards in hand. The lowest total wins, and stars count double.
- 2–4 players.

**Ayo (Ayo Olopon).** The board has 2×6 pits with 4 seeds each (48 total). You sow counter-clockwise and skip the starting pit on a lap. If your last seed makes the count in an opponent's pit 2 or 3, you capture it, then keep capturing backwards while the pits still have 2 or 3. A move that would capture all of your opponent's seeds captures nothing. You must feed an opponent who has no seeds, and if you can't, you take whatever is left. Over 24 seeds wins. 2 players.
> ⚠️ Ayo rules vary by region. A relay-sowing "Ayoayo" variant also exists. I'll confirm the variant with you before Phase 1. The rule set is a flag, so a second variant can be added later.

## Phases
**Phase 0: Scaffold (½ day).** Create the monorepo, lint, Vitest, Next.js app, Colyseus app and CI (typecheck + tests).

**Phase 1: Engines + AI (3–4 days).**
- Write the Whot and Ayo rule modules with full scenario tests: stacked Pick Two, "Last card" penalties, General Market with 4 players, counting when the market runs out, Ayo chain captures, the grand-slam rule and forced feeding.
- Property tests: random play always ends, Ayo always has 48 seeds in total, and a Whot `viewFor` never shows another player's hand.
- AI: *Easy* plays a random legal move. *Medium* uses heuristics: hold your 2s to defend, play Whot 20 late and name the shape you hold most. *Hard* is expectimax for Whot (sampling the hidden cards) and alpha-beta search with depth 6–8 for Ayo.

**Phase 2: Offline web game (4–5 days). First shareable build.**
- Mobile-first table UI: drag or tap to play a card, a market pile, turn indicator and shape picker. For Ayo, a wooden board where you tap a pit and watch the seeds get sown.
- Vs-AI and pass-and-play modes, PWA install, and visuals inspired by ankara fabric (with dark mode).
- Pidgin toast lines: "Oya pick two!", "Hold on!", "General market!", "Check up! 🎉", "E don cast" when you lose. Haptics through `navigator.vibrate`, with sound on/off. (A text-to-speech voice was tried and removed in Phase 5.)

**Phase 3: Online multiplayer (5–7 days).**
- Colyseus `WhotRoom` and `AyoRoom` run the engine on the server. Clients only send moves and receive their redacted view.
- **Private rooms through an invite link**: `/play/ABCD` with a WhatsApp share button and a dynamic OG image ("Tunde don challenge you for Whot").
- Guest identity through Supabase anonymous sign-in (with a nickname) and a turn timer (Whot 20s, Ayo 30s; on timeout the server auto-plays the Easy-AI move).
- 60s window to reconnect, after which the AI takes the seat. Spectators are allowed in private rooms. Moves are rate-limited and checked by the engine.

> Status: Phases 0–3 are done. Gaps left in Phase 3 (deploy, tests not in CI, and others) are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

**Phase 4: Accounts and competition (4–5 days).** Delivered in four PRs: **4a** accounts and saved results (done), **4b** Elo ratings (done), **4c** quick-match (done), **4d** weekly leaderboards (done).
- Upgrade a guest to Google and keep their history (phone OTP was dropped in favour of Google only). Profiles with an Elo rating per game.
- Quick-match queue (matched by rating), and weekly leaderboards ("Oga of the Week").
- How 4c (quick-match) works:
  - "Find me opponent" joins the `queue` room (`QueueRoom` in `apps/server/src/rooms.ts`). Its `onAuth` reads the player's rating from `ratings` with the secret key, keyed by the verified `userId` (1200 without a row, or without Supabase). The pairing logic is `Matchmaker` in `apps/server/src/queue.ts` (no Colyseus imports, unit-tested with fake timers).
  - Two players match when their gap fits inside both their windows (±100, plus 25 per second waited), so newcomers aren't thrown at someone far away but nobody waits long. The client offers "Play the computer" after 20s (`QUICK_OFFER_SECONDS`); after 60s (`QUICK_MAX_WAIT_SECONDS`) the server seats them against the computer.
  - Quick-match is 2-player for both games (Whot included, so matches come fast). The server opens a normal private room with seats held for the two players (`Match` option `reserved`): nobody hosts, anyone else with the code only watches, and a no-show's seat goes to the computer after 10s. Results and ratings save like any other room.
  - The queue is in memory (KI-5), so it only pairs players on one server process.
- How 4d (leaderboards) works:
  - Weekly points are the Elo a player gained in rated games that ended that week, so only games against other players with accounts count, and everyone starts each Monday on 0. Weeks run Monday 00:00 to Monday 00:00 Lagos time (UTC+1 all year).
  - `weekly_leaderboard(game, weeks_ago, max_rows)` is a `security definer` SQL function, because `match_players` is only readable by the people at that table. It returns rank, nickname and the week's totals, never who played whom, plus the caller's own row even outside the top. Anyone may call it (the advisors warn about this; it's intentional). Ties on points go to more wins, then share the rank.
  - "Oga of the Week" is last week's number one (`weeks_ago = 1`). It's computed when asked, so there's no cron job or stored winner.
  - The all-time board reads `ratings` (public) with `profiles(nickname)`, players with at least one rated game.
- Supabase tables: `profiles`, `matches`, `match_players`, `ratings`, with row-level security. The server writes results using the service key.

**Phase 5: Polish and launch (ongoing).** One PR each: 5a emotes and banter stickers in matches (done), 5b cosmetic card backs and ayo boards, unlocked by wins (done; ads or monetisation later, no gambling mechanics), 5c privacy-friendly analytics (done), and 5d load testing a single Colyseus node.

## Reuse
Mini Arcade (`mobile-apps/mini-games`) is React Native, so its code doesn't carry over directly. We copy its patterns:
- Theme tokens: `src/lib/theme.ts`
- Haptics wrapper: `src/lib/feedback.ts` → web version using `navigator.vibrate`
- Persisted progress context: `src/lib/progress.tsx` → stats stored locally in offline mode
- Game registry and shell idea: `src/games/index.ts`, `src/components/GameShell.tsx` → the web lobby's game list

## Verification
- `pnpm -r typecheck && pnpm -r test`: engine scenario and property tests pass, and AI-vs-AI simulations of 1,000 games all finish and look balanced.
- `pnpm dev` (web + server): play an AI match of each game in the browser pane at mobile width (375px) and desktop width.
- A Playwright test runs two browser contexts in one private room. It checks that each client only sees its own hand, that Pick Two and stacking work end to end, and that a dropped player rejoins within 60s.
- Before launch, a manual check on a real Android phone using a WhatsApp invite link.
