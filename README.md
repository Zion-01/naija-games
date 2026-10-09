# Naija Games

Whot and Ayo in the browser: play the computer, or send your guy a WhatsApp link and play online.

The full roadmap is in [docs/PLAN.md](docs/PLAN.md). Open issues and loose ends (some must be fixed before launch) are in [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Layout

```
packages/engine/   Pure TypeScript rules + AI for both games (no I/O). Shared by the web app and the server.
packages/online/   The client ↔ server protocol: snapshot and room types, move validation, room codes, timers.
apps/web/          Next.js 16 (App Router, Tailwind 4). Lobby, /whot and /ayo (computer, pass-and-play or online),
                   /play/CODE for private online rooms, /style for card backs and Ayo boards. Offline PWA.
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

## Your table

`/style` (🎨 in the lobby) picks a Whot card back and an Ayo board. The first ones are free; the rest unlock with wins against the computer, counted on the device (`src/lib/cosmetics.ts`). There's no shop and nothing random, and only you see your choice: it just sets CSS variables on the page.

## Analytics and privacy

Two kinds of numbers, neither of them about a person:

- **Page views**: Vercel Web Analytics (`components/PageAnalytics.tsx`), which sets no cookies. Before a view is sent, room codes are replaced with `[code]` and query strings are dropped (`src/lib/analytics.ts`). It only reports from production, and only once Web Analytics is enabled on the Vercel project (Project → Analytics → Enable). The service worker never caches `/_vercel/*`.
- **Gameplay totals**: the game server counts rooms (invite or quick), games started, finished and abandoned, rematches, games with computer seats, quick-match pairings and solo fallbacks, emotes, and the day's peak players and rooms (`apps/server/src/metrics.ts`). They're summed in memory and sent once a minute (and on shutdown) to the `daily_counts` table through `add_daily_counts`, which only the server's secret key can call. A row is a Lagos day, a metric, a game and a number: no ids, names or codes. Offline games aren't counted, because they never touch a server.

```sql
-- Last week, per game:
select day, metric, game, value from daily_counts where day > current_date - 7 order by day desc, metric, game;
```

## Load testing

`pnpm --filter server load --rooms 250` plays bot rooms against a local server and reports latency, CPU and memory. Results and what they mean for Render's free plan are in `docs/LOAD_TEST.md`.

## Online play

Pick **🌍 Online** in a game's setup, enter a nickname and tap **Invite your guy**. You land on `/play/ABCD` with a WhatsApp share button; the link preview says "Tunde don challenge you for Whot!". The host can start early and let the computer fill the open seats.

Or tap **Find me opponent**: the server pairs you with someone near your rating (one on one, for both games). If nobody turns up, you can play the computer after 20 seconds, and the computer takes you on automatically after a minute.

- **The server is authoritative.** Clients send moves without a player number; the server stamps the sender's seat, checks the move with the engine, and sends each client a snapshot built from `viewFor` for their seat. Nobody receives another player's cards.
- **Turn timer**: Whot 20s, Ayo 30s. When it runs out, the server plays an Easy-AI move for you.
- **Drops**: the SDK reconnects by itself. After 60s away, the computer (Medium) takes the seat. Opening the link again while signed in to the same account gives you your seat back.
- **Spectators**: anyone who opens a full or running room watches without a hand.
- **Rematch**: once every human in the room asks, the next game deals with the next player starting.
- **Emotes**: seated players tap 😜 in the header to throw a banter sticker ("Na fire!", "You don fall!", "Good game"…) at the table. It's a fixed list (`EMOTES` in `packages/online`), so there's nothing to moderate; one per 3s, spectators see them but can't send, and anyone can hide other players' emotes from the tray.
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
- **Save your account** on `/profile` by linking Google. Your games stay with you. On a new phone, **Sign in** with Google instead. (There's no phone-number sign-in.)
- **Results**: when an online game ends, the server calls the `record_match` database function with the secret key (`apps/server/src/results.ts`). Players can read only the games they sat in (row-level security). `/profile` lists your recent games.
- **Without Supabase** (env vars unset, as in `pnpm e2e`), the server falls back to a random device guest id and saves nothing.
- **Ratings**: each player has an Elo rating per game, starting at 1200, in the `ratings` table (public). `record_match` updates it in the same transaction as the result. Only games between players with accounts move ratings; games against computer seats only count towards wins and losses. With more than two players every pair is scored like a 1v1. A player who leaves mid-game counts as last. K is 40 for the first 20 rated games, then 20, and ratings never drop below 100. The game-over screen shows each player's change, and `/profile` shows your ratings and all-time record.
- **Leaderboards** (`/leaderboard`, 🏆 on the home page): a weekly board per game ranks players by the Elo they gained in rated games that week (Monday 00:00 to Monday 00:00, Lagos time), from the `weekly_leaderboard` database function. Last week's number one is the **Oga of the Week**. The all-time board is the highest current ratings. Nothing is stored for boards; they're worked out from `match_players`.
- Schema: `supabase/migrations/`. SQL tests: `supabase/tests/` (run them against a database; they roll back). Tables: `profiles` (nickname, public), `matches` and `match_players` (readable by the players in them), `ratings` (public). Dashboard settings the code relies on are listed under KI-22 in `docs/KNOWN_ISSUES.md`.

The server also serves `GET /rooms/:code` (public room facts for previews) and `GET /health`.

## Deploying

The web app goes on Vercel and the game server on Render (free plan). Do these in order; each step needs the one before.

1. **Game server on Render.** In the Render dashboard: New → Blueprint → pick this repository. It reads `render.yaml` (Docker, free plan, Frankfurt, health check `/health`). Paste `SUPABASE_SECRET_KEY` when asked. Note the URL it gets, e.g. `https://naija-games-server.onrender.com`, and check `/health` answers `{"ok":true}`.
   - The free plan sleeps after 15 minutes with no requests or WebSocket messages and takes up to a minute to wake. Games in progress keep it awake, players in a room send a `ping` every 4 minutes (so a waiting room survives), and the web app wakes it as soon as someone picks Online. For always-on, change `plan: free` to `plan: starter` ($7/month).
2. **Web app on Vercel.** Import the repository with root directory `apps/web` (Vercel detects Next.js and pnpm). Set these environment variables, then deploy:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (as in `apps/web/.env.example`)
   - `NEXT_PUBLIC_GAME_SERVER_URL` and `GAME_SERVER_URL`: the Render URL from step 1
3. **Supabase URLs.** Authentication → URL Configuration: set the Site URL to the Vercel address and add `https://<that address>/profile` to Redirect URLs (Google sign-in comes back there).
4. **CAPTCHA (in this order).** Create a Turnstile widget in the Cloudflare dashboard for the Vercel domain. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on Vercel and redeploy. *Then* in Supabase → Authentication → Attack Protection, enable CAPTCHA with Turnstile and the widget's secret key. Doing it the other way round breaks guest sign-in until the site key is live.
5. **Try it on a real phone**: open the site, start an online game, send the WhatsApp invite to another phone and play it out.

To check the server image locally (needs Docker): `docker build -f apps/server/Dockerfile -t naija-games-server .` from the repository root.

## Engine

Each game exposes the same shape: `initialState`, `legalMoves(state, player)`, `applyMove(state, move) → { ok, state } | { ok: false, error }`. States are immutable, and error messages are in pidgin.

- **Whot** (`@naija/engine/whot`): 54-card deck with Naija street rules. 1 Hold On, 2 Pick Two and 5 Pick Three (defend with the same number; penalties stack), 8 Suspension, 14 General Market (you play again), 20 Whot (call a shape). You can stack cards of the same number in one turn: only the first has to match, and each card's effect counts (two Pick Twos is pick four; Suspensions never skip past you). If you forget "Last card", anyone can `catch` you for 2 until play returns to you. When the market runs out, hands are counted: lowest total wins and stars count double. `viewFor(state, seat)` gives the redacted view that each client and the AI see.
- **Ayo** (`@naija/engine/ayo`): Ayo Olopon. Captures happen on 2 or 3 and chain backwards. Grand-slam captures are void, you must feed an empty opponent, more than 24 wins, and after 100 moves with no capture each side keeps what is on their side.
- **AI**: `chooseWhotMove(view, difficulty, rng)` and `chooseAyoMove(state, player, difficulty, rng)`, with difficulty `easy | medium | hard`. Hard Whot uses Monte Carlo over sampled deals and wins about 62% against medium. Hard Ayo is a depth-7 alpha-beta search.
- All randomness comes from a seeded `createRng(seed)`, so games can be replayed.
