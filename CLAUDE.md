# Naija Games: notes for agents

Read `README.md` for the layout, `docs/PLAN.md` for the phased roadmap, and `docs/KNOWN_ISSUES.md` for open problems. When you fix one, delete its `KI-n` entry and the matching `KI-n` comment in the code. When you find one, add it.

## Status (2026-10-09)
- ✅ **Phase 0, scaffold**: pnpm monorepo, CI (`.github/workflows/ci.yml`: typecheck + test), Next.js app, Colyseus server that boots with no rooms.
- ✅ **Phase 1, engines + AI**: `packages/engine`, 33 Vitest tests passing (rule scenarios, card and seed conservation, AI strength checks).
- ✅ **Phase 2, offline web game**: `/whot` and `/ayo` in `apps/web` (vs AI at three levels + pass-and-play), pidgin toasts/voice, synthesised SFX, haptics, local win/loss stats, PWA manifest + offline service worker, ankara theme with dark mode. Web tests in `apps/web/test`.
- ✅ **Phase 3, online multiplayer**: `packages/online` (protocol), `apps/server` (`Match` + `WhotRoom`/`AyoRoom`, `GET /rooms/:code`), `/play/[code]` with WhatsApp invite + dynamic OG image, turn timers with Easy-AI auto-play, 60s reconnect then AI takeover, guest-id seat reclaim, spectators, rematch, rate limits. Server tests (unit + real WebSocket), Playwright e2e (`pnpm e2e`).
- ⚠️ Phase 3 identity is a device guest id + nickname, **not Supabase yet** (no project/keys). Swap it in via `onAuth` in `apps/server/src/rooms.ts` when Phase 4 adds accounts (KI-1).
- 🔴 Launch blockers: see the "Before launch" table in `docs/KNOWN_ISSUES.md` (sign-in, server deploy, production URL, real-phone check, single-process rooms).
- ⏭️ **Next: Phase 4** (accounts, Elo, quick-match, leaderboards).

## Decisions already made (don't revisit)
- Web-first, Next.js. Online multiplayer comes in v1 (Phase 3), after the offline build.
- Whot uses Naija street rules (see the README). Ayo uses **Ayo Olopon** (2/3 capture), not relay-sowing Ayoayo.
- The server is authoritative. Clients send moves and receive only `viewFor` output. The AI also gets only the redacted view, so it can't cheat.
- "Check up" is automatic when you play your last card. Only "Last card" is enforced, through `catch` moves.

## Gotchas
- Tool versions are newer than most training data: **Next 16.4** (`apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing Next code), **Colyseus 0.18** (`defineServer({ transport, rooms })`; check `node_modules/@colyseus/core/build/*.d.ts`), TypeScript 7, Vitest 5, pnpm 12.
- Don't install the `colyseus` meta-package: it pulls `uWebSockets.js` from git, which pnpm blocks. Use `@colyseus/core` + `@colyseus/ws-transport`.
- Build-script approvals live in `allowBuilds` in the root `pnpm-workspace.yaml`.
- The web app consumes the engine as TS source (`transpilePackages: ["@naija/engine"]`). The web `typecheck` script runs `next typegen` first because `LayoutProps` is a generated type.
- The engine's simulation tests take about 60s (hard Whot AI). `vitest.config.ts` sets a 60s test timeout.
- Whot `legalMoves` can return `catch` moves for seats that aren't on turn. A server or game loop should offer every non-current seat a chance to catch after each move (see `simulate()` in `packages/engine/test/whot.test.ts`).
- Web game loop: the engine is driven from client components (`components/whot/WhotGame.tsx`, `components/ayo/AyoGame.tsx`). Pure helpers (callouts, AI scheduling, sow animation frames) live in `src/lib/*-session.ts` and are unit-tested; Phase 3 can reuse the callouts for server-driven state.
- Never call `Math.random()`/`Date.now()` during render (Cache Components turns that into a prerender error). Games are seeded with `Date.now()` in the click handler that starts them.
- Online: game logic lives in `apps/server/src/match.ts` (no Colyseus imports, unit-tested with fake timers); `rooms.ts` is a thin wrapper. The room id **is** the invite code (set in `onCreate`), and rooms are private so `joinOrCreate` never hands them out.
- Online web: `src/lib/online.ts` keeps connections outside React (survives navigation from /whot to /play/CODE and Strict Mode remounts). Boards are presentational (`WhotBoard`, `AyoBoard`) and shared by offline and online play.
- The Colyseus SDK only auto-reconnects rooms up for `reconnection.minUptime` (default 5s); the web client lowers it to 1s.
- `/play/[code]` metadata fetches the live room, so the page calls `connection()` inside its Suspense boundary (Cache Components otherwise errors on uncached data in `generateMetadata`).
- `public/sw.js` only registers in production builds (`components/ServiceWorker.tsx`). Bump its `CACHE` name when changing the precache list. It skips `/play/*` (online needs the network). Icons in `public/` are rendered from `public/icon.svg`.
