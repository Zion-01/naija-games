# Naija Games

Whot and Ayo in the browser: play the computer, or send your guy a WhatsApp link and play online.

The full roadmap is in [docs/PLAN.md](docs/PLAN.md). Open issues and loose ends (some must be fixed before launch) are in [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Layout

```
packages/engine/   Pure TypeScript rules + AI for both games (no I/O). Shared by the web app and the server.
packages/online/   The client ↔ server protocol: snapshot and room types, move validation, room codes, timers.
apps/web/          Next.js 16 (App Router, Tailwind 4). Lobby, /whot and /ayo (computer, pass-and-play or online),
                   /play/CODE for private online rooms. Offline PWA.
apps/server/       Colyseus 0.18 game server (@colyseus/core + ws transport): WhotRoom and AyoRoom run the engine.
supabase/          SQL migrations for the Supabase project (accounts, saved results).
```

## Commands

```bash
pnpm install
pnpm dev          # web on :3000 + server on :2567
pnpm test         # engine (~1 min; AI-vs-AI simulations), protocol, server (rooms over real WebSockets) and web unit tests
pnpm typecheck
pnpm e2e          # Playwright: two browsers share a private room (starts the server and web app itself)
```

Playwright needs a Chromium: run `pnpm --filter web exec playwright install chromium` once, or point `PW_CHROMIUM` at an installed one.

## Online play

Pick **🌍 Online** in a game's setup, enter a nickname and tap **Invite your guy**. You land on `/play/ABCD` with a WhatsApp share button; the link preview says "Tunde don challenge you for Whot!". The host can start early and let the computer fill the open seats.

Or tap **Find me opponent**: the server pairs you with someone near your rating (one on one, for both games). If nobody turns up, you can play the computer after 20 seconds, and the computer takes you on automatically after a minute.

- **The server is authoritative.** Clients send moves without a player number; the server stamps the sender's seat, checks the move with the engine, and sends each client a snapshot built from `viewFor` for their seat. Nobody receives another player's cards.
- **Turn timer**: Whot 20s, Ayo 30s. When it runs out, the server plays an Easy-AI move for you.
- **Drops**: the SDK reconnects by itself. After 60s away, the computer (Medium) takes the seat. Opening the link again while signed in to the same account gives you your seat back.
- **Spectators**: anyone who opens a full or running room watches without a hand.
- **Rematch**: once every human in the room asks, the next game deals with the next player starting.
- Moves are rate-limited (10 per 2s per client, and Colyseus disconnects anything over 30 messages/s).

| Variable | Where | Default |
|---|---|---|
| `NEXT_PUBLIC_GAME_SERVER_URL` | web (browser) | `http(s)://<page host>:2567` |
| `GAME_SERVER_URL` | web (server side, for link previews) | `NEXT_PUBLIC_GAME_SERVER_URL`, then `http://localhost:2567` |
| `PORT` | server | `2567` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web | unset: no accounts |
| `SUPABASE_URL` | server | unset: guest ids (refused when `NODE_ENV=production`) |
| `SUPABASE_SECRET_KEY` | server (never the web app) | unset: results aren't saved |

Copy `apps/web/.env.example` and `apps/server/.env.example` to `.env.local` in the same folder. The server's `dev` and `start` scripts load its `.env.local`.

## Accounts (Supabase)

- **Everyone online has an account.** The first time you play online, the web app signs you in anonymously (a guest) and sends the access token to the game server. The server checks it against the project's published signing keys (`apps/server/src/auth.ts`) and seats you by user id.
- **Save your account** on `/profile` by linking Google or a phone number (SMS code). Your games stay with you. On a new phone, **Sign in** instead.
- **Results**: when an online game ends, the server calls the `record_match` database function with the secret key (`apps/server/src/results.ts`). Players can read only the games they sat in (row-level security). `/profile` lists your recent games.
- **Without Supabase** (env vars unset, as in `pnpm e2e`), the server falls back to a random device guest id and saves nothing.
- **Ratings**: each player has an Elo rating per game, starting at 1200, in the `ratings` table (public). `record_match` updates it in the same transaction as the result. Only games between players with accounts move ratings; games against computer seats only count towards wins and losses. With more than two players every pair is scored like a 1v1. A player who leaves mid-game counts as last. K is 40 for the first 20 rated games, then 20, and ratings never drop below 100. The game-over screen shows each player's change, and `/profile` shows your ratings and all-time record.
- Schema: `supabase/migrations/`. SQL tests: `supabase/tests/` (run them against a database; they roll back). Tables: `profiles` (nickname, public), `matches` and `match_players` (readable by the players in them), `ratings` (public). Dashboard settings the code relies on are listed under KI-22 in `docs/KNOWN_ISSUES.md`.

The server also serves `GET /rooms/:code` (public room facts for previews) and `GET /health`.

## Engine

Each game exposes the same shape: `initialState`, `legalMoves(state, player)`, `applyMove(state, move) → { ok, state } | { ok: false, error }`. States are immutable, and error messages are in pidgin.

- **Whot** (`@naija/engine/whot`): 54-card deck with Naija street rules. 1 Hold On, 2 Pick Two and 5 Pick Three (defend with the same number; penalties stack), 8 Suspension, 14 General Market (you play again), 20 Whot (call a shape). You can stack cards of the same number in one turn: only the first has to match, and each card's effect counts (two Pick Twos is pick four; Suspensions never skip past you). If you forget "Last card", anyone can `catch` you for 2 until play returns to you. When the market runs out, hands are counted: lowest total wins and stars count double. `viewFor(state, seat)` gives the redacted view that each client and the AI see.
- **Ayo** (`@naija/engine/ayo`): Ayo Olopon. Captures happen on 2 or 3 and chain backwards. Grand-slam captures are void, you must feed an empty opponent, more than 24 wins, and after 100 moves with no capture each side keeps what is on their side.
- **AI**: `chooseWhotMove(view, difficulty, rng)` and `chooseAyoMove(state, player, difficulty, rng)`, with difficulty `easy | medium | hard`. Hard Whot uses Monte Carlo over sampled deals and wins about 62% against medium. Hard Ayo is a depth-7 alpha-beta search.
- All randomness comes from a seeded `createRng(seed)`, so games can be replayed.
