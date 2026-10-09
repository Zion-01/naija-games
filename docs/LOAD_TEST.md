# Load test (Phase 5d)

How much one game server process (one Colyseus node) can hold, and what that means for Render's free plan.

## How to run it

```bash
pnpm --filter server load --rooms 250 --ramp 30 --hold 45
```

`apps/server/load/run.ts` starts its own server on `localhost:2701` (guest ids, Supabase switched off, so nothing is saved and no accounts are made) with `LOAD_TEST=1`, which adds a `/debug/load` endpoint reporting CPU, memory, event-loop delay, rooms and clients. That endpoint never exists in production. The script then opens rooms over real WebSockets with bot players that wait a "think" time (default ~800 ms, randomised 0.5–1.5×) and play an Easy-AI move from their own redacted view, ask for a rematch when a game ends, and keep going until the end. Rooms rotate through four kinds: Whot 1v1, Ayo 1v1, Whot with 2 bots and 2 computer seats, and Ayo against the computer (computer seats run the server's Medium AI).

Options: `--rooms`, `--ramp` (seconds to open them all), `--hold` (seconds to keep playing after), `--think` (ms), `--every` (report interval), `--url` (test a server you started yourself with `LOAD_TEST=1`; never point it at production).

Every report line shows rooms, clients, bot moves per second, move round trip (send → the snapshot with the move), server CPU (fraction of one core), event-loop delay and memory.

## Results (2026-10-09)

Laptop: Intel Core i5-1035G7 (4 cores, 8 threads), Windows 11, Node 22. The bots ran on the same machine, so they compete with the server for CPU; numbers are a little pessimistic. On Windows the event-loop delay never reads below ~17–23 ms (timer granularity), so only values well above that mean anything.

| Rooms | Players | Bot moves/s | Round trip p50 / p95 / p99 | Server CPU (one core) | Event loop p99 | Memory |
|---|---|---|---|---|---|---|
| 8 | 14 | 13–16 | 1 / 3 / 4 ms | ~1% | idle | 100 MB |
| 250, held | 438 | ~222 | 1 / 2–3 / 3–5 ms | 2–3% | idle | 116 MB |
| 250, while opening (8 rooms/s) | | | 1 / 3–4 / 5–9 ms | up to 6% | idle | |
| 1,000, held | 1,750 | ~890 | 2 / 6–9 / 47–88 ms | 5–6% | 24 ms | 148 MB |
| 1,000, while opening (17 rooms/s, ~29 joins/s) | | | 3–7 / 76–351 / 110–605 ms | 18–32% | 37–133 ms | |

1,000 rooms ran with no errors from the server apart from one harmless race (a bot tried to catch after someone else already had: "Nobody to catch").

## What it means

- **Playing is cheap; joining is the expensive part.** A held room costs very little: about 0.006% of a core per room at bot speed, and real people move more slowly than the bots. Opening and joining rooms (WebSocket handshake, auth, matchmaker, private-room setup) works out to roughly 10 ms of CPU per join on this laptop. Bursts of joins are what push latency up.
- **Memory is not the limit**: about 150 MB at 1,000 rooms, against 512 MB on Render's free plan.
- **Render free (0.1 CPU, 512 MB)**: one tenth of a core, and a slower one than this laptop's. Rough budget, assuming Render's vCPU is about half this laptop's per-core speed:
  - held games: 1,000 rooms used ~5–6% of a laptop core, so 0.1 of a half-speed core runs out near 900 rooms at bot speed. Leaving half for headroom (joins, GC, the proxy): plan on around **400–500 concurrent rooms** (~800 players);
  - joins: ~10 ms of laptop CPU each, so ~20 ms there, which is around **4–5 joins per second** sustained. A launch spike (a WhatsApp invite going viral) is where the free plan would struggle first: moves lag for a few seconds while the joins are handled.
  - Render's Starter plan ($7/month, 0.5 CPU) gives about 5× both numbers.
- **Past one process** (KI-5): rooms, `/rooms/:code` and the quick-match queue all live in one process's memory, so scaling out needs Colyseus Redis presence/driver and a shared queue. The numbers above say that won't be needed for a long while; a bigger single instance comes first.

## Not covered

- Hard Whot AI (Monte Carlo) isn't offered online (KI-14), so it isn't tested. Running it on the server would block the event loop.
- Supabase: results, ratings and the daily counts aren't written during the test. Saving a result is one RPC per finished game and daily counts are one RPC a minute, both off the game loop.
- Real phone networks: the round trips above are on localhost. Players also see their own network latency (and the Render proxy's).
