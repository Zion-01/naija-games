# The game server. Build from the repository root (it needs the workspace packages):
#   docker build -f apps/server/Dockerfile -t naija-games-server .
# Runs the TypeScript source through tsx, like `pnpm --filter server start`. Configure with PORT, SUPABASE_URL
# and SUPABASE_SECRET_KEY; with NODE_ENV=production it refuses to start without SUPABASE_URL.
FROM node:22-slim

WORKDIR /app
# Node 22's bundled corepack can't verify pnpm 12's signature, so update it first.
RUN npm install -g corepack@latest && corepack enable

# Dependencies first, so code changes don't reinstall them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/engine/package.json packages/engine/
COPY packages/online/package.json packages/online/
RUN pnpm install --frozen-lockfile --prod --filter "server..."

COPY packages/engine/src packages/engine/src
COPY packages/online/src packages/online/src
COPY apps/server/src apps/server/src

ENV NODE_ENV=production
ENV PORT=2567
EXPOSE 2567
USER node
WORKDIR /app/apps/server
CMD ["node", "--import", "tsx", "src/index.ts"]
