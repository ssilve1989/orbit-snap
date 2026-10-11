# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM oven/bun:1.3.11 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1.3.11-slim AS runner
WORKDIR /app
# pixi.js is bundled into dist; serve.ts only needs hono (which has no deps)
COPY --from=builder /app/node_modules/hono ./node_modules/hono
COPY --from=builder /app/dist ./dist
COPY serve.ts ./
EXPOSE 3000
CMD ["bun", "run", "serve.ts"]
