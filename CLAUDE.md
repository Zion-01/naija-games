# Naija Games: notes for agents

Read `README.md` for the layout and `docs/PLAN.md` for the phased roadmap.

## Status (2026-10-09)
- ✅ **Phase 0, scaffold**: pnpm monorepo, CI (`.github/workflows/ci.yml`: typecheck + test), Next.js app, Colyseus server that boots with no rooms.
- ✅ **Phase 1, engines + AI**: `packages/engine`, 33 Vitest tests passing (rule scenarios, card and seed conservation, AI strength checks).
- ✅ **Phase 2, offline web game**: `/whot` and `/ayo` in `apps/web` (vs AI at three levels + pass-and-play), pidgin toasts/voice, synthesised SFX, haptics, local win/loss stats, PWA manifest + offline service worker, ankara theme with dark mode. Web tests in `apps/web/test`.
- ⏭️ **Next: Phase 3** (Colyseus `WhotRoom` and `AyoRoom` running the engine, private invite links).

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
- `public/sw.js` only registers in production builds (`components/ServiceWorker.tsx`). Bump its `CACHE` name when changing the precache list. Icons in `public/` are rendered from `public/icon.svg`.
