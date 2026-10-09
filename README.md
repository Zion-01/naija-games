# Naija Games

Whot and Ayo in the browser: play the computer, or send your guy a WhatsApp link and play online.

The full roadmap is in [docs/PLAN.md](docs/PLAN.md).

## Layout

```
packages/engine/   Pure TypeScript rules + AI for both games (no I/O). Shared by the web app and the server.
apps/web/          Next.js 16 (App Router, Tailwind 4). Lobby, /whot and /ayo: play the computer or pass-and-play, offline PWA.
apps/server/       Colyseus 0.18 game server (@colyseus/core + ws transport). No rooms yet.
```

## Commands

```bash
pnpm install
pnpm dev          # web on :3000 + server on :2567
pnpm test         # engine tests (~1 min; includes AI-vs-AI simulations) + web unit tests
pnpm typecheck
```

## Engine

Each game exposes the same shape: `initialState`, `legalMoves(state, player)`, `applyMove(state, move) → { ok, state } | { ok: false, error }`. States are immutable, and error messages are in pidgin.

- **Whot** (`@naija/engine/whot`): 54-card deck with Naija street rules. 1 Hold On, 2 Pick Two and 5 Pick Three (defend with the same number; penalties stack), 8 Suspension, 14 General Market (you play again), 20 Whot (call a shape). If you forget "Last card", anyone can `catch` you for 2 until play returns to you. When the market runs out, hands are counted: lowest total wins and stars count double. `viewFor(state, seat)` gives the redacted view that each client and the AI see.
- **Ayo** (`@naija/engine/ayo`): Ayo Olopon. Captures happen on 2 or 3 and chain backwards. Grand-slam captures are void, you must feed an empty opponent, more than 24 wins, and after 100 moves with no capture each side keeps what is on their side.
- **AI**: `chooseWhotMove(view, difficulty, rng)` and `chooseAyoMove(state, player, difficulty, rng)`, with difficulty `easy | medium | hard`. Hard Whot uses Monte Carlo over sampled deals and wins about 62% against medium. Hard Ayo is a depth-7 alpha-beta search.
- All randomness comes from a seeded `createRng(seed)`, so games can be replayed.
