FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (separate layer for caching)
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Production image
FROM base AS runner
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure tmp dir exists
RUN mkdir -p /tmp/imgworker

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
